"""Create the initial backend schema and seed the tarot deck.

Revision ID: 20261118_0001
Revises:
Create Date: 2026-11-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.deck import DECK, dummy_image_path_for


revision: str = "20261118_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_context().dialect.name != "postgresql":
        raise RuntimeError("This migration supports PostgreSQL only.")
    keyword_type = postgresql.ARRAY(sa.Text())
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("addressing_mode", sa.String(length=16), nullable=False),
        sa.Column("nickname", sa.String(length=40), nullable=True),
        sa.Column("consent_version", sa.String(length=40), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "oauth_attempts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_oauth_attempts_state_hash", "oauth_attempts", ["state_hash"], unique=True)
    op.create_table(
        "tarot_cards",
        sa.Column("id", sa.SmallInteger(), autoincrement=False, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name_ko", sa.String(length=64), nullable=False),
        sa.Column("upright_keywords", keyword_type, nullable=False),
        sa.Column("reversed_keywords", keyword_type, nullable=False),
        sa.Column("image_path", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )

    tarot_cards = sa.table(
        "tarot_cards",
        sa.column("id", sa.SmallInteger()),
        sa.column("code", sa.String()),
        sa.column("name_ko", sa.String()),
        sa.column("upright_keywords", keyword_type),
        sa.column("reversed_keywords", keyword_type),
        sa.column("image_path", sa.String()),
    )
    seed_rows = [
        {
            "id": card_id,
            "code": f"card-{card_id:02d}",
            "name_ko": name,
            "upright_keywords": list(upright),
            "reversed_keywords": list(reversed_keywords),
            "image_path": dummy_image_path_for(card_id),
        }
        for card_id, name, upright, reversed_keywords in DECK
    ]
    for row in seed_rows:
        op.execute(
            tarot_cards.insert().values(
                id=row["id"],
                code=row["code"],
                name_ko=row["name_ko"],
                upright_keywords=postgresql.array(
                    [op.inline_literal(value) for value in row["upright_keywords"]],
                    type_=sa.Text(),
                ),
                reversed_keywords=postgresql.array(
                    [op.inline_literal(value) for value in row["reversed_keywords"]],
                    type_=sa.Text(),
                ),
                image_path=row["image_path"],
            )
        )

    op.create_table(
        "auth_identities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("provider_user_id", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_user_id"),
    )
    op.create_index("ix_auth_identities_user_id", "auth_identities", ["user_id"], unique=False)
    op.create_table(
        "service_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_service_sessions_token_hash", "service_sessions", ["token_hash"], unique=True)
    op.create_index("ix_service_sessions_user_id", "service_sessions", ["user_id"], unique=False)
    op.create_table(
        "consultation_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("question", sa.String(length=300), nullable=True),
        sa.Column("spread_type", sa.String(length=20), nullable=True),
        sa.Column("deck_size", sa.Integer(), nullable=False),
        sa.Column("expected_card_count", sa.Integer(), nullable=False),
        sa.Column("deck_order", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_consultation_sessions_user_id", "consultation_sessions", ["user_id"], unique=False)
    op.create_table(
        "consultation_cards",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("consultation_id", sa.String(length=36), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("picked_number", sa.Integer(), nullable=False),
        sa.Column("position", sa.String(length=80), nullable=False),
        sa.Column("card_id", sa.Integer(), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("revealed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["card_id"], ["tarot_cards.id"]),
        sa.ForeignKeyConstraint(["consultation_id"], ["consultation_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("consultation_id", "picked_number"),
        sa.UniqueConstraint("consultation_id", "slot"),
    )
    op.create_index("ix_consultation_cards_consultation_id", "consultation_cards", ["consultation_id"], unique=False)
    op.create_table(
        "consultation_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("consultation_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("situation_summary", sa.String(length=500), nullable=False),
        sa.Column("readings", sa.JSON(), nullable=False),
        sa.Column("queen_line", sa.String(length=300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["consultation_id"], ["consultation_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_consultation_reports_consultation_id",
        "consultation_reports",
        ["consultation_id"],
        unique=True,
    )
    op.create_table(
        "share_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("consultation_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("hook_text", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["consultation_id"], ["consultation_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_share_links_consultation_id", "share_links", ["consultation_id"], unique=False)
    op.create_index("ix_share_links_token_hash", "share_links", ["token_hash"], unique=True)
    op.create_table(
        "consultation_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("consultation_id", sa.String(length=36), nullable=False),
        sa.Column("idempotency_key", sa.String(length=100), nullable=False),
        sa.Column("event", sa.String(length=40), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stage", sa.String(length=40), nullable=True),
        sa.Column("reason_code", sa.String(length=80), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("slot", sa.Integer(), nullable=True),
        sa.Column("stored_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["consultation_id"], ["consultation_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("consultation_id", "idempotency_key"),
    )
    op.create_index("ix_consultation_events_consultation_id", "consultation_events", ["consultation_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_consultation_events_consultation_id", table_name="consultation_events")
    op.drop_table("consultation_events")
    op.drop_index("ix_share_links_token_hash", table_name="share_links")
    op.drop_index("ix_share_links_consultation_id", table_name="share_links")
    op.drop_table("share_links")
    op.drop_index("ix_consultation_reports_consultation_id", table_name="consultation_reports")
    op.drop_table("consultation_reports")
    op.drop_index("ix_consultation_cards_consultation_id", table_name="consultation_cards")
    op.drop_table("consultation_cards")
    op.drop_index("ix_consultation_sessions_user_id", table_name="consultation_sessions")
    op.drop_table("consultation_sessions")
    op.drop_index("ix_service_sessions_user_id", table_name="service_sessions")
    op.drop_index("ix_service_sessions_token_hash", table_name="service_sessions")
    op.drop_table("service_sessions")
    op.drop_index("ix_auth_identities_user_id", table_name="auth_identities")
    op.drop_table("auth_identities")
    op.drop_table("tarot_cards")
    op.drop_index("ix_oauth_attempts_state_hash", table_name="oauth_attempts")
    op.drop_table("oauth_attempts")
    op.drop_table("users")
