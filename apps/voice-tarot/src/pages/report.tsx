import { Cards } from "@/components/cards";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AuthSessionError, authOptions } from "@/api/auth";
import { Link, Navigate, useParams } from "react-router-dom";
import { listReports, reportOptions, reportsKey } from "@/api/consultations";
import { FastApiError } from "@/api/client";
import { BrandHeader, LoadingPage, LoadingWave, MetallicIcon, Panel } from "@/components/tarot";
import { Button } from "@/components/ui/button";
export function ReportPage() {
  const { id = "" } = useParams(),
    report = useQuery({
      ...reportOptions(id),
      refetchInterval: ({ state }) =>
        state.data && "pending" in state.data ? 3000 : false,
    }),
    pending = report.data && "pending" in report.data,
    s = report.data && !("pending" in report.data) ? report.data : null,
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
  if (report.isPending) return <LoadingPage message="리포트를 불러오고 있어요." />;
  if (pending && !report.error)
    return <LoadingPage message="저장된 상담 메모로 리포트를 만들고 있어요." />;
  if (report.error instanceof FastApiError && report.error.status === 401)
    return <Navigate to="/login" replace />;
  if (
    report.error &&
    !(report.error instanceof FastApiError && report.error.status === 404)
  )
    return (
      <section className="page">
        <p role="alert">리포트를 불러오지 못했어요.</p>
        <Button onClick={() => void report.refetch()}>다시 시도</Button>
      </section>
    );
  if (!s?.report || s.demo)
    return (
      <section className="page">
        <h1>확인할 수 있는 리포트가 없어요.</h1>
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
      {s.cards.length > 0 && (
        <div className="report-spread">
          <Cards cards={s.cards} revealed={s.revealed} />
        </div>
      )}
      <p className="report-date">
        {new Date(s.date).toLocaleDateString("ko-KR")}
      </p>
      <Panel title="상황 한 줄 요약">
        <h2>{s.question || s.report.question}</h2>
        <p>{s.report.summary}</p>
      </Panel>
      {s.report.readings?.map(({ slot, text }) => (
        <Panel
          key={slot}
          title={s.cards.find((card) => card.slot === slot)?.name || `${slot}번 카드`}
        >
          <p>{text}</p>
        </Panel>
      ))}
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
      <nav className="report-nav" aria-label="리포트 화면 이동">
        <Link to="/reports">내 리포트 목록</Link>
        <Link to="/">처음으로</Link>
      </nav>
    </section>
  );
}

export function ReportsPage() {
  const auth = useQuery(authOptions);
  const user = auth.error instanceof AuthSessionError ? null : auth.data;
  const history = useInfiniteQuery({
    queryKey: reportsKey,
    enabled: !!user,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listReports(pageParam, signal),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  if (auth.isPending) {
    return (
      <LoadingPage message="로그인 상태를 확인하고 있어요." />
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  const reports =
    history.data?.pages.flatMap((page) =>
      page.items.filter((item) => item.report_status === "COMPLETED"),
    ) ?? [];
  return (
    <section className="page metallic-page reports-page">
      <BrandHeader>
        <Link to="/" className="round-action glass" aria-label="내 리포트 닫기">
          <MetallicIcon name="close" />
        </Link>
      </BrandHeader>
      <h1>내 리포트</h1>
      <p>언니와 나눈 10분, 다시 꺼내봐.</p>
      <p className="hint">최근 상담순</p>
      {history.isPending && <p role="status"><LoadingWave />리포트를 불러오고 있어요.</p>}
      {history.isError && (
        <>
          <p role="alert">리포트 목록을 불러오지 못했어요.</p>
          <Button onClick={() => void history.refetch()}>다시 시도</Button>
        </>
      )}
      {reports.length ? (
        <ul className="report-history">
          {reports.map((session) => (
            <li key={session.id}>
              <Link className="panel" to={`/sessions/${session.id}/report`}>
                <small>
                  {new Date(session.created_at).toLocaleDateString("ko-KR")}
                </small>
                <h2>{session.question || "오늘의 마음 이야기"}</h2>
                <p>{session.situation_summary}</p>
                <small>리포트 보기 ›</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : !history.isPending && !history.isError && !history.hasNextPage ? (
        <Panel title="내 리포트">
          <p>저장된 리포트가 아직 없어요.</p>
        </Panel>
      ) : null}
      {history.hasNextPage && (
        <Button
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          리포트 더 보기
        </Button>
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
          src="/assets/metallic/chrome-heart.png"
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
      <Panel title="MESSAGE" icon="flower" endIcon="flower">
        <h2>10분, 내 이야기로 보는 타로</h2>
        <p>
          카드를 한 장씩 뽑으며, 타로 언니에게
          <br />내 상황에 맞는 연애운을 들어봐.
        </p>
      </Panel>
      <Button size="wide" asChild>
        <Link to="/">내 카드 세 장 뽑아보기</Link>
      </Button>
      <p className="hint">로그인 후 내 이야기로 상담을 시작해요</p>
    </section>
  );
}
