import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  redactLog,
  renderTestLog,
  type TestLogBatch,
} from "../shared/test-log.ts";
import type { ReadingStore } from "./reading-store.ts";
export class TestLogStore {
  private queues = new Map<string, Promise<void>>();
  readonly directory: string;
  constructor(directory: string) {
    this.directory = directory;
  }
  key(id: string, runId: string) {
    if (!/^[a-f0-9]{48}$/.test(id) || !/^[a-f0-9-]{36}$/.test(runId))
      throw Error("잘못된 로그 ID");
    return `${id}-${runId}`;
  }
  async append(batch: TestLogBatch) {
    const key = this.key(batch.id, batch.runId);
    const task = (this.queues.get(key) || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        let previous: TestLogBatch = { ...batch, events: [] };
        try {
          previous = JSON.parse(
            await readFile(join(this.directory, key + ".json"), "utf8"),
          );
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        const events = new Map(previous.events.map((e) => [e.seq, e]));
        for (const e of batch.events)
          if (!events.has(e.seq)) events.set(e.seq, e);
        const combined = redactLog({
          ...batch,
          events: [...events.values()],
        }) as TestLogBatch;
        await writeFile(
          join(this.directory, key + ".json.tmp"),
          JSON.stringify(combined),
          { mode: 0o600 },
        );
        await rename(
          join(this.directory, key + ".json.tmp"),
          join(this.directory, key + ".json"),
        );
        let recording = false;
        try {
          await readFile(join(this.directory, key + ".webm"));
          recording = true;
        } catch {
          /* Recording is optional. */
        }
        await writeFile(
          join(this.directory, key + ".md.tmp"),
          renderTestLog(combined, recording),
          { mode: 0o600 },
        );
        await rename(
          join(this.directory, key + ".md.tmp"),
          join(this.directory, key + ".md"),
        );
      });
    this.queues.set(key, task);
    try {
      await task;
    } finally {
      if (this.queues.get(key) === task) this.queues.delete(key);
    }
    return `.test-logs/${key}.md`;
  }
}
export const testLogs = new TestLogStore(
  new URL("../.test-logs/", import.meta.url).pathname,
);
export async function handleTestLogs(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  readings: ReadingStore,
) {
  if (!["/test-logs", "/test-recording"].includes(url.pathname)) return false;
  const reply = (status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (
    process.env.SERVE_REACT === "1" ||
    process.env.NODE_ENV === "production"
  ) {
    reply(404, { error: "로컬 개발 통화에서만 로그를 저장합니다." });
    return true;
  }
  if (req.method !== "POST") {
    reply(405, { error: "POST required" });
    return true;
  }
  if (
    req.headers.origin &&
    ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(
      req.headers.origin,
    )
  ) {
    reply(403, { error: "허용되지 않은 요청" });
    return true;
  }
  try {
    const limit =
      url.pathname === "/test-recording" ? 50 * 1024 * 1024 : 1024 * 1024;
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) {
        reply(413, { error: "로그가 너무 커요." });
        return true;
      }
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    if (url.pathname === "/test-recording") {
      const id = url.searchParams.get("id") || "",
        runId = url.searchParams.get("runId") || "";
      const key = testLogs.key(id, runId);
      await readings.request({ id, action: "get" });
      if (!req.headers["content-type"]?.startsWith("audio/webm"))
        throw Error("WebM 녹음만 저장할 수 있어요.");
      await mkdir(testLogs.directory, { recursive: true, mode: 0o700 });
      await writeFile(join(testLogs.directory, key + ".webm"), bytes, {
        mode: 0o600,
      });
      reply(200, { ok: true });
      return true;
    }
    const batch = JSON.parse(bytes.toString("utf8")) as TestLogBatch;
    testLogs.key(batch.id, batch.runId);
    if (
      typeof batch.engine !== "string" ||
      typeof batch.persona !== "string" ||
      !Array.isArray(batch.events) ||
      batch.events.length > 1000 ||
      batch.events.some(
        (e) =>
          !e ||
          !Number.isSafeInteger(e.seq) ||
          e.seq < 1 ||
          typeof e.at !== "string" ||
          !Number.isFinite(Date.parse(e.at)) ||
          typeof e.type !== "string",
      )
    )
      throw Error("잘못된 로그 형식");
    await readings.request({ id: batch.id, action: "get" });
    reply(200, { path: await testLogs.append(batch) });
  } catch {
    reply(400, { error: "테스트 로그를 저장하지 못했어요." });
  }
  return true;
}
