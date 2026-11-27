import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReadingStore } from "../../../server/reading-store.ts";
import { cards } from "../../../shared/cards.ts";
import { Consultation, type RealtimeEvent } from "./controller";
import { emptyReading, type Session } from "@/api/types";
import { loadSession } from "@/lib/storage";
import { queryClient } from "@/api/client";
import { consultationOptions } from "@/api/consultations";
const audioMock = vi.hoisted(() => ({
  busy: false,
  state: (_busy: boolean) => {
    void _busy;
  },
  appended: [] as Array<[string, string]>,
  playback: (_text: string, _segmentStarted = true) => {
    void [_text, _segmentStarted];
  },
}));
vi.mock("./speech.ts", () => ({
  displaySpeech: (s: string) => s,
  SpeechPlayer: class {
    get busy() {
      return audioMock.busy;
    }
    constructor(
      _context: unknown,
      options: {
        onCaption: (text: string, segmentStarted: boolean) => void;
        onState: (busy: boolean) => void;
      },
    ) {
      audioMock.playback = (text, segmentStarted = true) =>
        options.onCaption(text, segmentStarted);
      audioMock.state = options.onState;
    }
    append(text: string, responseId: string) {
      audioMock.appended.push([text, responseId]);
    }
    cancel() {}
    close() {}
  },
}));
let dir: string, store: ReadingStore, controller: Consultation;
let mutations: Record<string, number>;
let storeId: string;
const consultationId = "12345678-1234-4321-8123-123456789abc";
const pathPrefix = `/api/v1/consultations/${consultationId}`;
const sends: Record<string, unknown>[] = [];
class Peer {
  localDescription = { sdp: "offer" };
  connectionState = "connected";
  onconnectionstatechange?: () => void;
  channel = {
    readyState: "open",
    onopen: () => {},
    onerror: () => {},
    onmessage: () => {},
    send: (s: string) => sends.push(JSON.parse(s)),
    close: () => {},
  };
  addTrack() {}
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return { type: "offer", sdp: "offer" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {
    this.channel.onopen();
  }
  close() {}
}
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  queryClient.clear();
  sends.length = 0;
  audioMock.appended = [];
  audioMock.busy = false;
  mutations = {};
  dir = await mkdtemp(join(tmpdir(), "react-tarot-"));
  store = new ReadingStore(dir, () =>
    cards.map((c) => ({ ...c, reversed: false })),
  );
  const revealed = new Map<number, object>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path === `${pathPrefix}/realtime-connection`)
        return new Response("answer");
      if (path === `${pathPrefix}/card-selection`) {
        mutations.confirm_cards = (mutations.confirm_cards || 0) + 1;
        const body = JSON.parse(String(options?.body));
        await store.request({
          id: storeId,
          action: "review_question",
          args: {
            question: body.question,
            spreadId: body.spread_type.toLowerCase(),
          },
        });
        await store.request({ id: storeId, action: "confirm_question" });
        await store.request({
          id: storeId,
          action: "select_numbers",
          args: { picks: body.picks },
        });
        const selected = await store.request({
          id: storeId,
          action: "confirm_cards",
        });
        if (selected.result.error) throw Error(selected.result.error);
        return Response.json({
          cards: selected.state.cards.map((c) => ({
            slot: c.slot,
            picked_number: c.number,
            position: c.position,
            revealed: false,
            card_id: null,
            name: null,
            keywords: null,
          })),
        });
      }
      const reveal = path.match(/\/cards\/([1-3])\/reveal$/);
      if (reveal) {
        mutations.reveal_card = (mutations.reveal_card || 0) + 1;
        const slot = Number(reveal[1]);
        const { state } = await store.request({ id: storeId, action: "get" });
        const card = state.cards[slot - 1];
        const result = {
          slot,
          picked_number: card.number,
          position: card.position,
          revealed: true,
          card_id: card.id,
          name: card.name,
          keywords: [card.upright],
        };
        revealed.set(slot, result);
        return Response.json({ card: result });
      }
      if (path === `${pathPrefix}/end`)
        return Response.json({
          id: consultationId,
          status: "ENDED",
          cards: [...revealed.values()],
          report_status: null,
        });
      if (path === `${pathPrefix}/report` && options?.method === "PUT")
        return Response.json(JSON.parse(String(options.body)), { status: 201 });
      throw Error(`Unexpected request: ${path}`);
    }),
  );
});
afterEach(async () => {
  controller?.dispose();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});
