export interface Card {
  id: number;
  number: number;
  slot: number;
  position: string;
  name: string;
  reversed?: boolean;
  upright: string;
  reverse: string;
  knowledge?: { reflection: string; [key: string]: unknown };
}
export interface Plan {
  id: string;
  name: string;
  count: number;
  positions: string[];
  groups: number[][];
}
export interface Clarifier {
  confirmed: boolean;
  drawn: boolean;
  slot: number;
  question: string;
}
export interface Note {
  sequence: number;
  at: string;
  kind: string;
  text: string;
  source: string;
  stageLabel: string;
  focusSlots?: number[];
  spread?: { positions: string[] };
}
export interface Reading {
  masterId: string;
  question: string;
  plan: Plan | null;
  positions: string[];
  cards: Card[];
  revealed: number[];
  picks: number[];
  questionConfirmed: boolean;
  clarifier: Clarifier | null;
  summaryVisited: boolean;
  readingSlots: number[];
}
export interface Report {
  question: string;
  summary: string;
  readings: { slot: number; text: string }[];
  queen_line: string;
}
export interface Session extends Reading {
  voiceEngine?: "realtime" | "live-typecast";
  readingId: string;
  demo: boolean;
  transcript: string[];
  notes: Note[];
  date: string;
  endAt?: number;
  connected?: boolean;
  report?: Report;
  ended?: boolean;
}
export interface ReadingResult {
  error?: string;
  name?: string;
  context?: { focusSlots: number[]; cards: (Card & { keywords: string })[] };
  [key: string]: unknown;
}
export interface ReadingResponse {
  id: string;
  state: Reading;
  result: ReadingResult;
}
export interface Profile {
  nick: string;
  tickets: number;
  freeUsed: boolean;
  bgm: boolean;
  last?: Session;
}
export const emptyReading: Reading = {
  masterId: "adaptive",
  question: "",
  plan: null,
  positions: [],
  cards: [],
  revealed: [],
  picks: [],
  questionConfirmed: false,
  clarifier: null,
  summaryVisited: false,
  readingSlots: [],
};
