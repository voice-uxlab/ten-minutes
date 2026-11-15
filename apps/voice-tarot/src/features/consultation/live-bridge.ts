import type { ReadingResult } from "@/api/types";
type FunctionItem = {
  type: string;
  call_id: string;
  name: string;
  arguments: string;
};
export interface LiveEvent {
  type: string;
  event_id?: string;
  delta?: string;
  start_ms?: number;
  end_ms?: number;
  delegation_id?: string;
  event?: {
    type: string;
    response?: { id: string };
    response_id?: string;
    item?: FunctionItem;
  };
  error?: { code?: string };
}
export interface LiveCallbacks {
  send: (event: unknown) => void;
  append: (text: string, flush?: boolean) => void;
  cancel: () => void;
  context: (speaker: "user" | "assistant") => unknown;
  transcript: (
    speaker: "user" | "assistant",
    text: string,
    context: unknown,
  ) => void;
  caption: (text: string) => void;
  command: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ReadingResult>;
  error: (message: string) => void;
  metric: (ms: number) => void;
}
/** Native Live audio is never played. Transcript boundaries and local speech detection are heuristics. */
export class LiveBridge {
  private seen = new Set<string>();
  private calls = new Set<string>();
  private completed = new Set<string>();
  private tasks: Promise<unknown> = Promise.resolve();
  private pendingNotes: string[] = [];
  private processing = 0;
  private awaitingResponse = false;
  private needContinuation = false;
  private batches = new Map<string, { id: string; items: FunctionItem[] }>();
  private timers: Partial<
    Record<"user" | "assistant", ReturnType<typeof setTimeout>>
  > = {};
  private text = { user: "", assistant: "" };
  private contexts: Partial<Record<"user" | "assistant", unknown>> = {};
  private captionText = "";
  private speechBuffer = "";
  private bufferAt?: number;
  private speechTimer?: ReturnType<typeof setTimeout>;
  private pendingStarts: number[] = [];
  private spokenThrough = -1;
  private userThrough = -1;
  private blockedThrough = -1;
  private closed = false;
  private speaking = false;
  private onClosed?: () => void;
  private closeTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private callbacks: LiveCallbacks,
    private now = () => performance.now(),
  ) {}
  event(e: LiveEvent) {
    if (e.type === "session.closed") {
      this.onClosed?.();
      return;
    }
    if (this.closed) return;
    if (e.event_id) {
      if (this.seen.has(e.event_id)) return;
      this.seen.add(e.event_id);
    }
    if (e.type === "session.delegation.created") {
      this.awaitingResponse = true;
      return;
    }
    if (e.type === "error") {
      if (
        ["function_call_outputs_required", "tool_outputs_required"].includes(
          e.error?.code || "",
        )
      ) {
        this.awaitingResponse = false;
        this.needContinuation = true;
        return;
      }
      this.callbacks.error(
        "GPT-Live 응답 오류" + (e.error?.code ? ` (${e.error.code})` : ""),
      );
      return;
    }
    if (e.type === "response.event") {
      this.backend(e);
      return;
    }
    const speaker =
      e.type === "session.input_transcript.delta"
        ? "user"
        : e.type === "session.output_transcript.delta"
          ? "assistant"
          : null;
    if (!speaker || typeof e.delta !== "string" || !e.delta) return;
    if (speaker === "user") {
      if (typeof e.end_ms === "number" && e.end_ms > this.userThrough) {
        this.userThrough = e.end_ms;
        if ((e.start_ms ?? e.end_ms) >= this.spokenThrough) this.interrupt();
      }
    } else {
      if (
        this.speaking ||
        (typeof e.end_ms === "number" && e.end_ms <= this.blockedThrough)
      )
        return;
      this.spokenThrough = Math.max(this.spokenThrough, e.end_ms ?? -1);
      this.captionText = (this.captionText + e.delta).slice(-600);
      this.callbacks.caption(this.captionText);
      if (!this.speechBuffer) this.bufferAt = this.now();
      this.speechBuffer += e.delta;
      // Complete sentences can go immediately. Never send a punctuation-only request.
      const boundary = [
        ...this.speechBuffer.matchAll(/[.!?。！？](?:[”’"'])?(?=\s|$)/g),
      ].at(-1);
      if (boundary) this.speak(boundary.index! + boundary[0].length);
      if (this.speechBuffer && !this.speechTimer) this.scheduleSpeech();
    }
    if (!this.text[speaker])
      this.contexts[speaker] = this.callbacks.context(speaker);
    this.text[speaker] += e.delta;
    clearTimeout(this.timers[speaker]);
    this.timers[speaker] = setTimeout(() => this.flushNote(speaker), 800);
  }
  private scheduleSpeech() {
    this.speechTimer = setTimeout(() => {
      this.speechTimer = undefined;
      if (!this.speechBuffer || this.closed) return;
      const boundary = this.speechBuffer.lastIndexOf(" ") + 1;
      if (boundary >= 12) this.speak(boundary);
      else if (this.now() - (this.bufferAt ?? this.now()) >= 800)
        this.speak(this.speechBuffer.length);
      if (this.speechBuffer) this.scheduleSpeech();
    }, 200);
  }
  private speak(length: number) {
    const text = this.speechBuffer.slice(0, length),
      start = this.bufferAt ?? this.now();
    this.speechBuffer = this.speechBuffer.slice(length);
    this.bufferAt = this.speechBuffer ? this.now() : undefined;
    if (!/[\p{L}\p{N}]/u.test(text)) return;
    this.pendingStarts.push(start);
    this.callbacks.append(text, true);
  }
  private backend(e: LiveEvent) {
    const event = e.event,
      key = e.delegation_id || "default";
    if (!event) return;
    if (event.type === "response.created" && event.response) {
      this.awaitingResponse = false;
      const existing = this.batches.get(key);
      if (existing?.id !== event.response.id)
        this.batches.set(key, { id: event.response.id, items: [] });
      return;
    }
    if (
      event.type === "response.output_item.done" &&
      event.item?.type === "function_call"
    ) {
      const item = event.item;
      if (this.calls.has(item.call_id)) return;
      this.calls.add(item.call_id);
      const batch = this.batches.get(key) || {
        id: event.response_id || key,
        items: [],
      };
      batch.items.push(item);
      this.batches.set(key, batch);
      return;
    }
    if (
      ![
        "response.completed",
        "response.failed",
        "response.cancelled",
        "response.incomplete",
      ].includes(event.type)
    )
      return;
    const batch = this.batches.get(key),
      id = event.response?.id || batch?.id;
    if (!id || this.completed.has(id)) return;
    this.completed.add(id);
    this.batches.delete(key);
    this.awaitingResponse = false;
    if (event.type !== "response.completed") {
      this.callbacks.error(
        "GPT-Live 백엔드 작업이 완료되지 않았어요. 다시 말해 주세요.",
      );
      return;
    }
    if (!batch?.items.length) {
      this.continueBackend();
      return;
    }
    this.processing++;
    this.tasks = this.tasks
      .catch(() => {})
      .then(async () => {
        for (const item of batch.items) {
          if (this.closed) return;
          let result: ReadingResult;
          try {
            result = await this.callbacks.command(
              item.name,
              JSON.parse(item.arguments),
            );
          } catch {
            result = { error: "함수 처리에 실패했어요." };
          }
          if (this.closed) return;
          this.callbacks.send({
            type: "response.item.create",
            item: {
              type: "function_call_output",
              call_id: item.call_id,
              output: JSON.stringify(result),
            },
          });
        }
        this.needContinuation = true;
      })
      .finally(() => {
        this.processing--;
        this.continueBackend();
      });
  }
  private flushNote(speaker: "user" | "assistant") {
    clearTimeout(this.timers[speaker]);
    const text = this.text[speaker];
    this.text[speaker] = "";
    if (text.trim())
      this.callbacks.transcript(speaker, text, this.contexts[speaker]);
  }
  firstAudio() {
    const start = this.pendingStarts.shift();
    if (start !== undefined)
      this.callbacks.metric(Math.max(0, Math.round(this.now() - start)));
  }
  interrupt() {
    this.blockedThrough = Math.max(
      this.blockedThrough,
      this.spokenThrough,
      this.userThrough,
    );
    clearTimeout(this.speechTimer);
    this.speechTimer = undefined;
    this.speechBuffer = "";
    this.bufferAt = undefined;
    this.pendingStarts = [];
    this.callbacks.cancel();
    this.flushNote("assistant");
    this.captionText = "";
  }
  userSpeaking(speaking: boolean) {
    if (speaking && !this.speaking) this.interrupt();
    this.speaking = speaking;
  }
  private continueBackend() {
    if (
      this.closed ||
      this.processing ||
      this.batches.size ||
      this.awaitingResponse
    )
      return;
    const notes = this.pendingNotes.splice(0);
    for (const text of notes)
      this.callbacks.send({
        type: "response.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "[앱 내부 진행 정보] " + text },
          ],
        },
      });
    if (notes.length || this.needContinuation) {
      this.needContinuation = false;
      this.awaitingResponse = true;
      this.callbacks.send({ type: "response.create" });
    }
  }
  note(text: string, runBackend = true) {
    if (this.closed) return;
    this.interrupt();
    // UTF-8 bytes upper-bound token count, including Korean and emoji; append limit is 500 tokens.
    let brief = "";
    const encoder = new TextEncoder();
    for (const character of text) {
      if (encoder.encode(brief + character).length > 450) break;
      brief += character;
    }
    this.callbacks.send({
      type: "session.thinking.append",
      delegation_id: null,
      content: brief,
    });
    if (runBackend) {
      this.pendingNotes.push(text);
      this.continueBackend();
    } else
      this.callbacks.send({
        type: "session.commentary.append",
        delegation_id: null,
        content: brief,
      });
  }
  async close() {
    if (this.closed) return;
    this.flushNote("user");
    this.flushNote("assistant");
    this.closed = true;
    clearTimeout(this.speechTimer);
    this.callbacks.cancel();
    await new Promise<void>((resolve) => {
      this.onClosed = () => {
        clearTimeout(this.closeTimer);
        resolve();
      };
      this.closeTimer = setTimeout(this.onClosed, 2000);
      this.callbacks.send({ type: "session.close" });
    });
  }
  dispose() {
    this.closed = true;
    clearTimeout(this.timers.user);
    clearTimeout(this.timers.assistant);
    clearTimeout(this.speechTimer);
    clearTimeout(this.closeTimer);
    this.onClosed?.();
    this.callbacks.cancel();
  }
}
