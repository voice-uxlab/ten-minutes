import { beforeEach, afterEach, expect, test, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { App } from "./app";
import { queryClient } from "@/api/client";
import { ReadingStore } from "../../poc/reading-store.mjs";
import { cards } from "../../poc/cards.mjs";
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
  await user.click(screen.getByText("직접 번호 고르기"));
  await user.click(await screen.findByLabelText("7번 카드"));
  await user.click(screen.getByLabelText("22번 카드"));
  await screen.findByText(/1개만 더/);
  expect(document.querySelectorAll(".card-wrap")).toHaveLength(2);
  await user.click(screen.getByLabelText("51번 카드"));
  await user.click(await screen.findByText("응, 이 3장을 열어줘"));
  const cardNodes = [...document.querySelectorAll(".card-wrap")];
  await user.click(await screen.findByText("다음 이야기 듣기 →"));
  expect(document.querySelectorAll(".card-wrap")[1]).toBe(cardNodes[1]);
  for (let i = 0; i < 7; i++) {
    await user.click(await screen.findByText("다음 이야기 듣기 →"));
    await waitFor(() =>
      expect(
        (screen.queryByText("다음 이야기 듣기 →") as HTMLButtonElement | null)
          ?.disabled,
      ).not.toBe(true),
    );
  }
  await user.click(await screen.findByText("오늘의 리포트 보기"));
  await screen.findByText("나의 퀸 카드 저장 ↗");
  expect(screen.getAllByText(/진행 기록/).length).toBeGreaterThan(3);
  expect(creates).toBe(1);
  const path = location.pathname;
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
