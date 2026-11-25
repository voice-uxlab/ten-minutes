import type { Profile, Session } from "@/api/types";
export function profile(): Profile {
  try {
    return JSON.parse(localStorage.getItem("queen") || "{}") || {};
  } catch {
    return {};
  }
}
export const isLegacyReading = (id: string) => /^[a-f0-9]{48}$/.test(id);
export function saveSession(s: Session) {
  if (isLegacyReading(s.readingId)) return;
  const key = `voice-tarot:draft:${s.readingId}`;
  if (s.ended && !s.reportPending) sessionStorage.removeItem(key);
  else sessionStorage.setItem(key, JSON.stringify(s));
}
export function loadSession(id: string): Session | undefined {
  try {
    if (!isLegacyReading(id))
      return (
        JSON.parse(
          sessionStorage.getItem(`voice-tarot:draft:${id}`) || "null",
        ) || undefined
      );
    return (
      JSON.parse(localStorage.getItem(`queen:session:${id}`) || "null") ||
      (profile().last?.readingId === id ? profile().last : undefined)
    );
  } catch {
    return undefined;
  }
}
