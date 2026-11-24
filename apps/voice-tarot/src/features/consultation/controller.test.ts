import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReadingStore } from "../../../server/reading-store.ts";
import { cards } from "../../../shared/cards.ts";
import { Consultation, type RealtimeEvent } from "./controller";
import { emptyReading, type Session } from "@/api/types";
import { profile, saveProfile, loadSession } from "@/lib/storage";
import { queryClient } from "@/api/client";
const audioMock = vi.hoisted(() => ({
  busy: false,
  state: (_busy: boolean) => { void _busy; },
  appended: [] as Array<[string, boolean | undefined]>,
  playback: (_text: string) => {
    void _text;
  },
}));
vi.mock("./speech.ts", () => ({
  displaySpeech: (s: string) => s,
  SpeechPlayer: class {
    get busy() { return audioMock.busy; }
    constructor(
      _context: unknown,
      options: { onPlaybackStart: (text: string) => void; onState: (busy: boolean) => void },
    ) {
      audioMock.playback = options.onPlaybackStart;
      audioMock.state = options.onState;
    }
    async connect() {}
    append(text: string, flush?: boolean) {
      audioMock.appended.push([text, flush]);
    }
    cancel() {}
    close() {}
  },
}));
let dir: string, store: ReadingStore, controller: Consultation;
let mutations: Record<string, number>;
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
  queryClient.clear();
  sends.length = 0;
  audioMock.appended = [];
  audioMock.busy = false;
  mutations = {};
  dir = await mkdtemp(join(tmpdir(), "react-tarot-"));
  store = new ReadingStore(dir, () =>
    cards.map((c) => ({ ...c, reversed: false })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/test-logs")
        return Response.json({ path: ".test-logs/test.md" });
      if (path === "/session") return Response.json({ value: "test-token" });
      if (path.startsWith("https://api.openai.com/"))
        return new Response("answer");
      const body = JSON.parse(String(options?.body));
      mutations[body.action] = (mutations[body.action] || 0) + 1;
      try {
        return Response.json(await store.request(body));
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 400 });
      }
    }),
  );
});
afterEach(async () => {
  controller?.dispose();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});
async function session(demo = true) {
  const created = await store.request({
    id: undefined,
    action: "create",
    masterId: "adaptive",
    previous: undefined,
  });
  return {
    ...emptyReading,
    ...created.state,
    readingId: created.id,
    demo,
    date: new Date().toISOString(),
    notes: [],
    transcript: [],
  } as Session;
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
  await controller.start();
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
  await controller.command("select_numbers", { picks: [22, 51] });
  expect(controller.getSnapshot().session.picks).toEqual([7, 22, 51]);
  await controller.command("confirm_cards");
  const chosen = structuredClone(controller.getSnapshot().session.cards);
  await controller.command("confirm_cards");
  expect(controller.getSnapshot().session.cards).toEqual(chosen);
  for (let slot = 1; slot <= 3; slot++) {
    await controller.command("reveal_card", { slot });
    await controller.command("show_reading", { slot });
    expect(controller.getSnapshot().active).toEqual([slot]);
  }
  await controller.command("show_reading", { slot: 0 });
  expect((await controller.command("request_clarifier", {slot: 2, question: "more"})).error).toBeTruthy();
  expect(controller.getSnapshot().session.cards).toEqual(chosen);
  await controller.end();
  const saved = loadSession(controller.getSnapshot().session.readingId)!;
  expect(saved.ended).toBe(true);
  expect(saved.cards).toHaveLength(3);
  expect(saved.notes.some((n) => n.stageLabel === "종합과 다음 행동")).toBe(
    true,
  );
  expect(saved.report?.readings).toHaveLength(3);
});
test("live duplicate tool events mutate once; remount reconnect does not charge a second ticket", async () => {
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
  saveProfile({ ...profile(), freeUsed: true, tickets: 2 });
  controller = new Consultation(await session(false));
  await controller.start();
  expect(profile().tickets).toBe(1);
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
  expect(audioMock.appended).toEqual([["카드의 상징을 살펴볼게.", true]]);
  expect(controller.getSnapshot().caption).toBe("");
  audioMock.playback("카드의 상징을 살펴볼게.");
  expect(controller.getSnapshot().caption).toBe("카드의 상징을 살펴볼게.");
  await controller.event({
    type: "response.output_text.done",
    response_id: "spoken",
    text: "카드의 상징을 살펴볼게. 마지막 말",
  });
  expect(audioMock.appended.at(-1)).toEqual([" 마지막 말", true]);
  await emit(
    "review_question",
    { question: "오늘 주목할 점?", spreadId: "situation" },
    "one",
  );
  expect(mutations.review_question).toBe(1);
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
  expect(profile().tickets).toBe(1);
  expect(controller.getSnapshot().session.picks).toEqual([7]);
  expect(controller.getSnapshot().phase).toBe("picking");
  // Continue exclusively through model tool events, with no UI interactions.
  const caption = controller.getSnapshot().caption;
  await emit("select_numbers", {picks: [22,51]}, "remaining");
  await emit("confirm_cards", {}, "four");
  await emit("reveal_card", { slot: 1 }, "five");
  await emit("show_reading", { slot: 1 }, "six");
  expect((await controller.command("reveal_card", {slot:2})).error).toBeTruthy();
  for (const slot of [2,3]) {
    audioMock.playback("카드 해석.");
    audioMock.busy = true;
    let settled = false;
    const advancing = emit("reveal_card", {slot}, `reveal-${slot}`).then(() => { settled = true; });
    const responseCount = sends.filter(e => e.type === "response.create").length;
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(settled).toBe(false);
    expect(controller.getSnapshot().session.revealed).not.toContain(slot);
    expect(sends.filter(e => e.type === "response.create")).toHaveLength(responseCount);
    audioMock.busy = false;
    audioMock.state(false);
    await advancing;
    expect(controller.getSnapshot().session.revealed).not.toContain(slot);
    expect(sends.filter(e => e.type === "response.create")).toHaveLength(responseCount);
    const afterAdvance = sends.length;
    await new Promise(resolve => setTimeout(resolve, 750));
    expect(sends).toHaveLength(afterAdvance); // idle callback must not start a second continuation
    await controller.event({type: "input_audio_buffer.speech_started", item_id: `feedback-${slot-1}`});
    await emit("reveal_card", {slot}, `after-feedback-${slot}`);
    expect(controller.getSnapshot().session.revealed).toContain(slot);
    await emit("show_reading", {slot}, `read-${slot}`);
  }
  audioMock.playback("세 번째 카드 해석.");
  expect((await controller.command("show_reading", {slot:0})).awaitingUser).toBe(true);
  await controller.event({type: "input_audio_buffer.speech_started", item_id: "feedback-3"});
  await emit("show_reading", { slot: 0 }, "seven");
  expect(controller.getSnapshot().session.summaryVisited).toBe(true);
  expect(controller.getSnapshot().session.revealed).toEqual([1,2,3]);
  expect(controller.getSnapshot().caption).toContain(caption);
  expect(mutations.confirm_cards).toBe(1);
  audioMock.busy = true;
  const reveals = mutations.reveal_card;
  const pendingReveal = controller.command("reveal_card", {slot: 2});
  controller.dispose();
  expect((await pendingReveal).error).toBeTruthy();
  expect(mutations.reveal_card).toBe(reveals);
});
