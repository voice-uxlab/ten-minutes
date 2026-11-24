import { Cards } from "@/components/cards";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authOptions } from "@/api/auth";
import { Link, Navigate, useParams } from "react-router-dom";
import { loadSession, localReports } from "@/lib/storage";
import { BrandHeader, Panel } from "@/components/tarot";
import { Button } from "@/components/ui/button";
export function ReportPage() {
  const { id = "" } = useParams(),
    s = loadSession(id),
    [error, setError] = useState(""),
    [shareStatus, setShareStatus] = useState("");
  async function shareInvite() {
    const url = new URL("/invite/christmas", window.location.origin).href;
    setError("");
    try {
      if (navigator.share) await navigator.share({ title: "텐미닛 타로", url });
      else {
        await navigator.clipboard.writeText(url);
        setShareStatus("초대 링크를 복사했어요.");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setError("초대 링크를 공유하지 못했어요.");
      }
    }
  }
  if (!s?.report || s.demo)
    return (
      <section className="page">
        <h1>이 기기에 저장된 리포트가 없어요.</h1>
        <Link to={`/sessions/${id}`}>상담 확인하기</Link>
        <Link to="/">홈으로</Link>
      </section>
    );
  return (
    <section className="page metallic-page report-page">
      <BrandHeader />
      <h1>
        {s.cards.length
          ? `공주가 고른 타로 ${s.cards.length === 3 ? "세 장" : `${s.cards.length}장`}`
          : "오늘의 상담 리포트"}
      </h1>
      <div className="report-spread">
        <Cards cards={s.cards} revealed={s.revealed} />
      </div>
      <p className="report-date">
        {new Date(s.date).toLocaleDateString("ko-KR")}
      </p>
      <Panel title="상황 한 줄 요약">
        <h2>{s.question || s.report.question}</h2>
        <p>{s.report.summary}</p>
      </Panel>
      <Panel title="언니의 한마디">
        <p>{s.report.queen_line}</p>
      </Panel>
      <h2 className="report-invite-title">친구는 어떤 카드가 나올까?</h2>
      <Button size="wide" onClick={() => void shareInvite()}>
        친구한테도 알려주기
      </Button>
      {shareStatus && (
        <p className="hint" role="status">
          {shareStatus}
        </p>
      )}
      {error ? <p role="alert">{error}</p> : null}
      <Link to="/reports">내 리포트 목록</Link>
      <Link to="/">처음으로</Link>
    </section>
  );
}

export function ReportsPage() {
  const auth = useQuery(authOptions);
  if (auth.isPending) {
    return (
      <section className="page" role="status">
        로그인 상태를 확인하고 있어요.
      </section>
    );
  }
  if (!auth.data) return <Navigate to="/login" replace />;
  const reports = localReports();
  return (
    <section className="page metallic-page reports-page">
      <BrandHeader>
        <Link to="/" className="round-action glass" aria-label="내 리포트 닫기">
          ×
        </Link>
      </BrandHeader>
      <h1>내 리포트</h1>
      <p>언니와 나눈 10분, 다시 꺼내봐.</p>
      <p className="hint">최근 상담순 · {reports.length}개의 리포트</p>
      {reports.length ? (
        <ul className="report-history">
          {reports.map((session) => (
            <li key={session.readingId}>
              <Link
                className="panel"
                to={`/sessions/${session.readingId}/report`}
              >
                <small>
                  {new Date(session.date).toLocaleDateString("ko-KR")}
                </small>
                <h2>{session.question || session.report?.question}</h2>
                <p>{session.report?.queen_line}</p>
                <small>리포트 보기 ›</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Panel title="내 리포트">
          <p>이 기기에 저장된 리포트가 아직 없어요.</p>
        </Panel>
      )}
    </section>
  );
}

export function ChristmasInvite() {
  return (
    <section className="page metallic-page invite-page">
      <BrandHeader />
      <p className="invite-kicker glass">친구가 보낸 크리스마스 타로</p>
      <h1>
        이번 크리스마스,
        <br />
        <em>나는 혼자일까?</em>
      </h1>
      <p>연말의 내 옆자리, 카드로 먼저 만나봐.</p>
      <div className="invite-illustration" aria-hidden="true">
        <div className="invite-calendar glass">
          <span>DECEMBER</span>
          <strong>12.25</strong>
          <span>그날, 내 옆에는?</span>
        </div>
        <img
          className="invite-heart-left"
          src="/assets/metallic/chrome-heart.png"
          alt=""
          width="86"
          height="86"
        />
        <img
          className="invite-heart-right"
          src="/assets/metallic/christmas-heart-right.png"
          alt=""
          width="45"
          height="45"
        />
        <img
          className="invite-star"
          src="/assets/metallic/christmas-star.png"
          alt=""
          width="64"
          height="64"
        />
      </div>
      <Panel title="MESSAGE">
        <h2>10분, 내 이야기로 보는 타로</h2>
        <p>
          카드를 한 장씩 뽑으며, 타로 언니에게 내 상황에 맞는 연애운을 들어봐.
        </p>
      </Panel>
      <Button size="wide" asChild>
        <Link to="/">내 카드 세 장 뽑아보기</Link>
      </Button>
      <p className="hint">로그인 후 내 이야기로 상담을 시작해요</p>
    </section>
  );
}
