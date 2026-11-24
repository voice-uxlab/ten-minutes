import { existsSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { cards } from "../../shared/cards.ts";
import { Cards } from "./cards";
import { cardImage } from "./card-image";

afterEach(cleanup);

test("each deck card ID has its own bundled artwork", () => {
  const images = cards.map(({ id }) => cardImage(id));
  expect(new Set(images).size).toBe(78);
  for (const image of images) {
    expect(image).toBeDefined();
    expect(existsSync(`public${image}`)).toBe(true);
  }
  expect(cardImage(17)).toBe("/cards/tarot/major-17-star.webp");
  expect(cardImage(22)).toBe("/cards/tarot/minor-wands-1.webp");
  expect(cardImage(36)).toBe("/cards/tarot/minor-cups-1.webp");
  expect(cardImage(50)).toBe("/cards/tarot/minor-swords-1.webp");
  expect(cardImage(77)).toBe("/cards/tarot/minor-pentacles-king.webp");
});

test("a shuffled card shows its own image only after reveal", () => {
  const cupAce = {
    ...cards[36],
    number: 7,
    slot: 1,
    position: "나",
    reversed: true,
  };
  const { rerender } = render(<Cards cards={[cupAce]} revealed={[]} />);
  expect(screen.queryByRole("img", { name: cupAce.name })).toBeNull();
  expect(
    screen.getByRole("img", { name: "아직 공개하지 않은 타로 카드" }),
  ).toBeTruthy();

  rerender(<Cards cards={[cupAce]} revealed={[1]} />);
  const image = screen.getByRole("img", { name: cupAce.name });
  expect(image.getAttribute("src")).toBe("/cards/tarot/minor-cups-1.webp");
  expect(image.closest(".card")?.classList.contains("reversed")).toBe(true);
});
