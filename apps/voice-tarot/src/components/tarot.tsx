import { type ReactNode } from "react";
import type { Note } from "@/api/types";
export function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"panel " + className}>
      <div className="panel-title">♥ {title}</div>
      <div className="panel-body">{children}</div>
    </div>
  );
}
export function Reader({
  status = "너의 모든 마음을 편하게 들어주는 언니",
}: {
  status?: string;
}) {
  return (
    <div className="reader-row">
      <div className="portrait">
        <img src="/assets/reader.png" alt="타로 리더 레나" />
      </div>
      <div className="mention glass">
        <small>MENTION</small>
        <p role="status">{status}</p>
      </div>
    </div>
  );
}
const labels: Record<string, string> = {
  user: "공주",
  assistant: "레나",
  flow: "진행 기록",
  example: "시범 사연",
};
export function Notes({
  notes,
  open = false,
}: {
  notes: Note[];
  open?: boolean;
}) {
  return (
    <details className="conversation-notes" open={open || undefined}>
      <summary>상담 흐름 · 대화 노트</summary>
      {notes.length ? (
        notes.map((entry) => (
          <article key={entry.sequence}>
            <small>
              {entry.sequence}. {entry.stageLabel} ·{" "}
              {labels[entry.kind] || "기록"}
              {entry.source === "demo" ? " (시범)" : ""}
            </small>
            <p>{entry.text}</p>
            {entry.focusSlots?.length ? (
              <small>
                {entry.focusSlots
                  .map((slot) => entry.spread?.positions[slot - 1])
                  .filter(Boolean)
                  .join(" / ")}
              </small>
            ) : null}
          </article>
        ))
      ) : (
        <p>이 상담에는 흐름별 대화 노트가 없어요.</p>
      )}
    </details>
  );
}
