from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import SessionLocal
from .deck import DECK, card_code, card_image_path, card_taxonomy
from .models import TarotCard


def seed_tarot_cards(db: Session) -> int:
    existing_ids = set(db.scalars(select(TarotCard.id)))
    cards = []
    for card_id, name, upright in DECK:
        if card_id in existing_ids:
            continue
        taxonomy = card_taxonomy(card_id)
        cards.append(
            TarotCard(
                id=card_id,
                code=card_code(card_id),
                name_ko=name,
                arcana=taxonomy.arcana,
                suit=taxonomy.suit,
                rank=taxonomy.rank,
                upright_keywords=list(upright),
                image_path=card_image_path(card_id),
            )
        )
    if cards:
        db.add_all(cards)
        db.commit()
    return len(cards)


def main() -> None:
    with SessionLocal() as db:
        created = seed_tarot_cards(db)
    print(f"Seeded {created} tarot cards.")


if __name__ == "__main__":
    main()
