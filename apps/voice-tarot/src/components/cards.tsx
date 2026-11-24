import { memo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Card } from "@/api/types";
type DisplayCard = Pick<Card, "number" | "slot" | "position"> & Partial<Card>;
const art: Record<string, string> = {
  별: "star",
  태양: "sun",
  절제: "temperance",
};
const TarotCard = memo(function TarotCard({
  card,
  open,
  active,
}: {
  card: DisplayCard;
  open: boolean;
  active: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={"card-wrap" + (active ? " active" : "")}>
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
            <span className="arcana">TAROT</span>
            {art[card.name || ""] ? (
              <img
                className="symbol"
                src={`/assets/${art[card.name!]}.png`}
                alt={card.name}
              />
            ) : (
              <span className="symbol">✦</span>
            )}
            <span className="english">{card.position}</span>
            <b>{card.name}</b>
          </>
        ) : (
          <img
            style={{ transform: "rotateY(180deg)" }}
            src="/assets/card-back.png"
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
}: {
  cards: DisplayCard[];
  revealed: number[];
  active?: number[];
}) {
  if (!cards.length) return null;
  return (
    <div className="slots" data-count={cards.length}>
      {cards.map((card) => (
        <TarotCard
          key={card.number}
          card={card}
          open={revealed.includes(card.slot)}
          active={active.includes(card.slot)}
        />
      ))}
    </div>
  );
}
