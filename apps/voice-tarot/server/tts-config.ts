export function ttsConfig(env = process.env) {
  const key = env.TYPECAST_API_KEY;
  const voice = env.TYPECAST_VOICE_ID;
  return {
    provider: "typecast",
    key,
    voice,
    model: env.TYPECAST_MODEL || "ssfm-v30",
    error:
      !key || !voice
        ? "TYPECAST_API_KEY와 TYPECAST_VOICE_ID를 .env에 설정해 주세요."
        : null,
  };
}
