// IDs follow the deck order in shared/cards.ts.
const majorCards = [
  "fool",
  "magician",
  "high-priestess",
  "empress",
  "emperor",
  "hierophant",
  "lovers",
  "chariot",
  "strength",
  "hermit",
  "wheel-of-fortune",
  "justice",
  "hanged-man",
  "death",
  "temperance",
  "devil",
  "tower",
  "star",
  "moon",
  "sun",
  "judgement",
  "world",
];
const suits = ["wands", "cups", "swords", "pentacles"];
const ranks = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "page",
  "knight",
  "queen",
  "king",
];
const filenames = [
  ...majorCards.map(
    (name, id) => `major-${String(id).padStart(2, "0")}-${name}`,
  ),
  ...suits.flatMap((suit) => ranks.map((rank) => `minor-${suit}-${rank}`)),
];

export function cardImage(id?: number) {
  const filename = id === undefined ? undefined : filenames[id];
  return filename ? `/cards/tarot/${filename}.webp` : undefined;
}
