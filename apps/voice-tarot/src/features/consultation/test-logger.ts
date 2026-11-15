import type { Session } from "@/api/types";
import { redactLog, type TestLogEvent } from "../../../shared/test-log.ts";
export class TestLogger {
  readonly runId = crypto.randomUUID();
  private events: TestLogEvent[] = [];
  private seq = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private saving?: Promise<void>;
  constructor(
    private session: Session,
    private status: (path: string, error?: string) => void,
  ) {}
  log(type: string, data: unknown = {}) {
    if (!import.meta.env.DEV || this.session.demo) return;
    this.events.push({
      seq: ++this.seq,
      at: new Date().toISOString(),
      type,
      data: redactLog(data),
    });
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, 2000);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.saving) {
      await this.saving;
      if (this.events.length) return this.flush();
      return;
    }
    if (!this.events.length) return;
    const events = this.events.splice(0, 100);
    let saved = false;
    this.saving = (async () => {
      try {
        const response = await fetch("/test-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: this.session.readingId,
            runId: this.runId,
            engine: this.session.voiceEngine || "realtime",
            persona: this.session.personaId || "lena",
            events,
          }),
        });
        if (!response.ok) throw Error("대화 로그 저장 실패");
        const data = await response.json();
        saved = true;
        this.status(data.path);
      } catch {
        this.events.unshift(...events);
        this.status("", "로그 저장에 실패했어요. 서버 연결을 확인해 주세요.");
      }
    })();
    await this.saving;
    this.saving = undefined;
    if (saved && this.events.length) await this.flush();
  }
  async recording(blob: Blob) {
    if (!import.meta.env.DEV || this.session.demo) return;
    try {
      const response = await fetch(
        `/test-recording?id=${this.session.readingId}&runId=${this.runId}`,
        { method: "POST", headers: { "Content-Type": blob.type }, body: blob },
      );
      if (!response.ok) throw Error("녹음 저장 실패");
      this.log("recording.saved", {
        bytes: blob.size,
        mime: blob.type,
        tracks: "user microphone only",
      });
    } catch {
      this.log("error", {
        message: "마이크 녹음 파일 저장 실패",
        mime: blob.type,
      });
      this.status(
        "",
        "녹음 파일 저장 실패. 화면의 녹음 다운로드를 이용해 주세요.",
      );
    }
    await this.flush();
  }
}

export async function exportSavedConversations(): Promise<number> {
  const sessions = new Map<string, Session>();
  for (const key of Object.keys(localStorage).filter((key) =>
    key.startsWith("queen:session:"),
  )) {
    try {
      const session = JSON.parse(
        localStorage.getItem(key) || "null",
      ) as Session;
      if (session?.readingId) sessions.set(session.readingId, session);
    } catch {
      /* Ignore corrupt local entries. */
    }
  }
  let count = 0;
  for (const session of sessions.values()) {
    const logger = new TestLogger(
      { ...session, demo: false },
      (_path, error) => {
        if (error) throw Error(error);
      },
    );
    logger.log("archive.import", {
      note: "이전 브라우저 기록 복원. 실제 재생 시점과 함수 호출 상세는 소급 복원할 수 없습니다.",
      demo: session.demo,
      date: session.date,
    });
    if (session.notes?.length)
      for (const note of session.notes) {
        logger.log(
          ["user", "assistant"].includes(note.kind)
            ? "transcript"
            : "archive.flow",
          {
            speaker: note.kind,
            text: note.text,
            originalAt: note.at,
            stage: note.stageLabel,
          },
        );
      }
    else
      for (const text of session.transcript || [])
        logger.log("transcript", {
          speaker: text.startsWith("공주:") ? "user" : "assistant",
          text,
        });
    logger.log("archive.report", { report: session.report });
    await logger.flush();
    count++;
  }
  return count;
}
