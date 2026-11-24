interface SpeechTurn {
  id: string;
  text: string;
  caption: string;
  audio: Uint8Array[];
  remainder: Uint8Array;
  first: boolean;
  done: boolean;
  timeout?: ReturnType<typeof setTimeout>;
  abort?: AbortController;
  responseId?: string;
  index?: number;
}
interface SpeechOptions {
  onState?: (busy: boolean) => void;
  onError?: (error: Error) => void;
  onFirstAudio?: () => void;
  onPlaybackStart?: (text: string) => void;
  destination?: AudioNode;
  socketFactory?: (url: string) => WebSocket;
  streamSegment?: (
    text: string,
    responseId: string,
    index: number,
    signal: AbortSignal,
  ) => Promise<Response>;
}
export function displaySpeech(text: string) {
  return text
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\[[^\]]*$/, "")
    .replace(/^ +/, "");
}

function wavSampleRate(header: Uint8Array) {
  const view = new DataView(header.buffer);
  const tag = (offset: number) =>
    String.fromCharCode(...header.subarray(offset, offset + 4));
  const rate = view.getUint32(24, true);
  if (
    tag(0) !== "RIFF" ||
    tag(8) !== "WAVE" ||
    tag(12) !== "fmt " ||
    tag(36) !== "data" ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint16(34, true) !== 16 ||
    rate < 8000 ||
    rate > 96000
  )
    throw Error("타입캐스트 오디오 형식을 읽지 못했어요.");
  return rate;
}

// One browser socket per call; independent contexts separate interrupted answers.
export class SpeechPlayer {
  context: AudioContext;
  destination: AudioNode;
  onState: (busy: boolean) => void;
  onError: (error: Error) => void;
  onFirstAudio: () => void;
  onPlaybackStart: (text: string) => void;
  socketFactory: (url: string) => WebSocket;
  private streamSegment?: SpeechOptions["streamSegment"];
  private streaming = false;
  private streamResponse = "";
  private segmentIndex = 0;
  sources: Set<AudioBufferSourceNode>;
  captionTimers: Set<ReturnType<typeof setTimeout>>;
  turns: SpeechTurn[];
  serial: number;
  nextAt: number;
  closed: boolean;
  current: SpeechTurn | null = null;
  socket?: WebSocket;
  ready = false;
  sampleRate = 24000;
  rejectConnect: ((reason: Error) => void) | null = null;
  connectTimer?: ReturnType<typeof setTimeout>;

