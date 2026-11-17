import hashlib
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, Query, Response
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
    User,
    ensure_utc,
)
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


router = APIRouter(prefix="/api/v1")
public_router = APIRouter(prefix="/api/v1", tags=["shares"])
PROMPT_PATH = Path(__file__).parent / "prompts" / "tarot_reader.md"


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def owned_consultation(db: Session, consultation_id: UUID, user: User) -> Consultation:
    consultation = db.scalar(
        select(Consultation).where(
            Consultation.id == str(consultation_id), Consultation.user_id == user.id
        )
    )
    if not consultation:
        raise APIError(404, "CONSULTATION_NOT_FOUND", "상담을 찾을 수 없습니다.")
    return consultation


def shuffled_deck() -> list[dict]:
    card_ids = list(range(78))
    random = secrets.SystemRandom()
    random.shuffle(card_ids)
    return [{"card_id": card_id, "reversed": bool(random.getrandbits(1))} for card_id in card_ids]


@router.get("/users/me", response_model=CurrentUserResponse, tags=["users"])
def get_me(user: User = Depends(current_user)):
    return user_response(user)


@router.patch("/users/me", response_model=CurrentUserResponse, tags=["users"])
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


@router.post("/consultations", response_model=ConsultationResponse, status_code=201, tags=["consultations"])
def create_consultation(
    body: CreateConsultationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    if not user.consent_version or user.consent_version != body.consent_version:
        raise APIError(409, "CONSENT_REQUIRED", "필수 동의가 필요합니다.")
    consultation = Consultation(
        user_id=user.id,
        deck_size=78,
        expected_card_count=settings.default_card_count,
        deck_order=shuffled_deck(),
    )
    db.add(consultation)
    db.commit()
    db.refresh(consultation)
    return consultation_response(consultation)


@router.get("/consultations", response_model=ConsultationListResponse, tags=["consultations"])
def list_consultations(
    limit: int = Query(default=20, ge=1, le=50),
    cursor: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    query = select(Consultation).where(Consultation.user_id == user.id)
    if cursor:
        cursor_item = db.scalar(
            select(Consultation).where(Consultation.id == str(cursor), Consultation.user_id == user.id)
        )
        if not cursor_item:
            raise APIError(400, "INVALID_CURSOR", "목록 커서가 올바르지 않습니다.")
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
                "thumbnail_image_url": None,
                "created_at": ensure_utc(item.created_at),
                "ended_at": ensure_utc(item.ended_at),
            }
            for item in items
        ],
        "next_cursor": items[-1].id if has_more else None,
    }


@router.get("/consultations/{consultation_id}", response_model=ConsultationResponse, tags=["consultations"])
def get_consultation(
    consultation_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return consultation_response(owned_consultation(db, consultation_id, user))


@router.post(
    "/consultations/{consultation_id}/card-selection",
    response_model=CardSelectionResponse,
    status_code=201,
    tags=["cards"],
)
def select_cards(
    consultation_id: UUID,
    body: CardSelectionRequest,
    response: Response,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    del idempotency_key
    consultation = owned_consultation(db, consultation_id, user)
    positions = SPREAD_POSITIONS[body.spread_type]
    if len(body.picks) != consultation.expected_card_count:
        raise APIError(422, "INVALID_CARD_COUNT", "선택할 카드 수가 올바르지 않습니다.")
    if body.positions is not None and body.positions != positions:
        raise APIError(422, "INVALID_SPREAD_POSITIONS", "배치 유형과 카드 자리가 일치하지 않습니다.")
    if consultation.cards:
        same = (
            consultation.question == body.question
            and consultation.spread_type == body.spread_type.value
            and [card.picked_number for card in consultation.cards] == body.picks
        )
        if not same:
            raise APIError(409, "CARD_SELECTION_LOCKED", "이미 확정된 카드 선택은 바꿀 수 없습니다.")
        response.status_code = 200
        return {
            "question": consultation.question,
            "spread_type": consultation.spread_type,
            "cards": [card_response(card) for card in consultation.cards],
        }
    if consultation.status in {"ENDED", "FAILED"}:
        raise APIError(409, "CONSULTATION_STATE_CONFLICT", "종료된 상담에서는 카드를 선택할 수 없습니다.")
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
        raise APIError(409, "CARD_SELECTION_CONFLICT", "카드 선택이 동시에 처리되었습니다. 다시 조회해 주세요.")
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
)
def reveal_card(
    consultation_id: UUID,
    slot: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user)
    if not consultation.cards:
        raise APIError(409, "CARD_SELECTION_REQUIRED", "카드를 먼저 선택해 주세요.")
    if slot < 1 or slot > consultation.expected_card_count:
        raise APIError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    card = next((item for item in consultation.cards if item.slot == slot), None)
    if not card:
        raise APIError(404, "CARD_NOT_FOUND", "카드를 찾을 수 없습니다.")
    if slot > 1:
        previous = next(item for item in consultation.cards if item.slot == slot - 1)
        if previous.revealed_at is None:
            raise APIError(409, "PREVIOUS_CARD_NOT_REVEALED", "앞 카드를 먼저 공개해 주세요.")
    if card.revealed_at is None:
        card.revealed_at = datetime.now(timezone.utc)
        db.commit()
    return {"card": card_response(card)}


@router.post("/consultations/{consultation_id}/end", response_model=ConsultationResponse, tags=["consultations"])
def end_consultation(
    consultation_id: UUID,
    body: EndConsultationRequest,
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
)
def save_report(
    consultation_id: UUID,
    body: SaveReportRequest,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user)
    if not consultation.cards or any(card.revealed_at is None for card in consultation.cards):
        raise APIError(409, "CARDS_NOT_FULLY_REVEALED", "모든 카드를 순서대로 공개한 뒤 리포트를 저장해 주세요.")
    expected_slots = list(range(1, consultation.expected_card_count + 1))
    if sorted(reading.slot for reading in body.readings) != expected_slots:
        raise APIError(422, "INVALID_REPORT_READINGS", "리포트 해석은 공개된 카드와 모두 일치해야 합니다.")
    normalized_readings = [reading.model_dump() for reading in sorted(body.readings, key=lambda item: item.slot)]
    if consultation.report:
        same = (
            consultation.report.situation_summary == body.situation_summary
            and consultation.report.readings == normalized_readings
            and consultation.report.queen_line == body.queen_line
        )
        if not same:
            raise APIError(409, "REPORT_LOCKED", "이미 저장된 리포트는 덮어쓸 수 없습니다.")
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
    "/consultations/{consultation_id}/report", response_model=ReportResponse, tags=["reports"]
)
def get_report(
    consultation_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user)
    if not consultation.report:
        raise APIError(404, "REPORT_NOT_FOUND", "리포트를 찾을 수 없습니다.")
    return report_response(consultation)


