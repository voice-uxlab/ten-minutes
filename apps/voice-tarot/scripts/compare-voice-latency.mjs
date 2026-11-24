// Identical paced audio input, fresh sessions, rotated order; real APIs incur usage.
import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import ts from "typescript";
import { SpeechPlayer } from "../src/features/consultation/speech.ts";
import { bridgeTypecast } from "../server/typecast-speech.ts";
import { ttsConfig } from "../server/tts-config.ts";
import { typecastOptions, defaults } from "../server/voice-settings.ts";
const compiled = ts.transpileModule(
  await readFile(
    new URL("../src/features/consultation/live-bridge.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { LiveBridge } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const config = ttsConfig();
if (config.error || config.provider !== "typecast")
  throw Error(config.error || "Typecast required");
const dir = process.env.BENCH_DIR || "/tmp/voice-tarot-comparison";
await mkdir(dir, { recursive: true });
const inputText = "오늘 일이 너무 많아서 좀 지쳤어. 짧게 위로해 줄래?";
const instructions =
  "한국어로 말해. 사용자가 말을 끝낼 때까지 먼저 말하거나 맞장구치지 마. 사용자가 위로를 요청하면 정확히 다음 두 문장만 말해: 오늘 많이 지쳤구나. 여기서는 잠깐 쉬어도 괜찮아. 도구 호출이나 다른 말은 하지 마.";
let pcm;
try {
  pcm = await readFile(`${dir}/input.pcm`);
} catch {
  const r = await fetch("https://api.typecast.ai/v1/text-to-speech/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": config.key },
    body: JSON.stringify({
      voice_id: config.voice,
      model: config.model,
      language: "kor",
      text: inputText,
      ...typecastOptions({ ...defaults, ...config.settings }),
    }),
  });
  if (!r.ok) throw Error(`Input synthesis ${r.status}`);
  await writeFile(`${dir}/input.wav`, Buffer.from(await r.arrayBuffer()));
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    `${dir}/input.wav`,
    "-ar",
    "24000",
    "-ac",
    "1",
    "-f",
    "s16le",
    `${dir}/input.pcm`,
  ]);
  pcm = await readFile(`${dir}/input.pcm`);
  // Remove trailing silence using the same 20ms energy threshold used for outputs.
  let last = 0;
  for (let i = 0; i < pcm.length; i += 960) {
    if (audible(pcm.subarray(i, i + 960))) last = i + 960;
  }
  pcm = pcm.subarray(0, Math.min(last, pcm.length));
  await writeFile(`${dir}/input.pcm`, pcm);
}
function audible(b) {
  let sum = 0,
    n = 0;
  for (let i = 0; i + 1 < b.length; i += 2) {
    const x = b.readInt16LE(i) / 32768;
    sum += x * x;
    n++;
  }
  return n > 0 && Math.sqrt(sum / n) > 0.005;
}
const meta = {
  date: new Date().toISOString(),
  inputText,
  inputSha256: createHash("sha256").update(pcm).digest("hex"),
  inputMs: pcm.length / 48,
  instructions,
  models: {
    realtime: process.env.REALTIME_MODEL || "gpt-realtime-2.1",
    live: process.env.LIVE_MODEL || "gpt-live-1",
  },
  typecast: {
    voice: config.voice,
    model: config.model,
    speed: config.settings?.speed || 1.2,
  },
  scope:
    "Fresh WebSocket sessions; identical 24kHz PCM paced at 20ms; end=last input audio packet sent; threshold RMS .005; excludes connection setup, browser playback, tools and real human microphone. Current production text chunkers, default Realtime semantic VAD medium, native Live turn handling.",
};
const results = [];
console.log(JSON.stringify({ meta }));
async function trial(mode, round) {
  return new Promise((resolve) => {
    const live = mode !== "realtime-typecast",
      native = mode === "live-noeul";
    const record = { mode, round, transcript: "", inputTranscript: "" };
    let timer,
      feed,
      end,
      firstText,
      firstRequest,
      firstPCM,
      done = false,
      bridge,
      player,
      recordTimer;
    const chunks = [];
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(recordTimer);
      clearInterval(feed);
      bridge?.dispose();
      player?.close();
      out.emit("close");
      if (error) record.error = error;
      if (firstPCM && end !== undefined) {
        record.end_to_audio_ms = Math.round(firstPCM - end);
        record.end_to_text_ms = firstText ? Math.round(firstText - end) : null;
        record.text_to_audio_ms = firstText
          ? Math.round(firstPCM - firstText)
          : null;
        record.buffer_ms =
          firstRequest && firstText
            ? Math.round(firstRequest - firstText)
            : null;
        record.typecast_ms = firstRequest
          ? Math.round(firstPCM - firstRequest)
          : null;
        record.overlap = firstPCM < end;
      }
      record.transcript = record.transcript.trim();
      record.inputTranscript = record.inputTranscript.trim();
      if (ws.readyState === 1 && live)
        ws.send(JSON.stringify({ type: "session.close" }));
      ws.close();
      setTimeout(() => ws.terminate(), 1000).unref();
      if (chunks.length) {
        const path = `${dir}/${mode}-${round}.pcm`;
        writeFile(path, Buffer.concat(chunks)).then(() => resolve(record));
      } else resolve(record);
    };
    const out = new EventEmitter();
    out.readyState = 1;
    out.bufferedAmount = 0;
    out.close = () => {};
    function maybeFinish() {
      if (!firstPCM || end === undefined || recordTimer || done) return;
      recordTimer = setTimeout(() => finish(), round === 1 ? 7000 : 100);
    }
    function audio(b) {
      if (round === 1) chunks.push(b);
      if (!firstPCM && audible(b)) firstPCM = performance.now();
      maybeFinish();
    }
    const socket = { send: (raw) => out.emit("message", raw), close: () => {} };
    const ctx = {
      currentTime: 0,
      destination: {},
      createBuffer: (_, n, rate) => ({
        duration: n / rate,
        getChannelData: () => new Float32Array(n),
      }),
      createBufferSource: () => ({
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
      }),
    };
    player = new SpeechPlayer(ctx, {
      socketFactory: () => socket,
      onError: (e) => finish(e.message),
    });
    if (!native)
      player.connect("ws://benchmark").catch((e) => finish(e.message));
    out.send = (raw) => {
      const e = JSON.parse(raw);
      if (e.type === "error") return finish(e.message);
      if (e.type === "audio") audio(Buffer.from(e.audio, "base64"));
      if (!done) socket.onmessage({ data: raw });
    };
    if (!native)
      bridgeTypecast(out, config, {
        request: (...args) => {
          firstRequest ??= performance.now();
          return fetch(...args);
        },
      });
    else {
      player.close();
    }
    if (live && !native)
      bridge = new LiveBridge({
        send: () => {},
        append: (t, f) => player.append(t, f),
        cancel: () => {},
        context: () => null,
        transcript: () => {},
        caption: () => {},
        command: async () => ({}),
        error: (e) => finish(e),
        metric: () => {},
      });
    const ws = new WebSocket(
      live
        ? "wss://api.openai.com/v1/live/sessions"
        : `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(meta.models.realtime)}`,
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } },
    );
    const startFeed = () => {
      let offset = -24000;
      feed = setInterval(() => {
        if (ws.readyState !== 1 || done) return;
        let b = Buffer.alloc(960);
        if (offset >= 0 && offset < pcm.length) {
          pcm.copy(b, 0, offset, Math.min(offset + 960, pcm.length));
        }
        ws.send(
          JSON.stringify({
            type: live
              ? "session.input_audio.append"
              : "input_audio_buffer.append",
            audio: b.toString("base64"),
          }),
        );
        offset += 960;
        if (end === undefined && offset >= pcm.length) {
          end = performance.now();
          maybeFinish();
        }
      }, 20);
    };
    ws.on("open", () => {
      if (live)
        ws.send(
          JSON.stringify({
            type: "session.start",
            session: {
              model: meta.models.live,
              instructions,
              audio: {
                format: { type: "audio/pcm", rate: 24000 },
                output: { voice: native ? "noeul" : "marin" },
              },
            },
          }),
        );
      else
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              instructions,
              output_modalities: ["text"],
              audio: {
                input: {
                  format: { type: "audio/pcm", rate: 24000 },
                  turn_detection: { type: "semantic_vad", eagerness: "medium" },
                  transcription: {
                    model: "gpt-4o-mini-transcribe",
                    language: "ko",
                  },
                },
              },
            },
          }),
        );
    });
    ws.on("message", (raw) => {
      if (done) return;
      const e = JSON.parse(raw);
      if (
        e.type === "session.started" ||
        (e.type === "session.updated" && !live && !feed)
      )
        startFeed();
      if (e.type === "error")
        return finish(`${e.error?.code}: ${e.error?.message}`);
      if (e.type === "session.input_transcript.delta")
        record.inputTranscript += e.delta || "";
      if (e.type === "conversation.item.input_audio_transcription.completed")
        record.inputTranscript += e.transcript || "";
      if (
        e.type === "session.output_transcript.delta" ||
        e.type === "response.output_text.delta"
      ) {
        if (end === undefined) {
          record.early_output = true;
        }
        firstText ??= performance.now();
        record.transcript += e.delta || "";
        if (!native) {
          if (live) bridge.event(e);
          else player.append(e.delta || "");
        }
      }
      if (e.type === "response.output_text.done" && !live)
        player.append("", true);
      if (native && e.type === "session.output_audio.delta")
        audio(Buffer.from(e.delta || e.audio || "", "base64"));
    });
    ws.on("error", (e) => finish(e.message));
    ws.on("unexpected-response", (_, r) => {
      r.resume();
      finish(`HTTP ${r.statusCode}`);
    });
    timer = setTimeout(() => finish("timeout 40s"), 40000);
  });
}
const modes = process.env.BENCH_MODES?.split(",") || [
  "realtime-typecast",
  "live-typecast",
  "live-noeul",
];
for (let round = 1; round <= Number(process.env.BENCH_ROUNDS || 3); round++)
  for (let j = 0; j < modes.length; j++) {
    const result = await trial(modes[(j + round - 1) % modes.length], round);
    results.push(result);
    console.log(JSON.stringify(result));
    await writeFile(
      `${dir}/results.json`,
      JSON.stringify({ meta, results }, null, 2),
    );
  }
