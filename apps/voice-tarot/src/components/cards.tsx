import { memo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Card } from "@/api/types";
import { cardImage } from "./card-image";
type DisplayCard = Pick<Card, "number" | "slot" | "position"> & Partial<Card>;
const titles: Record<number, { roman: string; english: string }> = {
  14: { roman: "XIV", english: "TEMPERANCE" },
  17: { roman: "XVII", english: "THE STAR" },
  19: { roman: "XIX", english: "THE SUN" },
};
const cardBack = "/assets/metallic/metallic-card-back.png";
const TarotCard = memo(function TarotCard({
  card,
  open,
  active,
  hidden,
}: {
  card: DisplayCard;
  open: boolean;
  active: boolean;
  hidden: boolean;
}) {
  const reduced = useReducedMotion();
  const image = cardImage(card.id);
  const title = card.id === undefined ? undefined : titles[card.id];
  return (
    <div className={"card-wrap" + (active ? " active" : "")} hidden={hidden}>
      <motion.div
        className={
          "card" + (open ? (card.reversed ? " reversed" : "") : " back")
        }
        initial={false}
        animate={{ rotateY: open ? 0 : 180 }}
        transition={{ duration: reduced ? 0 : 0.35 }}
      >
        {open ? (
          <>
            <span className="arcana">{title?.roman ?? "TAROT"}</span>
            {image ? (
              <img className="symbol" src={image} alt={card.name} />
            ) : (
              <span className="symbol">✦</span>
            )}
            <span className="english">{title?.english ?? card.position}</span>
            <b>{card.name}</b>
          </>
        ) : (
          <img
            style={{ transform: "rotateY(180deg)" }}
            src={cardBack}
            alt="아직 공개하지 않은 타로 카드"
          />
        )}
      </motion.div>
      <span>
        선택 {String(card.number).padStart(2, "0")}
        {open && card.reversed ? " · 역방향" : ""}
      </span>
      <small className="position-label">{card.position}</small>
    </div>
  );
});
export function Cards({
  cards,
  revealed,
  active = [],
  pending = 0,
  focus,
}: {
  cards: DisplayCard[];
  revealed: number[];
  active?: number[];
  pending?: number;
  focus?: number;
}) {
  if (!cards.length && !pending) return null;
  return (
    <div
      className="slots"
      data-count={focus ? 1 : cards.length + pending}
      data-focused={focus ? true : undefined}
    >
      {cards.map((card) => (
        <TarotCard
          key={card.number}
          card={card}
          open={revealed.includes(card.slot)}
          active={active.includes(card.slot)}
          hidden={focus !== undefined && focus !== card.slot}
        />
      ))}
      {Array.from({ length: pending }, (_, index) => (
        <div className="card-placeholder" key={index}>
          <img src={cardBack} alt="" />
          <small>PICK {cards.length + index + 1}</small>
        </div>
      ))}
    </div>
  );
}
