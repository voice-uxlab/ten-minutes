import { QueryClient } from "@tanstack/react-query";
import type { ReadingResponse } from "./types";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
export async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal,
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했어요.");
  return data;
}
export const readingRequest = (body: unknown) =>
  request<ReadingResponse>("/reading", body);
export const readingOptions = (id: string) => ({
  queryKey: ["reading", id],
  queryFn: () => readingRequest({ id, action: "get" }),
  staleTime: 0,
});