async function session() {
  const created = await store.request({
    id: undefined,
    action: "create",
    masterId: "adaptive",
    previous: undefined,
  });
  storeId = created.id;
  return {
    ...emptyReading,
    ...created.state,
    readingId: consultationId,
    endAt: Date.now() + 600000,
    demo: false,
    date: new Date().toISOString(),
    notes: [],
    transcript: [],
  } as Session;
}
function mockRealtime() {
  vi.stubGlobal(
    "AudioContext",
    class {
      destination = {};
      async resume() {}
      async close() {}
    },
  );
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop() {}, enabled: true }],
        getAudioTracks: () => [{ stop() {}, enabled: true }],
      }),
    },
  });
}
async function emit(name: string, args: unknown, id: string) {
  await controller.event({ type: "response.created", response: { id } });
  const event: RealtimeEvent = {
    type: "response.done",
    response: {
      id,
      output: [
        {
          type: "function_call",
          name,
          arguments: JSON.stringify(args),
          call_id: `call-${id}`,
        },
      ],
    },
  };
  await Promise.all([controller.event(event), controller.event(event)]);
}
test("partial picks, same-card confirmation, sequential three-card reading, flow notes and reload report", async () => {
  controller = new Consultation(await session());
  expect(controller.getSnapshot().session.cards).toHaveLength(0);
  await controller.command("review_question", {
    question: "이직할까 남을까?",
    spreadId: "decision",
    choices: ["이직", "잔류"],
  });
  await controller.command("confirm_question");
  await controller.command("select_numbers", { picks: [7, 22] });
  expect(controller.getSnapshot().heading).toContain("1개만 더");
  expect(controller.getSnapshot().session.cards).toHaveLength(0);
  await controller.command("select_numbers", { picks: [79] });
  expect(controller.getSnapshot().retryNumbers).toBe(true);
  await controller.event({ type: "input_audio_buffer.speech_stopped" });
  expect(controller.getSnapshot().status).toBe("말해준 번호를 확인하는 중");
  expect(controller.getSnapshot().session.picks).toEqual([7, 22]);
  await controller.command("select_numbers", { picks: [22, 51] });
  expect(controller.getSnapshot().retryNumbers).toBe(false);
  expect(controller.getSnapshot().session.picks).toEqual([7, 22, 51]);
  await controller.command("confirm_cards");
  const chosen = controller
    .getSnapshot()
    .session.cards.map((card) => card.number);
  await controller.command("confirm_cards");
  expect(
    controller.getSnapshot().session.cards.map((card) => card.number),
  ).toEqual(chosen);
  for (let slot = 1; slot <= 3; slot++) {
    await controller.command("reveal_card", { slot });
    await controller.command("show_reading", { slot });
    expect(controller.getSnapshot().active).toEqual([slot]);
  }
  await controller.command("show_reading", { slot: 0 });
  expect(
    (
      await controller.command("request_clarifier", {
        slot: 2,
        question: "more",
      })
    ).error,
  ).toBeTruthy();
  expect(
    controller.getSnapshot().session.cards.map((card) => card.number),
  ).toEqual(chosen);
  await controller.end();
  const saved = controller.getSnapshot().session;
  expect(loadSession(consultationId)).toBeUndefined();
  const reportRequest = vi
    .mocked(fetch)
    .mock.calls.find(
      ([path, options]) =>
        path === `${pathPrefix}/report` && options?.method === "PUT",
    );
  expect(JSON.parse(String(reportRequest?.[1]?.body)).readings).toHaveLength(3);
  expect(saved.ended).toBe(true);
  expect(saved.cards).toHaveLength(3);
  expect(saved.notes.some((n) => n.stageLabel === "종합과 다음 행동")).toBe(
    true,
  );
  expect(saved.report?.readings).toHaveLength(3);
});
test("batches 100 characters through the next sentence ending and flushes the tail", async () => {
  mockRealtime();
  controller = new Consultation(await session());
  await controller.start();
  const id = "batched";
  await controller.event({ type: "response.created", response: { id } });
  const delta = (text: string) => controller.event({
    type: "response.output_text.delta", response_id: id, delta: text,
  });
  const prefix = "가".repeat(98) + ".";
  await delta(prefix);
  await delta(" 다음");
  expect(audioMock.appended).toHaveLength(0);
  await delta(" 문장. 끝");
  expect(audioMock.appended).toEqual([[prefix + " 다음 문장.", id]]);
  await controller.event({
    type: "response.output_text.done", response_id: id, text: prefix + " 다음 문장. 끝",
  });
  expect(audioMock.appended.at(-1)).toEqual([" 끝", id]);
});

