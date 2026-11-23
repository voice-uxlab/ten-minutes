"""Remove backend-managed tarot image paths.

Revision ID: 20261123_0006
Revises: 20261122_0005
Create Date: 2026-11-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.deck import DECK, card_image_path


revision: str = "20261123_0006"
down_revision: Union[str, None] = "20261122_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_context().dialect.name != "postgresql":
        raise RuntimeError("This migration supports PostgreSQL only.")

    op.drop_column("tarot_cards", "image_path")


def downgrade() -> None:
    if op.get_context().dialect.name != "postgresql":
        raise RuntimeError("This migration supports PostgreSQL only.")

    op.add_column(
        "tarot_cards",
        sa.Column("image_path", sa.String(length=255), nullable=True),
    )
    tarot_cards = sa.table(
        "tarot_cards",
        sa.column("id", sa.SmallInteger()),
        sa.column("image_path", sa.String()),
    )
    for card_id, *_ in DECK:
        op.execute(
            tarot_cards.update()
            .where(tarot_cards.c.id == card_id)
            .values(image_path=card_image_path(card_id))
        )
    op.alter_column(
        "tarot_cards",
        "image_path",
        existing_type=sa.String(length=255),
        nullable=False,
    )
