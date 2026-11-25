import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .errors import APIError
from .models import (
    Consultation,
    RealtimeCall,
    User,
    VoiceAccountUsage,
    ensure_utc,
    uuid_string,
)
from .voice_tasks import schedule_voice_hangup

OPENAI_CALLS = "https://api.openai.com/v1/realtime/calls"
PROMPTS = Path(__file__).parent / "prompts"
INSTRUCTIONS = (PROMPTS / "tarot_reader.md").read_text(encoding="utf-8")
TOOLS = json.loads((PROMPTS / "realtime_tools.json").read_text(encoding="utf-8"))


def active_consultation(consultation: Consultation, now: datetime) -> None:
    if consultation.status in {"ENDED", "ENDING", "FAILED"}:
        raise APIError(409, "CONSULTATION_STATE_CONFLICT", "The consultation has ended.")
    if get_settings().voice_deadline_enabled and consultation.call_ends_at <= now:
        raise APIError(409, "CONSULTATION_EXPIRED", "The ten-minute consultation has expired.")


def lock_account(db: Session, user_id: str) -> None:
    db.scalar(select(User.id).where(User.id == user_id).with_for_update())


def lock_consultation(db: Session, consultation_id: str, user_id: str) -> Consultation:
    consultation = db.scalar(
        select(Consultation).where(
            Consultation.id == consultation_id, Consultation.user_id == user_id,
        ).with_for_update().execution_options(populate_existing=True)
    )
    if consultation is None:
        raise APIError(404, "CONSULTATION_NOT_FOUND", "The consultation was not found.")
    return consultation


def locked_daily_usage(db: Session, user_id: str, now: datetime) -> VoiceAccountUsage:
    # The caller holds the account row lock, including when the daily row is absent.
    usage = db.get(VoiceAccountUsage, (user_id, now.date()))
    if usage is None:
        usage = VoiceAccountUsage(user_id=user_id, utc_day=now.date(),
                                  connection_attempts=0, tts_characters=0)
        db.add(usage)
    return usage


def reserve_connection(
    db: Session, consultation_id: str, user_id: str, settings: Settings
) -> tuple[str, list[str], Optional[datetime]]:
    lock_account(db, user_id)
    consultation = lock_consultation(db, consultation_id, user_id)
    now = datetime.now(timezone.utc)
    active_consultation(consultation, now)
    if consultation.voice_reservation_until and ensure_utc(consultation.voice_reservation_until) > now:
        raise APIError(409, "VOICE_CONNECTION_PENDING", "A voice connection is already being created.")
    active_id = db.scalar(
        select(Consultation.id)
        .where(
            Consultation.user_id == user_id,
            Consultation.id != consultation_id,
            (Consultation.voice_reservation_until > now)
            | select(RealtimeCall.id).where(
                RealtimeCall.consultation_id == Consultation.id,
                RealtimeCall.closed_at.is_(None),
            ).exists(),
        )
        .limit(1)
    )
    if active_id:
        raise APIError(409, "VOICE_ALREADY_ACTIVE", "Another voice call is still active for this account.")
    usage = locked_daily_usage(db, user_id, now)
    if (consultation.voice_connection_attempts >= settings.voice_connections_per_consultation
            or usage.connection_attempts >= settings.voice_connections_per_account_day):
        raise APIError(429, "VOICE_CONNECTION_LIMIT", "The voice connection limit has been reached.")
    prior = list(db.scalars(select(RealtimeCall.id).where(
        RealtimeCall.consultation_id == consultation_id, RealtimeCall.closed_at.is_(None)
    )))
    reservation = uuid_string()
    usage.connection_attempts += 1
    consultation.voice_connection_attempts += 1
    consultation.voice_reservation = reservation
    # Keep the lease visible if the deadline passes during the upstream handshake.
    consultation.voice_reservation_until = now + timedelta(seconds=60)
    deadline = consultation.call_ends_at if settings.voice_deadline_enabled else None
    db.commit()
    return reservation, prior, deadline


def hangup(client: httpx.Client, call_id: str, api_key: str) -> bool:
    response = client.post(f"{OPENAI_CALLS}/{call_id}/hangup", headers={"Authorization": f"Bearer {api_key}"})
    return response.is_success or response.status_code in {404, 410}


def close_record(db: Session, call_id: str) -> None:
    call = db.get(RealtimeCall, call_id)
    if call and call.closed_at is None:
        call.closed_at = datetime.now(timezone.utc)
        db.commit()