test("Realtime duplicate tool events mutate once; FastAPI reconnects using the same deadline", async () => {
  mockRealtime();
  controller = new Consultation(await session());
  await controller.start();
  const deadline = controller.getSnapshot().session.endAt;
  await controller.event({
    type: "response.created",
    response: { id: "spoken" },
  });
  await controller.event({
    type: "response.output_text.delta",
    response_id: "spoken",
    delta: "카드의 상징을 ",
  });
  expect(audioMock.appended).toHaveLength(0);
  expect(controller.getSnapshot().caption).toBe("");
  await controller.event({
    type: "response.output_text.delta",
    response_id: "spoken",
    delta: "살펴볼게. 마지막 말",
  });
  expect(audioMock.appended).toHaveLength(0);
  expect(controller.getSnapshot().caption).toBe("");
  await controller.event({
    type: "response.output_text.done",
    response_id: "spoken",
    text: "카드의 상징을 살펴볼게. 마지막 말",
  });
  const combined = "카드의 상징을 살펴볼게. 마지막 말";
  expect(audioMock.appended).toEqual([[combined, "spoken"]]);
  audioMock.playback("카드의 상징을 살펴볼게.");
  expect(controller.getSnapshot().caption).toBe("카드의 상징을 살펴볼게.");
  audioMock.playback("마지막 말", false);
  expect(controller.getSnapshot().caption).toBe("마지막 말");
  await emit(
    "review_question",
    { question: "오늘 주목할 점?", spreadId: "situation" },
    "one",
  );

  expect(
    sends.filter(
      (e) => (e.item as { call_id?: string })?.call_id === "call-one",
    ),
  ).toHaveLength(1);
  await emit("confirm_question", {}, "two");
  await emit("select_numbers", { picks: [7] }, "three");
  expect(controller.getSnapshot().session.picks).toEqual([7]);
  const beforeRepeat = controller.getSnapshot();
  const noteCount = beforeRepeat.session.notes.length;
  await emit(
    "review_question",
    { question: "오늘 주목할 점?", spreadId: "situation" },
    "repeat-question",
  );
  expect(controller.getSnapshot().phase).toBe(beforeRepeat.phase);
  expect(controller.getSnapshot().session.picks).toEqual([7]);
  expect(controller.getSnapshot().session.questionConfirmed).toBe(true);
  expect(controller.getSnapshot().session.notes).toHaveLength(noteCount);
  const id = controller.getSnapshot().session.readingId;
  controller.dispose();
  controller = new Consultation(loadSession(id)!);
  await controller.start();
  expect(controller.getSnapshot().session.endAt).toBe(deadline);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([path]) => path === `${pathPrefix}/realtime-connection`,
      )
      .map(([, options]) => JSON.parse(String(options?.body)).sdp),
  ).toEqual(["offer", "offer"]);
  expect(controller.getSnapshot().session.picks).toEqual([7]);
  expect(controller.getSnapshot().phase).toBe("picking");
  // Continue exclusively through model tool events, with no UI interactions.
  await emit("select_numbers", { picks: [22, 51] }, "remaining");
  await emit("confirm_cards", {}, "four");
  await emit("reveal_card", { slot: 1 }, "five");
  await emit("show_reading", { slot: 1 }, "six");
  expect(
    (await controller.command("reveal_card", { slot: 2 })).error,
  ).toBeTruthy();
  for (const slot of [2, 3]) {
    audioMock.playback("카드 해석.");
    audioMock.busy = true;
    let settled = false;
    const advancing = emit("reveal_card", { slot }, `reveal-${slot}`).then(
      () => {
        settled = true;
      },
    );
    const responseCount = sends.filter(
      (e) => e.type === "response.create",
    ).length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(settled).toBe(false);
    expect(controller.getSnapshot().session.revealed).not.toContain(slot);
    expect(sends.filter((e) => e.type === "response.create")).toHaveLength(
      responseCount,
    );
    audioMock.busy = false;
    audioMock.state(false);
    await advancing;
    expect(controller.getSnapshot().session.revealed).not.toContain(slot);
    expect(sends.filter((e) => e.type === "response.create")).toHaveLength(
      responseCount,
    );
    const afterAdvance = sends.length;
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(sends).toHaveLength(afterAdvance); // idle callback must not start a second continuation
    await controller.event({
      type: "input_audio_buffer.speech_started",
      item_id: `feedback-${slot - 1}`,
    });
    const revealedViews: { phase: string; focus: number[]; caption: string }[] =
      [];
    const unsubscribe = controller.subscribe(() => {
      const view = controller.getSnapshot();
      if (view.session.revealed.includes(slot))
        revealedViews.push({
          phase: view.phase,
          focus: view.active,
          caption: view.caption,
        });
    });
    await emit("reveal_card", { slot }, `after-feedback-${slot}`);
    unsubscribe();
    expect(revealedViews).toHaveLength(1);
    expect(revealedViews[0]).toEqual({
      phase: "reveal",
      focus: [slot],
      caption: "",
    });
    await emit("show_reading", { slot }, `read-${slot}`);
  }
  audioMock.playback("세 번째 카드 해석.");
  expect(controller.getSnapshot().caption).toBe("세 번째 카드 해석.");
  expect(
    (await controller.command("show_reading", { slot: 0 })).awaitingUser,
  ).toBe(true);
  await controller.event({
    type: "input_audio_buffer.speech_started",
    item_id: "feedback-3",
  });
  await emit("show_reading", { slot: 0 }, "seven");
  expect(controller.getSnapshot().session.summaryVisited).toBe(true);
  expect(controller.getSnapshot().session.revealed).toEqual([1, 2, 3]);
  expect(controller.getSnapshot().caption).toBe("");
  expect(mutations.confirm_cards).toBe(1);
  audioMock.busy = true;
  const reveals = mutations.reveal_card;
  const pendingReveal = controller.command("reveal_card", { slot: 2 });
  controller.dispose();
  expect((await pendingReveal).error).toBeTruthy();
  expect(mutations.reveal_card).toBe(reveals);
});

