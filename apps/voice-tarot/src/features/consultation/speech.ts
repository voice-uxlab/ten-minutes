interface SpeechTurn {
  text: string;
  responseId: string;
  index: number;
  audio: Uint8Array[];
  remainder: Uint8Array;
  first: boolean;
  done: boolean;
  abort: AbortController;
  playback: PlaybackSpan[];
  words: TimedWord[] | null;
}

interface PlaybackSpan {
  start: number;
  end: number;
}

interface TimedWord {
  text: string;
  start: number;
  end: number;
}

function isTimedWord(word: unknown): word is TimedWord {
  if (!word || typeof word !== "object") return false;
  const { text, start, end } = word as Partial<TimedWord>;
  return (
    typeof text === "string" &&
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end >= start
  );
}

async function* audioChunks(
  response: Response,
  turn: SpeechTurn,
  signal: AbortSignal,
) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("합성 오디오 스트림을 받지 못했어요.");
  const timed =
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() === "application/x-ndjson";
  const words: TimedWord[] | null = timed ? [] : null;
  turn.words = words;
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (signal.aborted) break;
      if (!words) {
        if (done) break;
        yield value;
        continue;
      }
      const lines = (pending + decoder.decode(value, { stream: !done })).split(
        "\n",
      );
      pending = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.trim()) continue;
        const frame: { audio?: unknown; words?: unknown } | null =
          JSON.parse(line);
        if (
          typeof frame?.audio !== "string" ||
          !Array.isArray(frame.words) ||
          !frame.words.every(isTimedWord)
        )
          throw Error("타입캐스트 자막 스트림을 읽지 못했어요.");
        words.push(...frame.words);
        if (frame.audio)
          yield Uint8Array.from(atob(frame.audio), (byte) =>
            byte.charCodeAt(0),
          );
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

interface SpeechOptions {
  onState?: (busy: boolean) => void;
  onError?: (error: Error) => void;
  onCaption?: (text: string, segmentStarted: boolean) => void;
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

function captionCues(text: string) {
  const phrases: string[] = [];
  for (const sentence of text.split(/(?<=[.!?。！？…][”’"']?)\s+/u)) {
    let phrase = "";
    for (const word of sentence.match(/\S+/gu) ?? []) {
      if (phrase && phrase.length + 1 + word.length > 34) {
        phrases.push(phrase);
        phrase = "";
      }
      for (const part of word.match(/.{1,34}/gu) ?? []) {
        phrase = phrase ? `${phrase} ${part}` : part;
        if (phrase.length >= 34) {
          phrases.push(phrase);
          phrase = "";
        }
      }
    }
    if (phrase) phrases.push(phrase);
  }
  return phrases.map((phrase) => ({
    text: phrase,
    weight: phrase.replace(/\s/g, "").length,
  }));
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
  private readonly onCaption: NonNullable<SpeechOptions["onCaption"]>;
  private readonly streamSegment: SpeechOptions["streamSegment"];
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly captionTimers = new Set<ReturnType<typeof setTimeout>>();
  private turns: SpeechTurn[] = [];
  private nextAt = 0;
  private captionStart = -Infinity;
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
      onCaption = () => {},
      destination = context.destination,
      streamSegment,
    }: SpeechOptions,
  ) {
    this.context = context;
    this.destination = destination;
    this.onState = onState;
    this.onError = onError;
    this.onCaption = onCaption;
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
        playback: [],
        words: null,
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
          const header = new Uint8Array(44);
          let headerSize = 0;
          for await (const value of audioChunks(response, turn, signal)) {
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
        const span = turn.playback.at(-1);
        if (span?.end === at) span.end = this.nextAt;
        else turn.playback.push({ start: at, end: this.nextAt });
        if (turn.first) {
          turn.first = false;
          this.followCaption(turn, at);
        }
      }
      if (!turn.done) break;
      if (turn.remainder.length || turn.first)
        return this.fail("생성된 음성이 없거나 중간에 끊겼어요.");
      this.turns.shift();
    }
    if (!this.busy) this.onState(false);
  }

  private followCaption(turn: SpeechTurn, start: number) {
    const cues = turn.words ? [] : captionCues(turn.text);
    const totalWeight = cues.reduce((sum, cue) => sum + cue.weight, 0);
    let shown = -1;
    let wordIndex = 0;
    let phrase = "";
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(notify, delay);
      this.captionTimers.add(timer);
    };
    const notify = () => {
      this.captionTimers.delete(timer);
      if (start < this.captionStart) return;
      const now = this.context.currentTime;
      if (now < start || this.context.state === "suspended") {
        schedule(Math.max(16, (start - now) * 1000));
        return;
      }
      this.captionStart = start;
      let played = 0;
      let queued = 0;
      for (const span of turn.playback) {
        played += Math.max(0, Math.min(now, span.end) - span.start);
        queued += span.end - span.start;
      }
      if (turn.words) {
        const previous = phrase;
        while (
          wordIndex < turn.words.length &&
          turn.words[wordIndex].start <= played
        ) {
          const text = turn.words[wordIndex++].text.trim();
          if (!text) continue;
          const combined = phrase ? `${phrase} ${text}` : text;
          phrase =
            combined.length > 34 || /[.!?。！？…][”’"']?$/u.test(phrase)
              ? text
              : combined;
        }
        if (!turn.done || (wordIndex < turn.words.length && played < queued))
          schedule(50);
        if (phrase !== previous) this.onCaption(phrase, previous === "");
        return;
      }
      // WAV has no word timestamps. Use the audio duration once the stream ends.
      const duration = turn.done ? queued : Math.max(queued, totalWeight / 7);
      const progress = (played / duration) * totalWeight;
      let index = 0;
      let boundary = cues[0].weight;
      while (index < cues.length - 1 && progress >= boundary) {
        index++;
        boundary += cues[index].weight;
      }
      if (index < cues.length - 1) schedule(50);
      if (index > shown) {
        const started = shown === -1;
        shown = index;
        this.onCaption(cues[index].text, started);
      }
    };
    schedule(Math.max(0, (start - this.context.currentTime) * 1000));
  }
  cancel() {
    for (const timer of this.captionTimers) clearTimeout(timer);
    this.captionTimers.clear();
    this.captionStart = -Infinity;
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
