import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/api/client";
import { Home, Onboarding } from "@/pages/home";
import { lazy, Suspense } from "react";
const SessionPage = lazy(() =>
  import("@/pages/session").then((m) => ({ default: m.SessionPage })),
);
const ReportPage = lazy(() =>
  import("@/pages/report").then((m) => ({ default: m.ReportPage })),
);
const ReportsPage = lazy(() =>
  import("@/pages/report").then((m) => ({ default: m.ReportsPage })),
);
const ChristmasInvite = lazy(() =>
  import("@/pages/report").then((m) => ({ default: m.ChristmasInvite })),
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
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Home />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/sessions/:id" element={<SessionPage />} />
              <Route path="/sessions/:id/report" element={<ReportPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/invite/christmas" element={<ChristmasInvite />} />
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
      </BrowserRouter>
    </QueryClientProvider>
  );
}
