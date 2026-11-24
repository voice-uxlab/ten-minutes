import { Cards } from "@/components/cards";
import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { loadSession, saveSession } from "@/lib/storage";
import { Notes, Panel } from "@/components/tarot";
import { Button } from "@/components/ui/button";
import type { Session } from "@/api/types";
async function share(s: Session) {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const x = c.getContext("2d");
  if (!x) throw Error("이미지를 만들 수 없어요.");
  x.fillStyle = "#171619";
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#ffb2ce";
  x.textAlign = "center";
  x.font = "36px serif";
  x.fillText("VOICE TAROT", 540, 200);
  x.font = "55px serif";
  x.fillText("오늘, 나에게 온 카드", 540, 360);
  const cols = Math.min(3, Math.max(1, s.cards.length));
  s.cards.forEach((card, i) => {
    const left = (1080 - cols * 310) / 2 + (i % cols) * 310,
      top = 480 + Math.floor(i / cols) * 400;
    x.strokeStyle = "#ffb2ce";
    x.strokeRect(left, top, 280, 300);
    x.font = "30px serif";
    x.fillText(
      s.revealed.includes(card.slot) ? card.name : "✦",
      left + 140,
      top + 140,
      250,
    );
    x.font = "24px serif";
    x.fillText(card.position, left + 140, top + 250, 250);
  });
  let line = "",
    y = 1400;
  x.font = "40px serif";
  for (const ch of s.report!.queen_line) {
    if (x.measureText(line + ch).width > 880) {
      x.fillText(line, 540, y);
      y += 65;
      line = "";
    }
    line += ch;
  }
  x.fillText(line, 540, y);
  const blob = await new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(Error("이미지 저장 실패"))),
      "image/png",
    ),
  );
  const file = new File([blob], "queen-tarot.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] }))
    await navigator.share({ files: [file] });
  else {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
export function ReportPage() {
  const navigate = useNavigate(),
    { id = "" } = useParams(),
    s = loadSession(id),
    [error, setError] = useState("");
  if (!s?.report)
    return (
      <section className="page">
        <h1>이 기기에 저장된 리포트가 없어요.</h1>
        <Link to={`/sessions/${id}`}>상담 확인하기</Link>
        <Link to="/">홈으로</Link>
      </section>
    );
  return (
    <section className="page">
      <header>VOICE TAROT · YOUR READING</header>
      <h1>
        공주가 기억할
        <br />
        오늘의 이야기.
      </h1>
      <p className="hint">
        {new Date(s.date).toLocaleDateString("ko-KR")}
        {s.demo ? " · 시범 통화" : ""}
      </p>
      <h3>{s.question}</h3>
      <Cards cards={s.cards} revealed={s.revealed} />
      <Panel title="TODAY’S MESSAGE">
        <p>{s.report.summary}</p>
        {s.report.readings.map((r) => (
          <p key={r.slot}>
            {s.positions[r.slot - 1]} — {r.text}
          </p>
        ))}
        <blockquote>“{s.report.queen_line}”</blockquote>
      </Panel>
      <Notes notes={s.notes} />
      <Button
        size="wide"
        onClick={() =>
          void share(s).catch((e: Error) => {
            if (e.name !== "AbortError") setError(e.message);
          })
        }
      >
        나의 퀸 카드 저장 ↗
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      {!s.summaryVisited ||
      s.revealed.length < s.cards.length ||
      (s.clarifier?.confirmed && !s.clarifier.drawn) ? (
        <Button
          size="wide"
          onClick={() => {
            saveSession(
              {
                ...s,
                ended: false,
                connected: false,
                endAt: undefined,
                report: undefined,
              },
              true,
            );
            navigate(`/sessions/${id}`);
          }}
        >
          남은 카드 이어보기
        </Button>
      ) : null}
      <Link to="/">처음으로</Link>
    </section>
  );
}
