import { type ReactNode } from "react";
import type { Note } from "@/api/types";

export function BrandHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="metallic-header">
      <span className="metallic-brand">
        <img
          src="/assets/metallic/brand-mark.png"
          width="43"
          height="43"
          alt=""
        />
        TEN MINUTES
      </span>
      {children}
    </header>
  );
}

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
      <div className="panel-title">
        <img
          src="/assets/metallic/panel-mark.png"
          width="20"
          height="20"
          alt=""
        />
        {title}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}
export function Reader({
  status = "나는 레나야. 편하게 얘기해봐.",
  profile = false,
  active = false,
}: {
  status?: string;
  profile?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={
        profile ? "reader-row reader-profile" : "reader-row reader-call"
      }
    >
      <div className={active ? "portrait rings" : "portrait"}>
        <img
          src={
            profile
              ? "/assets/metallic/metallic-reader.png"
              : "/assets/metallic/call-reader.png"
          }
          alt="타로 리더 레나"
        />
      </div>
      <div className="mention glass">
        <small>{profile ? "PROFILE" : "MENTION"}</small>
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
