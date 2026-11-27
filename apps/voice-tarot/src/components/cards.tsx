import { memo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Card } from "@/api/types";
import { cardImage } from "./card-image";
type DisplayCard = Pick<Card, "number" | "slot" | "position"> & Partial<Card>;
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
  const [initiallyOpen] = useState(open);
  const [artwork, setArtwork] = useState<{ src: string; failed: boolean }>();
  const frontImage = open ? cardImage(card.id) : undefined;
  const artworkReady = artwork && artwork.src === frontImage;
  const faceUp = open && (initiallyOpen || !frontImage || artworkReady);
  return (
    <div className={"card-wrap" + (active ? " active" : "")} hidden={hidden}>
      <div className="tarot-card-visual">
        <motion.div
          className="tarot-card-flip"
          initial={false}
          animate={{ rotateY: faceUp ? 0 : 180 }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 0.42, delay: 0.12, ease: "easeInOut" }
          }
        >
          <div className="tarot-card-face tarot-card-back">
            <img
              src={cardBack}
              alt={open ? "" : "아직 공개하지 않은 타로 카드"}
            />
          </div>
          {open && (
            <div className="tarot-card-face">
              {frontImage && !(artworkReady && artwork?.failed) ? (
                <img
                  className={card.reversed ? "tarot-card-reversed" : undefined}
                  src={frontImage}
                  alt={card.name}
                  onLoad={() => setArtwork({ src: frontImage, failed: false })}
                  onError={() => setArtwork({ src: frontImage, failed: true })}
                />
              ) : (
                <span>{card.name}</span>
              )}
            </div>
          )}
        </motion.div>
      </div>
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
