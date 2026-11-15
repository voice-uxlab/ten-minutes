import {
  appendNote as append,
  recordFlow as flow,
  finishNotes as finish,
  noteContext as context,
  openingCue,
} from "../../../poc/conversation-notes.mjs";
import { cardInfo as info } from "../../../poc/state.mjs";
import {
  recommendSpread as recommend,
  selectionCount as count,
  masters,
} from "../../../poc/spreads.mjs";
import type { Card, Session } from "@/api/types";
export { openingCue, masters };
export const appendNote = append as unknown as (
  s: Session,
  kind: string,
  text: string,
  context?: unknown,
  source?: string,
) => void;
export const recordFlow = flow as unknown as (
  s: Session,
  action: string,
  args: Record<string, unknown>,
) => void;
export const finishNotes = finish as unknown as (s: Session) => void;
export const noteContext = context as unknown as (s: Session) => unknown;
export const cardInfo = info as unknown as (
  c: Card,
) => Card & { direction: string; keywords: string };
export const recommendSpread = recommend as (
  q: string,
  master?: string,
) => string;
export const selectionCount = count as unknown as (s: Session) => number;
