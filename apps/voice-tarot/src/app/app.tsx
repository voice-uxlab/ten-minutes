import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/api/client";
import { Screens } from "@/pages/screens";
import { Home, Onboarding, Tickets } from "@/pages/home";
import { lazy, Suspense } from "react";
const SessionPage = lazy(() =>
  import("@/pages/session").then((m) => ({ default: m.SessionPage })),
);
import { PaymentResult } from "@/pages/payment-result";
const ReportPage = lazy(() =>
  import("@/pages/report").then((m) => ({ default: m.ReportPage })),
);
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <main id="phone" className="safe-bottom">
          <Suspense
            fallback={
              <section className="page" role="status">
                화면을 준비하고 있어요.
              </section>
            }
          >
            <Routes>
              <Route path="/" element={<Home key="realtime" />} />
              <Route
                path="/live-lab"
                element={<Home key="live-typecast" voiceEngine="live-typecast" />}
              />
              <Route path="/screens" element={<Screens />} />
              <Route path="/login" element={<Home key="realtime" />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/sessions/:id" element={<SessionPage />} />
              <Route path="/sessions/:id/report" element={<ReportPage />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/payments/result" element={<PaymentResult />} />
              <Route
                path="*"
                element={
                  <section className="page">
                    <h1>페이지를 찾을 수 없어요.</h1>
                    <Link to="/">홈으로</Link>
                  </section>
                }
              />
            </Routes>
          </Suspense>
          <div className="home-indicator" aria-hidden="true" />
        </main>
        <footer className="work-links">
          <Link to="/screens">화면 목록</Link>
          <Link to="/live-lab">Live 비교 통화</Link>
          <a href="/voice-lab">목소리 테스트</a>
        </footer>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
