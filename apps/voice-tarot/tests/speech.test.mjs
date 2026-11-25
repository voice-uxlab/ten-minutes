import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SpeechPlayer,
  displaySpeech,
} from "../src/features/consultation/speech.ts";

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(32000, 24);
header.writeUInt16LE(16, 34);
header.write("data", 36);

function setup(options = {}) {
  const played = [],
    errors = [];
  const context = {
    currentTime: 0,
    destination: {},
    createBuffer(_, length, rate) {
      const samples = new Float32Array(length);
      return { duration: length / rate, getChannelData: () => samples };
    },
    createBufferSource() {
      return {
        connect() {},
        disconnect() {},
        start(at) {
          this.at = at;
          played.push(this);
        },
        stop() {
          this.stopped = true;
        },
      };
    },
  };
  const player = new SpeechPlayer(context, {
    onError: (error) => errors.push(error.message),
    ...options,
  });
  return { player, context, played, errors };
}

test("acting tags stay out of captions", () => {
  assert.equal(displaySpeech("[conf"), "");
  assert.equal(
    displaySpeech("[confident] 공주, [warmly] 괜찮아."),
    "공주,  괜찮아.",
  );
});

test("FastAPI audio handles a split WAV header, plays before EOF and cancels old segments", async (t) => {
  const streams = [];
  const s = setup({
    streamSegment: async (text, responseId, index, signal) =>
      new Response(
        new ReadableStream({
          start(stream) {
            streams.push({ text, responseId, index, signal, stream });
            signal.addEventListener(
              "abort",
              () => stream.error(signal.reason),
              { once: true },
            );
          },
        }),
      ),
  });
  t.after(() => s.player.close());
  s.player.append("첫 문장이야.", "response-1");
  s.player.append("대기 중인 문장이야.", "response-1");
  const first = streams[0];
  assert.equal(first.index, 0);
  first.stream.enqueue(header.subarray(0, 20));
  first.stream.enqueue(
    Buffer.concat([header.subarray(20), Buffer.from([0, 64])]),
  );
  await nextTurn();
  assert.equal(s.played[0].buffer.duration, 1 / 32000);
  assert.equal(s.played[0].buffer.getChannelData(0)[0], 0.5);
  s.player.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(s.played[0].stopped, true);
  s.player.append("새 답변이야.", "response-2");
  await nextTurn();
  assert.deepEqual(
    streams.map(({ text, responseId, index }) => [text, responseId, index]),
    [
      ["첫 문장이야.", "response-1", 0],
      ["새 답변이야.", "response-2", 0],
    ],
  );
  streams[1].stream.enqueue(Buffer.concat([header, Buffer.from([0, 64])]));
  streams[1].stream.close();
  await nextTurn();
  assert.equal(s.played.length, 2);
  assert.deepEqual(s.errors, []);
});

test("HTTP synthesis preserves sentence order and captions follow scheduled playback", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [],
    captions = [];
  const s = setup({
    streamSegment: async (text, responseId, index) => {
      calls.push([text, responseId, index]);
      return new Response(Buffer.concat([header, new Uint8Array(64000)]));
    },
    onPlaybackStart: (text) => captions.push(text),
  });
  t.after(() => s.player.close());
  s.player.append("첫 문장.", "same-response");
  s.player.append("둘째 문장.", "same-response");
  await nextTurn();
  assert.deepEqual(calls, [
    ["첫 문장.", "same-response", 0],
    ["둘째 문장.", "same-response", 1],
  ]);
  assert.ok(s.played[0].at < s.played[1].at);
  assert.deepEqual(captions, []);
  s.context.currentTime = 0.025;
  t.mock.timers.tick(25);
  assert.deepEqual(captions, ["첫 문장."]);
  s.player.cancel();
  s.context.currentTime = 2;
  t.mock.timers.tick(2000);
  assert.deepEqual(captions, ["첫 문장."]);
});

test("invalid HTTP audio stops playback and reports an error", async (t) => {
  const s = setup({
    streamSegment: async () => new Response(new Uint8Array(44)),
  });
  t.after(() => s.player.close());
  s.player.append("합성 오류.", "response");
  await nextTurn();
  assert.equal(s.player.busy, false);
  assert.equal(s.player.closed, true);
  assert.equal(s.played.length, 0);
  assert.equal(s.errors.length, 1);
});
