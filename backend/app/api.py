import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import anyio
import httpx
from fastapi import APIRouter, Depends, Header, Path as PathParameter, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from .auth import current_user
from .config import Settings, get_settings
from .database import get_db
from .errors import APIError
from .models import (
    Consultation,
    ConsultationCard,
    ConsultationEvent,
    ConsultationReport,
    ConsultationReportDraft,
    RealtimeCall,
    ShareLink,
    TarotCard,
    User,
    ensure_utc,
)
from .openapi import AUTHENTICATED_RESPONSES, PUBLIC_RESPONSES, error_response
from .reports import mark_consultation_ended, process_due_report
from .schemas import (
    CardRevealResponse,
    CardSelectionRequest,
    CardSelectionResponse,
    ClientEventRequest,
    ClientEventResponse,
    ConsultationListResponse,
    ConsultationResponse,
    CreateConsultationRequest,
    CreateShareLinkRequest,
    CurrentUserResponse,
    EndConsultationRequest,
    PublicShareResponse,
    RealtimeConnectionRequest,
    ReportResponse,
    SPREAD_POSITIONS,
    SaveReportRequest,
    SaveReportDraftRequest,
    ShareLinkResponse,
    TTSDiagnostics,
    TTSRequest,
    UpdateCurrentUserRequest,
    VoiceHeartbeatRequest,
)
from .serializers import (
    card_response,
    consultation_response,
    public_origin,
    report_response,
    user_response,
)

