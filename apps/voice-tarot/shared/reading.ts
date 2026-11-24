import type {
  ReadingState,
  DeckCard,
  ActionArgs,
  ReadingResult,
} from "./types.ts";
import {
  makePlan,
  masters,
  READING_VERSION,
  selectionCount,
} from "./spreads.ts";
import { selectNumbers, confirmSelection } from "./selection.ts";
import { reveal, cardInfo } from "./state.ts";
import { cardKnowledge } from "./card-knowledge.ts";
const error = (message: string) => ({ error: message });
export function createReading(
  deck: DeckCard[],
  masterId = "adaptive",
): ReadingState {
  if (!Object.hasOwn(masters, masterId))
    throw Error("알 수 없는 리딩 방식이에요.");
  return {
    deck,
    masterId,
    version: READING_VERSION,
    question: "",
    positions: [],
    plan: null,
    picks: [],
    cards: [],
    revealed: [],
    questionConfirmed: false,
    clarifier: null,
    summaryVisited: false,
    readingSlots: [],
  };
}
export function publicReading(s: ReadingState) {
  const { deck, ...state } = s;
  return structuredClone({
    ...state,
    requiredCount: selectionCount(s),
    usedNumbers: s.cards.map((c) => c.number),
  });
}
export function readingContext(s: ReadingState, focusSlots: number[] = []) {
  return {
    tradition: "RWS",
    version: s.version,
    question: s.question,
    plan: s.plan,
    master: masters[s.masterId],
    focusSlots,
    cards: s.cards.filter((c) => s.revealed.includes(c.slot) && (!focusSlots.length || focusSlots.includes(c.slot))).map(cardInfo),
    method:
      "reading-style.md의 공통 설명 방식을 따른다. 실제 카드 지식과 자리·정역을 해석에 활용하되, 카드와 사연을 연결하는 핵심 근거 및 원래 질문의 결론만 짧게 전달한다. 해석 가설과 사실을 구분하며 맞지 않는다는 피드백을 인정한다.",
    visualPolicy:
      "knowledge.symbol은 전통 RWS 참고 도상이다. 현재 화면을 보고 발견한 것처럼 말하지 않는다.",
  };
}
export function applyReading(
  s: ReadingState,
  action: string,
  args: Record<string, unknown> = {},
): ReadingResult {
  const a = args as unknown as ActionArgs;
  switch (action) {
    case "review_question": {
      const plan = makePlan(a.spreadId, {
        choices: a.choices,
        timeframe: a.timeframe,
      });
      if (
        !plan ||
        typeof a.question !== "string" ||
        !a.question.trim() ||
        a.question.length > 300
      )
        return error("질문과 유효한 배치가 필요해.");
      if (
        s.question === a.question.trim() &&
        JSON.stringify(s.plan) === JSON.stringify(plan)
      )
        return {
          ok: true,
          unchanged: true,
          plan: s.plan,
          questionConfirmed: s.questionConfirmed,
          picks: [...s.picks],
          revealed: [...s.revealed],
          note: "이미 정리한 같은 질문이야. 현재 선택과 공개 상태를 유지하고, 질문 확인을 반복하지 말고 이어서 진행해.",
        };
      if (s.cards.length) return error("확정한 카드와 질문은 바꿀 수 없어.");
      s.question = a.question.trim();
      s.plan = plan;
      s.positions = [...plan.positions];
      s.picks = [];
      s.questionConfirmed = false;
      return {
        ok: true,
        plan,
        master: masters[s.masterId],
        note: "고민을 자연스럽게 짚고 맞는지 확인해. 방식·설정·자리 목록을 설명하거나 고르게 하지 마.",
      };
    }
    case "confirm_question":
      if (!s.plan || s.cards.length) return error("질문과 배치를 먼저 확인해.");
      s.questionConfirmed = true;
      return { ok: true, count: s.plan.count, positions: s.positions };
    case "select_numbers":
      if (!s.questionConfirmed)
        return error("질문과 배치에 대한 사용자 확인이 먼저야.");
      return selectNumbers(s, a.picks, a.replace === true);
    case "confirm_cards": {
      if (!s.questionConfirmed) return error("질문과 배치 확인이 먼저야.");
      const result = confirmSelection(s);
      if (result.error) return result;
      for (const c of s.cards) {
        if (c.knowledge) continue;
        c.knowledge = cardKnowledge(c.id);
        if (c.knowledge) {
          c.upright = c.knowledge.core;
          c.reverse = c.knowledge.reversed;
        }
      }
      return {
        question: s.question,
        plan: s.plan,
        cards: s.cards.map(cardInfo),
        note: "1번 카드만 공개하고 show_reading(slot:1)로 해석을 받아 말해. 그 설명이 끝난 다음 2번, 3번을 같은 순서로 진행해.",
      };
    }
    case "reveal_card":
      return reveal(s, a.slot);
    case "show_reading": {
      if (!s.cards.length) return error("카드를 먼저 선택해.");
      const slots =
        a.slots !== undefined ? a.slots : a.slot === 0 ? [] : [a.slot];
      if (
        !Array.isArray(slots) ||
        slots.some(
          (n) => !Number.isInteger(n) || n < 1 || n > s.cards.length,
        ) ||
        new Set(slots).size !== slots.length
      )
        return error("유효한 카드 자리 번호가 필요해.");
      if (slots.length > 1) return error("한 번에 한 카드만 해석해.");
      if (slots.length && !s.revealed.includes(slots[0])) return error("해당 카드를 먼저 공개해.");
      if (!slots.length && (s.revealed.length !== 3 || s.readingSlots.length !== 3))
        return error("세 카드를 한 장씩 공개하고 각각 해석한 뒤 마무리해.");
      if (!slots.length) s.summaryVisited = true;
      else s.readingSlots = [...new Set([...(s.readingSlots || []), ...slots])];
      return { ok: true, context: readingContext(s, slots) };
    }
    case "request_clarifier":
    case "confirm_clarifier":
    case "cancel_clarifier":
      return error("이 상담은 78장 중 3장으로만 진행해. 추가 카드는 뽑지 않아.");
    default:
      return error("알 수 없는 리딩 작업이야.");
  }
}
