import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LiveBridge, type LiveCallbacks } from "./live-bridge";
let c: LiveCallbacks, b: LiveBridge;
beforeEach(() => {
  vi.useFakeTimers();
  c = {
    send: vi.fn(),
    append: vi.fn(),
    cancel: vi.fn(),
    transcript: vi.fn(),
    context: () => ({ stage: "listening" }),
    caption: vi.fn(),
    command: vi.fn(async () => ({ ok: true })),
    error: vi.fn(),
    metric: vi.fn(),
  };
  b = new LiveBridge(c, () => Date.now());
});
afterEach(() => {
  b.dispose();
  vi.useRealTimers();
});
test("only Live captions feed Typecast; duplicate events and punctuation-only chunks never speak", async () => {
  const e = {
    type: "session.output_transcript.delta",
    event_id: "a",
    delta: "공주야.",
    end_ms: 100,
  };
  b.event(e);
  b.event(e);
  b.event({ type: "session.output_audio.delta", delta: "nativeAudio" });
  b.event({
    type: "response.event",
    event: { type: "response.output_text.delta" },
  });
  b.event({ type: "session.output_transcript.delta", delta: ".", end_ms: 110 });
  expect(c.append).toHaveBeenCalledExactlyOnceWith("공주야.", true);
  await vi.advanceTimersByTimeAsync(800);
  expect(c.transcript).toHaveBeenCalledWith("assistant", "공주야..", {
    stage: "listening",
  });
});
test("word fragments are joined, remaining unpunctuated tail eventually speaks", async () => {
  b.event({ type: "session.output_transcript.delta", delta: "공주" });
  await vi.advanceTimersByTimeAsync(250);
  expect(c.append).not.toHaveBeenCalled();
  b.event({ type: "session.output_transcript.delta", delta: "야" });
  await vi.advanceTimersByTimeAsync(550);
  expect(c.append).toHaveBeenCalledExactlyOnceWith("공주야", true);
});
test("interruption cancels playback and pending text; late old captions are dropped", async () => {
  b.event({
    type: "session.output_transcript.delta",
    delta: "이전 답.",
    end_ms: 100,
  });
  b.event({
    type: "session.output_transcript.delta",
    delta: "남은",
    end_ms: 150,
  });
  b.userSpeaking(true);
  b.event({
    type: "session.output_transcript.delta",
    delta: "겹친 말",
    end_ms: 160,
  });
  b.userSpeaking(false);
  b.event({
    type: "session.output_transcript.delta",
    delta: "이전 답.",
    end_ms: 90,
  });
  b.event({
    type: "session.output_transcript.delta",
    delta: "새 답.",
    end_ms: 300,
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(c.cancel).toHaveBeenCalled();
  expect(c.append).toHaveBeenCalledTimes(2);
  expect(c.append).toHaveBeenLastCalledWith("새 답.", true);
});
test("collects all function items and sends one continuation after all outputs, even with duplicate events", async () => {
  b.event({
    type: "response.event",
    delegation_id: "d",
    event: { type: "response.created", response: { id: "r" } },
  });
  for (const n of [1, 1, 2])
    b.event({
      type: "response.event",
      delegation_id: "d",
      event: {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: `c${n}`,
          name: "select_numbers",
          arguments: '{"picks":[7]}',
        },
      },
    });
  expect(c.command).not.toHaveBeenCalled();
  for (let n = 0; n < 2; n++)
    b.event({
      type: "response.event",
      delegation_id: "d",
      event: { type: "response.completed", response: { id: "r" } },
    });
  await vi.waitFor(() => expect(c.send).toHaveBeenCalledTimes(3));
  expect(c.command).toHaveBeenCalledTimes(2);
  expect(c.send).toHaveBeenLastCalledWith({ type: "response.create" });
});
test("latency follows queued chunks and cancellation discards obsolete timing", async () => {
  b.event({
    type: "session.output_transcript.delta",
    delta: "첫 문장.",
    end_ms: 100,
  });
  await vi.advanceTimersByTimeAsync(250);
  b.event({
    type: "session.output_transcript.delta",
    delta: "두 문장.",
    end_ms: 500,
  });
  await vi.advanceTimersByTimeAsync(350);
  b.firstAudio();
  expect(c.metric).toHaveBeenLastCalledWith(600);
  b.firstAudio();
  expect(c.metric).toHaveBeenLastCalledWith(350);
  b.interrupt();
  b.firstAudio();
  expect(c.metric).toHaveBeenCalledTimes(2);
});
test("dispose clears buffered fragments and all flush timers", async () => {
  b.event({ type: "session.output_transcript.delta", delta: "남은 말" });
  b.dispose();
  await vi.advanceTimersByTimeAsync(1000);
  b.event({ type: "session.output_transcript.delta", delta: "무시." });
  expect(c.append).not.toHaveBeenCalled();
});
test("screen actions wait for outstanding tool results; Korean context fits the append token ceiling", async () => {
  b.event({
    type: "response.event",
    delegation_id: "d",
    event: { type: "response.created", response: { id: "r" } },
  });
  b.note("한글😀".repeat(1000));
  expect(c.send).toHaveBeenCalledTimes(1);
  const first = vi.mocked(c.send).mock.calls[0][0] as { content: string };
  expect(new TextEncoder().encode(first.content).length).toBeLessThanOrEqual(
    450,
  );
  b.event({
    type: "response.event",
    delegation_id: "d",
    event: {
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "c",
        name: "confirm_question",
        arguments: "{}",
      },
    },
  });
  b.event({
    type: "response.event",
    delegation_id: "d",
    event: { type: "response.completed", response: { id: "r" } },
  });
  await vi.waitFor(() => expect(c.send).toHaveBeenCalledTimes(4));
  expect(c.send).toHaveBeenNthCalledWith(2, {
    type: "response.item.create",
    item: { type: "function_call_output", call_id: "c", output: '{"ok":true}' },
  });
  expect(c.send).toHaveBeenLastCalledWith({ type: "response.create" });
});
