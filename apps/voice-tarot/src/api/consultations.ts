import { applyReading } from "../../shared/reading.ts";
import { cardInfo } from "../../shared/state.ts";
import { makePlan } from "../../shared/spreads.ts";
import {
  emptyReading,
  type Card,
  type ReadingResult,
  type Report,
  type Session,
} from "./types";
import { fastApi, fastApiJson } from "./client";
import { consentVersion } from "./auth";
import { isLegacyReading, loadSession } from "@/lib/storage";

interface ApiCard {
  slot: number;
  picked_number: number;
  position: string;
  revealed: boolean;
  card_id: number | null;
  card_code: string | null;
  name: string | null;
  direction: "UPRIGHT" | null;
  keywords: string[] | null;
}
interface ConsultationResponse {
  id: string;
  question: string | null;
  spread_type: string | null;
  status: string;
  created_at: string;
  call_ends_at: string;
  cards: ApiCard[];
  report_status: string | null;
}
interface ApiReport {
  consultation_id: string;
  consulted_at: string;
  question: string | null;
  cards: ApiCard[];
  situation_summary: string;
  queen_line: string;
  readings: Report["readings"];
}
interface ReportList {
  items: {
    id: string;
    question: string | null;
    report_status: string | null;
    situation_summary: string | null;
    created_at: string;
  }[];
  next_cursor: string | null;
}
const consultations = "/api/v1/consultations";
const path = (id: string) => `${consultations}/${encodeURIComponent(id)}`;

function mapCard(card: ApiCard): Card {
  return {
    id: card.card_id ?? -1,
    number: card.picked_number,
    slot: card.slot,
    position: card.position,
    name: card.name ?? "",
    upright: card.keywords?.join(" · ") ?? "",
    reverse: "",
    reversed: false,
  };
}

function sessionFromApi(data: ConsultationResponse, local?: Session): Session {
  const serverPlan = data.spread_type
    ? makePlan(data.spread_type.toLowerCase())
    : null;
  const cards = data.cards.map(mapCard);
  const revealed = data.cards
    .filter((card) => card.revealed)
    .map((card) => card.slot);
  const locked = cards.length > 0;
  const plan = locked
    ? local?.plan?.id === serverPlan?.id
      ? (local?.plan ?? serverPlan)
      : serverPlan
    : (local?.plan ?? null);
  return {
    ...emptyReading,
    ...local,
    plan,
    question: data.question ?? local?.question ?? "",
    questionConfirmed: locked || !!local?.questionConfirmed,
    positions: plan?.positions ?? cards.map((card) => card.position),
    cards,
    picks: locked ? cards.map((card) => card.number) : (local?.picks ?? []),
    revealed,
    readingSlots:
      local?.readingSlots.filter((slot) => revealed.includes(slot)) ?? [],
    readingId: data.id,
    date: data.created_at,
    connected: data.status !== "CREATED",
    endAt: Date.parse(data.call_ends_at),
    ended: data.status === "ENDED" || data.status === "FAILED",
    reportPending: !!local?.reportPending && !data.report_status,
    demo: false,
    transcript: local?.transcript ?? [],
    notes: local?.notes ?? [],
  };
}

export async function createConsultation() {
  if (!consentVersion) throw new Error("상담 동의 버전을 확인해 주세요.");
  return sessionFromApi(
    await fastApiJson<ConsultationResponse>(consultations, "POST", {
      consent_version: consentVersion,
    }),
  );
}

export const consultationOptions = (id: string) => ({
  queryKey: ["consultation", id],
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    const local = loadSession(id);
    if (isLegacyReading(id)) {
      if (local?.ended && local.report && !local.demo) return local;
      throw new Error(
        "이전 상담은 다시 연결할 수 없어요. 홈에서 새 상담을 시작해 주세요.",
      );
    }
    const data = await fastApi<ConsultationResponse>(path(id), { signal });
    return sessionFromApi(data, local);
  },
  staleTime: 0,
});

