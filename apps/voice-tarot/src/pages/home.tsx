import { exportSavedConversations } from "@/features/consultation/test-logger";
import { personas, type PersonaId } from "../../shared/personas.ts";
import {
  prepareAudio,
  discardPreparedAudio,
} from "@/features/consultation/audio-context";
import { useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { request, readingRequest } from "@/api/client";
import { emptyReading, type Session } from "@/api/types";
import { profile, saveProfile, saveSession } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PolicyDialog } from "@/components/ui/dialog";
import { Reader, Panel } from "@/components/tarot";
export function Login() {
  return (
    <section className="page landing">
      <p className="invitation">
        오늘 고민은 언니가 들어줄게.
        <br />
        공주야, 편하게 시작해.
      </p>
      <img
        className="home-art"
        src="/assets/home-art.png"
        alt="전화기를 든 캐릭터와 은빛 VOICE TAROT 로고"
      />
      <div className="action-stack">
        <a className="button glass" href="/auth/naver">
          네이버로 시작하기
        </a>
        <a className="button glass" href="/auth/kakao">
          카카오로 시작하기
        </a>
        <Button asChild variant="ghost">
          <Link to="/onboarding">닉네임으로 체험하기</Link>
        </Button>
      </div>
      {new URLSearchParams(location.search).has("auth_error") ? (
        <p role="alert">
          소셜 로그인 설정을 확인해 주세요. 닉네임으로도 체험할 수 있어요.
        </p>
      ) : null}
      <PolicyDialog title="이용 안내">
        타로는 선택을 돕는 참고용 상담이에요. 이용권은 실제 결제가 없는 데모
        기능이에요.
      </PolicyDialog>
      <PolicyDialog title="개인정보 및 음성 처리 안내">
        상담 음성은 OpenAI로, 답변 텍스트는 Typecast로 전송해요. 상담 요약은 이
        브라우저에, 질문과 카드는 이어보기를 위해 앱 서버에 보관돼요. 소셜
        로그인은 회원 식별자와 닉네임을 사용해요.
      </PolicyDialog>
    </section>
  );
}
export function Onboarding() {
  const [nick, setNick] = useState(profile().nick),
    navigate = useNavigate();
  return (
    <section className="page">
      <h1>만나서 반가워, 공주야.</h1>
      <Panel title="어떻게 불러줄까?">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nick.trim()) return;
            saveProfile({ ...profile(), nick: nick.trim() });
            navigate("/");
          }}
        >
          <label htmlFor="nick">닉네임</label>
          <Input
            id="nick"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={20}
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
          <label className="consent">
            <input type="checkbox" required /> 만 14세 이상이에요.
          </label>
          <Button size="wide">레나 만나러 가기</Button>
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
    [consent, setConsent] = useState(false),
    [record, setRecord] = useState(false),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [exportStatus, setExportStatus] = useState("");
  const auth = useQuery({
    queryKey: ["auth"],
    queryFn: () =>
      request<{
        user?: { nickname: string };
        providers: Record<string, boolean>;
      }>("/auth/me"),
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
  const nick = auth.data?.user?.nickname || p.nick;
  if (!nick && !auth.isPending) return <Navigate to="/login" replace />;
  async function allowMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMic(true);
      setError("");
    } catch {
      setError(
        "브라우저의 사이트 설정에서 마이크 권한을 허용한 뒤 다시 시도해 주세요.",
      );
    }
  }
  return (
    <section className="page intro">
      <fieldset className="panel" disabled={create.isPending}>
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
          둘 다 레나의 목소리 · 1.3배속이에요. 새 통화에 선택한 버전을 적용해요.
        </p>
      </fieldset>
      <fieldset className="panel" disabled={create.isPending}>
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
          새 음성 통화에 적용돼요. 이어보기는 기존 선택을 유지하고, 시범 통화는
          고정 예시예요.
        </p>
      </fieldset>
      <header>
        <Link to="/login">‹ HOME</Link>
        {auth.data?.user ? (
          <Button
            variant="ghost"
            onClick={async () => {
              await request("/auth/logout", {});
              saveProfile({ ...p, nick: "" });
              setP(profile());
              location.assign("/login");
            }}
          >
            로그아웃
          </Button>
        ) : null}
      </header>
      <Reader />
      <Panel title="message from 언니" className="greeting-panel">
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
            <small>
              내 목소리를 녹음해요. 로컬 테스트에서는 서버의 로그 폴더에도
              저장해요.
            </small>
          </div>
          <input
            type="checkbox"
            role="switch"
            checked={record}
            onChange={(e) => setRecord(e.target.checked)}
            aria-label="내 목소리 녹음 동의"
          />
        </label>
        <PolicyDialog title="녹음 안내 보기">
          내 마이크만 녹음해요. 로컬 테스트에서는 서버에도 저장해요. AI 음성은
          포함되지 않고, 종료 후 파일로 저장할 수 있어요. 녹음 없이도 상담할 수
          있어요.
        </PolicyDialog>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          {voiceEngine === "live-noeul"
            ? "음성을 OpenAI에 전송하여 음성 상담을 진행하는 데 동의해요."
            : "음성을 OpenAI에, 답변 텍스트를 타입캐스트에 전송하는 데 동의해요."}
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
      {import.meta.env.DEV ? (
        <Panel title="테스트 대화 로그">
          <p>
            새 음성 통화는 대화·도구·재생 이벤트를 로컬 서버의 .test-logs 폴더에
            자동 저장해요.
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
