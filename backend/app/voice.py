import hashlib
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .errors import APIError
from .models import (
    Consultation,
    RealtimeCall,
    User,
    VoiceAccountUsage,
    ensure_utc,
    uuid_string,
)

VOICE_CONNECTION_HEADER = "X-Voice-Connection"
VOICE_IDLE_TIMEOUT = timedelta(minutes=2)

OPENAI_CALLS = "https://api.openai.com/v1/realtime/calls"
PROMPTS = Path(__file__).parent / "prompts"
TOOLS = json.loads((PROMPTS / "realtime_tools.json").read_text(encoding="utf-8"))


def active_consultation(consultation: Consultation) -> None:
    if consultation.status in {"ENDED", "ENDING", "FAILED"}:
        raise APIError(409, "CONSULTATION_STATE_CONFLICT", "The consultation has ended.")
    if consultation.call_ends_at <= datetime.now(timezone.utc):
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
) -> tuple[str, list[str]]:
    lock_account(db, user_id)
    consultation = lock_consultation(db, consultation_id, user_id)
    now = datetime.now(timezone.utc)
    active_consultation(consultation)
    pending = db.scalar(select(Consultation.id).where(
        Consultation.user_id == user_id, Consultation.voice_reservation_until > now,
    ).limit(1))
    if pending:
        raise APIError(409, "VOICE_CONNECTION_PENDING", "A voice connection is already being created.")
    usage = locked_daily_usage(db, user_id, now)
    if (consultation.voice_connection_attempts >= settings.voice_connections_per_consultation
            or usage.connection_attempts >= settings.voice_connections_per_account_day):
        raise APIError(429, "VOICE_CONNECTION_LIMIT", "The voice connection limit has been reached.")
    # Lock the consultations before their calls, in the same order as heartbeat and /end.
    open_call = select(RealtimeCall.id).where(
        RealtimeCall.consultation_id == Consultation.id, RealtimeCall.closed_at.is_(None),
    ).exists()
    previous = db.scalars(select(Consultation).where(
        Consultation.user_id == user_id, Consultation.id != consultation_id,
        open_call | Consultation.voice_reservation.is_not(None),
    ).order_by(Consultation.id).with_for_update()).all()
    for old in previous:
        old.voice_reservation = None
        old.voice_reservation_until = None
        if old.ended_at is None:
            old.status = "ENDED"
            old.ended_at = now
            old.end_reason = "USER"
    calls = db.scalars(select(RealtimeCall).where(
        RealtimeCall.consultation_id.in_([consultation_id, *(old.id for old in previous)]),
        RealtimeCall.closed_at.is_(None),
    ).order_by(RealtimeCall.id).with_for_update()).all()
    prior = []
    for call in calls:
        call.hangup_at = now
        prior.append(call.id)
    reservation = uuid_string()
    usage.connection_attempts += 1
    consultation.voice_connection_attempts += 1
    consultation.voice_reservation = reservation
    consultation.voice_reservation_until = now + timedelta(seconds=60)
    db.commit()
    return reservation, prior


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
) -> tuple[str, str]:
    prompt_id = settings.openai_realtime_prompt_id.strip()
    prompt_version = settings.openai_realtime_prompt_version.strip()
    if not re.fullmatch(r"pmpt_[A-Za-z0-9]+", prompt_id) or not re.fullmatch(
        r"[1-9][0-9]*", prompt_version
    ):
        raise APIError(
            503, "REALTIME_PROMPT_NOT_CONFIGURED",
            "Set a valid OPENAI_REALTIME_PROMPT_ID and OPENAI_REALTIME_PROMPT_VERSION.",
        )

    reservation, prior_calls = reserve_connection(db, consultation_id, user_id, settings)
    try:
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
                        "prompt": {"id": prompt_id, "version": prompt_version},
                        # Keep the tool contract aligned with the app's executor.
                        "tools": TOOLS,
                        "tool_choice": "auto",
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
                    and ensure_utc(consultation.voice_reservation_until) > now
                    and consultation.status not in {"ENDED", "ENDING", "FAILED"}
                    and consultation.call_ends_at > now
                    and response.text.startswith("v=0")
                )
                db.add(RealtimeCall(
                    id=call_id, consultation_id=consultation_id,
                    hangup_at=min(now + VOICE_IDLE_TIMEOUT, consultation.call_ends_at) if accepted else now,
                ))
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
            return response.text, connection_token(call_id)
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


def connection_token(call_id: str) -> str:
    return hashlib.sha256(call_id.encode()).hexdigest()


def renew_voice_connection(db: Session, consultation_id: str, user_id: str, token: str) -> None:
    consultation = lock_consultation(db, consultation_id, user_id)
    active_consultation(consultation)
    call = db.scalar(
        select(RealtimeCall)
        .where(
            RealtimeCall.consultation_id == consultation_id,
            RealtimeCall.closed_at.is_(None),
        )
        .order_by(RealtimeCall.hangup_at.desc())
        .limit(1)
        .with_for_update()
    )
    now = datetime.now(timezone.utc)
    if (
        call is None
        or ensure_utc(call.hangup_at) <= now
        or not secrets.compare_digest(connection_token(call.id), token)
    ):
        raise APIError(409, "VOICE_CONNECTION_INACTIVE", "This voice connection is no longer active.")
    call.hangup_at = min(now + VOICE_IDLE_TIMEOUT, consultation.call_ends_at)
    db.commit()


def close_inactive_voice_calls(db: Session, api_key: str) -> None:
    now = datetime.now(timezone.utc)
    # An expired lease cannot be renewed. Holding the DB connection during provider I/O is unnecessary.
    call_ids = list(db.scalars(
        select(RealtimeCall.id)
        .where(RealtimeCall.closed_at.is_(None), RealtimeCall.hangup_at <= now)
        .order_by(RealtimeCall.hangup_at, RealtimeCall.id)
        .limit(6)
        .with_for_update(skip_locked=True)
    ))
    db.rollback()
    failed = False
    with httpx.Client(timeout=3) as client:
        for call_id in call_ids:
            try:
                closed = hangup(client, call_id, api_key)
            except httpx.RequestError:
                closed = False
            if closed:
                close_record(db, call_id)
            else:
                failed = True
    if failed:
        raise APIError(503, "VOICE_HANGUP_RETRY", "Some inactive voice connections are still open.")


def close_consultation_calls(db: Session, consultation_id: str, api_key: str) -> None:
    consultation = db.scalar(
        select(Consultation).where(Consultation.id == consultation_id).with_for_update()
    )
    if consultation is None:
        return
    now = datetime.now(timezone.utc)

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
) -> str:
    lock_account(db, user_id)
    consultation = lock_consultation(db, consultation_id, user_id)
    now = datetime.now(timezone.utc)
    active_consultation(consultation)
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
    return lease


def release_tts(bind, consultation_id: str, lease: str) -> None:
    with Session(bind) as db, db.begin():
        consultation = db.scalar(select(Consultation).where(
            Consultation.id == consultation_id
        ).with_for_update())
        if consultation:
            consultation.tts_leases = {
                key: deadline for key, deadline in consultation.tts_leases.items() if key != lease
            }