export async function consultationCommand(
  s: Session,
  action: string,
  args: Record<string, unknown>,
): Promise<ReadingResult> {
  if (action === "confirm_cards") {
    if (s.cards.length) return { ok: true, unchanged: true };
    if (!s.questionConfirmed || !s.plan || s.picks.length !== 3)
      return { error: "질문과 서로 다른 카드 번호 세 개를 먼저 확인해." };
    const result = await fastApiJson<{ cards: ApiCard[] }>(
      `${path(s.readingId)}/card-selection`,
      "POST",
      {
        question: s.question,
        spread_type: s.plan.id.toUpperCase(),
        picks: s.picks,
      },
      { "Idempotency-Key": s.readingId },
    );
    s.cards = result.cards.map(mapCard);
    s.revealed = result.cards
      .filter((card) => card.revealed)
      .map((card) => card.slot);
    return {
      ok: true,
      note: "카드 세 장을 확정했어. 1번 카드를 공개한 뒤 그 카드만 해석해.",
    };
  }
  if (action === "reveal_card") {
    const slot = Number(args.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > s.cards.length)
      return { error: "먼저 카드를 선택해 주세요." };
    if (slot > 1 && !s.revealed.includes(slot - 1))
      return { error: "앞 카드부터 공개해 주세요." };
    const { card } = await fastApiJson<{ card: ApiCard }>(
      `${path(s.readingId)}/cards/${slot}/reveal`,
      "POST",
    );
    const revealedCard = mapCard(card);
    s.cards = s.cards.map((item) => (item.slot === slot ? revealedCard : item));
    if (!s.revealed.includes(slot)) s.revealed = [...s.revealed, slot];
    return cardInfo(revealedCard);
  }
  const state = { ...s, deck: [], version: s.plan?.version ?? "" };
  const result = applyReading(state, action, args);
  if (!result.error) {
    const { deck, ...reading } = state;
    void deck;
    Object.assign(s, reading);
  }
  return result;
}

export async function connectRealtime(id: string, sdp: string) {
  const response = await fastApiJson<Response>(
    `${path(id)}/realtime-connection`,
    "POST",
    { sdp },
    undefined,
    AbortSignal.timeout(25000),
    "response",
  );
  return {
    answer: await response.text(),
    connectionToken: response.headers.get("X-Voice-Connection"),
  };
}

export function sendVoiceHeartbeat(
  id: string,
  token: string,
  signal: AbortSignal,
) {
  return fastApiJson<Response>(
    `${path(id)}/voice-heartbeat`,
    "POST",
    { connection_token: token },
    undefined,
    signal,
    "response",
  );
}

export function streamSpeech(
  id: string,
  text: string,
  responseId: string,
  index: number,
  signal: AbortSignal,
) {
  return fastApiJson<Response>(
    `${path(id)}/tts/stream`,
    "POST",
    {
      text,
      response_id: responseId,
      segment_index: index,
    },
    undefined,
    signal,
    "response",
  );
}

export async function finishConsultation(
  id: string,
  reason: "USER" | "TIMEOUT",
  report: Report,
) {
  await fastApiJson(`${path(id)}/end`, "POST", { reason });
  await fastApiJson(`${path(id)}/report`, "PUT", {
    situation_summary: report.summary.trim().slice(0, 500),
    queen_line: report.queen_line.trim().slice(0, 300),
    readings: report.readings.map(({ slot, text }) => ({
      slot,
      text: text.trim().slice(0, 1000),
    })),
  });
}

export const reportOptions = (id: string) => ({
  queryKey: ["report", id],
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    if (isLegacyReading(id)) return loadSession(id) ?? null;
    const data = await fastApi<ApiReport>(`${path(id)}/report`, { signal });
    return {
      ...emptyReading,
      readingId: id,
      cards: data.cards.map(mapCard),
      revealed: data.cards.map((card) => card.slot),
      date: data.consulted_at,
      transcript: [],
      notes: [],
      demo: false,
      report: {
        question: data.question ?? "오늘의 마음 이야기",
        summary: data.situation_summary,
        readings: data.readings,
        queen_line: data.queen_line,
      },
    } satisfies Session;
  },
});

export const reportsKey = ["consultations", "reports"] as const;
export function listReports(cursor: string | null, signal: AbortSignal) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fastApi<ReportList>(`${consultations}${query}`, { signal });
}
