import { exportSavedConversations } from "@/features/consultation/test-logger";
import { personas, type PersonaId } from "../../shared/personas.ts";
import {
  prepareAudio,
  discardPreparedAudio,
} from "@/features/consultation/audio-context";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readingRequest } from "@/api/client";
import {
  authOptions,
  authorizeUrl,
  consentVersion,
  logout,
  saveMemberProfile,
} from "@/api/auth";
import { emptyReading, type Session } from "@/api/types";
import { profile, saveProfile, saveSession } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PolicyDialog } from "@/components/ui/dialog";
import { BrandHeader, Reader, Panel } from "@/components/tarot";

const loginAttemptKey = "voice-tarot:login-attempt";
const recentLoginKey = "voice-tarot:recent-login";
const loginProviders = { naver: "네이버", kakao: "카카오" } as const;
type LoginProvider = keyof typeof loginProviders;
const aiProcessing =
  "음성 타로 상담을 위해 내 음성을 OpenAI에, AI 답변 텍스트를 Typecast에 전송하여 처리하는 데 동의합니다.";

function loginProvider(provider: string | null): LoginProvider | null {
  return provider === "naver" || provider === "kakao" ? provider : null;
}

function LandingIntro() {
  return (
    <>
      <h1 className="landing-title">텐미닛 타로</h1>
      <p className="invitation">
        오늘 고민은 언니가 들어줄게.
        <br />딱 10분, 편하게 이야기해.
      </p>
      <div className="landing-art">
        <img
          className="landing-reader"
          src="/assets/metallic/landing-reader.png"
          alt="타로 리더 레나"
        />
        <img
          className="landing-logo"
          src="/assets/metallic/landing-logo.png"
          alt="TEN MINS TAROT"
        />
      </div>
    </>
  );
}

function AuthCheckNotice() {
  const [showNotice, setShowNotice] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    const noticeTimer = window.setTimeout(() => setShowNotice(true), 3000);
    const deadlineTimer = window.setTimeout(() => {
      void queryClient.cancelQueries({
        queryKey: authOptions.queryKey,
        exact: true,
      });
      navigate("/login", { replace: true });
    }, 8000);
    return () => {
      window.clearTimeout(noticeTimer);
      window.clearTimeout(deadlineTimer);
    };
  }, [navigate, queryClient]);

  return (
    <p className="auth-check-notice" role="status">
      {showNotice && (
        <>
          로그인 상태를 확인 중이에요.
          <br />
          잠시만 기다려 주세요.
        </>
      )}
    </p>
  );
}

