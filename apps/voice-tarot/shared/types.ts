export interface Card {
  id: number;
  number: number;
  slot: number;
  position: string;
  name: string;
  clarifies?: number;
  reversed?: boolean;
  upright: string;
  reverse: string;
  knowledge?: {
    reflection: string;
    core: string;
    reversed: string;
    [key: string]: unknown;
  };
}
export interface Plan {
  id: string;
  name: string;
  count: number;
  positions: string[];
  groups: number[][];
  tradition?: string;
  version?: string;
  reversals?: string;
  choices?: string[];
  timeframe?: string;
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
  spread?: { positions: string[] } | null;
}
export interface Reading {
  personaId?: import("./personas.ts").PersonaId;
  version?: string;
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
  voiceEngine?: "realtime" | "live-typecast" | "live-noeul";
  readingId: string;
  demo: boolean;
  transcript: string[];
  notes: Note[];
  date: string;
  connected?: boolean;
  report?: Report;
  reportPending?: boolean;
  ended?: boolean;
}
export interface ReadingResult {
  error?: string;
  name?: string;
  context?: {
    focusSlots: number[];
    cards: {
      name: string;
      direction: string;
      keywords: string;
      slot: number;
      position: string;
      knowledge?: Card["knowledge"];
    }[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
export interface ReadingResponse {
  id: string;
  state: Reading;
  result: ReadingResult;
}
export interface Profile {
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

export interface DeckCard {
  id: number;
  name: string;
  upright: string;
  reverse: string;
  reversed: boolean;
}
export interface ReadingState extends Reading {
  deck: DeckCard[];
  version: string;
}
// Domain operations validate these fields before committing state.
export interface ActionArgs {
  question: string;
  spreadId: string;
  choices?: string[];
  timeframe?: string;
  slot: number;
  slots?: number[];
  picks: number[];
  replace?: boolean;
}
