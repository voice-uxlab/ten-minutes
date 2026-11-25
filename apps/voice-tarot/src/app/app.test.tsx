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
import { loadSession } from "@/lib/storage";
import { queryClient } from "@/api/client";
vi.mock("@/features/consultation/speech.ts", () => ({
  displaySpeech: (text: string) => text,
  SpeechPlayer: class {
    async connect() {}
    cancel() {}
    close() {}
  },
}));
const consultationId = "12345678-1234-4321-8123-123456789abc";
const consultPath = "/api/v1/consultations";
const userPath = "/api/v1/users/me";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState({}, "", "/");
  queryClient.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
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
  expect(screen.getByRole("link", { name: "카카오로 시작하기" })).toBeTruthy();
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
          respond?.(Response.json({}, { status: 401 }));
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

test("cancelled social login offers retry", async () => {
  sessionStorage.setItem("voice-tarot:login-attempt", "naver");
  history.replaceState({}, "", "/?auth_error=cancelled");
  render(<App />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "로그인을 취소했어요.",
  );
  const naver = screen.getByRole("link", { name: "네이버로 시작하기" });
  const alert = screen.getByRole("alert");
  expect(naver.getAttribute("aria-describedby")).toBe(alert.id);
  expect(screen.queryByRole("link", { name: /로그인 다시 시도/ })).toBeNull();
  await waitFor(() => expect(window.location.search).toBe(""));
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
  expect(alert.textContent).toContain("다시 로그인해 주세요.");
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
    Response.json({ nickname: "테스트 공주", provider: "kakao" }),
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

test("a logged-in user with older consent is sent to onboarding", async () => {
  vi.mocked(fetch).mockImplementation(async () =>
    Response.json({
      nickname: "공주",
      consent_version: "older-version",
      onboarding_required: false,
    }),
  );
  render(<App />);
  await screen.findByRole("heading", { name: "어떻게 불러줄까?" });
  expect(location.pathname).toBe("/onboarding");
});

test("authenticated StrictMode: real call entry, partial picks and same-session reload", async () => {
  const user = userEvent.setup();
  const now = Date.now();
  const consultation = {
    id: consultationId,
    status: "CREATED",
    question: null,
    spread_type: null,
    created_at: new Date(now).toISOString(),
    call_ends_at: new Date(now + 600000).toISOString(),
    cards: [],
  };
  vi.mocked(fetch).mockImplementation(async (path, options) => {
    if (path === userPath) return Response.json({ nickname: "공주" });
    if (path === consultPath && options?.method === "POST") {
      expect(JSON.parse(String(options.body))).toEqual({
        consent_version: "2026-11",
      });
      return Response.json(consultation);
    }
    if (path === `${consultPath}/${consultationId}`)
      return Response.json(consultation);
    if (path === `${consultPath}/${consultationId}/realtime-connection`) {
      consultation.status = "CONNECTING";
      return new Response("answer");
    }
    if (path === `${consultPath}/${consultationId}/card-selection`) {
      expect(JSON.parse(String(options?.body))).toMatchObject({
        spread_type: "RELATIONSHIP",
        picks: [7, 22, 51],
      });
      return Response.json({
        cards: [7, 22, 51].map((picked_number, index) => ({
          slot: index + 1,
          picked_number,
          position: ["나", "상대", "관계 흐름"][index],
          revealed: false,
          card_id: null,
          card_code: null,
          name: null,
          keywords: null,
        })),
      });
    }
    throw Error(`Unexpected request: ${path}`);
  });
  let receiveRealtime: (message: MessageEvent<string>) => void;
  async function sayCardNumbers(picks: number[]) {
    const id = `picks-${picks.join("-")}`;
    await act(async () => {
      for (const event of [
        { type: "response.created", response: { id } },
        {
          type: "response.done",
          response: {
            id,
            output: [
              {
                type: "function_call",
                name: "select_numbers",
                arguments: JSON.stringify({ picks }),
                call_id: id,
              },
            ],
          },
        },
      ]) {
        receiveRealtime(
          new MessageEvent("message", { data: JSON.stringify(event) }),
        );
      }
    });
  }
  const audioTrack = { stop: vi.fn(), enabled: true };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [audioTrack],
        getAudioTracks: () => [audioTrack],
      }),
    },
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      destination = {};
      async resume() {}
      async close() {}
    },
  );
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      localDescription = { sdp: "offer" };
      channel = {
        readyState: "open",
        onopen: () => {},
        onmessage: vi.fn<(event: MessageEvent<string>) => void>(),
        send: () => {},
        close: () => {},
      };
      addTrack() {}
      createDataChannel() {
        return this.channel;
      }
      async createOffer() {
        return this.localDescription;
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        receiveRealtime = this.channel.onmessage;
        this.channel.onopen();
      }
      close() {}
    },
  );

  const app = render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await user.click(await screen.findByRole("button", { name: "허용하기" }));
  await user.click(screen.getByLabelText("상담을 위한 음성 처리에 동의해요."));
  await user.click(screen.getByRole("button", { name: /10분 상담 시작하기/ }));
  await user.click(
    await screen.findByRole("button", { name: /그 사람도 나를 좋아할까/ }),
  );
  await user.click(await screen.findByText("응, 이 질문으로 볼래"));
  expect(document.querySelectorAll(".card-wrap")).toHaveLength(0);
  expect(screen.queryByText("직접 번호 고르기")).toBeNull();
  await sayCardNumbers([7, 22]);
  await screen.findByText(/1개만 더/);
  expect(document.querySelectorAll(".card-wrap")).toHaveLength(2);
  const reading = loadSession(consultationId)!;
  expect(reading.demo).toBe(false);
  expect(reading.endAt! - Date.now()).toBeGreaterThan(590000);
  expect(vi.mocked(fetch).mock.calls.map(([path]) => path)).not.toContain(
    "/test-logs",
  );
  const path = location.pathname;
  app.unmount();
  history.replaceState({}, "", path);
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await user.click(await screen.findByLabelText(/음성은 OpenAI로/));
  await user.click(screen.getByRole("button", { name: "상담 연결하기" }));
  await screen.findByText(/1개만 더/);
  await sayCardNumbers([51]);
  await user.click(await screen.findByText("응, 이 3장을 열어줘"));
  await screen.findByRole("heading", { name: /공주가 고른 카드를/ });
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([path, options]) => path === consultPath && options?.method === "POST",
      ),
  ).toHaveLength(1);
});

