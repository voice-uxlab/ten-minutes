"""Map the complete tarot deck to stable codes and image paths.

Revision ID: 20261121_0003
Revises: 20261121_0002
Create Date: 2026-11-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.deck import DECK, card_code, card_image_path, dummy_image_path_for


revision: str = "20261121_0003"
down_revision: Union[str, None] = "20261121_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_context().dialect.name != "postgresql":
        raise RuntimeError("This migration supports PostgreSQL only.")

    tarot_cards = sa.table(
        "tarot_cards",
        sa.column("id", sa.SmallInteger()),
        sa.column("code", sa.String()),
        sa.column("image_path", sa.String()),
    )
    for card_id, *_ in DECK:
        op.execute(
            tarot_cards.update()
            .where(tarot_cards.c.id == card_id)
            .values(code=card_code(card_id), image_path=card_image_path(card_id))
        )


def downgrade() -> None:
    tarot_cards = sa.table(
        "tarot_cards",
        sa.column("id", sa.SmallInteger()),
        sa.column("code", sa.String()),
        sa.column("image_path", sa.String()),
    )
    for card_id, *_ in DECK:
        op.execute(
            tarot_cards.update()
            .where(tarot_cards.c.id == card_id)
            .values(code=f"card-{card_id:02d}", image_path=dummy_image_path_for(card_id))
        )
