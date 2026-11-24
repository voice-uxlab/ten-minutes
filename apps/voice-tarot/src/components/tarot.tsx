import { type ReactNode } from "react";

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
