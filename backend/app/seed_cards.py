from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import SessionLocal
from .deck import DECK, dummy_image_path_for
from .models import TarotCard


def seed_tarot_cards(db: Session) -> int:
    existing_ids = set(db.scalars(select(TarotCard.id)))
    cards = [
        TarotCard(
            id=card_id,
            code=f"card-{card_id:02d}",
            name_ko=name,
            upright_keywords=list(upright),
            reversed_keywords=list(reversed_keywords),
            image_path=dummy_image_path_for(card_id),
        )
        for card_id, name, upright, reversed_keywords in DECK
        if card_id not in existing_ids
    ]
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