function Login({ checking = false }: { checking?: boolean }) {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState(() =>
    new URLSearchParams(search).get("auth_error"),
  );
  const [attempt, setAttempt] = useState(() =>
    loginProvider(sessionStorage.getItem(loginAttemptKey)),
  );
  const recentLogin = loginProvider(localStorage.getItem(recentLoginKey));
  useEffect(() => {
    if (checking) return;
    const consumeAttempt = () => {
      const provider = loginProvider(sessionStorage.getItem(loginAttemptKey));
      if (!provider) return;
      setAttempt(provider);
      sessionStorage.removeItem(loginAttemptKey);
    };
    consumeAttempt();
    window.addEventListener("pageshow", consumeAttempt);
    return () => window.removeEventListener("pageshow", consumeAttempt);
  }, [checking]);
  useEffect(() => {
    if (pathname.toLowerCase().replace(/\/+$/, "") !== "/login") return;
    const params = new URLSearchParams(search);
    const error = params.get("auth_error");
    if (error === null) return;
    setAuthError(error);
    params.delete("auth_error");
    navigate({ pathname, search: params.toString(), hash }, { replace: true });
  }, [hash, navigate, pathname, search]);
  function startLogin(provider: LoginProvider) {
    setAttempt(null);
    setAuthError(null);
    sessionStorage.setItem(loginAttemptKey, provider);
  }
  return (
    <section
      className={checking ? "page landing landing-loading" : "page landing"}
    >
      <LandingIntro />
      <div className="action-stack">
        {checking && <AuthCheckNotice />}
        {(["naver", "kakao"] as const).map((provider) => {
          const showRecovery =
            attempt === provider ||
            (!attempt && authError && provider === "naver");
          return (
            <a
              key={provider}
              className="button glass social-login-button"
              href={authorizeUrl(provider)}
              onClick={() => startLogin(provider)}
              aria-describedby={
                showRecovery ? "login-recovery-message" : undefined
              }
            >
              {loginProviders[provider]}로 시작하기
              {recentLogin === provider && (
                <span className="recent-login-label">최근 로그인</span>
              )}
            </a>
          );
        })}
        {(attempt || authError) && (
          <p
            className="login-recovery"
            id="login-recovery-message"
            role="alert"
          >
            <strong>
              {authError === "cancelled"
                ? "로그인을 취소했어요."
                : "소셜 로그인을 완료할 수 없습니다."}
            </strong>
            <span>다시 시도하거나 닉네임으로 체험할 수 있습니다.</span>
          </p>
        )}
        <Button asChild variant="ghost">
          <Link
            to="/onboarding"
            onClick={() => sessionStorage.removeItem(loginAttemptKey)}
          >
            닉네임으로 체험하기
          </Link>
        </Button>
      </div>
      <div className="login-policies">
        <PolicyDialog title="이용약관">
          데모 이용 안내입니다. 타로는 선택을 돕는 참고용 상담이에요. 데모
          이용권에는 실제 결제가 없어요.
        </PolicyDialog>
        <span aria-hidden="true">·</span>
        <PolicyDialog title="개인정보처리방침">
          데모 개인정보 처리 안내입니다. 상담 음성은 OpenAI에, AI 답변 텍스트는
          Typecast에 전송해요. 상담 요약은 이 브라우저에, 질문과 카드는
          이어보기를 위해 앱 서버에 보관해요.
        </PolicyDialog>
      </div>
    </section>
  );
}
export function Onboarding() {
  const member =
    new URLSearchParams(useLocation().search).get("mode") === "member";
  const [nick, setNick] = useState(() => (member ? "" : profile().nick)),
    navigate = useNavigate();
  const [customName, setCustomName] = useState(false);
  const auth = useQuery({ ...authOptions, enabled: member });
  const queryClient = useQueryClient();
  const saveMember = useMutation({
    mutationFn: saveMemberProfile,
    onSuccess: (user) => {
      queryClient.setQueryData(authOptions.queryKey, user);
      navigate("/", { replace: true });
    },
  });
  if (member && auth.isPending) {
    return <p role="status">로그인 상태를 확인하고 있어요.</p>;
  }
  if (member && auth.isError) {
    return (
      <p role="alert">
        로그인 상태를 확인하지 못했어요. <Link to="/login">로그인 화면</Link>
      </p>
    );
  }
  if (member && !auth.data) return <Navigate to="/login" replace />;
  if (member && !auth.data?.onboarding_required)
    return <Navigate to="/" replace />;
  return (
    <section className="page">
      <h1>만나서 반가워, 공주야.</h1>
      <Panel title="어떻게 불러줄까?">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (member) {
              if (saveMember.isPending || (customName && !nick.trim())) return;
              saveMember.mutate(
                customName
                  ? { addressing_mode: "CUSTOM", nickname: nick.trim() }
                  : { addressing_mode: "DEFAULT", nickname: null },
              );
              return;
            }
            if (!nick.trim()) return;
            saveProfile({ ...profile(), nick: nick.trim() });
            navigate("/");
          }}
        >
          {member ? (
            <fieldset>
              <legend>호칭 선택</legend>
              <label className="consent">
                <input
                  type="radio"
                  name="addressing-mode"
                  checked={!customName}
                  onChange={() => setCustomName(false)}
                />{" "}
                기본 호칭 (공주)
              </label>
              <label className="consent">
                <input
                  type="radio"
                  name="addressing-mode"
                  checked={customName}
                  onChange={() => setCustomName(true)}
                />{" "}
                닉네임으로 불리기
              </label>
            </fieldset>
          ) : null}
          {!member || customName ? (
            <>
              <label htmlFor="nick">닉네임</label>
              <Input
                id="nick"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={member ? 40 : 20}
                required
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setNick(
                    ["새벽의 별", "빛나는 달", "당당한 장미"][
                      Math.floor(Math.random() * 3)
                    ],
                  )
                }
              >
                랜덤 닉네임 ⚄
              </Button>
            </>
          ) : null}
          <label className="consent">
            <input type="checkbox" required /> 만 14세 이상이에요.
          </label>
          {member ? (
            <label className="consent">
              <input type="checkbox" required /> {aiProcessing}
            </label>
          ) : null}
          {member && !consentVersion ? (
            <p role="alert">회원 가입 설정을 확인해 주세요.</p>
          ) : null}
          {saveMember.error ? (
            <p role="alert">{saveMember.error.message}</p>
          ) : null}
          <Button
            size="wide"
            disabled={member && (saveMember.isPending || !consentVersion)}
          >
            {saveMember.isPending ? "저장 중…" : "레나 만나러 가기"}
          </Button>
        </form>
      </Panel>
    </section>
  );
}
export function Home({
  voiceEngine: initialVoiceEngine = "realtime",
}: {
  voiceEngine?: Session["voiceEngine"];
}) {
  const navigate = useNavigate(),
    [p, setP] = useState(profile),
    [voiceEngine, setVoiceEngine] = useState(initialVoiceEngine),
    [personaId, setPersonaId] = useState<PersonaId>("cool-unnie"),
    [mic, setMic] = useState(false),
    [microphoneDenied, setMicrophoneDenied] = useState(false),
    [showPrivacy, setShowPrivacy] = useState(false),
    [menu, setMenu] = useState(false),
    [consent, setConsent] = useState(false),
    [record, setRecord] = useState(false),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [exportStatus, setExportStatus] = useState("");
  const { pathname, search } = useLocation();
  const isLogin = pathname.toLowerCase().replace(/\/+$/, "") === "/login";
  const queryClient = useQueryClient();
  const auth = useQuery({ ...authOptions, enabled: !isLogin });
  useEffect(() => {
    if (isLogin || !auth.data || new URLSearchParams(search).has("auth_error"))
      return;
    const provider =
      loginProvider(auth.data.provider) ??
      loginProvider(sessionStorage.getItem(loginAttemptKey));
    if (provider) localStorage.setItem(recentLoginKey, provider);
    sessionStorage.removeItem(loginAttemptKey);
  }, [auth.data, isLogin, search]);
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      saveProfile({ ...profile(), nick: "" });
      setP(profile());
      queryClient.setQueryData(authOptions.queryKey, null);
      navigate("/login", { replace: true });
    },
  });
  const starting = useRef(false);
  const create = useMutation({
    mutationFn: async (demo: boolean) => {
      const data = await readingRequest({
        action: "create",
        masterId: "adaptive",
        personaId,
      });
      const session: Session = {
        ...emptyReading,
        ...data.state,
        readingId: data.id,
        demo,
        voiceEngine,
        transcript: [],
        notes: [],
        date: new Date().toISOString(),
      };
      saveSession(session, true);
      return session;
    },
    onError: () => discardPreparedAudio(),
    onSettled: () => {
      starting.current = false;
    },
    onSuccess: (s) =>
      navigate(`/sessions/${s.readingId}`, {
        state: { start: true, record, consent },
      }),
  });
  function begin(demo: boolean) {
    if (starting.current) return;
    starting.current = true;
    try {
      if (!demo) prepareAudio();
      create.mutate(demo);
    } catch (e) {
      starting.current = false;
      discardPreparedAudio();
      setError(e instanceof Error ? e.message : "음성을 준비하지 못했어요.");
    }
  }
  const hasAuthError = new URLSearchParams(search).has("auth_error");
  if (!isLogin && !hasAuthError && auth.data?.onboarding_required) {
    return <Navigate to="/onboarding?mode=member" replace />;
  }
  const nick = auth.data ? auth.data.nickname || "공주" : p.nick;
  if (isLogin || hasAuthError || !nick) {
    const checking = !isLogin && !hasAuthError && auth.isPending;
    return (
      <>
        <Login checking={checking} />
        {!isLogin && !checking && (
          <Navigate to={`/login${hasAuthError ? search : ""}`} replace />
        )}
      </>
    );
  }
  async function allowMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMic(true);
      setMicrophoneDenied(false);
      setError("");
    } catch {
      setMic(false);
      setMicrophoneDenied(true);
    }
  }
  if (microphoneDenied)
    return (
      <section
        className="page metallic-page recovery-page"
        data-phase="permission"
      >
        <BrandHeader>
          <span className="timer glass">● 준비</span>
        </BrandHeader>
        <Reader status="마이크 설정을 확인해줘" />
        <h1>{"공주 목소리를\n들을 수 있게 해줘."}</h1>
        <p className="hint">마이크 접근이 허용되지 않았어요</p>
        <Panel title="NOTICE">
          <p>
            브라우저의 사이트 설정에서 마이크 접근을 허용한 뒤 다시 시도해줘.
          </p>
          <p>다른 앱이 마이크를 사용 중이라면 그 앱을 닫고 다시 확인해줘.</p>
        </Panel>
        <div className="action-stack recovery-actions">
          <Button size="wide" onClick={() => void allowMic()}>
            마이크 다시 확인하기
          </Button>
          <Button size="wide" onClick={() => setMicrophoneDenied(false)}>
            홈으로
          </Button>
        </div>
      </section>
    );
  if (showPrivacy)
    return (
      <section className="page metallic-page privacy-page">
        <BrandHeader>
          <button
            type="button"
            className="round-action glass"
            aria-label="녹음 안내 닫기"
            onClick={() => setShowPrivacy(false)}
          >
            ×
          </button>
        </BrandHeader>
        <p className="hint">녹음 안내</p>
        <h1>{"목소리는 오직\n타로 상담을 위해"}</h1>
        <p>TEN MINUTES의 타로 상담과 상담 리포트 제공에 목소리를 이용해요.</p>
        <Panel title="VOICE PRIVACY">
          <h2>어떤 정보를, 왜 쓰나요?</h2>
          <p>{aiProcessing}</p>
          <h2>마이크 허용과 녹음 저장은 별개예요</h2>
          <p>
            녹음은 내 마이크에만 적용돼요. 녹음을 선택하면 종료 후 파일로 저장할
            수 있고, 로컬 테스트에서는 서버에도 저장해요.
          </p>
          <h2>상담 기록은 어디에 남나요?</h2>
          <p>
            상담 요약은 이 브라우저에 저장해요. 질문과 카드는 상담을 이어볼 수
            있도록 앱 서버에 보관해요.
          </p>
        </Panel>
        <p className="hint">녹음 저장 여부는 별도로 선택할 수 있어요.</p>
        <Button size="wide" onClick={() => setShowPrivacy(false)}>
          확인했어요
        </Button>
      </section>
    );
  return (
    <section className="page intro metallic-page">
      <BrandHeader>
        <button
          type="button"
          className="round-action glass"
          aria-label={menu ? "메뉴 닫기" : "메뉴 열기"}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenu(false);
          }}
          aria-expanded={menu}
          aria-controls={menu ? "home-menu" : undefined}
          onClick={() => setMenu(!menu)}
        >
          {menu ? "×" : "☰"}
        </button>
      </BrandHeader>
      {menu && (
        <>
          <button
            type="button"
            className="menu-backdrop"
            aria-label="메뉴 바깥 영역 닫기"
            onClick={() => setMenu(false)}
            tabIndex={-1}
          />
          <nav
            className="home-menu panel"
            id="home-menu"
            aria-label="메뉴"
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenu(false);
            }}
          >
            <small>MENU</small>
            <Link className="report-menu-item" to="/reports">
              <span>
                <b>내 리포트</b>
                <small>지난 상담을 다시 읽어보세요</small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
            {auth.data && (
              <Button
                variant="ghost"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
              >
                로그아웃
              </Button>
            )}
            {signOut.error && <p role="alert">{signOut.error.message}</p>}
          </nav>
        </>
      )}
      <Reader profile />
      <Panel title="MESSAGE" className="greeting-panel">
        <h1>{nick || "공주"}야, 안녕!</h1>
        <p>
          오늘 무슨 일 있었어?
          <br />
          복잡한 마음, 타로로
          <br />
          하나씩 풀어보자.
        </p>
        <small>지금은 공주 이야기만 듣는 시간.</small>
      </Panel>
      <Panel title="NOTICE" className="notice">
        <div className="notice-row">
          <span>♬</span>
          <div>
            <b>마이크 사용 · 필수</b>
            <small>목소리 상담에 마이크가 필요해요.</small>
          </div>
          <Button size="sm" onClick={() => void allowMic()} disabled={mic}>
            {mic ? "✓ 허용됨" : "허용하기"}
          </Button>
        </div>
        <label className="notice-row">
          <span>▥</span>
          <div>
            <b>상담 녹음 동의 · 선택</b>
            <small>녹음 없이도 상담할 수 있어요.</small>
          </div>
          <input
            type="checkbox"
            role="switch"
            checked={record}
            onChange={(e) => setRecord(e.target.checked)}
            aria-label="내 목소리 녹음 동의"
          />
        </label>
        <button
          className="text-button underline"
          onClick={() => setShowPrivacy(true)}
        >
          녹음 안내 보기
        </button>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          상담을 위한 음성 처리에 동의해요.
        </label>
      </Panel>
      <Button
        size="wide"
        variant="primary"
        disabled={!mic || !consent || create.isPending}
        onClick={() => {
          if (p.freeUsed && p.tickets < 1) {
            navigate("/tickets");
            return;
          }
          begin(false);
        }}
      >
        {create.isPending
          ? "상담 준비 중…"
          : `☎ ${p.freeUsed ? "이용권으로 10분 상담 시작하기" : "첫 상담 5분 시작하기"}`}
      </Button>
      <p className="hint">
        {mic && consent
          ? "준비됐어, 공주야. 편하게 시작해."
          : "마이크와 음성 처리에 동의하면 시작할 수 있어요."}
      </p>
      <details
        className="home-options"
        open={initialVoiceEngine === "live-typecast" || undefined}
      >
        <summary>상담 옵션</summary>
        <fieldset
          className="panel consultation-options"
          disabled={create.isPending}
        >
          <legend>상담 버전 선택</legend>
          <label className="consent">
            <input
              type="radio"
              name="voice-engine"
              value="realtime"
              checked={voiceEngine === "realtime"}
              onChange={() => setVoiceEngine("realtime")}
            />
            Realtime + Typecast
          </label>
          <label className="consent">
            <input
              type="radio"
              name="voice-engine"
              value="live-typecast"
              checked={voiceEngine === "live-typecast"}
              onChange={() => setVoiceEngine("live-typecast")}
            />
            Live + Typecast
          </label>
          <p className="hint">
            둘 다 레나의 목소리 · 1.3배속이에요. 새 통화에 선택한 버전을
            적용해요.
          </p>
        </fieldset>
        <fieldset
          className="panel consultation-options"
          disabled={create.isPending}
        >
          <legend>테스트 · 페르소나 선택</legend>
          {personas.map((persona) => (
            <label className="consent" key={persona.id}>
              <input
                type="radio"
                name="persona"
                checked={personaId === persona.id}
                onChange={() => setPersonaId(persona.id)}
              />
              {persona.label}
            </label>
          ))}
          <p className="hint">
            새 음성 통화에 적용돼요. 이어보기는 기존 선택을 유지하고, 시범
            통화는 고정 예시예요.
          </p>
        </fieldset>
      </details>
      {import.meta.env.DEV ? (
        <details className="home-options">
          <summary>테스트 대화 로그</summary>
          <Panel title="테스트 대화 로그">
            <p>
              새 음성 통화는 대화·도구·재생 이벤트를 로컬 서버의 .test-logs
              폴더에 자동 저장해요.
            </p>
            <Button
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                setExportStatus("");
                try {
                  const count = await exportSavedConversations();
                  setExportStatus(`이전 대화 ${count}개를 .md로 저장했어요.`);
                } catch {
                  setExportStatus(
                    "일부 로그 저장에 실패했어요. 로컬 서버 연결을 확인해 주세요.",
                  );
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? "저장 중…" : "이 브라우저의 이전 대화도 .md로 저장"}
            </Button>
            <p role="status">{exportStatus}</p>
          </Panel>
        </details>
      ) : null}
      <div className="extras">
        <Button
          variant="ghost"
          disabled={create.isPending}
          onClick={() => begin(true)}
        >
          시범 통화
        </Button>
        {p.last ? (
          <Link
            to={`/sessions/${p.last.readingId}${p.last.ended ? "/report" : ""}`}
          >
            지난 상담
          </Link>
        ) : null}
        <Link to="/tickets">데모 이용권 추가</Link>
        <span>이용권 {p.tickets}장</span>
      </div>
      {error || create.error ? (
        <p role="alert" className="error-message">
          {error || create.error?.message}
        </p>
      ) : null}
    </section>
  );
}
export function Tickets() {
  const navigate = useNavigate(),
    [busy, setBusy] = useState(false);
  return (
    <section className="page">
      <h1>언니와 조금 더 얘기할까?</h1>
      <Panel title="데모 이용권">
        <p>10분 상담 이용권 1장</p>
        <p>실제 결제는 없어요. 이 기기에 저장되는 체험용 이용권이에요.</p>
        <Button
          disabled={busy}
          size="wide"
          onClick={() => {
            setBusy(true);
            const p = profile();
            saveProfile({ ...p, tickets: p.tickets + 1 });
            navigate("/payments/result", {
              replace: true,
              state: { demoGranted: true },
            });
          }}
        >
          데모 이용권 받기
        </Button>
      </Panel>
      <Link to="/">홈으로</Link>
    </section>
  );
}