@router.post(
    "/consultations/{consultation_id}/share-links",
    response_model=ShareLinkResponse,
    status_code=201,
    tags=["shares"],
)
def create_share_link(
    consultation_id: UUID,
    body: CreateShareLinkRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    consultation = owned_consultation(db, consultation_id, user)
    if not consultation.report:
        raise APIError(409, "REPORT_REQUIRED", "리포트가 완성된 뒤 공유할 수 있습니다.")
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


@public_router.get("/shares/{token}", response_model=PublicShareResponse)
def get_public_share(
    token: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    share = db.scalar(
        select(ShareLink).where(ShareLink.token_hash == token_hash(token), ShareLink.is_active.is_(True))
    )
    if not share:
        raise APIError(404, "SHARE_NOT_FOUND", "공유 링크를 찾을 수 없습니다.")
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
)
def save_event(
    consultation_id: UUID,
    body: ClientEventRequest,
    response: Response,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    consultation = owned_consultation(db, consultation_id, user)
    if body.slot and body.slot > consultation.expected_card_count:
        raise APIError(422, "INVALID_EVENT_SLOT", "이벤트 카드 위치가 올바르지 않습니다.")
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
        raise APIError(409, "CONSULTATION_STATE_CONFLICT", "종료된 상담에서는 음성을 생성할 수 없습니다.")
    return consultation


@router.post(
    "/consultations/{consultation_id}/realtime-credentials",
    response_model=RealtimeCredentialResponse,
    status_code=201,
    tags=["voice"],
)
async def realtime_credentials(
    consultation_id: UUID,
    body: RealtimeCredentialRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    del body
    consultation = active_voice_consultation(db, consultation_id, user)
    if not settings.openai_api_key:
        raise APIError(503, "OPENAI_NOT_CONFIGURED", "OpenAI Realtime 연결이 아직 설정되지 않았습니다.")
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
        raise APIError(504, "REALTIME_CREDENTIAL_TIMEOUT", "음성 연결 준비 시간이 초과되었습니다.")
    if not upstream.is_success:
        raise APIError(502, "REALTIME_CREDENTIAL_FAILED", "음성 연결을 준비하지 못했습니다.")
    data = upstream.json()
    secret = data.get("value") or data.get("client_secret", {}).get("value")
    expires_at = data.get("expires_at") or data.get("client_secret", {}).get("expires_at")
    if not secret or not expires_at:
        raise APIError(502, "REALTIME_INVALID_RESPONSE", "음성 제공자의 응답이 올바르지 않습니다.")
    consultation.status = "CONNECTING"
    db.commit()
    return {"client_secret": secret, "expires_at": expires_at, "realtime_model": settings.openai_realtime_model}


@router.post("/consultations/{consultation_id}/tts/stream", tags=["voice"])
async def tts_stream(
    consultation_id: UUID,
    body: TTSRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    _request_order = (body.response_id, body.segment_index)
    del _request_order
    active_voice_consultation(db, consultation_id, user)
    if not settings.typecast_api_key or not settings.typecast_voice_id:
        raise APIError(503, "TYPECAST_NOT_CONFIGURED", "Typecast 음성 합성이 아직 설정되지 않았습니다.")
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
        raise APIError(504, "TTS_TIMEOUT", "음성 합성 시간이 초과되었습니다.")
    if not upstream.is_success:
        await upstream.aclose()
        await client.aclose()
        raise APIError(502, "TTS_FAILED", "음성을 합성하지 못했습니다.")

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
