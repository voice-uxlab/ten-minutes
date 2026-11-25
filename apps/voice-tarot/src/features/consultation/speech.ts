interface SpeechTurn {
  text: string;
  responseId: string;
  index: number;
  audio: Uint8Array[];
  remainder: Uint8Array;
  first: boolean;
  done: boolean;
  abort: AbortController;
}
interface SpeechOptions {
  onState?: (busy: boolean) => void;
  onError?: (error: Error) => void;
  onPlaybackStart?: (text: string) => void;
  destination?: AudioNode;
  streamSegment: (
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

export class SpeechPlayer {
  private readonly context: AudioContext;
  private readonly destination: AudioNode;
  private readonly onState: NonNullable<SpeechOptions["onState"]>;
  private readonly onError: NonNullable<SpeechOptions["onError"]>;
  private readonly onPlaybackStart: NonNullable<
    SpeechOptions["onPlaybackStart"]
  >;
  private readonly streamSegment: SpeechOptions["streamSegment"];
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly captionTimers = new Set<ReturnType<typeof setTimeout>>();
  private turns: SpeechTurn[] = [];
  private nextAt = 0;
  private sampleRate = 32000;
  private streaming = false;
  private streamResponse = "";
  private segmentIndex = 0;
  closed = false;

  constructor(
    context: AudioContext,
    {
      onState = () => {},
      onError = () => {},
      onPlaybackStart = () => {},
      destination = context.destination,
      streamSegment,
    }: SpeechOptions,
  ) {
    this.context = context;
    this.destination = destination;
    this.onState = onState;
    this.onError = onError;
    this.onPlaybackStart = onPlaybackStart;
    this.streamSegment = streamSegment;
  }

  get busy() {
    return this.turns.length > 0 || this.sources.size > 0;
  }

  append(text: string, responseId: string) {
    if (this.closed) return;
    const cleaned = displaySpeech(text).trim();
    if (!cleaned) return;
    if (this.streamResponse !== responseId) {
      this.streamResponse = responseId;
      this.segmentIndex = 0;
    }
    const characters = Array.from(cleaned);
    for (let offset = 0; offset < characters.length; offset += 500) {
      this.turns.push({
        text: characters.slice(offset, offset + 500).join(""),
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
  }

  private async pumpStream() {
    if (this.streaming || this.closed) return;
    this.streaming = true;
    try {
      while (this.turns.length && !this.closed) {
        const turn = this.turns[0];
        const signal = AbortSignal.any([
          turn.abort.signal,
          AbortSignal.timeout(30000),
        ]);
        try {
          const response = await this.streamSegment(
            turn.text,
            turn.responseId,
            turn.index,
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
          if (turn.abort.signal.aborted) continue;
          if (signal.aborted) throw Error("음성 응답 시간이 초과됐어요.");
          turn.done = true;
          this.drain();
        } catch (error) {
          if (!turn.abort.signal.aborted) {
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

  private drain() {
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
          // Follow the audio clock, including queued audio and suspended contexts.
          const notify = () => {
            this.captionTimers.delete(timer);
            if (this.closed) return;
            const remaining = at - this.context.currentTime;
            if (remaining > 0 || this.context.state === "suspended") {
              timer = setTimeout(notify, Math.max(16, remaining * 1000));
              this.captionTimers.add(timer);
            } else this.onPlaybackStart(turn.text);
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
    for (const turn of this.turns) turn.abort.abort();
    this.turns = [];
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
    this.closed = true;
    this.cancel();
  }
  private fail(message: string) {
    if (this.closed) return;
    const error = Error(message);
    this.close();
    this.onError(error);
  }
}
