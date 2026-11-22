from typing import Optional

from .config import Settings
from .models import Consultation, ConsultationCard, User, ensure_utc


def public_origin(settings: Settings) -> str:
    return settings.public_web_origin.rstrip("/")


def user_response(user: User) -> dict:
    provider = user.identities[0].provider if user.identities else None
    nickname_required = user.addressing_mode == "CUSTOM" and not bool(user.nickname)
    return {
        "id": user.id,
        "addressing_mode": user.addressing_mode,
        "nickname": user.nickname,
        "provider": provider,
        "onboarding_required": not bool(user.consent_version) or nickname_required,
        "created_at": ensure_utc(user.created_at),
    }


def card_response(
    card: ConsultationCard,
    *,
    reading: Optional[str] = None,
) -> dict:
    revealed = card.revealed_at is not None
    response = {
        "slot": card.slot,
        "picked_number": card.picked_number,
        "position": card.position,
        "revealed": revealed,
        "card_id": None,
        "card_code": None,
        "name": None,
        "arcana": None,
        "suit": None,
        "rank": None,
        "direction": None,
        "keywords": None,
        "revealed_at": ensure_utc(card.revealed_at),
    }
    if not revealed:
        return response
    definition = card.tarot_card
    keywords = (
        definition.upright_keywords
        if card.direction == "UPRIGHT"
        else definition.reversed_keywords
    )
    response.update(
        {
            "card_id": card.card_id,
            "card_code": definition.code,
            "name": definition.name_ko,
            "arcana": definition.arcana,
            "suit": definition.suit,
            "rank": definition.rank,
            "direction": card.direction,
            "keywords": list(keywords),
        }
    )
    if reading is not None:
        response["reading"] = reading
    return response


def consultation_response(consultation: Consultation) -> dict:
    return {
        "id": consultation.id,
        "status": consultation.status,
        "question": consultation.question,
        "spread_type": consultation.spread_type,
        "deck_size": consultation.deck_size,
        "expected_card_count": consultation.expected_card_count,
        "cards": [card_response(card) for card in consultation.cards],
        "report_status": consultation.report.status if consultation.report else None,
        "created_at": ensure_utc(consultation.created_at),
        "ended_at": ensure_utc(consultation.ended_at),
    }


def report_response(consultation: Consultation) -> dict:
    report = consultation.report
    reading_by_slot = {item["slot"]: item["text"] for item in report.readings}
    return {
        "consultation_id": consultation.id,
        "status": report.status,
        "spread_type": consultation.spread_type,
        "consulted_at": ensure_utc(consultation.created_at),
        "question": consultation.question,
        "cards": [
            card_response(card, reading=reading_by_slot[card.slot])
            for card in consultation.cards
            if card.revealed_at
        ],
        "situation_summary": report.situation_summary,
        "readings": report.readings,
        "queen_line": report.queen_line,
        "created_at": ensure_utc(report.created_at),
    }