test.each([
  [
    "카드 설명을 인용한 경우",
    "소드 6이 떴어. 어떤 느낌이 들어?",
    "상담 내용을 요약하지 못했어.",
  ],
  [
    "새로 요약한 경우",
    "일을 계속할지, 다른 방향을 준비할지 고민하고 있어.",
    "일을 계속할지, 다른 방향을 준비할지 고민하고 있어.",
  ],
  ["요약 요청이 거절된 경우", null, "상담 내용을 요약하지 못했어."],
])(
  "저장 리포트에 대화 원문을 옮기지 않는다 — %s",
  async (_, summary, expected) => {
    mockRealtime();
    controller = new Consultation({
      ...(await session()),
      question: "지금 일을 계속할까?",
      transcript: ["레나: 소드 6이 떴어. 어떤 느낌이 들어?"],
    });
    await controller.start();

    const ending = controller.end();
    const report = await vi.waitFor(() => {
      const request = sends.find(
        (event) => event.event_id === `report-${consultationId}`,
      );
      expect(request).toBeDefined();
      return request!;
    });
    expect(report.response).toMatchObject({
      conversation: "none",
      tool_choice: { type: "function", name: "write_report" },
      input: [{ role: "user", content: [{ type: "input_text" }] }],
    });
    if (summary === null) {
      await controller.event({
        type: "error",
        error: {
          event_id: String(report.event_id),
          code: "invalid_request_error",
        },
      });
    } else {
      await controller.event({
        type: "response.done",
        response: {
          id: "report-response",
          metadata: { purpose: "report" },
          status: "completed",
          output: [
            {
              type: summary === expected ? "message" : "function_call",
              name: "write_report",
              call_id: "report-call",
              arguments:
                summary === expected ? "" : JSON.stringify({ summary }),
              content: [{ text: JSON.stringify({ summary }) }],
            },
          ],
        },
      });
    }
    await ending;
    const saved = vi
      .mocked(fetch)
      .mock.calls.find(([path]) => path === `${pathPrefix}/report`);
    expect(JSON.parse(String(saved?.[1]?.body)).situation_summary).toBe(
      expected,
    );
  },
);

