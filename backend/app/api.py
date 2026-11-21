import hashlib
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, Path as PathParameter, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import current_user
from .config import Settings, get_settings
from .database import get_db
from .errors import APIError
from .models import (
    Consultation,
    ConsultationCard,
    ConsultationEvent,
    ConsultationReport,
    ShareLink,
    TarotCard,
    User,
    ensure_utc,
)
from .openapi import AUTHENTICATED_RESPONSES, PUBLIC_RESPONSES, error_response
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
    RealtimeCredentialRequest,
    RealtimeCredentialResponse,
    ReportResponse,
    SPREAD_POSITIONS,
    SaveReportRequest,
    ShareLinkResponse,
    TTSRequest,
    UpdateCurrentUserRequest,
)
from .serializers import (
    card_response,
    consultation_response,
    public_origin,
    report_response,
    user_response,
)


router = APIRouter(prefix="/api/v1", responses=AUTHENTICATED_RESPONSES)
public_router = APIRouter(prefix="/api/v1", tags=["shares"], responses=PUBLIC_RESPONSES)
PROMPT_PATH = Path(__file__).parent / "prompts" / "tarot_reader.md"

CONSULTATION_NOT_FOUND_RESPONSE = error_response(
    404,
    examples={
        "consultation_not_found": ("CONSULTATION_NOT_FOUND", "The consultation was not found."),
    },
)
VALIDATION_RESPONSE = error_response(422)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def owned_consultation(db: Session, consultation_id: UUID, user: User) -> Consultation:
    consultation = db.scalar(
        select(Consultation).where(
            Consultation.id == str(consultation_id), Consultation.user_id == user.id
        )
    )
    if not consultation:
        raise APIError(404, "CONSULTATION_NOT_FOUND", "The consultation was not found.")
    return consultation


