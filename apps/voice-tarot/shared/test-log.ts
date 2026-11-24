export interface TestLogEvent {
  seq: number;
  at: string;
  type: string;
  data: unknown;
}
export interface TestLogBatch {
  id: string;
  runId: string;
  engine: string;
  persona: string;
  events: TestLogEvent[];
}
export function redactLog(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(/\b(?:sk-|ek_)[A-Za-z0-9_-]{12,}/g, "[REDACTED]")
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
  if (Array.isArray(value)) return value.map(redactLog);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /secret|token|api.?key|authorization|cookie|sdp|^audio$|^deck$/i.test(
          key,
        )
          ? "[REDACTED]"
          : redactLog(item),
      ]),
    );
  return value;
}
export function renderTestLog(batch: TestLogBatch, recording = false) {
  const events = [...batch.events].sort((a, b) => a.seq - b.seq);
  const flags: string[] = [];
  const calls = new Map<string, TestLogEvent>();
  for (const event of events) {
    const data = event.data as Record<string, unknown> | null;
    if (event.type === "error")
      flags.push(`${event.at}: 오류 (이벤트 ${event.seq})`);
    if (event.type === "tool.request") {
      const key = JSON.stringify(data),
        previous = calls.get(key);
      if (previous && Date.parse(event.at) - Date.parse(previous.at) < 10000)
        flags.push(
          `${event.at}: 10초 내 동일 도구·인자 재요청 (이벤트 ${previous.seq}, ${event.seq}). 정상 재조회일 수도 있음.`,
        );
      calls.set(key, event);
    }
    if (event.type === "speech.latency" && Number(data?.ms) > 1500)
      flags.push(
        `${event.at}: 자막→오디오 수신 ${data?.ms}ms (이벤트 ${event.seq})`,
      );
  }
  const lines = [
    `# 테스트 통화 로그`,
    "",
    `- 상담: ${batch.id}`,
    `- 연결: ${batch.runId}`,
    `- 엔진: ${batch.engine}`,
    `- 페르소나: ${batch.persona}`,
    `- 이벤트: ${events.length}개`,
    "",
    "> 전사문은 음성 인식 결과입니다. assistant는 생성된 답변이며 speech.playback은 재생 시작한 문장입니다. 끝까지 들었다는 뜻은 아닙니다. 자동 표시 항목은 검토 후보이며 오류 확정이 아닙니다.",
    "",
    "## 확인할 지점",
    "",
    ...(flags.length
      ? flags.map((x) => `- ${x}`)
      : [
          "- 규칙으로 감지한 후보 없음. 의미·말투의 자연스러움은 별도 검토가 필요합니다.",
        ]),
    "",
    "## 대화",
    "",
  ];
  for (const event of events)
    if (event.type === "transcript") {
      const data = event.data as { speaker?: string; text?: string };
      lines.push(
        `### ${event.at} · ${data.speaker === "user" ? "사용자" : "상담자 (생성된 답변)"}`,
        "",
        ...String(data.text || "")
          .split("\n")
          .map((x) => `> ${x}`),
        "",
      );
    }
  lines.push(
    "## 녹음",
    "",
    recording
      ? `[사용자 마이크 녹음](./${batch.id}-${batch.runId}.webm)`
      : "녹음 파일 없음. 녹음 선택을 켠 통화에서만 사용자 마이크를 별도로 저장합니다. 상담자 음성은 이 파일에 포함되지 않습니다.",
    "",
    "## 전체 이벤트",
    "",
  );
  for (const event of events)
    lines.push(
      `### ${event.seq} · ${event.at} · ${event.type}`,
      "",
      "````json",
      JSON.stringify(event.data, null, 2).replace(/`/g, "\\u0060"),
      "````",
      "",
    );
  return lines.join("\n");
}
