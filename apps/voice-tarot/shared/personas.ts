export const personas = [
  { id: "lena", label: "기존 레나 퀸" },
  { id: "test-friend", label: "테스트 · 솔직한 상담 친구" },
  { id: "cool-unnie", label: "테스트 3 · 쿨한 언니" },
] as const;
export type PersonaId = (typeof personas)[number]["id"];
export function personaId(value: unknown): PersonaId {
  if (value === undefined) return "lena";
  if (value === "lena" || value === "test-friend" || value === "cool-unnie") return value;
  throw new Error("지원하지 않는 페르소나예요.");
}
