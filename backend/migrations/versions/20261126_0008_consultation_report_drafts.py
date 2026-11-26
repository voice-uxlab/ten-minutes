"""Persist report checkpoints and generation jobs."""
import sqlalchemy as sa
from alembic import op

revision = "20261126_0008"
down_revision = "20261125_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "consultation_report_drafts",
        sa.Column("consultation_id", sa.String(36), sa.ForeignKey("consultation_sessions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("summary", sa.String(300), nullable=True),
        sa.Column("readings", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("lease", sa.String(36), nullable=True),
    )
    op.create_index("ix_consultation_report_drafts_run_at", "consultation_report_drafts", ["run_at"])
    op.execute("ALTER TABLE consultation_report_drafts ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_consultation_report_drafts_run_at", table_name="consultation_report_drafts")
    op.drop_table("consultation_report_drafts")
