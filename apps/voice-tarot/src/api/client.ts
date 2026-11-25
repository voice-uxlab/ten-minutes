import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
export const apiOrigin =
  import.meta.env.VITE_AUTH_API_ORIGIN?.trim().replace(/\/+$/, "") || "";
export function fetchApi(path: string, options?: RequestInit) {
  return fetch(`${apiOrigin}${path}`, { ...options, credentials: "include" });
}
export class FastApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
export async function fastApi<T>(
  path: string,
  options?: RequestInit,
  mode?: "response",
): Promise<T> {
  const response = await fetchApi(path, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new FastApiError(
      body?.error?.message || "요청을 처리하지 못했어요.",
      response.status,
      body?.error?.code,
    );
  }
  return mode === "response" ? (response as T) : response.json();
}
export function fastApiJson<T>(
  path: string,
  method: "POST" | "PUT",
  body?: unknown,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  mode?: "response",
) {
  return fastApi<T>(
    path,
    {
      method,
      signal,
      headers: { "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    mode,
  );
}