def shuffled_deck(db: Session) -> list[dict]:
    card_ids = list(db.scalars(select(TarotCard.id).order_by(TarotCard.id)))
    if len(card_ids) != 78:
        raise APIError(503, "TAROT_DECK_NOT_READY", "The tarot deck is not ready.")
    random = secrets.SystemRandom()
    random.shuffle(card_ids)
    return [{"card_id": card_id, "reversed": bool(random.getrandbits(1))} for card_id in card_ids]


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
                "thumbnail_image_url": next(
                    (
                        card_response(card)["image_url"]
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
    consultation = owned_consultation(db, consultation_id, user)
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
    if consultation.status in {"ENDED", "FAILED"}:
        raise APIError(409, "CONSULTATION_STATE_CONFLICT", "Cards cannot be selected for an ended consultation.")
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
                direction="REVERSED" if mapped["reversed"] else "UPRIGHT",
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
    consultation = owned_consultation(db, consultation_id, user)
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
        card.revealed_at = datetime.now(timezone.utc)
        db.commit()
    return {"card": card_response(card)}


@router.post(
    "/consultations/{consultation_id}/end",
    response_model=ConsultationResponse,
    tags=["consultations"],
    summary="End consultation",
    description="Stores the termination reason and timestamp. Returns the existing result when the consultation has already ended.",
    responses={404: CONSULTATION_NOT_FOUND_RESPONSE, 422: VALIDATION_RESPONSE},
)
def end_consultation(
    body: EndConsultationRequest,
    consultation_id: UUID = PathParameter(description="Consultation ID to end"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user)
    if consultation.status != "ENDED":
        consultation.status = "ENDED"
        consultation.end_reason = body.reason
        consultation.ended_at = datetime.now(timezone.utc)
        db.commit()
    return consultation_response(consultation)


@router.put(
    "/consultations/{consultation_id}/report",
    response_model=ReportResponse,
    status_code=201,
    tags=["reports"],
    summary="Save report",
    description="Stores the situation summary, per-card readings, and closing message after every card is revealed. Retrying the same request returns the existing result with status 200.",
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
    consultation = owned_consultation(db, consultation_id, user)
    if not consultation.cards or any(card.revealed_at is None for card in consultation.cards):
        raise APIError(409, "CARDS_NOT_FULLY_REVEALED", "Reveal every card in order before saving the report.")
    expected_slots = list(range(1, consultation.expected_card_count + 1))
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


def active_voice_consultation(db: Session, consultation_id: UUID, user: User) -> Consultation:
    consultation = owned_consultation(db, consultation_id, user)
    if consultation.status in {"ENDED", "ENDING", "FAILED"}:
        raise APIError(409, "CONSULTATION_STATE_CONFLICT", "Audio cannot be generated for an ended consultation.")
    return consultation


@router.post(
    "/consultations/{consultation_id}/realtime-credentials",
    response_model=RealtimeCredentialResponse,
    status_code=201,
    tags=["voice"],
    summary="Issue OpenAI Realtime client secret",
    description="Issues a short-lived client secret for a direct browser connection to OpenAI Realtime over WebRTC.",
    responses={
        404: CONSULTATION_NOT_FOUND_RESPONSE,
        409: error_response(
            409,
            examples={"state_conflict": ("CONSULTATION_STATE_CONFLICT", "Audio cannot be generated for an ended consultation.")},
        ),
        422: VALIDATION_RESPONSE,
        502: error_response(502),
        503: error_response(
            503,
            examples={"openai_not_configured": ("OPENAI_NOT_CONFIGURED", "OpenAI Realtime is not configured.")},
        ),
        504: error_response(504),
    },
)
async def realtime_credentials(
    body: RealtimeCredentialRequest,
    consultation_id: UUID = PathParameter(description="Consultation ID used to prepare the Realtime connection"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    del body
    consultation = active_voice_consultation(db, consultation_id, user)
    if not settings.openai_api_key:
        raise APIError(503, "OPENAI_NOT_CONFIGURED", "OpenAI Realtime is not configured.")
    instructions = PROMPT_PATH.read_text(encoding="utf-8")
    payload = {
        "session": {
            "type": "realtime",
            "model": settings.openai_realtime_model,
            "instructions": instructions,
            "output_modalities": ["text"],
            "audio": {
                "input": {
                    "turn_detection": {"type": "semantic_vad", "eagerness": "medium"},
                    "transcription": {"model": "gpt-4o-mini-transcribe", "language": "ko"},
                }
            },
        }
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            upstream = await client.post(
                "https://api.openai.com/v1/realtime/client_secrets",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json=payload,
            )
    except httpx.TimeoutException:
        raise APIError(504, "REALTIME_CREDENTIAL_TIMEOUT", "Preparing the Realtime connection timed out.")
    if not upstream.is_success:
        raise APIError(502, "REALTIME_CREDENTIAL_FAILED", "Failed to prepare the Realtime connection.")
    data = upstream.json()
    secret = data.get("value") or data.get("client_secret", {}).get("value")
    expires_at = data.get("expires_at") or data.get("client_secret", {}).get("expires_at")
    if not secret or not expires_at:
        raise APIError(502, "REALTIME_INVALID_RESPONSE", "OpenAI Realtime returned an invalid response.")
    consultation.status = "CONNECTING"
    db.commit()
    return {"client_secret": secret, "expires_at": expires_at, "realtime_model": settings.openai_realtime_model}


@router.post(
    "/consultations/{consultation_id}/tts/stream",
    tags=["voice"],
    summary="Stream Typecast audio",
    description="Sends one segment of an OpenAI text response to Typecast and streams the synthesized audio to the client.",
    responses={
        200: {
            "description": "Audio byte stream using the Content-Type returned by Typecast",
            "content": {"audio/mpeg": {"schema": {"type": "string", "format": "binary"}}},
        },
        404: CONSULTATION_NOT_FOUND_RESPONSE,
        409: error_response(
            409,
            examples={"state_conflict": ("CONSULTATION_STATE_CONFLICT", "Audio cannot be generated for an ended consultation.")},
        ),
        422: VALIDATION_RESPONSE,
        502: error_response(502),
        503: error_response(
            503,
            examples={"typecast_not_configured": ("TYPECAST_NOT_CONFIGURED", "Typecast speech synthesis is not configured.")},
        ),
        504: error_response(504),
    },
)
async def tts_stream(
    body: TTSRequest,
    consultation_id: UUID = PathParameter(description="Active consultation ID for audio synthesis"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    _request_order = (body.response_id, body.segment_index)
    del _request_order
    active_voice_consultation(db, consultation_id, user)
    if not settings.typecast_api_key or not settings.typecast_voice_id:
        raise APIError(503, "TYPECAST_NOT_CONFIGURED", "Typecast speech synthesis is not configured.")
    client = httpx.AsyncClient(timeout=30)
    request = client.build_request(
        "POST",
        "https://api.typecast.ai/v1/text-to-speech/stream",
        headers={"X-API-KEY": settings.typecast_api_key},
        json={
            "voice_id": settings.typecast_voice_id,
            "model": settings.typecast_model,
            "language": "kor",
            "text": body.text,
        },
    )
    try:
        upstream = await client.send(request, stream=True)
    except httpx.TimeoutException:
        await client.aclose()
        raise APIError(504, "TTS_TIMEOUT", "Speech synthesis timed out.")
    if not upstream.is_success:
        await upstream.aclose()
        await client.aclose()
        raise APIError(502, "TTS_FAILED", "Speech synthesis failed.")

    async def chunks():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        chunks(), media_type=upstream.headers.get("content-type", "application/octet-stream")
    )