def create_voice_connection(
    db: Session, consultation_id: str, user_id: str, offer: str, settings: Settings
) -> str:
    reservation, prior_calls, deadline = reserve_connection(db, consultation_id, user_id, settings)
    try:
        if deadline is not None:
            schedule_voice_hangup(settings, consultation_id, deadline)
            if datetime.now(timezone.utc) >= deadline:
                raise APIError(409, "CONSULTATION_EXPIRED", "The ten-minute consultation has expired.")
        with httpx.Client(timeout=10) as client:
            for prior in prior_calls:
                if not hangup(client, prior, settings.openai_api_key):
                    raise APIError(502, "REALTIME_HANGUP_FAILED", "The previous voice connection could not be closed.")
                close_record(db, prior)
                db.rollback()
            response = client.post(
                OPENAI_CALLS,
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                files={
                    "sdp": (None, offer, "application/sdp"),
                    "session": (None, json.dumps({
                        "type": "realtime",
                        "model": settings.openai_realtime_model,
                        "instructions": INSTRUCTIONS,
                        "tools": TOOLS,
                        "output_modalities": ["text"],
                        "audio": {"input": {
                            "turn_detection": {"type": "semantic_vad", "eagerness": "medium"},
                            "transcription": {"model": "gpt-4o-mini-transcribe", "language": "ko"},
                        }},
                    }), "application/json"),
                },
            )
            if not response.is_success:
                raise APIError(502, "REALTIME_CONNECTION_FAILED", "Failed to establish the voice connection.")
            location = urlsplit(response.headers.get("location", "")).path
            match = re.fullmatch(r"/v1/realtime/calls/(rtc_[a-zA-Z0-9_-]{1,124})", location)
            if not match:
                raise APIError(502, "REALTIME_INVALID_RESPONSE", "The voice provider did not return a valid call ID.")
            call_id = match[1]
            try:
                consultation = lock_consultation(db, consultation_id, user_id)
                now = datetime.now(timezone.utc)
                accepted = (
                    consultation.voice_reservation == reservation
                    and consultation.status not in {"ENDED", "ENDING", "FAILED"}
                    and (deadline is None or deadline > now)
                    and response.text.startswith("v=0")
                )
                hangup_at = deadline or datetime.max.replace(tzinfo=timezone.utc)
                db.add(RealtimeCall(id=call_id, consultation_id=consultation_id,
                                    hangup_at=hangup_at if accepted else now))
                if accepted and consultation.status == "CREATED":
                    consultation.status = "CONNECTING"
                db.commit()
            except Exception:
                db.rollback()
                hangup(client, call_id, settings.openai_api_key)
                raise
            if not accepted:
                if hangup(client, call_id, settings.openai_api_key):
                    close_record(db, call_id)
                raise APIError(409, "VOICE_CONNECTION_CLOSED", "The consultation is no longer available for this connection.")
            return response.text
    except httpx.TimeoutException as exc:
        raise APIError(504, "REALTIME_CONNECTION_TIMEOUT", "The voice connection timed out.") from exc
    except httpx.RequestError as exc:
        raise APIError(502, "REALTIME_CONNECTION_FAILED", "Failed to establish the voice connection.") from exc
    finally:
        db.rollback()
        consultation = lock_consultation(db, consultation_id, user_id)
        if consultation.voice_reservation == reservation:
            consultation.voice_reservation = None
            consultation.voice_reservation_until = None
            db.commit()


def close_scheduled_consultation(db: Session, consultation_id: str, api_key: str) -> None:
    consultation = db.scalar(
        select(Consultation).where(Consultation.id == consultation_id).with_for_update()
    )
    if consultation is None:
        return
    now = datetime.now(timezone.utc)
    if consultation.ended_at is None:
        if consultation.call_ends_at > now:
            raise APIError(503, "VOICE_HANGUP_NOT_DUE", "The voice hangup is not yet due.")
        consultation.status = "ENDED"
        consultation.ended_at = consultation.call_ends_at
        consultation.end_reason = "TIMEOUT"

    pending = consultation.voice_reservation_until
    call_ids = list(db.scalars(select(RealtimeCall.id).where(
        RealtimeCall.consultation_id == consultation_id, RealtimeCall.closed_at.is_(None),
    )))
    db.commit()
    try:
        with httpx.Client(timeout=5) as client:
            for call_id in call_ids:
                if not hangup(client, call_id, api_key):
                    raise APIError(503, "VOICE_HANGUP_RETRY", "Could not close the Realtime call.")
                close_record(db, call_id)
    except httpx.RequestError as exc:
        raise APIError(503, "VOICE_HANGUP_RETRY", "Could not close the Realtime call.") from exc
    if pending and ensure_utc(pending) > now:
        raise APIError(503, "VOICE_HANGUP_PENDING_CONNECTION", "A voice connection is still being created.")


def reserve_tts(
    db: Session, consultation_id: str, user_id: str, characters: int, settings: Settings
) -> tuple[str, Optional[float]]:
    lock_account(db, user_id)
    consultation = lock_consultation(db, consultation_id, user_id)
    now = datetime.now(timezone.utc)
    active_consultation(consultation, now)
    if not db.scalar(select(RealtimeCall.id).where(
        RealtimeCall.consultation_id == consultation_id,
        RealtimeCall.closed_at.is_(None), RealtimeCall.hangup_at > now,
    ).limit(1)):
        raise APIError(409, "VOICE_CONNECTION_REQUIRED", "An active voice connection is required.")
    leases = {key: deadline for key, deadline in consultation.tts_leases.items() if deadline > now.timestamp()}
    usage = locked_daily_usage(db, user_id, now)
    if (len(leases) >= settings.tts_parallel_requests
            or consultation.tts_characters + characters > settings.tts_characters_per_consultation
            or usage.tts_characters + characters > settings.tts_characters_per_account_day):
        raise APIError(429, "TTS_USAGE_LIMIT", "The speech synthesis limit has been reached.")
    usage.tts_characters += characters
    lease = uuid_string()
    leases[lease] = now.timestamp() + 45
    consultation.tts_leases = leases
    consultation.tts_characters += characters
    db.commit()
    deadline = consultation.call_ends_at.timestamp() if settings.voice_deadline_enabled else None
    return lease, deadline


def release_tts(bind, consultation_id: str, lease: str) -> None:
    with Session(bind) as db, db.begin():
        consultation = db.scalar(select(Consultation).where(
            Consultation.id == consultation_id
        ).with_for_update())
        if consultation:
            consultation.tts_leases = {
                key: deadline for key, deadline in consultation.tts_leases.items() if key != lease
            }
