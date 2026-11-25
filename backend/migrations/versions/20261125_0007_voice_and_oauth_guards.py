"""Bind OAuth attempts to browsers and persist voice limits and hangups."""
import sqlalchemy as sa
from alembic import op

revision = "20261125_0007"
down_revision = "20261123_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("oauth_attempts", sa.Column("browser_binding_hash", sa.String(64), nullable=True))
    op.add_column("consultation_sessions", sa.Column("voice_connection_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("consultation_sessions", sa.Column("voice_reservation", sa.String(36), nullable=True))
    op.add_column("consultation_sessions", sa.Column("voice_reservation_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("consultation_sessions", sa.Column("tts_characters", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("consultation_sessions", sa.Column("tts_leases", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.create_table(
        "realtime_calls",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("consultation_id", sa.String(36), sa.ForeignKey("consultation_sessions.id"), nullable=False),
        sa.Column("hangup_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_realtime_calls_consultation_id", "realtime_calls", ["consultation_id"])
    op.create_index("ix_realtime_calls_hangup_at", "realtime_calls", ["hangup_at"])
    op.create_table(
        "voice_account_usage",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("utc_day", sa.Date(), primary_key=True),
        sa.Column("connection_attempts", sa.Integer(), nullable=False),
        sa.Column("tts_characters", sa.Integer(), nullable=False),
    )
    op.create_table(
        "voice_worker_heartbeat",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute("INSERT INTO voice_worker_heartbeat (id, seen_at) VALUES (1, '1970-01-01 00:00:00+00')")


def downgrade() -> None:
    op.drop_table("voice_worker_heartbeat")
    op.drop_table("voice_account_usage")
    op.drop_index("ix_realtime_calls_hangup_at", table_name="realtime_calls")
    op.drop_index("ix_realtime_calls_consultation_id", table_name="realtime_calls")
    op.drop_table("realtime_calls")
    for field in ("tts_leases", "tts_characters", "voice_reservation_until", "voice_reservation", "voice_connection_attempts"):
        op.drop_column("consultation_sessions", field)
    op.drop_column("oauth_attempts", "browser_binding_hash")
