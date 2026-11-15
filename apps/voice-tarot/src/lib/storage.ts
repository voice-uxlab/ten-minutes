import type { Profile, Session } from "@/api/types";
const initial: Profile = { nick: "", tickets: 0, freeUsed: false, bgm: false };
export function profile(): Profile {
  try {
    return { ...initial, ...JSON.parse(localStorage.getItem("queen") || "{}") };
  } catch {
    return { ...initial };
  }
}
export function saveProfile(p: Profile) {
  localStorage.setItem("queen", JSON.stringify(p));
}
export function saveSession(s: Session, makeLatest = false) {
  localStorage.setItem(`queen:session:${s.readingId}`, JSON.stringify(s));
  const p = profile();
  if (makeLatest || !p.last || p.last.readingId === s.readingId)
    saveProfile({ ...p, last: s });
}
export function loadSession(id: string): Session | undefined {
  try {
    return (
      JSON.parse(localStorage.getItem(`queen:session:${id}`) || "null") ||
      (profile().last?.readingId === id ? profile().last : undefined)
    );
  } catch {
    return undefined;
  }
}
