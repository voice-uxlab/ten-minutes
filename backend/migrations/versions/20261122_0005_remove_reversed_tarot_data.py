"""Remove reversed tarot data and enforce upright-only readings.

Revision ID: 20261122_0005
Revises: 20261121_0004
Create Date: 2026-11-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20261122_0005"
down_revision: Union[str, None] = "20261121_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_context().dialect.name != "postgresql":
        raise RuntimeError("This migration supports PostgreSQL only.")

    op.execute("UPDATE consultation_cards SET direction = 'UPRIGHT'")
    op.create_check_constraint(
        "ck_consultation_cards_direction",
        "consultation_cards",
        "direction = 'UPRIGHT'",
    )
    op.execute("ALTER TABLE tarot_cards DROP COLUMN IF EXISTS reversed_keywords")


def downgrade() -> None:
    if op.get_context().dialect.name != "postgresql":
        raise RuntimeError("This migration supports PostgreSQL only.")

    op.drop_constraint(
        "ck_consultation_cards_direction",
        "consultation_cards",
        type_="check",
    )
    op.add_column(
        "tarot_cards",
        sa.Column(
            "reversed_keywords",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.alter_column("tarot_cards", "reversed_keywords", server_default=None)
