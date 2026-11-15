import { Cards } from "@/components/cards";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { readingOptions } from "@/api/client";
import type { Session } from "@/api/types";
import { loadSession, profile } from "@/lib/storage";
import { Consultation } from "@/features/consultation/controller";
import {
  selectionCount,
  recommendSpread,
} from "@/features/consultation/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reader, Panel, Notes } from "@/components/tarot";
export function SessionPage() {
  const { id = "" } = useParams();
  const reading = useQuery(readingOptions(id));
  if (reading.isPending)
    return (
      <section className="page" role="status">
        이전 상담을 확인하고 있어요.
      </section>
    );
  if (reading.error)
    return (
      <section className="page">
        <h1>상담을 불러오지 못했어요.</h1>
        <p role="alert">{reading.error.message}</p>
        <Button onClick={() => void reading.refetch()}>다시 시도</Button>
        <Link to="/">홈으로</Link>
      </section>
    );
  const local = loadSession(id);
  const session: Session = {
    transcript: [],
    notes: [],
    date: new Date().toISOString(),
    demo: false,
    ...local,
    ...reading.data!.state,
    readingId: id,
  };
  return <Call key={id} initial={session} />;
}
function Call({ initial }: { initial: Session }) {
  const [controller] = useState(() => new Consultation(initial)),
    v = useSyncExternalStore(controller.subscribe, controller.getSnapshot),
    s = v.session,
    location = useLocation(),
    [consent, setConsent] = useState(!!location.state?.consent),
    [edit, setEdit] = useState(false),
    [question, setQuestion] = useState(s.question),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const onHide = () => controller.dispose();
    window.addEventListener("pagehide", onHide);
    if (location.state?.start) {
      // Consume the navigation intent; a reload offers reconnect instead of auto-starting audio.
      window.history.replaceState(
        { ...window.history.state, usr: { ...location.state, start: false } },
        "",
      );
      void controller.start(!!location.state.record);
    }
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", onHide);
      queueMicrotask(() => {
        if (!mounted.current) controller.dispose();
      });
    };
  }, [controller, location.state]);
  if (v.phase === "idle" || v.phase === "error")
    return (
      <section className="page">
        <Reader />
        <h1>
          {v.phase === "error"
            ? "다시 이어가면 돼, 공주야."
            : "이야기를 이어가볼까?"}
        </h1>
        <p role="alert">{v.error}</p>
        <Cards cards={s.cards} revealed={s.revealed} />
        {!s.demo ? (
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            음성은 OpenAI로, 답변 텍스트는 타입캐스트로 전송하는 데 동의해요.
          </label>
        ) : null}
        <Button
          size="wide"
          disabled={!s.demo && !consent}
          onClick={() => void controller.start()}
        >
          {v.phase === "error" ? "다시 연결하기" : "상담 연결하기"}
        </Button>
        <Link to="/">홈으로</Link>
      </section>
    );
  if (["ending", "ended"].includes(v.phase))
    return (
      <section className="page">
        <header>
          <strong>VOICE TAROT</strong>
          <span>● 종료</span>
        </header>
        <Reader status="언제든 네 편이야." />
        <h1>오늘도 괜찮아, 공주야.</h1>
        <Panel title="MESSAGE">
          <p>
            {v.phase === "ending"
              ? "오늘의 이야기를 정리하고 있어."
              : s.report?.queen_line}
          </p>
        </Panel>
        <Notes notes={s.notes} open={s.demo} />
        <Button asChild disabled={v.phase === "ending"} size="wide">
          <Link
            aria-disabled={v.phase === "ending"}
            onClick={(e) => {
              if (v.phase === "ending") e.preventDefault();
            }}
            to={`/sessions/${s.readingId}/report`}
          >
            {v.phase === "ending" ? "리포트 정리 중…" : "오늘의 리포트 보기"}
          </Link>
        </Button>
        {v.recording ? (
          <a
            className="button glass"
            href={v.recording}
            download="voice-tarot-recording.webm"
          >
            내 목소리 녹음 저장
          </a>
        ) : null}
        <Link to="/">처음으로 돌아가기</Link>
      </section>
    );
  const selecting = ["picking", "confirm"].includes(v.phase),
    count = selectionCount(s),
    cards = selecting
      ? [
          ...s.cards,
          ...s.picks
            .filter((number) => !s.cards.some((card) => card.number === number))
            .map((number, i) => ({
              number,
              slot: s.cards.length + i + 1,
              position: s.clarifier?.confirmed
                ? s.clarifier.question
                : s.positions[i],
            })),
        ]
      : s.cards;
  return (
    <section className="page call-page" data-phase={v.phase}>
      <header>
        <strong>VOICE TAROT</strong>
        <span
          className={
            "timer glass" +
            (!s.demo && v.phase !== "connecting" && v.remaining <= 60
              ? " warning"
              : "")
          }
        >
          {s.demo
            ? "시범"
            : `${String(Math.floor(v.remaining / 60)).padStart(2, "0")}:${String(v.remaining % 60).padStart(2, "0")}`}
        </span>
      </header>
      <span className="mode">
        {s.demo
          ? "시범 통화"
          : s.voiceEngine === "live-typecast"
            ? "Live × Typecast 비교 통화"
            : "레나와의 통화"}
      </span>
      {s.voiceEngine === "live-typecast" &&
      v.transcriptToAudioMs !== undefined ? (
        <p className="hint">
          최근 자막 구간 → 첫 음성 재생: {v.transcriptToAudioMs}ms (최근 구간)
        </p>
      ) : null}
      {v.phase !== "reveal" ? <Reader status={v.status} /> : null}
      <h1>{v.heading}</h1>
      <p className="hint">{v.hint}</p>
      {v.phase === "question" ? (
        <>
          <Panel title="YOUR QUESTION">
            <b>공주의 고민</b>
            <p>{s.question}</p>
            {edit ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void controller
                    .editQuestion(question.trim(), recommendSpread(question))
                    .then(() => setEdit(false));
                }}
              >
                <label htmlFor="question">상담할 질문</label>
                <Input
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={300}
                  required
                />
                <Button disabled={v.busy}>수정한 질문으로 확인</Button>
              </form>
            ) : null}
          </Panel>
          <Button
            size="wide"
            disabled={v.busy}
            onClick={() => void controller.interact("confirm_question")}
          >
            응, 이 질문으로 볼래
          </Button>
          <Button
            size="wide"
            onClick={() => {
              setQuestion(s.question);
              setEdit(true);
            }}
          >
            조금 다르게 말할게
          </Button>
        </>
      ) : null}
      {selecting ? (
        <>
          <p className="hint">
            1~78 사이 번호를 말해줘. {s.picks.length} / {count}
          </p>
          <div className="number-chips" aria-live="polite">
            {s.picks.map((n) => (
              <span className="number-chip" key={n}>
                {n}번
              </span>
            ))}
          </div>
          <details>
            <summary>직접 번호 고르기</summary>
            <div id="grid">
              {Array.from({ length: 78 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  aria-label={`${n}번 카드`}
                  aria-pressed={s.picks.includes(n)}
                  className={s.picks.includes(n) ? "selected" : ""}
                  disabled={v.busy || s.cards.some((c) => c.number === n)}
                  onClick={() => controller.pick(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </details>
        </>
      ) : null}
      <Cards cards={cards} revealed={s.revealed} active={v.active} />
      {v.phase === "confirm" ? (
        <div className="action-stack">
          <Button
            size="wide"
            disabled={v.busy}
            onClick={() => void controller.interact("confirm_cards")}
          >
            응, 이 {count}장을 열어줘
          </Button>
          <Button
            size="wide"
            disabled={v.busy}
            onClick={() =>
              void controller.interact("select_numbers", {
                picks: [],
                replace: true,
              })
            }
          >
            번호 다시 말하기
          </Button>
        </div>
      ) : null}
      {s.clarifier && !s.clarifier.confirmed && !s.clarifier.drawn ? (
        <Panel title="추가 카드 · 1장">
          <p>{s.clarifier.question}</p>
          <Button
            disabled={v.busy}
            onClick={() => void controller.interact("confirm_clarifier")}
          >
            응, 한 장 더 살펴볼래
          </Button>
          <Button
            variant="ghost"
            disabled={v.busy}
            onClick={() => void controller.interact("cancel_clarifier")}
          >
            지금 리딩으로 충분해
          </Button>
        </Panel>
      ) : null}
      {!["question", "confirm"].includes(v.phase) ? (
        <Panel title="MESSAGE">
          <p aria-live="polite">{v.caption}</p>
        </Panel>
      ) : null}
      {v.error ? (
        <p role="alert" className="error-message">
          {v.error}
        </p>
      ) : null}
      {s.demo && ["listening", "reveal", "reading"].includes(v.phase) ? (
        <Button
          size="wide"
          disabled={v.busy}
          onClick={() => void controller.nextDemo()}
        >
          {v.phase === "listening"
            ? "예시 고민으로 계속하기 →"
            : "다음 이야기 듣기 →"}
        </Button>
      ) : null}
      {!s.demo && v.remaining <= 60 && profile().tickets > 0 ? (
        <Button
          disabled={v.busy}
          onClick={() => void controller.interact("extend_call")}
        >
          이용권으로 10분 연장
        </Button>
      ) : null}
      {["connecting", "listening"].includes(v.phase) ? (
        <div className="wave" aria-label="음성 상담 중">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      ) : null}
      <div className="controls">
        <button
          aria-label="마이크 음소거"
          aria-pressed={v.muted}
          disabled={s.demo}
          onClick={() => controller.mute()}
        >
          <span className="control-icon">♩</span>
          <span className="control-label">
            {v.muted ? "음소거 중" : "마이크 켜짐"}
          </span>
        </button>
        <button id="hangup" onClick={() => void controller.end()}>
          <span className="control-icon">☎</span>
          <span className="control-label">통화 종료</span>
        </button>
        <Button
          id="bgm"
          variant="ghost"
          onClick={() => controller.setMusic(!v.bgm)}
        >
          배경음 {v.bgm ? "켜짐" : "꺼짐"}
        </Button>
      </div>
    </section>
  );
}
