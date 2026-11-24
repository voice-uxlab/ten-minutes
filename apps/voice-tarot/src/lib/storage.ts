import type { Profile, Session } from "@/api/types";
export function profile(): Profile {
  try {
    return JSON.parse(localStorage.getItem("queen") || "{}") || {};
  } catch {
    return {};
  }
}
export function saveProfile(p: Profile) {
  localStorage.setItem("queen", JSON.stringify(p));
}
export const isLegacyReading = (id: string) => /^[a-f0-9]{48}$/.test(id);
export function saveSession(s: Session, makeLatest = false) {
  if (!isLegacyReading(s.readingId)) {
    const key = `voice-tarot:draft:${s.readingId}`;
    if (s.ended && !s.reportPending) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(s));
    return;
  }
  localStorage.setItem(`queen:session:${s.readingId}`, JSON.stringify(s));
  const p = profile();
  if (makeLatest || !p.last || p.last.readingId === s.readingId)
    saveProfile({ ...p, last: s });
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
