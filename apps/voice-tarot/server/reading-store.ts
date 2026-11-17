import { personaId as parsePersonaId } from "../shared/personas.ts";
import type {
  DeckCard,
  Reading,
  ReadingState,
  ReadingResponse,
} from "../shared/types.ts";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { makePlan } from "../shared/spreads.ts";
import {
  createReading,
  applyReading,
  publicReading,
} from "../shared/reading.ts";
// Opaque IDs stay in the browser, never in model context. The unpicked deck stays on this server.
export class ReadingStore {
  directory: string;
  shuffle: () => DeckCard[];
  queues = new Map<string, Promise<ReadingResponse>>();
  constructor(directory: string, shuffle: () => DeckCard[]) {
    this.directory = directory;
    this.shuffle = shuffle;
  }
  async request({
    id,
    action,
    args = {},
    masterId,
    personaId,
    previous,
  }: {
    id?: string;
    action: string;
    args?: Record<string, unknown>;
    masterId?: string;
    personaId?: unknown;
    previous?: Reading;
  }) {
    if (action === "create") {
      const chosenPersona = parsePersonaId(personaId ?? previous?.personaId);
      const state = createReading(this.shuffle(), masterId);
      state.personaId = chosenPersona;
      if (previous) {
        const old = previous.cards;
        if (
          typeof previous.question !== "string" ||
          previous.question.length > 300 ||
          !Array.isArray(old) ||
          old.length !== 3 ||
          new Set(old.map((c) => c.id)).size !== 3 ||
          new Set(old.map((c) => c.number)).size !== 3 ||
          old.some(
            (c) =>
              !Number.isInteger(c.id) ||
              c.id < 0 ||
              c.id > 77 ||
              !Number.isInteger(c.number) ||
              c.number < 1 ||
              c.number > 78,
          ) ||
          !Array.isArray(previous.positions) ||
          previous.positions.length !== 3 ||
          previous.positions.some(
            (p) => typeof p !== "string" || p.length > 150,
          )
        )
          throw Error("이전 상담은 리포트에서 확인해 주세요.");
        state.plan = makePlan("relationship")!;
        state.plan.name = "이전 상담 배치";
        state.plan.positions = [...previous.positions];
        state.positions = [...previous.positions];
        state.question = previous.question;
        state.questionConfirmed = true;
        for (const c of old) {
          const index = state.deck.findIndex((x) => x.id === c.id);
          [state.deck[c.number - 1], state.deck[index]] = [
            state.deck[index],
            state.deck[c.number - 1],
          ];
          state.deck[c.number - 1].reversed = !!c.reversed;
        }
        state.picks = old.map((c) => c.number);
        applyReading(state, "confirm_cards");
        state.revealed = [];
        for (
          let slot = 1;
          slot <= 3 && previous.revealed?.includes(slot);
          slot++
        )
          state.revealed.push(slot);
      }
      id = randomBytes(24).toString("hex");
      await this.save(id, state);
      return { id, state: publicReading(state), result: { ok: true } };
    }
    if (typeof id !== "string" || !/^[a-f0-9]{48}$/.test(id))
      throw Error("상담 기록을 찾을 수 없어요.");
    const task = (this.queues.get(id) || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        let state: ReadingState;
        try {
          state = JSON.parse(
            await readFile(join(this.directory, id + ".json"), "utf8"),
          );
        } catch {
          throw Error(
            "상담 기록을 찾을 수 없어요. 기존 리포트는 이 브라우저에 남아 있어요.",
          );
        }
        const result =
          action === "get" ? { ok: true } : applyReading(state, action, args);
        if (!result.error && action !== "get") await this.save(id, state);
        return { id, state: publicReading(state), result };
      });
    this.queues.set(id, task);
    try {
      return await task;
    } finally {
      if (this.queues.get(id) === task) this.queues.delete(id);
    }
  }
  async save(id: string, state: ReadingState) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = join(this.directory, id + ".json");
    await writeFile(file + ".tmp", JSON.stringify(state), { mode: 0o600 });
    await rename(file + ".tmp", file);
  }
}
