import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { ttsConfig } from "./tts-config.ts";
import { bridgeTypecast } from "./typecast-speech.ts";

export function attachSpeechSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (
      url.pathname !== "/speech" ||
      url.searchParams.has("settings") ||
      ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(
        req.headers.origin || "",
      )
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const config = ttsConfig();
    if (config.error) {
      socket.end(
        "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
      );
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) =>
      bridgeTypecast(client, config),
    );
  });
}
