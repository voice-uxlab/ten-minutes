import { type ReactNode } from "react";

const metallicIconSizes = {
  "panel-mark": [18, 18],
  "notice-mark": [18, 18],
  headset: [20, 20],
  "audio-lines": [20, 20],
  menu: [22, 22],
  close: [24, 24],
  phone: [21, 22],
  "report-file": [24, 24],
  "chevron-right": [16, 16],
  refresh: [18, 18],
  flower: [18, 18],
  mic: [24, 24],
  "mic-off": [43, 43],
  "end-call": [29.33, 29.33],
  "wave-listening": [94, 30],
  "wave-connecting": [131, 42],
} as const;

export function MetallicIcon({
  name,
}: {
  name: keyof typeof metallicIconSizes;
}) {
  const [width, height] = metallicIconSizes[name];
  return (
    <img
      className="metallic-icon"
      src={`/assets/metallic/${name}.png`}
      width={width}
      height={height}
      alt=""
    />
  );
}

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
  icon = "panel-mark",
  endIcon,
  children,
  className = "",
}: {
  title: string;
  icon?: "panel-mark" | "notice-mark" | "flower" | null;
  endIcon?: "flower";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"panel " + className}>
      <div className="panel-title">
        {icon && <MetallicIcon name={icon} />}
        <span>{title}</span>
        {endIcon && <MetallicIcon name={endIcon} />}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}
export function LoadingWave() {
  return <span className="loading-wave" aria-hidden="true"><MetallicIcon name="wave-connecting" /></span>;
}

export function LoadingPage({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <section className="page metallic-page loading-page">
      <BrandHeader />
      <div className="loading-content">
        <Reader status={message} loading />
        {children}
      </div>
    </section>
  );
}

export function Reader({
  status = "나는 레나야. 편하게 얘기해봐.",
  profile = false,
  loading = false,
  active = false,
}: {
  status?: string;
  profile?: boolean;
  loading?: boolean;
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
        <p role="status">{loading && <LoadingWave />}{status}</p>
      </div>
    </div>
  );
}
