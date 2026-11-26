import { useLayoutEffect, useRef, useState } from "react";

function scrollToLatest(viewport: HTMLDivElement | null) {
  if (viewport) viewport.scrollTop = viewport.scrollHeight;
}

export function CallCaptions({
  caption,
  history,
  fallback,
}: {
  caption: string;
  history: readonly string[];
  fallback: string;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const liveViewport = useRef<HTMLDivElement>(null);
  const previousCount = history.length - (caption ? 1 : 0);

  useLayoutEffect(() => {
    if (!showHistory && liveViewport.current) liveViewport.current.scrollTop = 0;
  }, [caption, history.length, showHistory]);

  return (
    <div className="call-captions">
      {showHistory ? (
        <div
          className="caption-scroll"
          role="region"
          aria-label="이전 대사"
          tabIndex={0}
          ref={scrollToLatest}
        >
          {history.slice(0, previousCount).map((text, index) => (
            <p key={index}>{text}</p>
          ))}
        </div>
      ) : (
        <div
          className="caption-scroll"
          role="region"
          aria-label="최신 대사"
          aria-live="polite"
          tabIndex={0}
          ref={liveViewport}
        >
          <p>{caption || fallback}</p>
        </div>
      )}
      {previousCount > 0 && (
        <button
          className="text-button caption-toggle"
          type="button"
          onClick={() => setShowHistory((showing) => !showing)}
        >
          {showHistory ? "최신 대사 보기" : "이전 대사 보기"}
        </button>
      )}
    </div>
  );
}