test.each([503, "lost"] as const)(
  "saves the report with the server's revealed slots after an end response of %s",
  async (failure) => {
    controller = new Consultation(await session());
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (path, options) => {
      if (path === `${pathPrefix}/end`) {
        if (failure === "lost") throw new TypeError("Network request failed");
        return Response.json(
          { error: { code: "VOICE_HANGUP_RETRY" } },
          { status: failure },
        );
      }
      if (path === pathPrefix)
        return Response.json({
          id: consultationId,
          status: "ENDED",
          cards: [
            {
              slot: 1,
              picked_number: 7,
              position: "현재",
              revealed: true,
              card_id: 17,
              name: "별",
              keywords: ["희망"],
            },
          ],
          report_status: null,
        });
      return originalFetch(path, options);
    });

    await controller.end();

    expect(vi.mocked(fetch).mock.calls.map(([path]) => path)).toEqual([
      `${pathPrefix}/end`,
      pathPrefix,
      `${pathPrefix}/report`,
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      phase: "ended",
      session: { reportPending: false, report: { readings: [{ slot: 1 }] } },
    });
  },
);

test("keeps the draft and waits to save when the end commit is unconfirmed", async () => {
  controller = new Consultation(await session());
  vi.mocked(fetch).mockImplementation(async (path) => {
    if (path === `${pathPrefix}/end`) return new Response(null, { status: 503 });
    if (path === pathPrefix) return Response.json({ status: "ACTIVE" });
    throw Error(`Unexpected request: ${path}`);
  });

  await controller.end();

  expect(vi.mocked(fetch).mock.calls.map(([path]) => path)).toEqual([
    `${pathPrefix}/end`,
    pathPrefix,
  ]);
  expect(controller.getSnapshot()).toMatchObject({
    phase: "ending",
    endUnconfirmed: true,
    session: { reportPending: true },
  });
  expect(loadSession(consultationId)?.reportPending).toBe(true);
});

test.each(["retry", "reload"] as const)(
  "recovers a saved report after its PUT response is lost on %s",
  async (recovery) => {
    controller = new Consultation(await session());
    const originalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (path, options) => {
      if (path === pathPrefix)
        return Response.json({
          id: consultationId,
          status: "ENDED",
          cards: [],
          report_status: "COMPLETED",
        });
      if (path === `${pathPrefix}/report`) {
        if (options?.method === "PUT")
          throw new TypeError("Network request failed");
        return Response.json({
          situation_summary: "저장된 요약",
          queen_line: "저장된 조언",
          readings: [],
        });
      }
      return originalFetch(path, options);
    });

    await controller.end();
    expect(controller.getSnapshot()).toMatchObject({
      phase: "ending",
      endUnconfirmed: false,
      session: { ended: true, reportPending: true },
    });
    expect(loadSession(consultationId)?.reportPending).toBe(true);

    if (recovery === "reload") {
      const session = await consultationOptions(consultationId).queryFn({
        signal: new AbortController().signal,
      });
      expect(session).toMatchObject({
        reportPending: false,
        report: { summary: "저장된 요약" },
      });
    } else {
      await controller.saveReport();
      expect(controller.getSnapshot()).toMatchObject({
        phase: "ended",
        session: { reportPending: false, report: { summary: "저장된 요약" } },
      });
      expect(loadSession(consultationId)).toBeUndefined();
    }
    expect(
      vi.mocked(fetch).mock.calls.map(([path, options]) => [path, options?.method]),
    ).toEqual([
      [`${pathPrefix}/end`, "POST"],
      [`${pathPrefix}/report`, "PUT"],
      [pathPrefix, undefined],
      [`${pathPrefix}/report`, undefined],
    ]);
  },
);

