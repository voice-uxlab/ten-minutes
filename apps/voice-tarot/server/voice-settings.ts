export interface VoiceSettings {
  voice: string;
  model: string;
  mode: string;
  emotion: string;
  intensity: number;
  speed: number;
  pitch: number;
  silence: number | null;
  loudness: number | null;
}
export const defaults: VoiceSettings = {
  voice: "",
  model: "ssfm-v30",
  mode: "smart",
  emotion: "normal",
  intensity: 1,
  speed: 1.3,
  pitch: 0,
  silence: null,
  loudness: null,
};
let applied: VoiceSettings | null = null;
export function currentVoiceSettings() {
  return applied;
}
export function validateVoiceSettings(input: unknown): VoiceSettings {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("설정 형식이 잘못됐어요.");
  const raw = input as Record<string, unknown>;
  const s = Object.fromEntries(
    (Object.keys(defaults) as (keyof VoiceSettings)[]).map((k) => [
      k,
      raw[k] ?? defaults[k],
    ]),
  ) as unknown as VoiceSettings;
  s.voice = typeof s.voice === "string" ? s.voice.trim() : "";
  if (!/^(tc|uc)_[a-zA-Z0-9_-]{1,100}$/.test(s.voice))
    throw Error("타입캐스트 보이스 ID(tc_ 또는 uc_)를 입력해 주세요.");
  if (!["ssfm-v21", "ssfm-v30", "ssfm-v31"].includes(s.model))
    throw Error("지원하지 않는 모델이에요.");
  if (!["smart", "preset"].includes(s.mode))
    throw Error("감정 모드를 확인해 주세요.");
  if (
    ![
      "normal",
      "happy",
      "sad",
      "angry",
      "whisper",
      "toneup",
      "tonedown",
    ].includes(s.emotion)
  )
    throw Error("감정 설정을 확인해 주세요.");
  for (const [k, min, max] of [
    ["intensity", 0, 2],
    ["speed", 0.5, 2],
    ["pitch", -12, 12],
    ["silence", 0, 1000],
    ["loudness", -70, 0],
  ] as const) {
    if ((k === "silence" || k === "loudness") && s[k] === null) continue;
    if (
      typeof s[k] !== "number" ||
      !Number.isFinite(s[k]) ||
      s[k] < min ||
      s[k] > max ||
      (["pitch", "silence"].includes(k) && !Number.isInteger(s[k]))
    )
      throw Error(`${k} 설정 범위를 확인해 주세요.`);
  }
  if (
    s.model === "ssfm-v21" &&
    (s.mode === "smart" ||
      !["normal", "happy", "sad", "angry"].includes(s.emotion))
  )
    throw Error("v21은 일반·기쁨·슬픔·화남 프리셋만 지원해요.");
  return s;
}
export function applyVoiceSettings(input: unknown) {
  applied = validateVoiceSettings(input);
  return applied;
}
export function typecastOptions(
  settings: Partial<VoiceSettings> = {},
  previous = "",
) {
  const s = { ...defaults, ...settings };
  return {
    prompt:
      s.mode === "smart"
        ? { emotion_type: "smart", previous_text: previous }
        : s.model === "ssfm-v21"
          ? { emotion_preset: s.emotion, emotion_intensity: s.intensity }
          : {
              emotion_type: "preset",
              emotion_preset: s.emotion,
              emotion_intensity: s.intensity,
            },
    output: {
      audio_format: "wav",
      audio_tempo: s.speed,
      audio_pitch: s.pitch,
      ...(s.silence === null ? {} : { remove_silence_ms: s.silence }),
      ...(s.loudness === null ? {} : { target_lufs: s.loudness }),
    },
  };
}
