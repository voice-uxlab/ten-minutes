import type { QueryFunctionContext } from "@tanstack/react-query";
import { apiOrigin, FastApiError, fetchApi } from "./client";

const userPath = "/api/v1/users/me";
export const consentVersion = import.meta.env.VITE_AUTH_CONSENT_VERSION?.trim();

type AddressingMode = "DEFAULT" | "CUSTOM";
type MemberProfile = {
  id: string;
  addressing_mode: AddressingMode;
  nickname: string | null;
  provider: string | null;
  onboarding_required: boolean;
  consent_version?: string | null;
  created_at: string;
};
type AddressingPreference =
  | { addressing_mode: "DEFAULT"; nickname: null }
  | { addressing_mode: "CUSTOM"; nickname: string };
type AuthUser = Pick<
  MemberProfile,
  "nickname" | "onboarding_required" | "provider"
>;

export function authorizeUrl() {
  return `${apiOrigin}/auth/kakao/authorize`;
}

export const authOptions = {
  queryKey: ["auth"],
  queryFn: async ({
    signal,
  }: QueryFunctionContext): Promise<AuthUser | null> => {
    const response = await fetchApi(userPath, { signal });
    if (response.status === 401) return null;
    if (!response.ok)
      throw new FastApiError("로그인 상태를 확인하지 못했어요.", response.status);
    const member: MemberProfile = await response.json();
    return {
      ...member,
      onboarding_required:
        member.onboarding_required ||
        (!!consentVersion &&
          member.consent_version !== undefined &&
          member.consent_version !== consentVersion),
    };
  },
};

export async function saveMemberProfile(
  preference: AddressingPreference,
): Promise<MemberProfile> {
  if (!consentVersion || consentVersion.length > 40) {
    throw new Error("회원 가입 설정을 확인해 주세요.");
  }
  const response = await fetchApi(userPath, {
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
  if (!response.ok)
    throw new Error("회원 설정을 저장하지 못했어요. 다시 시도해 주세요.");
  return response.json();
}

export async function logout() {
  const response = await fetchApi("/api/v1/auth/logout", { method: "POST" });
  if (!response.ok)
    throw new Error("로그아웃하지 못했어요. 다시 시도해 주세요.");
}