test("saves the question and card checkpoint before queuing a server-generated report", async () => {
  mockRealtime();
  controller = new Consultation(await session());
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  const checkpoints = vi.fn();
  const endRequests: unknown[] = [];
  vi.mocked(fetch).mockImplementation(async (path, options) => {
    if (path === `${pathPrefix}/report-draft`) {
      checkpoints(JSON.parse(String(options?.body)));
      return new Response(null, { status: 204 });
    }
    if (path === `${pathPrefix}/end`) {
      const body = JSON.parse(String(options?.body));
      endRequests.push(body);
      if (!body.defer_voice_cleanup)
        return Response.json({ error: { code: "VOICE_HANGUP_RETRY" } }, { status: 503 });
      return Response.json({
        id: consultationId,
        status: "ENDED",
        report_status: "PENDING",
      });
    }
    if (path === `${pathPrefix}/report/generate`)
      return new Response(null, { status: 204 });
    return originalFetch(path, options);
  });

  async function completeCheckpoint(number: number, summary: string, readings: unknown[]) {
    const requestId = `checkpoint-${number}`;
    await vi.waitFor(() => expect(sends.some((event) => event.event_id === requestId)).toBe(true));
    await controller.event({
      type: "response.done",
      response: {
        id: `draft-${number}`,
        status: "completed",
        metadata: { purpose: "report", request_id: requestId },
        output: [{
          type: "function_call",
          name: "write_report",
          call_id: `draft-call-${number}`,
          arguments: JSON.stringify({ summary, readings }),
        }],
      },
    });
  }

  await controller.start();
  await controller.command("review_question", {
    question: "이직할까 남을까?",
    spreadId: "decision",
  });
  await controller.command("confirm_question");
  await completeCheckpoint(1, "이직을 고민하고 있어요.", []);
  await vi.waitFor(() => expect(checkpoints).toHaveBeenCalledWith({
    summary: "이직을 고민하고 있어요.",
  }));
  await controller.command("select_numbers", { picks: [7, 22, 51] });
  await controller.command("confirm_cards");
  await controller.command("reveal_card", { slot: 1 });
  await controller.command("show_reading", { slot: 1 });
  await controller.event({ type: "response.created", response: { id: "reading" } });
  await controller.event({
    type: "response.output_text.done",
    response_id: "reading",
    text: "지금 상황을 천천히 살펴봐.",
  });
  await completeCheckpoint(2, "이직 선택을 신중히 살피고 있어요.", [
    { slot: 1, text: "서두르기 전에 현재 상황을 정리한다." },
  ]);
  await vi.waitFor(() => expect(checkpoints).toHaveBeenLastCalledWith({
    summary: "이직 선택을 신중히 살피고 있어요.",
    readings: [{ slot: 1, text: "서두르기 전에 현재 상황을 정리한다." }],
  }));
  await controller.end();

  expect(controller.getSnapshot().phase).toBe("ended");
  expect(endRequests).toEqual([
    { reason: "USER", defer_voice_cleanup: true },
    { reason: "USER" },
  ]);
  const paths = vi.mocked(fetch).mock.calls.map(([path]) => path);
  expect(paths).toContain(`${pathPrefix}/report/generate`);
  expect(paths).not.toContain(`${pathPrefix}/report`);
});

test("renews the current voice connection and stops heartbeats on dispose", async () => {
  mockRealtime();
  controller = new Consultation(await session());
  const token = "a".repeat(64);
  const heartbeat = vi.fn();
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, options) => {
    if (path === `${pathPrefix}/realtime-connection`) {
      return new Response("answer", {
        headers: { "X-Voice-Connection": token },
      });
    }
    if (path === `${pathPrefix}/voice-heartbeat`) {
      heartbeat(JSON.parse(String(options?.body)));
      return new Response(null, { status: 204 });
    }
    return originalFetch(path, options);
  });

  vi.useFakeTimers();
  try {
    await controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeat).toHaveBeenCalledExactlyOnceWith({
      connection_token: token,
    });
    await vi.advanceTimersByTimeAsync(30000);
    expect(heartbeat).toHaveBeenCalledTimes(2);
    controller.dispose();
    await vi.advanceTimersByTimeAsync(60000);
    expect(heartbeat).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("requests a wrap-up at nine minutes and ends at the original deadline", async () => {
  mockRealtime();
  const reading = await session();
  vi.useFakeTimers();
  try {
    vi.setSystemTime(reading.endAt! - 600000);
    controller = new Consultation(reading);
    await controller.start();
    const warnings = () => sends.filter((event) => JSON.stringify(event).includes("1분 남았어"));
    await vi.advanceTimersByTimeAsync(539999);
    expect(warnings()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(warnings()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(warnings()).toHaveLength(1);
    const endings = vi.mocked(fetch).mock.calls.filter(([path]) => path === `${pathPrefix}/end`);
    expect(endings).toHaveLength(1);
    expect(JSON.parse(String(endings[0][1]?.body))).toEqual({ reason: "TIMEOUT" });
  } finally {
    vi.useRealTimers();
  }
});
