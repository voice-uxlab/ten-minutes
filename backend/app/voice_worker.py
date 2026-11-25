"""Close persisted OpenAI calls when the server deadline passes."""
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from time import sleep

import httpx
from sqlalchemy import select, update

from .config import get_settings
from .database import transaction
from .models import Consultation, RealtimeCall, VoiceWorkerHeartbeat
from .voice import hangup

logger = logging.getLogger(__name__)


def due_calls() -> list[str]:
    now = datetime.now(timezone.utc)
    with transaction() as db:
        db.execute(update(VoiceWorkerHeartbeat).where(VoiceWorkerHeartbeat.id == 1).values(seen_at=now))
        return list(db.scalars(
            select(RealtimeCall.id)
            .where(RealtimeCall.closed_at.is_(None), RealtimeCall.hangup_at <= now)
            .order_by(RealtimeCall.hangup_at)
            .limit(64)
        ))


def close_due_call(call_id: str, api_key: str) -> None:
    try:
        with httpx.Client(timeout=5) as client:
            if not hangup(client, call_id, api_key):
                logger.warning("Voice provider rejected a pending hangup")
                return
        now = datetime.now(timezone.utc)
        with transaction() as db:
            # Match the API's lock order: consultation first, call records second.
            consultation = db.scalar(select(Consultation).join(
                RealtimeCall, RealtimeCall.consultation_id == Consultation.id
            ).where(RealtimeCall.id == call_id).with_for_update(of=Consultation))
            if consultation is None:
                return
            call = db.get(RealtimeCall, call_id)
            if call.closed_at is None:
                call.closed_at = now
            if consultation.call_ends_at <= now and consultation.ended_at is None:
                consultation.status = "ENDED"
                consultation.ended_at = consultation.call_ends_at
                consultation.end_reason = "TIMEOUT"
    except httpx.RequestError:
        logger.warning("Voice provider hangup unavailable; will retry")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    api_key = get_settings().openai_api_key
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is required for the voice worker.")
    with ThreadPoolExecutor(max_workers=16) as workers:
        inflight = {}
        while True:
            for call_id, job in list(inflight.items()):
                if job.done():
                    if job.exception():
                        logger.error("Voice worker failed to finish a hangup; will retry")
                    del inflight[call_id]
            try:
                for call_id in due_calls():
                    if len(inflight) == 16:
                        break
                    if call_id not in inflight:
                        inflight[call_id] = workers.submit(close_due_call, call_id, api_key)
            except Exception:
                logger.error("Voice worker failed to read pending hangups; will retry")
            sleep(1)


if __name__ == "__main__":
    main()
