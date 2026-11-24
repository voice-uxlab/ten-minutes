const key = "queen:noeul-speaking-pace:v2";
export const defaultSpeakingPace = 2;
export function validSpeakingPace(value: number) {
  return Number.isFinite(value) && value >= 0.8 && value <= 2;
}
export function loadSpeakingPace() {
  try {
    const value = Number(localStorage.getItem(key));
    return validSpeakingPace(value) ? value : defaultSpeakingPace;
  } catch {
    return defaultSpeakingPace;
  }
}
export function saveSpeakingPace(value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* Current call still updates. */
  }
}
export function speakingPaceInstruction(value: number) {
  return `Replace all earlier speaking-pace instructions. From now on, target ${value} times your normal Korean speaking pace. Increase articulation speed and shorten unnecessary pauses, not just the answer length. Keep clear pronunciation, warmth, acknowledgments and full explanations. Do not announce this setting. This changes delivery, not answer length.`;
}
