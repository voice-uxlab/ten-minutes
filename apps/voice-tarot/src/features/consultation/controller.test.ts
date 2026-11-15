import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReadingStore } from "../../../poc/reading-store.mjs";
import { cards } from "../../../poc/cards.mjs";
import { Consultation, type RealtimeEvent } from "./controller";
import { emptyReading, type Session } from "@/api/types";
import { profile, saveProfile, loadSession } from "@/lib/storage";
import { queryClient } from "@/api/client";
vi.mock("../../../poc/speech.mjs", () => ({
  displaySpeech: (s: string) => s,
  SpeechPlayer: class {
    busy = false;
    async connect() {}
    append() {}
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
  mutations = {};
  dir = await mkdtemp(join(tmpdir(), "react-tarot-"));
  store = new ReadingStore(dir, () =>
    cards.map((c) => ({ ...c, reversed: false })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
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
test("partial picks, same-card confirmation, grouped five-card reading, flow notes and reload report", async () => {
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
  expect(controller.getSnapshot().heading).toContain("3개만 더");
  expect(controller.getSnapshot().session.cards).toHaveLength(0);
  await controller.command("select_numbers", { picks: [22, 51, 15, 35] });
  expect(controller.getSnapshot().session.picks).toEqual([7, 22, 51, 15, 35]);
  await controller.command("confirm_cards");
  const chosen = structuredClone(controller.getSnapshot().session.cards);
  await controller.command("confirm_cards");
  expect(controller.getSnapshot().session.cards).toEqual(chosen);
  for (let slot = 1; slot <= 5; slot++)
    await controller.command("reveal_card", { slot });
  await controller.command("show_reading", { slots: [1, 3] });
  expect(controller.getSnapshot().active).toEqual([1, 3]);
  await controller.command("show_reading", { slot: 0 });
  await controller.command("request_clarifier", {
    slot: 2,
    question: "부담을 줄이려면?",
  });
  await controller.command("confirm_clarifier");
  await controller.command("select_numbers", { picks: [9] });
  await controller.command("confirm_cards");
  expect(controller.getSnapshot().session.cards.slice(0, 5)).toEqual(chosen);
  await controller.command("reveal_card", { slot: 6 });
  await controller.end();
  const saved = loadSession(controller.getSnapshot().session.readingId)!;
  expect(saved.ended).toBe(true);
  expect(saved.cards).toHaveLength(6);
  expect(saved.notes.some((n) => n.stageLabel === "종합과 다음 행동")).toBe(
    true,
  );
  expect(saved.report?.readings).toHaveLength(6);
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
  await emit(
    "review_question",
    { question: "오늘 주목할 점?", spreadId: "focus" },
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
  const id = controller.getSnapshot().session.readingId;
  controller.dispose();
  controller = new Consultation(loadSession(id)!);
  await controller.start();
  expect(profile().tickets).toBe(1);
  expect(controller.getSnapshot().session.picks).toEqual([7]);
  expect(controller.getSnapshot().phase).toBe("confirm");
});
