"""Add arcana, suit, and rank to tarot cards.

Revision ID: 20261121_0002
Revises: 20261118_0001
Create Date: 2026-11-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.deck import DECK, card_taxonomy


revision: str = "20261121_0002"
down_revision: Union[str, None] = "20261118_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_context().dialect.name != "postgresql":
        raise RuntimeError("This migration supports PostgreSQL only.")

    op.add_column("tarot_cards", sa.Column("arcana", sa.String(length=8), nullable=True))
    op.add_column("tarot_cards", sa.Column("suit", sa.String(length=16), nullable=True))
    op.add_column("tarot_cards", sa.Column("rank", sa.String(length=16), nullable=True))

    tarot_cards = sa.table(
        "tarot_cards",
        sa.column("id", sa.SmallInteger()),
        sa.column("arcana", sa.String()),
        sa.column("suit", sa.String()),
        sa.column("rank", sa.String()),
    )
    for card_id, *_ in DECK:
        taxonomy = card_taxonomy(card_id)
        op.execute(
            tarot_cards.update()
            .where(tarot_cards.c.id == card_id)
            .values(arcana=taxonomy.arcana, suit=taxonomy.suit, rank=taxonomy.rank)
        )

    op.alter_column("tarot_cards", "arcana", existing_type=sa.String(length=8), nullable=False)
    op.alter_column("tarot_cards", "rank", existing_type=sa.String(length=16), nullable=False)
    op.create_check_constraint(
        "ck_tarot_cards_arcana",
        "tarot_cards",
        "arcana IN ('MAJOR', 'MINOR')",
    )
    op.create_check_constraint(
        "ck_tarot_cards_suit",
        "tarot_cards",
        "(arcana = 'MAJOR' AND suit IS NULL) OR "
        "(arcana = 'MINOR' AND suit IN ('WANDS', 'CUPS', 'SWORDS', 'PENTACLES'))",
    )


def downgrade() -> None:
    op.drop_constraint("ck_tarot_cards_suit", "tarot_cards", type_="check")
    op.drop_constraint("ck_tarot_cards_arcana", "tarot_cards", type_="check")
    op.drop_column("tarot_cards", "rank")
    op.drop_column("tarot_cards", "suit")
    op.drop_column("tarot_cards", "arcana")
