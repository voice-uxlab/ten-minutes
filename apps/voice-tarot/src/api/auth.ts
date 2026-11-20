import { request } from "./client";

const origin = import.meta.env.VITE_AUTH_API_ORIGIN?.trim().replace(/\/+$/, "");
const userPath = "/api/v1/users/me";
export const consentVersion = import.meta.env.VITE_AUTH_CONSENT_VERSION?.trim();

type AddressingMode = "DEFAULT" | "CUSTOM";
type MemberProfile = {
  id: string;
  addressing_mode: AddressingMode;
  nickname: string | null;
  provider: string | null;
  onboarding_required: boolean;
  created_at: string;
};
type AddressingPreference =
  | { addressing_mode: "DEFAULT"; nickname: null }
  | { addressing_mode: "CUSTOM"; nickname: string };
type AuthUser = { nickname: string | null; onboarding_required: boolean };

export function authorizeUrl(provider: "naver" | "kakao") {
  return origin ? `${origin}/auth/${provider}/authorize` : `/auth/${provider}`;
}

async function authRequest(path: string, options?: RequestInit) {
  return fetch(`${origin}${path}`, { ...options, credentials: "include" });
}

export const authOptions = {
  queryKey: ["auth"],
  queryFn: async (): Promise<AuthUser | null> => {
    if (!origin) {
      const { user } = await request<{ user: { nickname: string } | null }>(
        "/auth/me",
      );
      return user ? { ...user, onboarding_required: false } : null;
    }
    const response = await authRequest(userPath);
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("로그인 상태를 확인하지 못했어요.");
    const member: MemberProfile = await response.json();
    return member;
  },
};

export async function saveMemberProfile(
  preference: AddressingPreference,
): Promise<MemberProfile> {
  if (!origin || !consentVersion || consentVersion.length > 40) {
    throw new Error("회원 가입 설정을 확인해 주세요.");
  }
  const response = await authRequest(userPath, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...preference,
      consent_version: consentVersion,
    }),
  });
  if (response.status === 401) {
    throw new Error("로그인 세션이 만료됐어요. 다시 로그인해 주세요.");
  }
  if (!response.ok) throw new Error("회원 설정을 저장하지 못했어요. 다시 시도해 주세요.");
  return response.json();
}

export async function logout() {
  if (!origin) {
    await request("/auth/logout", {});
    return;
  }
  const response = await authRequest("/api/v1/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error("로그아웃하지 못했어요. 다시 시도해 주세요.");
}