  constructor(
    context: AudioContext,
    {
      onState = () => {},
      onError = () => {},
      onFirstAudio = () => {},
      onPlaybackStart = () => {},
      destination = context.destination,
      socketFactory = (url) => new WebSocket(url),
      streamSegment,
    }: SpeechOptions = {},
  ) {
    this.context = context;
    this.destination = destination;
    this.onState = onState;
    this.onError = onError;
    this.onFirstAudio = onFirstAudio;
    this.onPlaybackStart = onPlaybackStart;
    this.socketFactory = socketFactory;
    this.streamSegment = streamSegment;
    this.sources = new Set();
    this.captionTimers = new Set();
    this.turns = [];
    this.serial = 0;
    this.nextAt = 0;
    this.closed = false;
  }
  get busy() {
    return this.turns.length > 0 || this.sources.size > 0;
  }
  connect(
    url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/speech`,
  ) {
    if (this.streamSegment) {
      this.ready = true;
      return Promise.resolve();
    }
    this.socket = this.socketFactory(url);
    return new Promise<void>((resolve, reject) => {
      this.rejectConnect = reject;
      this.connectTimer = setTimeout(
        () => this.fail("음성 연결 시간이 초과됐어요."),
        15000,
      );
      this.socket!.onmessage = (event) => {
        if (this.closed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ready") {
            this.sampleRate = data.sampleRate || 24000;
            this.ready = true;
            clearTimeout(this.connectTimer);
            this.rejectConnect = null;
            resolve();
            return;
          }
          if (data.type === "error") return this.fail(data.message);
          const turn = this.turns.find((t) => t.id === data.id);
          if (!turn) return; // Ignore audio already in flight when the user interrupted.
          clearTimeout(turn.timeout);
          turn.timeout = setTimeout(
            () => this.fail("음성 응답이 지연되고 있어요. 다시 전화해 주세요."),
            30000,
          );
          if (data.type === "audio")
            turn.audio.push(
              Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0)),
            );
          if (data.type === "done") {
            turn.done = true;
            clearTimeout(turn.timeout);
          }
          this.drain();
        } catch {
          this.fail("음성 응답을 읽지 못했어요.");
        }
      };
      this.socket!.onerror = () => this.fail("음성 연결에 실패했어요.");
      this.socket!.onclose = () => {
        if (!this.closed)
          this.fail("음성 연결이 끊겼어요. 다시 전화해 주세요.");
      };
    });
  }
  send(data: unknown) {
    if (this.ready && !this.closed) this.socket?.send(JSON.stringify(data));
  }
  append(delta: string, flush = false, responseId?: string) {
    if (this.streamSegment) {
      if (!this.ready || this.closed || !responseId) return;
      if (this.streamResponse !== responseId) {
        this.streamResponse = responseId;
        this.segmentIndex = 0;
      }
      const text = displaySpeech(delta).trim();
      if (!text) return;
      const characters = Array.from(text);
      for (let offset = 0; offset < characters.length; offset += 500) {
        const segment = characters.slice(offset, offset + 500).join("");
        this.turns.push({
          id: `speech-${++this.serial}`,
          text: segment,
          caption: segment,
          audio: [],
          remainder: new Uint8Array(0),
          first: true,
          done: false,
          responseId,
          index: this.segmentIndex++,
          abort: new AbortController(),
        });
      }
      this.onState(true);
      void this.pumpStream();
      return;
    }
    if (this.closed || !this.ready || (!delta && !this.current)) return;
    if (!this.current) {
      this.current = {
        id: `speech-${++this.serial}`,
        text: "",
        caption: "",
        audio: [],
        remainder: new Uint8Array(0),
        first: true,
        done: false,
      };
      this.turns.push(this.current);
      this.onState(true);
    }
    const turn = this.current;
    turn.text += delta;
    turn.caption += delta;
    // Send complete words as they arrive; never invent spaces inside Korean words.
    const sentences = [
      ...turn.text.matchAll(/[.!?。！？](?:[”’"'])?(?=\s|$)/g),
    ];
    const lastSentence = sentences.at(-1);
    const sentenceEnd = lastSentence
      ? lastSentence.index + lastSentence[0].length
      : 0;
    const boundary = flush
      ? turn.text.length
      : Math.max(sentenceEnd, turn.text.lastIndexOf(" ") + 1);
    if (boundary || flush) {
      const text = turn.text.slice(0, boundary);
      turn.text = turn.text.slice(boundary);
      this.send({
        type: "text",
        id: turn.id,
        text: flush || sentenceEnd === boundary ? text.trimEnd() + " " : text,
        flush,
        generate: !flush && sentenceEnd > 0,
      });
      clearTimeout(turn.timeout);
      turn.timeout = setTimeout(
        () => this.fail("음성 응답이 지연되고 있어요. 다시 전화해 주세요."),
        30000,
      );
    }
    if (flush) this.current = null;
  }
  private async pumpStream() {
    if (this.streaming || this.closed || !this.streamSegment) return;
    this.streaming = true;
    try {
      while (this.turns.length && !this.closed) {
        const turn = this.turns[0];
        const signal = AbortSignal.any([
          turn.abort!.signal,
          AbortSignal.timeout(30000),
        ]);
        try {
          const response = await this.streamSegment(
            turn.text,
            turn.responseId!,
            turn.index!,
            signal,
          );
          const reader = response.body?.getReader();
          if (!reader) throw Error("합성 오디오 스트림을 받지 못했어요.");
          const header = new Uint8Array(44);
          let headerSize = 0;
          try {
            while (!signal.aborted) {
              const { value, done } = await reader.read();
              if (done) break;
              if (signal.aborted) break;
              const size = Math.min(header.length - headerSize, value.length);
              if (size) {
                header.set(value.subarray(0, size), headerSize);
                headerSize += size;
                if (headerSize < header.length) continue;
                this.sampleRate = wavSampleRate(header);
              }
              if (value.length > size) {
                turn.audio.push(value.subarray(size));
                this.drain();
              }
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
          if (turn.abort!.signal.aborted) continue;
          if (signal.aborted) throw Error("음성 응답 시간이 초과됐어요.");
          turn.done = true;
          this.drain();
        } catch (error) {
          if (!turn.abort!.signal.aborted) {
            this.fail(
              error instanceof Error
                ? error.message
                : "음성 합성에 실패했어요.",
            );
          }
        }
      }
    } finally {
      this.streaming = false;
    }
  }

  drain() {
    // Later contexts may synthesize early, but their audio must play in text order.
    while (this.turns.length) {
      const turn = this.turns[0];
      for (const value of turn.audio.splice(0)) {
        const bytes = new Uint8Array(turn.remainder.length + value.length);
        bytes.set(turn.remainder);
        bytes.set(value, turn.remainder.length);
        const size = bytes.length - (bytes.length % 2);
        turn.remainder = bytes.slice(size);
        if (!size) continue;
        const buffer = this.context.createBuffer(
          1,
          size / 2,
          this.sampleRate || 24000,
        );
        const samples = buffer.getChannelData(0),
          view = new DataView(bytes.buffer);
        for (let i = 0; i < samples.length; i++)
          samples[i] = view.getInt16(i * 2, true) / 32768;
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.destination);
        this.sources.add(source);
        source.onended = () => {
          this.sources.delete(source);
          source.disconnect();
          if (!this.busy) this.onState(false);
        };
        const at = Math.max(this.context.currentTime + 0.025, this.nextAt);
        source.start(at);
        this.nextAt = at + buffer.duration;
        if (turn.first) {
          turn.first = false;
          this.onFirstAudio();
          // Follow the audio clock, including queued audio and suspended contexts.
          const notify = () => {
            this.captionTimers.delete(timer);
            if (this.closed) return;
            const remaining = at - this.context.currentTime;
            if (remaining > 0 || this.context.state === "suspended") {
              timer = setTimeout(notify, Math.max(16, remaining * 1000));
              this.captionTimers.add(timer);
            } else this.onPlaybackStart(turn.caption);
          };
          let timer = setTimeout(
            notify,
            Math.max(0, (at - this.context.currentTime) * 1000),
          );
          this.captionTimers.add(timer);
        }
      }
      if (!turn.done) break;
      if (turn.remainder.length || turn.first)
        return this.fail("생성된 음성이 없거나 중간에 끊겼어요.");
      this.turns.shift();
    }
    if (!this.busy) this.onState(false);
  }
  cancel() {
    for (const timer of this.captionTimers) clearTimeout(timer);
    this.captionTimers.clear();
    for (const turn of this.turns) {
      clearTimeout(turn.timeout);
      turn.abort?.abort();
      this.send({ type: "cancel", id: turn.id });
    }
    this.turns = [];
    this.current = null;
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.nextAt = 0;
    this.onState(false);
  }
  close() {
    if (this.closed) return;
    this.cancel();
    this.closed = true;
    this.ready = false;
    clearTimeout(this.connectTimer);
    this.rejectConnect?.(Error("음성 연결이 취소됐어요."));
    this.rejectConnect = null;
    this.socket?.close();
  }
  fail(message: string) {
    if (this.closed) return;
    const error = Error(message);
    this.rejectConnect?.(error);
    this.rejectConnect = null;
    this.close();
    this.onError(error);
  }
}
