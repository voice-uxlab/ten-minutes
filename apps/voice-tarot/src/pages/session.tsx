import { Cards } from "@/components/cards";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { consultationOptions } from "@/api/consultations";
import type { Session } from "@/api/types";
import { Consultation } from "@/features/consultation/controller";
import {
  selectionCount,
  recommendSpread,
} from "@/features/consultation/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandHeader, Reader, Panel } from "@/components/tarot";
const topicSets = [
  [
    "그 사람도 나를 좋아할까?",
    "나는 언제쯤 결혼할까?",
    "지금 내 선택, 괜찮을까?",
  ],
  [
    "먼저 연락해도 될까?",
    "지금 일을 계속해도 될까?",
    "새로운 인연을 만날 수 있을까?",
  ],
];

function Wave() {
  return (
    <div className="wave" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

export function SessionPage() {
  const { id = "" } = useParams();
  const reading = useQuery(consultationOptions(id));
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
  return <Call key={id} initial={reading.data!} />;
}
function Call({ initial }: { initial: Session }) {
  const [controller] = useState(() => new Consultation(initial)),
    v = useSyncExternalStore(controller.subscribe, controller.getSnapshot),
    s = v.session,
    location = useLocation(),
    navigate = useNavigate(),
    [topics, setTopics] = useState(0),
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
      <section
        className="page metallic-page recovery-page"
        data-phase={v.startIssue === "microphone" ? "permission" : v.phase}
      >
        <BrandHeader>
          <span className="timer glass">
            ●{" "}
            {v.phase === "error"
              ? v.startIssue === "microphone"
                ? "준비"
                : "연결 오류"
              : "준비"}
          </span>
        </BrandHeader>
        <Reader
          status={
            v.startIssue === "microphone"
              ? "마이크 설정을 확인해줘"
              : "연결 상태를 확인해줘"
          }
        />
        <h1>
          {v.startIssue === "microphone"
            ? "공주 목소리를\n들을 수 있게 해줘."
            : v.phase === "error"
              ? "연결이 잠깐\n끊겼어, 공주야."
              : "이야기를 이어가볼까?"}
        </h1>
        {v.phase === "error" && (
          <Panel title="NOTICE">
            <p role="alert">
              {v.startIssue === "microphone"
                ? "브라우저의 사이트 설정에서 마이크 접근을 허용한 뒤 다시 시도해줘."
                : v.error}
            </p>
            {v.startIssue !== "microphone" && (
              <p>공주의 잘못이 아니야. 언니는 여기 있을게.</p>
            )}
          </Panel>
        )}
        {s.cards.length > 0 && <Cards cards={s.cards} revealed={s.revealed} />}
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          음성은 OpenAI로, 답변 텍스트는 타입캐스트로 전송하는 데 동의해요.
        </label>
        <Button
          size="wide"
          disabled={!consent}
          onClick={() => void controller.start()}
        >
          {v.startIssue === "microphone"
            ? "마이크 다시 확인하기"
            : v.phase === "error"
              ? "다시 연결하기"
              : "상담 연결하기"}
        </Button>
        <Button asChild size="wide">
          <Link to="/">홈으로</Link>
        </Button>
      </section>
    );
  if (["ending", "ended"].includes(v.phase))
    return (
      <section className="page metallic-page ended-page" data-phase={v.phase}>
        <BrandHeader>
          <span className="timer glass">● 종료</span>
        </BrandHeader>
        <Reader status="다음에 또 이야기하자" />
        <h1>이야기 나눠줘서 고마워.</h1>
        <p className="hint">통화가 종료되었어요.</p>
        <Panel title="MESSAGE">
          <h2>언제든 다시 이야기하자.</h2>
          <p>
            {v.phase === "ending"
              ? "오늘의 이야기를 정리하고 있어."
              : s.report?.queen_line}
          </p>
        </Panel>
        {v.phase === "ending" && v.error && (
          <>
            <p role="alert">{v.error}</p>
            <Button
              size="wide"
              disabled={v.busy}
              onClick={() => void controller.saveReport()}
            >
              리포트 저장 다시 시도
            </Button>
          </>
        )}
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
        <Button asChild size="wide">
          <Link to="/">타로 다시 보기</Link>
        </Button>
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
              position: s.positions[i],
            })),
        ]
      : s.cards;
  const activeCard = s.cards.find((card) => v.active.includes(card.slot));
  const focused =
    activeCard && ["reveal", "reading"].includes(v.phase)
      ? activeCard
      : undefined;
  const summary = v.phase === "reading" && s.summaryVisited && !focused;
  const retry = selecting && v.retryNumbers;
  const phase = retry ? "retry-numbers" : summary ? "summary" : v.phase;
  const timer =
    v.phase === "connecting"
      ? "연결 중"
      : `${String(Math.floor(v.remaining / 60)).padStart(2, "0")}:${String(v.remaining % 60).padStart(2, "0")}`;
  const ordinal =
    focused && ["첫 번째", "두 번째", "세 번째"][focused.slot - 1];
  const heading = retry
    ? "앗, 잘 못 들었어.\n번호를 다시 알려줄래?"
    : summary
      ? "세 장의 카드를\n함께 살펴볼게."
      : v.phase === "question"
        ? "이 질문으로\n살펴볼까?"
        : v.phase === "picking" && !s.picks.length && count === 3
          ? "마음이 가는\n번호 세 개를 골라줘."
          : ordinal && v.phase === "reveal"
            ? `${ordinal} 카드는,\n${focused.name}이야.`
            : ordinal && v.phase === "reading"
              ? `${ordinal} 카드,\n언니가 이야기해줄게.`
              : v.heading;
  return (
    <section className="page metallic-page call-page" data-phase={phase}>
      <BrandHeader>
        <span
          className={`timer glass${v.phase !== "connecting" && v.remaining <= 60 ? " warning" : ""}`}
        >
          ● {timer}
        </span>
      </BrandHeader>
      {v.phase === "reveal" && focused ? (
        <p className="eyebrow">
          PICKED BY PRINCESS / {focused.slot} OF {s.cards.length}
        </p>
      ) : (
        !summary && (
          <Reader
            active={[
              "listening",
              "question",
              "picking",
              "confirm",
              "reading",
            ].includes(v.phase)}
            status={retry ? "번호를 다시 말해줘" : v.status}
          />
        )
      )}
      <h1>{heading}</h1>
      {["listening", "question"].includes(v.phase) && (
        <p className="question-progress">
          <span data-current={v.phase === "listening"}>1 고민 말하기</span>
          <span aria-hidden="true">›</span>
          <span data-current={v.phase === "question"}>2 질문 확인</span>
        </p>
      )}
      {retry ? (
        <p className="hint">번호 다시 듣기 · 천천히 말해줘</p>
      ) : focused ? (
        <p className="hint">
          {focused.slot} / {s.cards.length} · {focused.position}
          {v.phase === "reading" ? ` · ${focused.name}` : ""}
        </p>
      ) : (
        v.phase !== "question" &&
        v.phase !== "listening" && (
          <p className="hint">
            {v.phase === "connecting"
              ? "마이크와 오디오를 연결하고 있어요"
              : v.hint}
          </p>
        )
      )}
      {v.phase === "listening" && (
        <Panel title="MESSAGE" className="listening-message">
          <p aria-live="polite">
            {v.caption || "편하게 말해줘. 아래 질문을 골라도 좋아!"}
          </p>
          <div className="topic-list">
            {topicSets[topics].map((topic) => (
              <Button
                key={topic}
                disabled={v.busy}
                onClick={() =>
                  void controller.editQuestion(topic, recommendSpread(topic))
                }
              >
                {topic}
                <span aria-hidden="true">›</span>
              </Button>
            ))}
            <button
              className="text-button"
              onClick={() => setTopics((topics + 1) % topicSets.length)}
            >
              ⟳ 다른 질문 보기
            </button>
          </div>
        </Panel>
      )}
      {v.phase === "connecting" && (
        <>
          <Panel title="CONNECTING" className="connecting-message">
            <p>
              곧 언니 목소리가 들릴 거야.
              <br />
              편하게 이야기할 준비만 해줘.
            </p>
          </Panel>
          <Wave />
          <Button size="wide" onClick={() => navigate("/")}>
            연결 취소
          </Button>
        </>
      )}
      {v.phase !== "connecting" && v.phase !== "listening" && (
        <div className="phase-content">
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
                        .editQuestion(
                          question.trim(),
                          recommendSpread(question),
                        )
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
          {v.phase !== "question" && (
            <Cards
              cards={cards}
              revealed={s.revealed}
              active={v.active}
              pending={selecting ? count - s.picks.length : 0}
              focus={focused?.slot}
            />
          )}
          {selecting ? (
            <>
              <Panel title={retry ? "TRY AGAIN" : "MESSAGE"}>
                <p>
                  {retry
                    ? "번호를 천천히 다시 말해줘. 이미 확인된 번호는 그대로 둘게."
                    : "1~78 중 서로 다른 번호를 말해줘. 다 뽑으면 한 장씩 해석해줄게."}
                </p>
              </Panel>
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
          {!selecting && v.phase !== "question" && (
            <>
              <Panel title="MESSAGE" className="reading-message">
                <p aria-live="polite">
                  {v.caption ||
                    (v.phase === "reveal" && focused
                      ? focused.reversed
                        ? focused.reverse
                        : focused.upright
                      : "네 이야기를 듣고 있어.")}
                </p>
              </Panel>
            </>
          )}
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
        </div>
      )}
      {v.error ? (
        <p role="alert" className="error-message">
          {v.error}
        </p>
      ) : null}
      {v.phase === "listening" && (
        <div className="listening-wave">
          <Wave />
          <p className="hint">말하면 자동으로 들어요</p>
        </div>
      )}
      {v.phase !== "connecting" && (
        <div className="controls">
          <button
            aria-label="마이크 음소거"
            aria-pressed={v.muted}
            onClick={() => controller.mute()}
          >
            <span className="control-icon">
              <img
                src={
                  v.muted
                    ? "/assets/metallic/mic-off.png"
                    : "/assets/metallic/mic.png"
                }
                width={v.muted ? 43 : 24}
                height={v.muted ? 43 : 24}
                alt=""
              />
            </span>
            <span className="control-label">
              {v.muted ? "마이크 꺼짐" : "마이크 켜짐"}
            </span>
          </button>
          <button id="hangup" onClick={() => void controller.end()}>
            <span className="control-icon">
              <img
                src="/assets/metallic/end-call.png"
                width={29.33}
                height={29.33}
                alt=""
              />
            </span>
            <span className="control-label">통화 종료</span>
          </button>
        </div>
      )}
      {summary && (
        <Button
          size="wide"
          disabled={v.busy}
          onClick={() => void controller.end()}
        >
          상담 마치고 리포트 보기
        </Button>
      )}
    </section>
  );
}