test("report history links to the saved report and its invite", async () => {
  const question = "먼저 연락해도 될까?";
  const date = new Date().toISOString();
  vi.mocked(fetch).mockImplementation(async (path) => {
    if (path === userPath) return Response.json({ nickname: "공주" });
    if (path === consultPath)
      return Response.json({
        items: [
          {
            id: consultationId,
            question,
            report_status: "COMPLETED",
            situation_summary: "가벼운 안부부터.",
            created_at: date,
          },
        ],
        next_cursor: null,
      });
    if (path === `${consultPath}/${consultationId}/report`)
      return Response.json({
        consultation_id: consultationId,
        question,
        consulted_at: date,
        cards: [
          {
            slot: 1,
            picked_number: 7,
            position: "나",
            revealed: true,
            card_id: 36,
            card_code: "cups-ace",
            name: "컵 에이스",
            direction: "UPRIGHT",
            keywords: ["감정"],
          },
        ],
        situation_summary: "가벼운 안부부터.",
        queen_line: "마음은 솔직하게.",
        readings: [],
      });
    throw Error(`Unexpected request: ${path}`);
  });
  history.replaceState({}, "", "/reports");
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("link", { name: /먼저 연락해도 될까/ }),
  );
  await screen.findByRole("button", { name: "친구한테도 알려주기" });
  expect(screen.getByText("마음은 솔직하게.")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "컵 에이스" }).getAttribute("src"),
  ).toBe("/cards/tarot/minor-cups-1.webp");
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
