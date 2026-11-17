import type { Server } from "node:http";
import { validateVoiceSettings } from "./voice-settings.ts";
import WebSocket, { WebSocketServer } from "ws";
import { voiceProtocol } from "./voice-protocol.ts";
import { ttsConfig } from "./tts-config.ts";
import { bridgeTypecast } from "./typecast-speech.ts";

// Preview settings are validated; provider keys always stay on the server.
export function attachSpeechSocket(
  server: Server,
  {
    connect = (url: string, options: WebSocket.ClientOptions) =>
      new WebSocket(url, options),
  } = {},
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (
      url.pathname !== "/speech" ||
      ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(
        req.headers.origin || "",
      )
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    let config = ttsConfig();
    if (url.searchParams.has("settings")) {
      try {
        const settings = validateVoiceSettings(
          JSON.parse(url.searchParams.get("settings")!),
        );
        config = {
          provider: "typecast",
          key: process.env.TYPECAST_API_KEY,
          voice: settings.voice,
          model: settings.model,
          settings,
          error: !process.env.TYPECAST_API_KEY
            ? "TYPECAST_API_KEY required"
            : null,
        };
      } catch {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        return;
      }
    }
    if (config.error) {
      socket.end(
        "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
      );
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) =>
      config.provider === "typecast"
        ? bridgeTypecast(client, config)
        : bridge(client),
    );
  });
  function bridge(client: WebSocket) {
    const protocol = voiceProtocol(
      process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
      process.env.ELEVENLABS_VOICE_ID || "",
    );
    const upstream = connect(protocol.url, {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY || "" },
      handshakeTimeout: 15000,
      maxPayload: 8 * 1024 * 1024,
    });
    const contexts = new Map<string, { length: number; flushed?: boolean }>();
    let ended = false;
    const send = (data: unknown) => {
      if (client.readyState === WebSocket.OPEN)
        client.send(JSON.stringify(data));
    };
    const write = (data: unknown) => {
      if (upstream.readyState === WebSocket.OPEN)
        upstream.send(JSON.stringify(data));
    };
    const cleanup = () => {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      contexts.clear();
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
      else if (upstream.readyState === WebSocket.CONNECTING)
        upstream.terminate();
    };
    const fail = (message: string) => {
      if (ended) return;
      send({ type: "error", message });
      cleanup();
      client.close(1011, "Speech connection failed");
    };
    const heartbeat = setInterval(() => {
      for (const [context_id, context] of contexts)
        if (!context.flushed) write(protocol.keepAlive(context_id));
    }, 10000);
    heartbeat.unref();
    upstream.on("open", () => {
      // Keep one non-speaking context alive during long user turns.
      write(protocol.init("idle"));
      contexts.set("idle", { length: 0 });
      send({ type: "ready" });
    });
    upstream.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.error === "voice_id_does_not_exist")
          return fail(
            "설정된 ElevenLabs 보이스를 찾을 수 없어요. 보이스 ID와 계정의 사용 권한을 확인해 주세요.",
          );
        if (data.error || data.detail)
          return fail(
            "ElevenLabs 음성 생성에 실패했어요. 키·보이스 권한·크레딧을 확인해 주세요.",
          );
        const id = data.context_id ?? data.contextId;
        if (id === "idle" || !contexts.has(id)) return;
        if (client.bufferedAmount > 4 * 1024 * 1024)
          return fail("음성 수신이 지연되고 있어요. 다시 연결해 주세요.");
        if (data.audio) send({ type: "audio", id, audio: data.audio });
        if (data.is_final ?? data.isFinal) {
          send({ type: "done", id });
          contexts.delete(id);
        }
      } catch {
        fail("음성 응답을 읽지 못했어요.");
      }
    });
    upstream.on("unexpected-response", (_req, res) => {
      res.resume();
      fail(
        `ElevenLabs 연결 실패 (${res.statusCode}). 키·보이스 권한·구독을 확인해 주세요.`,
      );
    });
    upstream.on("error", () => fail("ElevenLabs 음성 연결에 실패했어요."));
    upstream.on("close", () => {
      if (!ended) fail("음성 연결이 끊겼어요. 통화를 다시 시작해 주세요.");
    });
    client.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (upstream.readyState !== WebSocket.OPEN)
          return fail("음성 연결 준비가 끝나지 않았어요.");
        if (typeof data.id !== "string" || !/^speech-\d+$/.test(data.id))
          return fail("잘못된 음성 요청이에요.");
        const context_id = data.id;
        if (data.type === "cancel") {
          const context = contexts.get(context_id);
          if (contexts.delete(context_id) && !context?.flushed)
            write({ context_id, close_context: true });
          return;
        }
        if (
          data.type !== "text" ||
          typeof data.text !== "string" ||
          data.text.length > 4000 ||
          typeof data.flush !== "boolean" ||
          (data.generate !== undefined && typeof data.generate !== "boolean")
        )
          return fail("잘못된 음성 요청이에요.");
        let context = contexts.get(context_id);
        if (!context) {
          if (contexts.size >= 5)
            return fail("동시에 처리할 수 있는 음성 응답 수를 초과했어요.");
          context = { length: 0, flushed: false };
          contexts.set(context_id, context);
          write(protocol.init(context_id));
        }
        context.length += data.text.length;
        if (
          context.flushed ||
          context.length > 20000 ||
          upstream.bufferedAmount > 65536
        )
          return fail("음성 요청이 너무 길거나 지연되고 있어요.");
        context.flushed = data.flush;
        // A sentence flush starts synthesis without closing this answer's context.
        write(
          protocol.text(
            context_id,
            data.text,
            data.flush || data.generate === true,
          ),
        );
        // flush generates buffered audio; close_context produces isFinal after that audio.
        if (data.flush) write({ context_id, close_context: true });
      } catch {
        fail("잘못된 음성 요청이에요.");
      }
    });
    client.on("close", cleanup);
    client.on("error", cleanup);
  }
  server.on("close", () => {
    for (const client of wss.clients) client.terminate();
    wss.close();
  });
  return wss;
}
