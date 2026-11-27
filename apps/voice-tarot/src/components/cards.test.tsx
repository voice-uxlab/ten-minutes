import { existsSync } from "node:fs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  expect(image.classList.contains("tarot-card-reversed")).toBe(true);
  expect(image.parentElement?.className).toBe("tarot-card-face");
  expect(screen.queryByText("TAROT")).toBeNull();
});

test("each newly focused card turns from its back to the loaded artwork", async () => {
  const spread = [3, 36, 50].map((id, index) => ({
    ...cards[id],
    slot: index + 1,
    number: index + 1,
    position: "나",
  }));
  const { container, rerender } = render(<Cards cards={spread} revealed={[]} />);
  const wrappers = Array.from(
    container.querySelectorAll<HTMLDivElement>(".card-wrap"),
  );
  for (const [index, card] of spread.entries()) {
    const flip = wrappers[index].querySelector<HTMLElement>(".tarot-card-flip")!;
    const back = flip.querySelector(".tarot-card-back img");
    const revealed = spread.slice(0, index + 1).map(({ slot }) => slot);
    rerender(<Cards cards={spread} revealed={revealed} focus={card.slot} />);

    const front = within(wrappers[index]).getByRole("img", { name: card.name });
    expect(flip.querySelector(".tarot-card-back img")).toBe(back);
    expect(flip.style.transform).toContain("rotateY(180deg)");
    expect(wrappers.filter((wrapper) => !wrapper.hidden)).toEqual([
      wrappers[index],
    ]);
    fireEvent.load(front);
    await waitFor(() => expect(flip.style.transform).toBe("none"), {
      timeout: 1500,
    });
  }
});
