import type { NoteContext } from "./domain";
import { takeAudio } from "./audio-context";
import { FastApiError, queryClient } from "@/api/client";
import {
  consultationCommand,
  confirmConsultationEnd,
  closeConsultationVoice,
  generateConsultationReport,
  saveReportCheckpoint,
  saveConsultationReport,
  connectRealtime,
  sendVoiceHeartbeat,
  reportsKey,
  streamSpeech,
} from "@/api/consultations";
import { type Session, type Report, type ReadingResult } from "@/api/types";
import { isLegacyReading, saveSession } from "@/lib/storage";
import { SpeechPlayer, displaySpeech } from "./speech.ts";
import {
  appendNote,
  recordFlow,
  finishNotes,
  noteContext,
  cardInfo,
  openingCue,
  selectionCount,
} from "./domain";

export type Phase =
  | "idle"
  | "connecting"
  | "listening"
  | "question"
  | "picking"
  | "confirm"
  | "reveal"
  | "reading"
  | "ending"
  | "ended"
  | "error";
export interface View {
  session: Session;
  phase: Phase;
  heading: string;
  hint: string;
  caption: string;
  status: string;
  error: string;
  endUnconfirmed?: boolean;
  startIssue?: "microphone";
  retryNumbers?: boolean;
  muted: boolean;
  remaining: number;
  recording?: string;
  busy: boolean;
  active: number[];
  audioPlaying?: boolean;
}
type ToolCall = {
  type: string;
  name: string;
  arguments: string;
  call_id: string;
};
interface Response {
  id: string;
  metadata?: { purpose?: string; request_id?: string };
  status?: string;
  output?: Array<ToolCall & { content?: { text?: string }[] }>;
}
export interface RealtimeEvent {
  type: string;
  event_id?: string;
  response?: Response;
  response_id?: string;
  delta?: string;
  text?: string;
  transcript?: string;
  item_id?: string;
  error?: { code?: string; event_id?: string };
}
const reportTool = {
  type: "function",
  name: "write_report",
  description: "정리한 상담 리포트를 반환한다.",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string" },
      readings: {
        type: "array",
        items: {
          type: "object",
          properties: { slot: { type: "integer" }, text: { type: "string" } },
          required: ["slot", "text"],
          additionalProperties: false,
        },
      },
      queen_line: { type: "string" },
    },
    required: ["summary", "readings", "queen_line"],
    additionalProperties: false,
  },
};