from .voice import (
    VOICE_CONNECTION_HEADER,
    active_consultation,
    close_inactive_voice_calls,
    close_consultation_calls,
    create_voice_connection,
    release_tts,
    reserve_tts,
    renew_voice_connection,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", responses=AUTHENTICATED_RESPONSES)
public_router = APIRouter(prefix="/api/v1", tags=["shares"], responses=PUBLIC_RESPONSES)

CONSULTATION_NOT_FOUND_RESPONSE = error_response(
    404,
    examples={
        "consultation_not_found": ("CONSULTATION_NOT_FOUND", "The consultation was not found."),
    },
)
VALIDATION_RESPONSE = error_response(422)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def owned_consultation(db: Session, consultation_id: UUID, user: User, *, lock: bool = False) -> Consultation:
    query = select(Consultation).where(
        Consultation.id == str(consultation_id), Consultation.user_id == user.id
    )
    consultation = db.scalar(query.with_for_update() if lock else query)
    if not consultation:
        raise APIError(404, "CONSULTATION_NOT_FOUND", "The consultation was not found.")
    return consultation


def shuffled_deck(db: Session) -> list[dict]:
    card_ids = list(db.scalars(select(TarotCard.id).order_by(TarotCard.id)))
    if len(card_ids) != 78:
        raise APIError(503, "TAROT_DECK_NOT_READY", "The tarot deck is not ready.")
    random = secrets.SystemRandom()
    random.shuffle(card_ids)
    return [{"card_id": card_id} for card_id in card_ids]


@router.get(
    "/users/me",
    response_model=CurrentUserResponse,
    tags=["users"],
    summary="Get current user",
    description="Returns the display name, OAuth provider, and onboarding state for the authenticated user.",
)
def get_me(user: User = Depends(current_user)):
    return user_response(user)


@router.patch(
    "/users/me",
    response_model=CurrentUserResponse,
    tags=["users"],
    summary="Update current user",
    description="Updates the display name used during consultations and the accepted consent version.",
    responses={422: VALIDATION_RESPONSE},
)
def update_me(
    body: UpdateCurrentUserRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    user.addressing_mode = body.addressing_mode.value
    user.nickname = body.nickname
    user.consent_version = body.consent_version
    db.commit()
    return user_response(user)


@router.post(
    "/consultations",
    response_model=ConsultationResponse,
    status_code=201,
    tags=["consultations"],
    summary="Create consultation",
    description="Creates a three-card consultation with a shuffled 78-card server-side deck.",
    responses={
        409: error_response(
            409,
            examples={"consent_required": ("CONSENT_REQUIRED", "Required consent has not been accepted.")},
        ),
        422: VALIDATION_RESPONSE,
        503: error_response(
            503,
            examples={"deck_not_ready": ("TAROT_DECK_NOT_READY", "The tarot deck is not ready.")},
        ),
    },
)
def create_consultation(
    body: CreateConsultationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    if not user.consent_version or user.consent_version != body.consent_version:
        raise APIError(409, "CONSENT_REQUIRED", "Required consent has not been accepted.")
    consultation = Consultation(
        user_id=user.id,
        deck_size=78,
        expected_card_count=settings.default_card_count,
        deck_order=shuffled_deck(db),
    )
    db.add(consultation)
    db.commit()
    db.refresh(consultation)
    return consultation_response(consultation)


@router.get(
    "/consultations",
    response_model=ConsultationListResponse,
    tags=["consultations"],
    summary="List my consultations",
    description="Returns consultations in reverse chronological order using cursor pagination, including report summaries and thumbnails.",
    responses={
        400: error_response(
            400,
            examples={"invalid_cursor": ("INVALID_CURSOR", "The pagination cursor is invalid.")},
        ),
        422: VALIDATION_RESPONSE,
    },
)
def list_consultations(
    limit: int = Query(default=20, ge=1, le=50, description="Number of consultations to return per page"),
    cursor: Optional[UUID] = Query(
        default=None,
        description="`next_cursor` from the previous response. Omit for the first page.",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    query = select(Consultation).where(Consultation.user_id == user.id)
    if cursor:
        cursor_item = db.scalar(
            select(Consultation).where(Consultation.id == str(cursor), Consultation.user_id == user.id)
        )
        if not cursor_item:
            raise APIError(400, "INVALID_CURSOR", "The pagination cursor is invalid.")
        query = query.where(Consultation.created_at < cursor_item.created_at)
    items = list(db.scalars(query.order_by(Consultation.created_at.desc()).limit(limit + 1)))
    has_more = len(items) > limit
    items = items[:limit]
    return {
        "items": [
            {
                "id": item.id,
                "question": item.question,
                "spread_type": item.spread_type,
                "status": item.status,
                "expected_card_count": item.expected_card_count,
                "report_status": item.report.status if item.report else None,
                "situation_summary": item.report.situation_summary if item.report else None,
                "thumbnail_card_code": next(
                    (
                        card.tarot_card.code
                        for card in item.cards
                        if card.revealed_at is not None
                    ),
                    None,
                ),
                "created_at": ensure_utc(item.created_at),
                "ended_at": ensure_utc(item.ended_at),
            }
            for item in items
        ],
        "next_cursor": items[-1].id if has_more else None,
    }


@router.get(
    "/consultations/{consultation_id}",
    response_model=ConsultationResponse,
    tags=["consultations"],
    summary="Get consultation",
    description="Returns the consultation state, selected cards, reveal state, and report state for the owner.",
    responses={404: CONSULTATION_NOT_FOUND_RESPONSE, 422: VALIDATION_RESPONSE},
)
def get_consultation(
    consultation_id: UUID = PathParameter(description="Consultation ID to retrieve"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return consultation_response(owned_consultation(db, consultation_id, user))


@router.post(
    "/consultations/{consultation_id}/card-selection",
    response_model=CardSelectionResponse,
    status_code=201,
    tags=["cards"],
    summary="Confirm card selection",
    description="Maps the question, spread type, and selected numbers from 1 to 78 to the server deck. Retrying the same request returns the existing result with status 200.",
    responses={
        404: CONSULTATION_NOT_FOUND_RESPONSE,
        409: error_response(
            409,
            examples={
                "selection_locked": ("CARD_SELECTION_LOCKED", "The confirmed card selection cannot be changed."),
                "state_conflict": ("CONSULTATION_STATE_CONFLICT", "Cards cannot be selected for an ended consultation."),
            },
        ),
        422: error_response(
            422,
            examples={
                "validation_error": ("VALIDATION_ERROR", "Check the request values."),
                "invalid_card_count": ("INVALID_CARD_COUNT", "The selected card count is invalid."),
                "invalid_positions": ("INVALID_SPREAD_POSITIONS", "The spread positions do not match the spread type."),
            },
        ),
    },
)
def select_cards(
    body: CardSelectionRequest,
    response: Response,
    consultation_id: UUID = PathParameter(description="Consultation ID for card selection"),
    idempotency_key: str = Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=100,
        description="An 8-100 character idempotency key used to identify network retries",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    del idempotency_key
    consultation = owned_consultation(db, consultation_id, user, lock=True)
    positions = SPREAD_POSITIONS[body.spread_type]
    if len(body.picks) != consultation.expected_card_count:
        raise APIError(422, "INVALID_CARD_COUNT", "The selected card count is invalid.")
    if body.positions is not None and body.positions != positions:
        raise APIError(422, "INVALID_SPREAD_POSITIONS", "The spread positions do not match the spread type.")
    if consultation.cards:
        same = (
            consultation.question == body.question
            and consultation.spread_type == body.spread_type.value
            and [card.picked_number for card in consultation.cards] == body.picks
        )
        if not same:
            raise APIError(409, "CARD_SELECTION_LOCKED", "The confirmed card selection cannot be changed.")
        response.status_code = 200
        return {
            "question": consultation.question,
            "spread_type": consultation.spread_type,
            "cards": [card_response(card) for card in consultation.cards],
        }
    active_consultation(consultation)
    consultation.question = body.question
    consultation.spread_type = body.spread_type.value
    consultation.status = "ACTIVE"
    for index, picked_number in enumerate(body.picks):
        mapped = consultation.deck_order[picked_number - 1]
        db.add(
            ConsultationCard(
                consultation_id=consultation.id,
                slot=index + 1,
                picked_number=picked_number,
                position=positions[index],
                card_id=mapped["card_id"],
                direction="UPRIGHT",
            )
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise APIError(409, "CARD_SELECTION_CONFLICT", "The card selection was processed concurrently. Retrieve the consultation again.")
    db.refresh(consultation)
    return {
        "question": consultation.question,
        "spread_type": consultation.spread_type,
        "cards": [card_response(card) for card in consultation.cards],
    }


@router.post(
    "/consultations/{consultation_id}/cards/{slot}/reveal",
    response_model=CardRevealResponse,
    tags=["cards"],
    summary="Reveal a card",
    description="Reveals cards sequentially starting with `slot=1`. Returns the existing result when the card is already revealed.",
    responses={
        404: error_response(
            404,
            examples={
                "consultation_not_found": ("CONSULTATION_NOT_FOUND", "The consultation was not found."),
                "card_not_found": ("CARD_NOT_FOUND", "The card was not found."),
            },
        ),
        409: error_response(
            409,
            examples={
                "selection_required": ("CARD_SELECTION_REQUIRED", "Select the cards before revealing them."),
                "previous_not_revealed": ("PREVIOUS_CARD_NOT_REVEALED", "Reveal the previous card first."),
            },
        ),
        422: VALIDATION_RESPONSE,
    },
)
def reveal_card(
    consultation_id: UUID = PathParameter(description="Consultation ID containing the card"),
    slot: int = PathParameter(ge=1, description="One-based slot of the card to reveal"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user, lock=True)
    if not consultation.cards:
        raise APIError(409, "CARD_SELECTION_REQUIRED", "Select the cards before revealing them.")
    if slot < 1 or slot > consultation.expected_card_count:
        raise APIError(404, "CARD_NOT_FOUND", "The card was not found.")
    card = next((item for item in consultation.cards if item.slot == slot), None)
    if not card:
        raise APIError(404, "CARD_NOT_FOUND", "The card was not found.")
    if slot > 1:
        previous = next(item for item in consultation.cards if item.slot == slot - 1)
        if previous.revealed_at is None:
            raise APIError(409, "PREVIOUS_CARD_NOT_REVEALED", "Reveal the previous card first.")
    if card.revealed_at is None:
        active_consultation(consultation)
        card.revealed_at = datetime.now(timezone.utc)
        db.commit()
    return {"card": card_response(card)}


@router.post(
    "/consultations/{consultation_id}/end",
    response_model=ConsultationResponse,
    tags=["consultations"],
    summary="End consultation",
    description="Stores the termination reason and closes any open Realtime connection. Repeating the request retries an unconfirmed hangup.",
    responses={404: CONSULTATION_NOT_FOUND_RESPONSE, 422: VALIDATION_RESPONSE},
)
def end_consultation(
    body: EndConsultationRequest,
    consultation_id: UUID = PathParameter(description="Consultation ID to end"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    consultation = owned_consultation(db, consultation_id, user, lock=True)
    mark_consultation_ended(db, consultation, body.reason, datetime.now(timezone.utc))
    result = consultation_response(consultation)
    needs_hangup = not body.defer_voice_cleanup and (bool(consultation.voice_reservation) or db.scalar(
        select(RealtimeCall.id).where(
            RealtimeCall.consultation_id == consultation.id, RealtimeCall.closed_at.is_(None)
        ).limit(1)
    ))
    db.commit()
    if needs_hangup:
        if not settings.openai_api_key:
            raise APIError(503, "VOICE_NOT_CONFIGURED", "The voice provider is not configured.")
        close_consultation_calls(db, str(consultation_id), settings.openai_api_key)
    return result


@router.put(
    "/consultations/{consultation_id}/report-draft",
    status_code=204,
    tags=["reports"],
    summary="Save a short consultation checkpoint",
)
def save_report_draft(
    consultation_id: UUID,
    body: SaveReportDraftRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user, lock=True)
    active_consultation(consultation)
    if consultation.report:
        raise APIError(409, "REPORT_LOCKED", "The saved report cannot be overwritten.")
    revealed = {card.slot for card in consultation.cards if card.revealed_at is not None}
    if any(reading.slot not in revealed for reading in body.readings):
        raise APIError(422, "INVALID_REPORT_READINGS", "Only revealed cards can have report notes.")
    draft = consultation.report_draft
    if draft is None:
        draft = consultation.report_draft = ConsultationReportDraft(
            run_at=consultation.call_ends_at,
            expires_at=consultation.call_ends_at + timedelta(hours=24),
            readings={},
        )
    if body.summary is not None:
        draft.summary = body.summary
    draft.readings = {
        **draft.readings,
        **{str(reading.slot): reading.text for reading in body.readings},
    }
    db.commit()
    return Response(status_code=204)


@router.post(
    "/consultations/{consultation_id}/report/generate",
    status_code=204,
    tags=["reports"],
    summary="Process a due report for an ended consultation",
)
def generate_consultation_report(
    consultation_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    owned_consultation(db, consultation_id, user)
    process_due_report(db, settings, str(consultation_id))
    return Response(status_code=204)


@router.put(
    "/consultations/{consultation_id}/report",
    response_model=ReportResponse,
    status_code=201,
    tags=["reports"],
    summary="Save report",
    description="Stores the situation summary, per-card readings, and closing message after the call ends or every card is revealed. Retrying the same request returns the existing result with status 200.",
    responses={
        404: CONSULTATION_NOT_FOUND_RESPONSE,
        409: error_response(
            409,
            examples={
                "cards_not_revealed": ("CARDS_NOT_FULLY_REVEALED", "Reveal every card in order before saving the report."),
                "report_locked": ("REPORT_LOCKED", "The saved report cannot be overwritten."),
            },
        ),
        422: error_response(
            422,
            examples={
                "validation_error": ("VALIDATION_ERROR", "Check the request values."),
                "invalid_readings": ("INVALID_REPORT_READINGS", "Report readings must match every revealed card."),
            },
        ),
    },
)
def save_report(
    body: SaveReportRequest,
    response: Response,
    consultation_id: UUID = PathParameter(description="Consultation ID for the report"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user, lock=True)
    expected_slots = [card.slot for card in consultation.cards if card.revealed_at is not None]
    if consultation.status != "ENDED" and len(expected_slots) != consultation.expected_card_count:
        raise APIError(409, "CARDS_NOT_FULLY_REVEALED", "Reveal every card in order before saving the report.")
    if sorted(reading.slot for reading in body.readings) != expected_slots:
        raise APIError(422, "INVALID_REPORT_READINGS", "Report readings must match every revealed card.")
    normalized_readings = [reading.model_dump() for reading in sorted(body.readings, key=lambda item: item.slot)]
    if consultation.report:
        same = (
            consultation.report.situation_summary == body.situation_summary
            and consultation.report.readings == normalized_readings
            and consultation.report.queen_line == body.queen_line
        )
        if not same:
            raise APIError(409, "REPORT_LOCKED", "The saved report cannot be overwritten.")
        response.status_code = 200
    else:
        consultation.report = ConsultationReport(
            situation_summary=body.situation_summary,
            readings=normalized_readings,
            queen_line=body.queen_line,
        )
        consultation.report_draft = None
        db.commit()
        db.refresh(consultation)
    return report_response(consultation)


@router.get(
    "/consultations/{consultation_id}/report",
    response_model=ReportResponse,
    tags=["reports"],
    summary="Get private report",
    description="Returns the question, card images, per-card readings, situation summary, and closing message to the consultation owner only.",
    responses={
        202: {"description": "A report is pending generation"},
        404: error_response(
            404,
            examples={
                "consultation_not_found": ("CONSULTATION_NOT_FOUND", "The consultation was not found."),
                "report_not_found": ("REPORT_NOT_FOUND", "The report was not found."),
            },
        ),
        422: VALIDATION_RESPONSE,
    },
)
def get_report(
    consultation_id: UUID = PathParameter(description="Consultation ID for the report"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user)
    if not consultation.report:
        if consultation.status == "ENDED" and consultation.report_draft:
            return Response(status_code=202, headers={"Cache-Control": "no-store"})
        raise APIError(404, "REPORT_NOT_FOUND", "The report was not found.")
    return report_response(consultation)


@router.post(
    "/consultations/{consultation_id}/share-links",
    response_model=ShareLinkResponse,
    status_code=201,
    tags=["shares"],
    summary="Create share link",
    description="Creates a public share link that exposes only the hook text and service CTA, not the private report content.",
    responses={
        404: CONSULTATION_NOT_FOUND_RESPONSE,
        409: error_response(
            409,
            examples={"report_required": ("REPORT_REQUIRED", "A completed report is required before sharing.")},
        ),
        422: VALIDATION_RESPONSE,
    },
)
def create_share_link(
    body: CreateShareLinkRequest,
    consultation_id: UUID = PathParameter(description="Consultation ID used to create the share link"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    consultation = owned_consultation(db, consultation_id, user)
    if not consultation.report:
        raise APIError(409, "REPORT_REQUIRED", "A completed report is required before sharing.")
    raw_token = secrets.token_urlsafe(24)
    db.add(
        ShareLink(
            consultation_id=consultation.id,
            token_hash=token_hash(raw_token),
            hook_text=body.hook_text,
        )
    )
    db.commit()
    share_path = f"/share/{raw_token}"
    return {
        "token": raw_token,
        "share_path": share_path,
        "share_url": f"{public_origin(settings)}{share_path}",
        "hook_text": body.hook_text,
        "cta_text": "나도 해보기",
        "preview": {
            "title": body.hook_text,
            "description": "AI 타로 언니에게 내 고민도 물어보기",
            "image_url": None,
        },
    }


@public_router.get(
    "/shares/{token}",
    response_model=PublicShareResponse,
    summary="Get share preview",
    description="Returns the public hook text and CTA without authentication. The consultation question and private report content are never returned.",
    responses={
        404: error_response(
            404,
            examples={"share_not_found": ("SHARE_NOT_FOUND", "The share link was not found.")},
        ),
    },
)
def get_public_share(
    token: str = PathParameter(description="Public token issued when the share link was created"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    share = db.scalar(
        select(ShareLink).where(ShareLink.token_hash == token_hash(token), ShareLink.is_active.is_(True))
    )
    if not share:
        raise APIError(404, "SHARE_NOT_FOUND", "The share link was not found.")
    return {
        "hook_text": share.hook_text,
        "cta_text": "나도 해보기",
        "cta_path": "/",
        "cta_url": f"{public_origin(settings)}/",
        "preview": {
            "title": share.hook_text,
            "description": "AI 타로 언니에게 내 고민도 물어보기",
            "image_url": None,
        },
        "created_at": ensure_utc(share.created_at),
    }


@router.post(
    "/consultations/{consultation_id}/events",
    response_model=ClientEventResponse,
    status_code=201,
    tags=["events"],
    summary="Store consultation UX event",
    description="Stores supported UX events such as connection failures, reconnects, TTS failures, and page exits. Retrying with the same idempotency key returns the existing result with status 200.",
    responses={404: CONSULTATION_NOT_FOUND_RESPONSE, 422: VALIDATION_RESPONSE},
)
def save_event(
    body: ClientEventRequest,
    response: Response,
    consultation_id: UUID = PathParameter(description="Consultation ID associated with the event"),
    idempotency_key: str = Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=100,
        description="An 8-100 character idempotency key used to prevent duplicate events",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user)
    if body.slot and body.slot > consultation.expected_card_count:
        raise APIError(422, "INVALID_EVENT_SLOT", "The event card slot is invalid.")
    existing = db.scalar(
        select(ConsultationEvent).where(
            ConsultationEvent.consultation_id == consultation.id,
            ConsultationEvent.idempotency_key == idempotency_key,
        )
    )
    if existing:
        response.status_code = 200
        return {"event_id": existing.id, "stored_at": ensure_utc(existing.stored_at)}
    event = ConsultationEvent(
        consultation_id=consultation.id,
        idempotency_key=idempotency_key,
        **body.model_dump(),
    )
    db.add(event)
    db.commit()
    return {"event_id": event.id, "stored_at": ensure_utc(event.stored_at)}


@router.post(
    "/consultations/{consultation_id}/realtime-connection",
    response_class=Response,
    status_code=201,
    tags=["voice"],
    summary="Connect a browser to OpenAI Realtime",
    responses={
        201: {"content": {"application/sdp": {"schema": {"type": "string"}}}},
        404: CONSULTATION_NOT_FOUND_RESPONSE,
        409: error_response(409),
        422: VALIDATION_RESPONSE,
        429: error_response(429),
        502: error_response(502),
        503: error_response(503),
        504: error_response(504),
    },
)
def realtime_connection(
    body: RealtimeConnectionRequest,
    consultation_id: UUID = PathParameter(description="Consultation ID to connect"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    owned_consultation(db, consultation_id, user)
    if not settings.openai_api_key or not settings.typecast_api_key or not settings.typecast_voice_id:
        raise APIError(503, "VOICE_NOT_CONFIGURED", "The voice providers are not configured.")
    answer, token = create_voice_connection(db, str(consultation_id), user.id, body.sdp, settings)
    return Response(
        answer, status_code=201, media_type="application/sdp",
        headers={"Cache-Control": "no-store", VOICE_CONNECTION_HEADER: token},
    )


@router.post(
    "/consultations/{consultation_id}/voice-heartbeat",
    status_code=204,
    tags=["voice"],
    summary="Keep a live voice connection open",
    responses={404: CONSULTATION_NOT_FOUND_RESPONSE, 409: error_response(409)},
)
def voice_heartbeat(
    consultation_id: UUID,
    body: VoiceHeartbeatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    renew_voice_connection(db, str(consultation_id), user.id, body.connection_token)
    return Response(status_code=204)


def authorize_scheduled_job(authorization: str, settings: Settings) -> None:
    secret = settings.voice_cleanup_secret
    scheme, _, token = authorization.partition(" ")
    if not secret or not token or scheme.lower() != "bearer" or not secrets.compare_digest(
        token.encode(), secret.get_secret_value().encode(),
    ):
        raise APIError(401, "VOICE_CLEANUP_UNAUTHORIZED", "A valid cleanup token is required.")


@router.post("/internal/voice-cleanup", status_code=204, include_in_schema=False)
def voice_cleanup(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    authorize_scheduled_job(authorization, settings)
    if not settings.openai_api_key:
        raise APIError(503, "VOICE_NOT_CONFIGURED", "The voice provider is not configured.")
    close_inactive_voice_calls(db, settings.openai_api_key)
    return Response(status_code=204)


@router.post("/internal/report-generation", status_code=204, include_in_schema=False)
def scheduled_report_generation(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    authorize_scheduled_job(authorization, settings)
    process_due_report(db, settings)
    return Response(status_code=204)


@router.post(
    "/consultations/{consultation_id}/tts/stream",
    tags=["voice"],
    summary="Stream Typecast audio",
    description="Sends one segment of an OpenAI text response to Typecast and streams the synthesized audio to the client.",
    responses={
        200: {
            "description": "Audio byte stream using the Content-Type returned by Typecast",
            "content": {"audio/wav": {"schema": {"type": "string", "format": "binary"}}},
        },
        404: CONSULTATION_NOT_FOUND_RESPONSE,
        409: error_response(
            409,
            examples={"state_conflict": ("CONSULTATION_STATE_CONFLICT", "Audio cannot be generated for an ended consultation.")},
        ),
        422: VALIDATION_RESPONSE,
        429: error_response(429),
        502: error_response(502),
        503: error_response(
            503,
            examples={"typecast_not_configured": ("TYPECAST_NOT_CONFIGURED", "Typecast speech synthesis is not configured.")},
        ),
        504: error_response(504),
    },
)
async def tts_stream(
    request: Request,
    body: TTSRequest,
    consultation_id: UUID = PathParameter(description="Active consultation ID for audio synthesis"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    if not settings.typecast_api_key or not settings.typecast_voice_id:
        await run_in_threadpool(owned_consultation, db, consultation_id, user)
        raise APIError(503, "TYPECAST_NOT_CONFIGURED", "Typecast speech synthesis is not configured.")
    consultation_key = str(consultation_id)
    bind = db.get_bind()
    lease = await run_in_threadpool(reserve_tts, db, consultation_key, user.id, len(body.text), settings)
    client = httpx.AsyncClient(timeout=15)
    upstream = None
    end_time = anyio.current_time() + 30
    cleaned = False

    async def cleanup():
        nonlocal cleaned
        if cleaned:
            return
        cleaned = True
        try:
            with anyio.move_on_after(5, shield=True):
                try:
                    if upstream is not None:
                        await upstream.aclose()
                finally:
                    await client.aclose()
        finally:
            with anyio.move_on_after(5, shield=True):
                await run_in_threadpool(release_tts, bind, consultation_key, lease)

    started = anyio.current_time()
    forwarded = False
    try:
        provider_request = client.build_request(
            "POST",
            "https://api.typecast.ai/v1/text-to-speech/stream",
            headers={"X-API-KEY": settings.typecast_api_key},
            json={
                "voice_id": settings.typecast_voice_id,
                "model": settings.typecast_model,
                "language": "kor",
                "text": body.text,
                "prompt": (
                    {"emotion_preset": "normal", "emotion_intensity": 1}
                    if settings.typecast_model == "ssfm-v21"
                    else {"emotion_type": "smart"}
                ),
                "output": {"audio_format": "wav", "audio_tempo": 1.3, "audio_pitch": 0},
            },
        )
        with anyio.fail_after(max(0, min(15, end_time - anyio.current_time()))):
            upstream = await client.send(provider_request, stream=True)
        if not upstream.is_success:
            logger.warning(
                "Typecast TTS failed request_id=%r upstream_status=%d elapsed_ms=%.0f",
                request.state.request_id, upstream.status_code, (anyio.current_time() - started) * 1000,
            )
            raise APIError(
                502, "TTS_FAILED", "Speech synthesis failed.",
                diagnostics=TTSDiagnostics(reason="provider_http_error", upstream_status=upstream.status_code),
            )

        async def chunks():
            iterator = upstream.aiter_bytes()
            try:
                while True:
                    remaining = end_time - anyio.current_time()
                    with anyio.fail_after(max(0, remaining)):
                        chunk = await iterator.__anext__()
                    yield chunk
            except StopAsyncIteration:
                pass
            except (httpx.RequestError, TimeoutError) as exc:
                logger.error(
                    "Typecast TTS interrupted request_id=%r stage=audio_stream error=%s elapsed_ms=%.0f",
                    request.state.request_id, type(exc).__name__, (anyio.current_time() - started) * 1000,
                )
                raise
            finally:
                await cleanup()

        forwarded = True
        return StreamingResponse(
            chunks(), media_type=upstream.headers.get("content-type", "application/octet-stream"),
            headers={"Cache-Control": "no-store"}, background=BackgroundTask(cleanup),
        )
    except (httpx.TimeoutException, TimeoutError) as exc:
        logger.warning(
            "Typecast TTS timeout request_id=%r stage=response_headers error=%s elapsed_ms=%.0f",
            request.state.request_id, type(exc).__name__, (anyio.current_time() - started) * 1000,
        )
        raise APIError(
            504, "TTS_TIMEOUT", "Speech synthesis timed out.",
            diagnostics=TTSDiagnostics(reason="timeout"),
        ) from exc
    except httpx.RequestError as exc:
        logger.warning(
            "Typecast TTS failed request_id=%r transport_error=%s elapsed_ms=%.0f",
            request.state.request_id, type(exc).__name__, (anyio.current_time() - started) * 1000,
        )
        raise APIError(
            502, "TTS_FAILED", "Speech synthesis failed.",
            diagnostics=TTSDiagnostics(reason="transport_error"),
        ) from exc
    finally:
        if not forwarded:
            await cleanup()
