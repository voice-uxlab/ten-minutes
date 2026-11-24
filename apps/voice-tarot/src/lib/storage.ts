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

export function localReports(): Session[] {
  const prefix = "queen:session:";
  const reports: Session[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const session = loadSession(key.slice(prefix.length));
    if (session?.report && session.ended) reports.push(session);
  }
  const previous = profile().last;
  if (
    previous?.report &&
    previous.ended &&
    !reports.some((session) => session.readingId === previous.readingId)
  ) {
    reports.push(previous);
  }
  return reports.sort((a, b) => b.date.localeCompare(a.date));
}
