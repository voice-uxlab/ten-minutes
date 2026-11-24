import { beforeEach, afterEach, expect, test, vi } from "vitest";
import {
  act,
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { App } from "./app";
import { profile, saveProfile, loadSession } from "@/lib/storage";
import { queryClient } from "@/api/client";
import { ReadingStore } from "../../server/reading-store.ts";
import { cards } from "../../shared/cards.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let dir: string, creates: number;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "react-ui-"));
  const store = new ReadingStore(dir, () =>
    cards.map((c) => ({ ...c, reversed: false })),
  );
  creates = 0;
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState({}, "", "/");
  queryClient.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path === "/auth/me")
        return Response.json({ providers: {}, user: null });
      const body = JSON.parse(String(options?.body));
      if (body.action === "create") creates++;
      return Response.json(await store.request(body));
    }),
  );
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});
test("home silently checks auth and opens login when the lookup fails", async () => {
  vi.mocked(fetch).mockImplementation(async () =>
    Response.json({ error: "Unavailable" }, { status: 500 }),
  );
  render(<App />);
  const art = screen.getByRole("img", { name: /TEN MINS TAROT/ });
  expect(art.closest(".landing-loading")).toBeTruthy();
  expect(screen.queryByText("로그인 상태를 확인하고 있어요.")).toBeNull();
  await waitFor(() => expect(window.location.pathname).toBe("/login"), {
    timeout: 3000,
  });
  expect(
    screen.getByRole("link", { name: "닉네임으로 체험하기" }),
  ).toBeTruthy();
  expect(screen.getByRole("img", { name: /TEN MINS TAROT/ })).toBe(art);
  expect(art.closest(".landing-loading")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

test.each(["responds", "times out"])(
  "slow auth lookup shows a notice until it %s",
  async (outcome) => {
    vi.useFakeTimers();
    try {
      let respond: ((response: Response) => void) | undefined;
      let signal: AbortSignal | null | undefined;
      vi.mocked(fetch).mockImplementation((_path, options) => {
        signal = options?.signal;
        return new Promise((resolve) => {
          respond = resolve;
        });
      });
      render(<App />);
      const notice = /로그인 상태를 확인 중이에요\.\s*잠시만 기다려 주세요\./;

      await act(() => vi.advanceTimersByTimeAsync(2999));
      expect(screen.queryByText(notice)).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(screen.getByText(notice)).toBeTruthy();
      expect(window.location.pathname).toBe("/");

      if (outcome === "responds") {
        await act(async () => {
          respond?.(Response.json({ user: null }));
          await vi.advanceTimersByTimeAsync(1);
        });
      } else {
        await act(() => vi.advanceTimersByTimeAsync(5000));
        expect(signal?.aborted).toBe(true);
      }
      expect(window.location.pathname).toBe("/login");
      expect(screen.queryByText(notice)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  },
);

test("cancelled social login offers retry and nickname experience", async () => {
  sessionStorage.setItem("voice-tarot:login-attempt", "naver");
  history.replaceState({}, "", "/?auth_error=cancelled");
  render(<App />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "로그인을 취소했어요.",
  );
  const naver = screen.getByRole("link", { name: "네이버로 시작하기" });
  const alert = screen.getByRole("alert");
  expect(naver.getAttribute("aria-describedby")).toBe(alert.id);
  expect(alert.nextElementSibling).toBe(
    screen.getByRole("link", { name: "닉네임으로 체험하기" }),
  );
  expect(screen.queryByRole("link", { name: /로그인 다시 시도/ })).toBeNull();
  await waitFor(() => expect(window.location.search).toBe(""));
  expect(sessionStorage.getItem("voice-tarot:login-attempt")).toBeNull();
  await userEvent.click(
    screen.getByRole("link", { name: "닉네임으로 체험하기" }),
  );
  expect(await screen.findByLabelText("닉네임")).toBeTruthy();
  expect(sessionStorage.getItem("voice-tarot:login-attempt")).toBeNull();
});

test("returning to the login page after leaving for OAuth restores retry", async () => {
  history.replaceState({}, "", "/login");
  render(<App />);
  const kakao = screen.getByRole("link", { name: "카카오로 시작하기" });
  kakao.addEventListener("click", (event) => event.preventDefault(), {
    once: true,
  });
  fireEvent.click(kakao);
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent(window, new Event("pageshow"));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("소셜 로그인을 완료할 수 없습니다.");
  expect(alert.textContent).toContain(
    "다시 시도하거나 닉네임으로 체험할 수 있습니다.",
  );
  expect(alert.nextElementSibling).toBe(
    screen.getByRole("link", { name: "닉네임으로 체험하기" }),
  );
  expect(kakao.getAttribute("aria-describedby")).toBe(alert.id);
  expect(screen.queryByRole("link", { name: /로그인 다시 시도/ })).toBeNull();
  expect(sessionStorage.getItem("voice-tarot:login-attempt")).toBeNull();
  cleanup();
  render(<App />);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a confirmed social login is marked on later visits to login", async () => {
  sessionStorage.setItem("voice-tarot:login-attempt", "kakao");
  vi.mocked(fetch).mockImplementation(async () =>
    Response.json({ user: { nickname: "테스트 공주", provider: "kakao" } }),
  );
  const app = render(<App />);
  await screen.findByRole("heading", { name: "테스트 공주야, 안녕!" });
  expect(sessionStorage.getItem("voice-tarot:login-attempt")).toBeNull();
  app.unmount();
  history.replaceState({}, "", "/login");
  render(<App />);
  expect(
    screen.getByRole("link", { name: /카카오로 시작하기.*최근 로그인/ }),
  ).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("React StrictMode: onboard → demo → partial picks → reveals → notes/report; URL reload creates no session", async () => {
  const errors = vi.spyOn(console, "error");
  const user = userEvent.setup();
  const app = render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await user.click(await screen.findByText("닉네임으로 체험하기"));
  await user.type(screen.getByLabelText("닉네임"), "테스트 공주");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByText("레나 만나러 가기"));
  await user.click(await screen.findByText("시범 통화"));
  await user.click(await screen.findByText("예시 고민으로 계속하기 →"));
  await user.click(await screen.findByText("응, 이 질문으로 볼래"));
  expect(document.querySelectorAll(".card-wrap")).toHaveLength(0);
  await user.click(await screen.findByText("직접 번호 고르기"));
  await user.click(await screen.findByLabelText("7번 카드"));
  await user.click(screen.getByLabelText("22번 카드"));
  await screen.findByText(/1개만 더/);
  expect(document.querySelectorAll(".card-wrap")).toHaveLength(2);
  await user.click(screen.getByLabelText("51번 카드"));
  await user.click(await screen.findByText("응, 이 3장을 열어줘"));
  const cardNodes = [...document.querySelectorAll(".card-wrap")];
  for (const [index, ordinal] of ["첫 번째", "두 번째", "세 번째"].entries()) {
    await user.click(await screen.findByText("다음 이야기 듣기 →"));
    await screen.findByText(`PICKED BY PRINCESS / ${index + 1} OF 3`);
    expect(document.querySelectorAll(".card-wrap")[index]).toBe(
      cardNodes[index],
    );
    await user.click(await screen.findByText("다음 이야기 듣기 →"));
    await screen.findByRole("heading", {
      name: new RegExp(`${ordinal} 카드,`),
    });
  }
  await user.click(await screen.findByText("다음 이야기 듣기 →"));
  await user.click(await screen.findByText("상담 마치고 리포트 보기"));
  await user.click(await screen.findByText("오늘의 리포트 보기"));
  await screen.findByText("나의 퀸 카드 저장 ↗");
  expect(screen.getAllByText(/진행 기록/).length).toBeGreaterThan(3);
  expect(creates).toBe(1);
  const path = location.pathname;
  await user.click(screen.getByText("내 리포트 목록"));
  await screen.findByRole("heading", { name: "내 리포트" });
  await user.click(screen.getByRole("link", { name: /연락 없는 그 사람/ }));
  await screen.findByText("나의 퀸 카드 저장 ↗");
  app.unmount();
  history.replaceState({}, "", path.replace("/report", ""));
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await screen.findByText("오늘의 리포트 보기");
  expect(creates).toBe(1);
  expect(
    errors.mock.calls.some((args) => String(args[0]).includes("same key")),
  ).toBe(false);
});
test("payment result cannot grant a ticket on reload", async () => {
  history.replaceState({}, "", "/payments/result");
  render(<App />);
  await screen.findByText("확인할 결제 내역이 없어요.");
  expect(localStorage.getItem("queen")).toBeNull();
  fireEvent.click(screen.getByText("레나 만나러 가기"));
});

for (const [label, engine] of [
  ["Realtime + Typecast", "realtime"],
  ["Live + Typecast", "live-typecast"],
] as const) {
  test(`home selection persists ${engine} for the new session`, async () => {
    saveProfile({ ...profile(), nick: "버전 확인" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText("상담 옵션"));
    const realtime = await screen.findByRole("radio", {
      name: "Realtime + Typecast",
    });
    expect((realtime as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("radio", { name: label }));
    await user.click(
      screen.getByRole("radio", { name: "테스트 · 솔직한 상담 친구" }),
    );
    await user.click(screen.getByText("시범 통화"));
    await screen.findByText("예시 고민으로 계속하기 →");
    expect(loadSession(profile().last!.readingId)?.voiceEngine).toBe(engine);
    expect(loadSession(profile().last!.readingId)?.personaId).toBe(
      "test-friend",
    );
  });
}

test("Live comparison link resets a previous Realtime selection", async () => {
  saveProfile({ ...profile(), nick: "비교 확인" });
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByText("상담 옵션"));
  expect(
    (
      (await screen.findByRole("radio", {
        name: "Realtime + Typecast",
      })) as HTMLInputElement
    ).checked,
  ).toBe(true);
  await user.click(screen.getByRole("link", { name: "Live 비교 통화" }));
  expect(
    (
      (await screen.findByRole("radio", {
        name: "Live + Typecast",
      })) as HTMLInputElement
    ).checked,
  ).toBe(true);
});

test("Christmas invitation opens without a report and leads to sign-in", async () => {
  history.replaceState({}, "", "/invite/christmas");
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: /이번 크리스마스/ });
  await user.click(
    screen.getByRole("link", { name: "내 카드 세 장 뽑아보기" }),
  );
  await screen.findByRole("link", { name: "네이버로 시작하기" });
  expect(location.pathname).toBe("/login");
});

test("report history goes to sign-in for a signed-out visitor", async () => {
  history.replaceState({}, "", "/reports");
  render(<App />);
  await screen.findByRole("link", { name: "네이버로 시작하기" });
  expect(location.pathname).toBe("/login");
});