/** Transport and domain state are independent of React rendering. One owner per call. */
export class Consultation {
  private listeners = new Set<() => void>();
  private view: View;
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private stream?: MediaStream;
  private audio?: AudioContext;
  private speech?: SpeechPlayer;
  private readingPlaybackSlot = 0;
  private readingFeedback = new Set<number>();
  private async waitForReadingPlayback(
    slot: number,
  ): Promise<ReadingResult | null> {
    if (!this.speech) return null;
    const generation = this.generation;
    const deadline = Date.now() + 45000;
    // A slow TTS response is pending work, not a failed model tool call.
    // Keep this tool open so no new response/preamble can refill the queue.
    while (this.speech.busy) {
      if (this.stopped || this.interrupted || generation !== this.generation)
        return { error: "사용자 발화나 통화 종료로 진행을 멈췄어." };
      if (this.speech.closed || Date.now() >= deadline)
        return {
          error:
            "음성 재생을 완료하지 못했어. 자동 재시도하지 말고 사용자 입력을 기다려.",
        };
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (this.stopped || this.interrupted || generation !== this.generation)
      return { error: "사용자 발화나 통화 종료로 진행을 멈췄어." };
    if (this.readingFeedback.has(slot)) return null;
    if (this.readingPlaybackSlot !== slot)
      return {
        error: `${slot}번 카드의 해석을 먼저 말해. 진행 안내가 아니라 실제 카드 해석이 필요해.`,
      };
    return {
      awaitingUser: true,
      note: "카드 해석에 대한 사용자 이야기를 기다려. 다음 카드 공개나 자동 재시도는 하지 마.",
    };
  }

  private recorder?: MediaRecorder;
  private timer?: ReturnType<typeof setInterval>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  private heartbeatAbort?: AbortController;
  private pending = false;
  private responding = false;
  private handling = false;
  private interrupted = false;
  private responseId = "";
  private responseContext?: NoteContext;
  private realtimeSpeechBuffer = "";
  private stopped = false;
  private warned = false;
  private generation = 0;
  private inputContexts = new Map<string, NoteContext>();
  private latestInput?: NoteContext;
  private events = new Set<string>();
  private responses = new Set<string>();
  private completed = new Set<string>();
  private calls = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private savingReport = false;
  private endReason?: "USER" | "TIMEOUT";
  private reportCheckpoints = Promise.resolve();
  private checkpointSequence = 0;
  private hasServerDraft = false;
  private savedReadingCheckpoints = new Set<number>();
  private reportRequest?: {
    eventId: string;
    resolve: (report: Partial<Report> | null) => void;
  };
  private wake?: WakeLockSentinel;
  constructor(session: Session) {
    this.hasServerDraft = !!session.hasReportDraft;
    this.view = {
      session: structuredClone(session),
      phase: session.reportPending
        ? "ending"
        : session.ended
          ? "ended"
          : "idle",
      heading: "공주야,\n무슨 일 있었어?",
      hint: "",
      caption: "",
      status: "연결 준비",
      error: session.reportPending ? "마무리 작업을 다시 시도해 주세요." : "",
      endUnconfirmed: session.reportPending && !session.ended,
      muted: false,
      remaining: 0,
      busy: false,
      active: [],
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<View> = {}) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private persist() {
    try {
      const s = this.view.session;
      saveSession(s);
      if (
        !isLegacyReading(s.readingId) &&
        queryClient.getQueryData(["consultation", s.readingId])
      ) {
        queryClient.setQueryData(
          ["consultation", s.readingId],
          structuredClone(s),
        );
      }
    } catch {
      this.update({ error: "이 브라우저에 상담 기록을 저장하지 못했어요." });
    }
  }
  private show(phase: Phase, heading: string, hint = "") {
    this.update({
      phase,
      heading,
      hint,
    });
  }
  private send(event: unknown) {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify(event));
      return true;
    }
    return false;
  }
  private respond() {
    if (this.stopped) return;
    if (this.responding || this.handling) {
      this.pending = true;
      return;
    }
    this.responding = this.send({ type: "response.create" });
  }
  note(text: string) {
    if (this.stopped) return;
    if (this.speech?.busy || this.responding) {
      this.speech?.cancel();
      this.interrupted = true;
      if (this.responding) this.send({ type: "response.cancel" });
    }
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "[시스템 안내] " + text }],
      },
    });
    this.respond();
  }
  private action(
    action: string,
    args: Record<string, unknown> = {},
  ): Promise<ReadingResult> {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        if (this.stopped) return { error: "종료된 통화예요." };
        const s = this.view.session;
        const result = await consultationCommand(s, action, args);
        if (this.stopped) return { error: "종료된 통화예요." };
        if (!result.error && !result.unchanged) recordFlow(s, action, args);
        this.persist();
        this.update();
        return result;
      });
    this.queue = task;
    return task;
  }
  private paintSelection() {
    const s = this.view.session,
      count = selectionCount(s),
      remaining = count - s.picks.length;
    this.show(
      remaining ? "picking" : "confirm",
      remaining
        ? s.picks.length
          ? `${remaining}개만 더\n알려줄래?`
          : `공주가 끌리는\n번호 ${count}개를 말해줘.`
        : `${s.picks.join("번, ")}번.\n이 ${count}장이 맞아?`,
    );
  }
  private restore() {
    const s = this.view.session;
    if (s.clarifier?.confirmed && !s.clarifier.drawn) this.paintSelection();
    else if (s.cards.length)
      this.show(
        "reveal",
        "공주가 고른 카드를\n한 장씩 살펴볼게.",
        `${s.revealed.length} / ${s.cards.length} 카드 공개`,
      );
    else if (s.questionConfirmed) this.paintSelection();
    else if (s.question) this.show("question", "이 이야기를\n함께 살펴볼까?");
    else this.show("listening", "공주야,\n무슨 일 있었어?");
  }
  async command(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<ReadingResult> {
    if (name === "end_call") {
      setTimeout(() => void this.end(), 0);
      return { ok: true };
    }
    const previousSlot =
      name === "reveal_card" && Number(args.slot) > 1
        ? Number(args.slot) - 1
        : name === "show_reading" && args.slot === 0
          ? 3
          : 0;
    if (previousSlot) {
      const blocked = await this.waitForReadingPlayback(previousSlot);
      if (blocked) return blocked;
    }
    const r = await this.action(name, args);
    const s = this.view.session;
    if (name === "select_numbers") {
      const invalid = Array.isArray(r.invalid) && r.invalid.length > 0;
      const emptyVoicePick =
        args.replace !== true &&
        Array.isArray(args.picks) &&
        !args.picks.length;
      this.update({
        retryNumbers:
          s.picks.length < selectionCount(s) &&
          Boolean(r.error || invalid || emptyVoicePick),
      });
    }
    if (r.error || r.unchanged) return r;
    if (name === "confirm_question" && this.dc?.readyState === "open")
      this.checkpointReport(s.question);
    switch (name) {
      case "review_question":
        this.show("question", "이 이야기를\n함께 살펴볼까?");
        break;
      case "confirm_question":
      case "select_numbers":
      case "confirm_clarifier":
        this.paintSelection();
        break;
      case "confirm_cards":
        this.show(
          "reveal",
          "공주가 고른 카드를\n한 장씩 열어볼게.",
          `${s.revealed.length} / ${s.cards.length} 카드 공개`,
        );
        break;
      case "reveal_card":
        this.show(
          "reveal",
          `${args.slot}번째 카드는,\n${r.name}이야.`,
          `${s.revealed.length} / ${s.cards.length} 카드 공개`,
        );
        this.update({ active: [Number(args.slot)] });
        break;
      case "show_reading": {
        const slots = r.context?.focusSlots || [];
        this.show(
          "reading",
          slots.length
            ? `${slots.map((n) => s.cards[n - 1].name).join(" · ")},\n함께 연결해볼게.`
            : "결정의 주인공은\n언제나 공주야.",
          slots.length
            ? slots.map((n) => s.positions[n - 1]).join(" / ")
            : `${s.cards.length}장 종합 리딩`,
        );
        this.update({ active: slots });
        break;
      }
    }
    return r;
  }
  async interact(name: string, args: Record<string, unknown> = {}) {
    if (this.view.busy || this.stopped) return;
    this.update({ busy: true, error: "" });
    try {
      const r = await this.command(name, args);
      if (r.error) throw Error(r.error);
      this.note(
        `사용자가 화면에서 ${name}을 선택했어. 설정을 설명하지 말고 자연스럽게 이어가. ${JSON.stringify(r)}`,
      );
    } catch (e) {
      this.failMessage(e);
    } finally {
      this.update({ busy: false });
    }
  }
  editQuestion(question: string, spreadId: string) {
    appendNote(this.view.session, "user", question, undefined, "typed");
    return this.interact("review_question", { question, spreadId });
  }
  private failMessage(e: unknown) {
    this.update({
      error:
        e instanceof Error
          ? e.message
          : "요청을 처리하지 못했어요. 다시 시도해 주세요.",
    });
  }
  async start(record = false) {
    if (!["idle", "error"].includes(this.view.phase) || this.view.session.ended)
      return;
    const s = this.view.session;
    if (s.endAt && s.endAt <= Date.now()) {
      await this.end("TIMEOUT");
      return;
    }
    this.stopped = false;
    const generation = ++this.generation;
    const stale = () => this.stopped || generation !== this.generation;
    this.show(
      "connecting",
      "잠깐만, 공주야.\n언니가 전화 받을게.",
      "연결 상태를 확인하고 있어요.",
    );
    this.update({ error: "", startIssue: undefined });
    let requestingMicrophone = false;
    try {
      this.audio = takeAudio();
      await this.audio.resume();
      requestingMicrophone = true;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      requestingMicrophone = false;
      if (stale()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.pc = new RTCPeerConnection();
      stream.getTracks().forEach((t) => this.pc!.addTrack(t, stream));
      this.speech = new SpeechPlayer(this.audio, {
        destination: this.audio.destination,
        streamSegment: (text, responseId, index, signal) =>
          streamSpeech(s.readingId, text, responseId, index, signal),
        onState: (busy: boolean) => {
          if (!this.stopped)
            this.update({
              audioPlaying: busy ? this.view.audioPlaying : false,
              status: busy
                ? "레나가 생각하는 중"
                : this.responding
                  ? "레나가 생각하는 중"
                  : "공주 얘기 듣는 중",
            });
        },
        onError: (error: Error) => this.failMessage(error),
        onCaption: (text, segmentStarted) => {
          if (this.stopped) return;
          if (!segmentStarted) {
            this.update({ caption: text });
            return;
          }
          if (this.view.phase === "reading" && this.view.active.length === 1)
            this.readingPlaybackSlot = this.view.active[0];
          this.update({
            caption: text,
            audioPlaying: true,
            status: "레나가 말하는 중",
          });
        },
      });
      if (stale()) return;
      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.onmessage = (m) => {
        try {
          void this.event(JSON.parse(m.data)).catch((e) => this.failMessage(e));
        } catch {
          this.failMessage(Error("통화 이벤트를 읽지 못했어요."));
        }
      };
      const opened = new Promise<void>((resolve, reject) => {
        this.dc!.onopen = () => resolve();
        this.dc!.onerror = () => reject(Error("음성 연결에 실패했어요."));
        this.connectTimer = setTimeout(
          () => reject(Error("연결 시간이 초과됐어요.")),
          30000,
        );
      });
      void opened.catch(() => {});
      await this.pc.setLocalDescription(await this.pc.createOffer());
      if (stale()) return;
      const { answer, connectionToken } = await connectRealtime(
        s.readingId,
        this.pc.localDescription!.sdp,
      );
      if (stale()) return;
      await this.pc.setRemoteDescription({ type: "answer", sdp: answer });
      await opened;
      clearTimeout(this.connectTimer);
      if (stale()) return;
      s.connected = true;
      this.restore();
      this.persist();
      this.startRecording(record);
      if (connectionToken) this.startHeartbeat(connectionToken);
      this.timer = setInterval(() => this.tick(), 500);
      this.tick();
      try {
        this.wake = await navigator.wakeLock?.request("screen");
        if (stale()) void this.wake?.release();
      } catch {
        /* optional */
      }
      this.pc.onconnectionstatechange = () => {
        if (
          ["disconnected", "failed"].includes(this.pc?.connectionState || "") &&
          !this.stopped
        ) {
          this.persist();
          this.stopTransport();
          this.update({
            phase: "error",
            error:
              "연결이 잠깐 끊겼어. 같은 카드와 남은 시간으로 다시 연결할 수 있어.",
          });
        }
      };
      const cue = s.question
        ? "내부 복원 정보다. 복원이나 설정을 이해했다는 말 없이 자연스럽게 이어가. 아직 고르지 않은 번호만 요청하고 기존 카드는 유지해. " +
          JSON.stringify({
            question: s.question,
            questionConfirmed: s.questionConfirmed,
            picks: s.picks,
            cards: s.cards.map(cardInfo),
            revealed: s.revealed,
            plan: s.plan,
            clarifier: s.clarifier,
            readingSlots: s.readingSlots,
            summaryVisited: s.summaryVisited,
            transcript: s.transcript.slice(-8),
          })
        : s.personaId === "test-friend" || s.personaId === "cool-unnie"
          ? "첫 연결이다. 선택된 페르소나로 자연스럽게 인사하고 아직 사연을 말하지 않았으면 고민을 물어봐. 설정이나 연결 상태를 읽지 않는다."
          : openingCue;
      this.note(cue);
    } catch (e) {
      if (stale()) return;
      this.stopTransport();
      this.update({
        phase: "error",
        startIssue: requestingMicrophone ? "microphone" : undefined,
      });
      this.failMessage(e);
    }
  }
  async event(e: RealtimeEvent) {
    if (e.event_id) {
      if (this.events.has(e.event_id)) return;
      this.events.add(e.event_id);
    }
    const s = this.view.session,
      r = e.response;
    if (
      e.type === "response.created" &&
      r &&
      r.metadata?.purpose !== "report" &&
      !this.stopped
    ) {
      if (this.responses.has(r.id)) return;
      this.responses.add(r.id);
      this.responseContext = noteContext(s);
      this.realtimeSpeechBuffer = "";
      this.responseId = r.id;
      this.responding = true;
      this.interrupted = false;
      this.update({ caption: "", status: "레나가 생각하는 중" });
    }
    const current =
      e.response_id === this.responseId && !this.interrupted && !this.stopped;
    if (e.type === "response.output_text.delta" && current) {
      this.realtimeSpeechBuffer += e.delta || "";
      // Batch short sentences from one reply before sending them to Typecast.
      const targetLength = 100;
      if (this.realtimeSpeechBuffer.length >= targetLength) {
        let consumed = 0;
        for (const boundary of this.realtimeSpeechBuffer.matchAll(
          /[.!?。！？]+(?:[”’"'])?(?=\s|$)/g,
        )) {
          const end = boundary.index + boundary[0].length;
          if (end - consumed < targetLength) continue;
          const segment = this.realtimeSpeechBuffer.slice(consumed, end);
          if (/[\p{L}\p{N}]/u.test(segment))
            this.speech?.append(segment, this.responseId);
          consumed = end;
        }
        this.realtimeSpeechBuffer = this.realtimeSpeechBuffer.slice(consumed);
      }
    }
    if (e.type === "response.output_text.done" && current) {
      const text = displaySpeech(e.text || "");
      s.transcript.push("레나: " + text);
      appendNote(s, "assistant", text, this.responseContext);
      if (/[\p{L}\p{N}]/u.test(this.realtimeSpeechBuffer))
        this.speech?.append(this.realtimeSpeechBuffer, this.responseId);
      this.realtimeSpeechBuffer = "";
      this.persist();
      const context = this.responseContext;
      if (context?.stage === "reading" && context.focusSlots.length === 1)
        this.checkpointReport(undefined, context.focusSlots[0]);
    }
    if (
      e.type === "conversation.item.input_audio_transcription.completed" &&
      e.transcript
    ) {
      s.transcript.push("공주: " + e.transcript);
      appendNote(
        s,
        "user",
        e.transcript,
        this.inputContexts.get(e.item_id || "") ||
          this.latestInput ||
          noteContext(s),
      );
      this.inputContexts.delete(e.item_id || "");
      this.persist();
    }
    if (e.type === "input_audio_buffer.speech_started" && !this.stopped) {
      this.latestInput = noteContext(s);
      if (e.item_id) this.inputContexts.set(e.item_id, this.latestInput);
      this.interrupted = true;
      if (this.readingPlaybackSlot)
        this.readingFeedback.add(this.readingPlaybackSlot);
      this.readingPlaybackSlot = 0;
      this.realtimeSpeechBuffer = "";
      this.speech?.cancel();
      this.pending = false;
      if (this.responding) this.send({ type: "response.cancel" });
      this.update({ status: "공주 얘기 듣는 중" });
    }
    if (
      e.type === "input_audio_buffer.speech_stopped" &&
      this.view.phase === "picking" &&
      !this.stopped
    ) {
      this.update({ status: "말해준 번호를 확인하는 중" });
    }
    if (e.type === "response.done" && r) {
      if (this.completed.has(r.id)) return;
      this.completed.add(r.id);
      if (r.metadata?.purpose === "report") {
        const request = this.reportRequest;
        if (!request || (r.metadata.request_id
          ? r.metadata.request_id !== request.eventId
          : !request.eventId.startsWith("report-"))) return;
        const report = r.output?.find(
          (item) =>
            item.type === "function_call" && item.name === reportTool.name,
        );
        const text =
          report?.arguments ??
          (r.output || [])
            .flatMap((item) => item.content || [])
            .map((part) => part.text || "")
            .join("");
        try {
          this.reportRequest?.resolve(
            r.status === "completed"
              ? JSON.parse(
                  text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
                )
              : null,
          );
        } catch {
          this.reportRequest?.resolve(null);
        }
        return;
      }
      if (r.id !== this.responseId) return;
      this.responding = false;
      if (this.stopped) return;
      if (this.interrupted) {
        if (this.pending) {
          this.pending = false;
          this.respond();
        }
        return;
      }
      if (r.status === "failed") {
        this.speech?.cancel();
        this.failMessage(Error("응답 생성에 실패했어요. 다시 말해 주세요."));
        return;
      }
      let used = false;
      let awaitingUser = false;
      this.handling = true;
      try {
        for (const item of r.output || []) {
          if (this.stopped || this.interrupted || r.id !== this.responseId)
            break;
          if (item.type !== "function_call" || this.calls.has(item.call_id))
            continue;
          this.calls.add(item.call_id);
          used = true;
          let result;
          try {
            result = await this.command(
              item.name,
              JSON.parse(item.arguments || "{}"),
            );
          } catch {
            result = { error: "작업 실패. 다시 시도해." };
          }
          awaitingUser ||= result.awaitingUser === true;
          this.send({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: item.call_id,
              output: JSON.stringify(result),
            },
          });
        }
      } finally {
        this.handling = false;
      }
      if (
        !this.stopped &&
        r.id === this.responseId &&
        !awaitingUser &&
        ((!this.interrupted && used) || this.pending)
      ) {
        this.pending = false;
        this.respond();
      }
    }
    if (
      e.type === "error" &&
      this.reportRequest &&
      this.reportRequest.eventId === e.error?.event_id
    ) {
      this.reportRequest?.resolve(null);
      return;
    }
    if (e.type === "error" && !this.stopped) {
      if (e.error?.code === "response_cancel_not_active") {
        if (this.pending) {
          this.responding = false;
          this.pending = false;
          this.respond();
        }
      } else
        this.failMessage(
          Error("음성 응답에 문제가 생겼어요. 다시 말해 주세요."),
        );
    }
  }
  mute() {
    if (!this.stream) return;
    const muted = !this.view.muted;
    this.stream.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    this.update({ muted });
  }
  private startHeartbeat(token: string) {
    const { signal } = (this.heartbeatAbort = new AbortController());
    const beat = async () => {
      if (signal.aborted || this.dc?.readyState !== "open") return;
      try {
        await sendVoiceHeartbeat(
          this.view.session.readingId,
          token,
          AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        );
      } catch (error) {
        if (signal.aborted) return;
        if (
          error instanceof FastApiError &&
          [401, 404, 409].includes(error.status)
        ) {
          if (this.view.phase === "ending") return;
          if ((this.view.session.endAt ?? Infinity) <= Date.now()) {
            await this.end("TIMEOUT");
            return;
          }
          this.stopTransport();
          this.update({
            phase: "error",
            error: "음성 연결이 끊겼어. 같은 카드로 다시 연결할 수 있어.",
          });
          return;
        }
      }
      if (!signal.aborted)
        this.heartbeatTimer = setTimeout(() => void beat(), 30000);
    };
    void beat();
  }
  private tick() {
    const left = Math.max(
      0,
      Math.ceil(((this.view.session.endAt || 0) - Date.now()) / 1000),
    );
    this.update({ remaining: left });
    if (left > 0 && left <= 60 && !this.warned) {
      this.warned = true;
      this.note("1분 남았어. 하던 해석을 마무리해. ");
    }
    if (!left) void this.end("TIMEOUT");
  }

  private startRecording(enabled: boolean) {
    if (!enabled || !this.stream || !globalThis.MediaRecorder) return;
    try {
      const chunks: BlobPart[] = [];
      this.recorder = new MediaRecorder(this.stream);
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      this.recorder.onstop = () => {
        if (this.view.recording) URL.revokeObjectURL(this.view.recording);
        const blob = new Blob(chunks, { type: this.recorder?.mimeType });
        this.update({ recording: URL.createObjectURL(blob) });
      };
      this.recorder.start();
    } catch {
      this.failMessage(
        Error("녹음을 시작하지 못했어요. 상담은 계속할 수 있어요."),
      );
    }
  }
  private fallback(): Report {
    const s = this.view.session;
    return {
      question: s.question || "오늘의 마음 이야기",
      summary: "상담 내용을 요약하지 못했어.",
      readings: s.cards
        .filter((c) => s.revealed.includes(c.slot))
        .map((c) => ({
          slot: c.slot,
          text: `${cardInfo(c).direction} · ${cardInfo(c).keywords}`,
        })),
      queen_line: "네 마음에 먼저 답해줘. 선택하는 건 너야.",
    };
  }
  private async requestReport(eventId: string, waitMs: number) {
    const s = this.view.session;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<Partial<Report> | null>((resolve) => {
        this.reportRequest = { eventId, resolve };
        timeout = setTimeout(() => resolve(null), waitMs);
        if (
          !this.send({
            type: "response.create",
            event_id: eventId,
            response: {
              conversation: "none",
              output_modalities: ["text"],
              metadata: { purpose: "report", request_id: eventId },
              tools: [reportTool],
              tool_choice: { type: "function", name: reportTool.name },
              instructions:
                "write_report로 상담을 정리해. summary는 사용자의 고민과 상황을 새로 요약한 한 문장으로 120자 안에서 써. 카드별 해석, 상담 대사, 질문은 summary에 넣지 마. 공개된 카드만 readings에 각 한 문장으로 정리해. queen_line은 짧은 조언이야. 어느 필드에도 실명이나 연락처를 넣거나 입력 기록을 그대로 옮기지 마.",
              input: [
                {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: JSON.stringify({
                        question: s.question,
                        cards: s.cards
                          .filter((card) => s.revealed.includes(card.slot))
                          .map(cardInfo),
                        transcript: s.transcript.join("\n").slice(-6000),
                      }),
                    },
                  ],
                },
              ],
            },
          })
        )
          resolve(null);
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      this.reportRequest = undefined;
    }
  }
  private checkpointReport(question?: string, slot?: number) {
    const generation = this.generation;
    const { readingId } = this.view.session;
    const eventId = `checkpoint-${++this.checkpointSequence}`;
    this.reportCheckpoints = this.reportCheckpoints.then(async () => {
      if (this.generation !== generation || this.dc?.readyState !== "open")
        return;
      if (slot && this.savedReadingCheckpoints.has(slot))
        return;

      const seed = question?.trim().slice(0, 300);
      if (seed) {
        await saveReportCheckpoint(readingId, { summary: seed });
        this.hasServerDraft = true;
      }
      const result = await this.requestReport(eventId, 4000);
      if (this.generation !== generation || !result) return;
      const summary = typeof result.summary === "string"
        ? result.summary.trim().slice(0, 300)
        : "";
      const reading = Array.isArray(result.readings)
        ? result.readings.find((entry) => entry?.slot === slot)
        : undefined;
      const text = typeof reading?.text === "string" ? reading.text.trim().slice(0, 300) : "";
      if (!summary && (!slot || !text)) return;
      await saveReportCheckpoint(readingId, {
        ...(summary ? { summary } : {}),
        ...(slot && text ? { readings: [{ slot, text }] } : {}),
      });
      this.hasServerDraft = true;
      if (slot && text) this.savedReadingCheckpoints.add(slot);
    }).catch(() => {
      // The last acknowledged checkpoint remains available for recovery.
    });
  }
  async end(reason: "USER" | "TIMEOUT" = "USER") {
    if (["ending", "ended"].includes(this.view.phase)) return;
    this.update({ phase: "ending" });
    finishNotes(this.view.session);
    this.stopped = true;
    this.show(
      "ending",
      "오늘도 괜찮아, 공주야.",
      "오늘의 이야기를 정리하고 있어.",
    );

    this.speech?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    clearInterval(this.timer);
    this.view.session.report = this.fallback();
    this.view.session.reportPending = true;
    this.persist();
    if (reason === "TIMEOUT") this.stopTransport();
    await this.queue.catch(() => {});
    await this.reportCheckpoints;
    const s = this.view.session;
    const remaining = (s.endAt ?? Date.now()) - Date.now();
    let result: Partial<Report> | null = null;
    if (!this.hasServerDraft && reason === "USER" && remaining > 0 && this.dc?.readyState === "open") {
      if (this.responding) this.send({ type: "response.cancel" });
      result = await this.requestReport(`report-${s.readingId}`, Math.min(25000, remaining));
    }
    this.stopTransport();
    const base = this.fallback();
    const summary =
      typeof result?.summary === "string" ? result.summary.trim() : "";
    const validSummary =
      summary.length > 0 &&
      summary.length <= 120 &&
      !/[\n\r?？]/.test(summary) &&
      !s.transcript.some(
        (line) => line.startsWith("레나:") && line.includes(summary),
      );

    this.view.session.report = {
      ...base,
      summary: validSummary ? summary : base.summary,
      queen_line:
        typeof result?.queen_line === "string" && result.queen_line.trim()
          ? result.queen_line
          : base.queen_line,
      readings: base.readings.map((reading) => {
        const text = Array.isArray(result?.readings)
          ? result.readings.find((item) => item?.slot === reading.slot)?.text
          : undefined;
        return typeof text === "string" && text.trim()
          ? { ...reading, text }
          : reading;
      }),
    };
    this.view.session.reportPending = true;
    this.persist();
    await this.saveReport(reason);
  }
  async saveReport(reason?: "USER" | "TIMEOUT") {
    const s = this.view.session;
    const draft = s.report;
    if (this.savingReport || !draft) return;
    this.endReason =
      reason ??
      this.endReason ??
      (s.endAt && s.endAt <= Date.now() ? "TIMEOUT" : "USER");
    this.savingReport = true;
    this.update({ error: "", endUnconfirmed: false, busy: true });
    let endConfirmed = false;
    try {
      const ended = await confirmConsultationEnd(
        s.readingId,
        this.endReason,
        reason === undefined,
        this.hasServerDraft,
      );
      endConfirmed = true;
      s.ended = true;
      this.persist();
      if (ended.report_status === "PENDING") {
        s.report = undefined;
        if (this.hasServerDraft && reason)
          void closeConsultationVoice(s.readingId, reason).catch(() => {});
        void generateConsultationReport(s.readingId)
          .then(() => queryClient.invalidateQueries({ queryKey: ["report", s.readingId] }))
          .catch(() => {});
      } else {
        s.report = await saveConsultationReport(ended, draft);
      }
      void queryClient.invalidateQueries({ queryKey: reportsKey });
      void queryClient.invalidateQueries({ queryKey: ["report", s.readingId] });
      void queryClient.invalidateQueries({
        queryKey: ["consultation", s.readingId],
      });
      s.reportPending = false;
      this.persist();
      this.update({ phase: "ended", caption: s.report?.queen_line || "" });
    } catch (error) {
      this.persist();
      this.update({ endUnconfirmed: !endConfirmed });
      this.failMessage(error);
    } finally {
      this.savingReport = false;
      this.update({ busy: false });
    }
  }
  private stopTransport() {
    this.readingPlaybackSlot = 0;
    this.stopped = true;
    this.generation++;
    this.reportRequest?.resolve(null);
    clearInterval(this.timer);
    clearTimeout(this.connectTimer);
    clearTimeout(this.heartbeatTimer);
    this.heartbeatAbort?.abort();
    if (this.pc) this.pc.onconnectionstatechange = null;
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.speech?.close();
    this.dc?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.wake?.release().catch(() => {});
    void this.audio?.close().catch(() => {});
    this.responding = false;
    this.pending = false;
    this.handling = false;
  }
  dispose() {
    this.persist();
    this.stopTransport();
    if (this.view.recording) URL.revokeObjectURL(this.view.recording);
  }
}
