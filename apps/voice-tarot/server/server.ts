import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { attachSpeechSocket } from "./speech-socket.ts";
import { cards } from "../shared/cards.ts";
import { getInstructions } from "./instructions.ts";
import { ttsConfig } from "./tts-config.ts";
export function shuffle() {
  const deck = cards.map((c) => ({ ...c, reversed: Boolean(randomInt(2)) }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
import { tools, flowInstructions } from "./tools.ts";
import { handleAuth } from "./auth.ts";
import { ReadingStore } from "./reading-store.ts";
const readings = new ReadingStore(
  process.env.READING_STORE_DIR ||
    fileURLToPath(new URL("../poc/.reading-sessions/", import.meta.url)),
  shuffle,
);
export const server = createServer(async (req, res) => {
  const reply = (status: number, data: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url || "/", "http://localhost"),
      path = url.pathname;
    if (await handleAuth(req, res, url)) return;
    if (req.method === "POST") {
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`
      )
        return reply(403, { error: "허용되지 않은 요청입니다." });
      if (path === "/reading") {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 8192)
            return reply(413, { error: "요청이 너무 커요." });
        }
        let request;
        try {
          request = JSON.parse(raw);
        } catch {
          return reply(400, { error: "올바른 JSON이 필요해요." });
        }
        if (!request || typeof request !== "object" || Array.isArray(request))
          return reply(400, { error: "요청 내용을 확인해 주세요." });
        try {
          return reply(200, await readings.request(request));
        } catch (e) {
          return reply(400, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      if (path === "/session") {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 4096)
            return reply(413, { error: "요청이 너무 커요." });
        }
        let instructions: string;
        try {
          const body = JSON.parse(raw || "{}");
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw Error("잘못된 세션 요청이에요.");
          const stored = body.id
            ? await readings.request({ id: body.id, action: "get" })
            : undefined;
          instructions = getInstructions(stored?.state.personaId);
        } catch {
          return reply(400, { error: "상담 정보를 확인해 주세요." });
        }

        const tts = ttsConfig();
        if (tts.error) return reply(503, { error: tts.error });
        if (!process.env.OPENAI_API_KEY)
          return reply(503, {
            error:
              "음성 상담을 시작하려면 서버에 OPENAI_API_KEY를 설정해 주세요.",
          });
        const upstream = await fetch(
          "https://api.openai.com/v1/realtime/client_secrets",
          {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session: {
                type: "realtime",
                model: process.env.REALTIME_MODEL || "gpt-realtime-2.1",
                instructions: instructions + flowInstructions,
                tools,
                output_modalities: ["text"],
                audio: {
                  input: {
                    turn_detection: {
                      type: "semantic_vad",
                      eagerness: "medium",
                    },
                    transcription: {
                      model: "gpt-4o-mini-transcribe",
                      language: "ko",
                    },
                  },
                },
              },
            }),
          },
        );
        if (!upstream.ok)
          return reply(502, {
            error: `음성 세션 발급 실패 (${upstream.status}). 서버의 키와 모델 권한을 확인해 주세요.`,
          });
        const data = await upstream.json();
        return reply(200, { value: data.value });
      }
    }
    if (req.method === "GET" && path === "/research") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(
        await readFile(
          new URL(
            "../poc/docs/research/tarot-reading-research.md",
            import.meta.url,
          ),
        ),
      );
    }
    // Production SPA assets are restricted to the build directory; never serve env/source files.
    if (process.env.SERVE_REACT === "1" && req.method === "GET") {
      const asset =
        /^\/assets\/(?:metallic\/)?[a-zA-Z0-9_.-]+$/.test(path) ||
        path === "/fonts/PretendardVariable.woff2";
      const route =
        path === "/" ||
        ["/login", "/onboarding", "/reports", "/invite/christmas"].includes(
          path,
        ) ||
        /^\/sessions\/[a-f0-9]{48}(?:\/report)?$/.test(path);
      if (asset || route) {
        try {
          const file = asset ? "." + path : "./index.html";
          const data = await readFile(
            new URL(file, new URL("../dist/", import.meta.url)),
          );
          const ext = file.split(".").at(-1);
          res.writeHead(200, {
            "Content-Type":
              (
                {
                  js: "text/javascript",
                  css: "text/css",
                  png: "image/png",
                  woff2: "font/woff2",
                  html: "text/html; charset=utf-8",
                } as Record<string, string>
              )[ext || ""] || "application/octet-stream",
            "Cache-Control": asset ? "public, max-age=3600" : "no-store",
          });
          return res.end(data);
        } catch {
          return reply(404, { error: "프론트엔드를 먼저 빌드해 주세요." });
        }
      }
    }
    reply(404, { error: "Not found" });
  } catch {
    if (!res.headersSent)
      reply(500, { error: "요청을 처리하지 못했어요. 다시 시도해 주세요." });
    else res.end();
  }
});
attachSpeechSocket(server);
if (process.argv[1] === fileURLToPath(import.meta.url))
  server.listen(Number(process.env.PORT || 3000), "127.0.0.1", () =>
    console.log("퀸의 타로 http://localhost:" + (process.env.PORT || 3000)),
  );
