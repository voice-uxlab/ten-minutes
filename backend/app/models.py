from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db_base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def uuid_string() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    addressing_mode: Mapped[str] = mapped_column(String(16), default="DEFAULT")
    nickname: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    consent_version: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    role: Mapped[str] = mapped_column(String(16), default="USER")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    identities: Mapped[list["AuthIdentity"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AuthIdentity(Base):
    __tablename__ = "auth_identities"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(16))
    provider_user_id: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="identities")


class ServiceSession(Base):
    __tablename__ = "service_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OAuthAttempt(Base):
    __tablename__ = "oauth_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    provider: Mapped[str] = mapped_column(String(16))
    state_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class TarotCard(Base):
    __tablename__ = "tarot_cards"
    __table_args__ = (
        CheckConstraint(
            "arcana IN ('MAJOR', 'MINOR')",
            name="ck_tarot_cards_arcana",
        ),
        CheckConstraint(
            "(arcana = 'MAJOR' AND suit IS NULL) OR "
            "(arcana = 'MINOR' AND suit IN ('WANDS', 'CUPS', 'SWORDS', 'PENTACLES'))",
            name="ck_tarot_cards_suit",
        ),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    name_ko: Mapped[str] = mapped_column(String(64))
    arcana: Mapped[str] = mapped_column(String(8))
    suit: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    rank: Mapped[str] = mapped_column(String(16))
    upright_keywords: Mapped[list[str]] = mapped_column(
        JSON().with_variant(ARRAY(String()), "postgresql")
    )


class Consultation(Base):
    __tablename__ = "consultation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="CREATED")
    question: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    spread_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    deck_size: Mapped[int] = mapped_column(Integer, default=78)
    expected_card_count: Mapped[int] = mapped_column(Integer, default=3)
    deck_order: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    cards: Mapped[list["ConsultationCard"]] = relationship(
        back_populates="consultation", cascade="all, delete-orphan", order_by="ConsultationCard.slot"
    )
    report: Mapped[Optional["ConsultationReport"]] = relationship(
        back_populates="consultation", cascade="all, delete-orphan", uselist=False
    )


class ConsultationCard(Base):
    __tablename__ = "consultation_cards"
    __table_args__ = (
        UniqueConstraint("consultation_id", "slot"),
        UniqueConstraint("consultation_id", "picked_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    consultation_id: Mapped[str] = mapped_column(ForeignKey("consultation_sessions.id"), index=True)
    slot: Mapped[int] = mapped_column(Integer)
    picked_number: Mapped[int] = mapped_column(Integer)
    position: Mapped[str] = mapped_column(String(80))
    card_id: Mapped[int] = mapped_column(ForeignKey("tarot_cards.id"))
    direction: Mapped[str] = mapped_column(String(10))
    revealed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    consultation: Mapped[Consultation] = relationship(back_populates="cards")
    tarot_card: Mapped[TarotCard] = relationship()


class ConsultationReport(Base):
    __tablename__ = "consultation_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    consultation_id: Mapped[str] = mapped_column(ForeignKey("consultation_sessions.id"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="COMPLETED")
    situation_summary: Mapped[str] = mapped_column(String(500))
    readings: Mapped[list] = mapped_column(JSON)
    queen_line: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    consultation: Mapped[Consultation] = relationship(back_populates="report")


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    consultation_id: Mapped[str] = mapped_column(ForeignKey("consultation_sessions.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    hook_text: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ConsultationEvent(Base):
    __tablename__ = "consultation_events"
    __table_args__ = (UniqueConstraint("consultation_id", "idempotency_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    consultation_id: Mapped[str] = mapped_column(ForeignKey("consultation_sessions.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100))
    event: Mapped[str] = mapped_column(String(40))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    stage: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    reason_code: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    slot: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stored_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
