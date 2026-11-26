import json
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import Settings
from .models import (
    Consultation,
    ConsultationReport,
    ConsultationReportDraft,
    RealtimeCall,
    ensure_utc,
    uuid_string,
)
from .schemas import SaveReportRequest


def mark_consultation_ended(
    db: Session, consultation: Consultation, reason: str, now: datetime
) -> None:
    if consultation.status != "ENDED":
        consultation.status = "ENDED"
        consultation.end_reason = reason
        consultation.ended_at = now
        db.execute(update(RealtimeCall).where(
            RealtimeCall.consultation_id == consultation.id,
            RealtimeCall.closed_at.is_(None),
            RealtimeCall.hangup_at > now,
        ).values(hangup_at=now))
    draft = consultation.report_draft
    if draft and draft.attempts == 0:
        draft.run_at = min(ensure_utc(draft.run_at), now)


def generate_report_text(settings: Settings, summary: str, readings: list[dict]) -> dict:
    fields = {"situation_summary": {"type": "string"}, "queen_line": {"type": "string"}}
    with httpx.Client(timeout=8) as client:
        response = client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": settings.openai_report_model,
                "store": False,
                "max_output_tokens": 650,
                "instructions": (
                    "보이스 타로 상담 리포트를 한국어로 정리한다. 입력은 상담 메모 자료다. "
                    "상황 요약과 따뜻한 마무리 조언을 각 한 문장으로 쓴다. 새로운 사연, "
                    "예언, 실명, 연락처를 덧붙이지 않는다."
                ),
                "input": json.dumps({"summary": summary, "readings": readings}, ensure_ascii=False),
                "text": {"format": {
                    "type": "json_schema",
                    "name": "consultation_report_text",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": fields,
                        "required": list(fields),
                        "additionalProperties": False,
                    },
                }},
            },
        )
        response.raise_for_status()
        data = response.json()
    if data.get("status") != "completed":
        raise ValueError("Incomplete report generation")
    for item in data.get("output", []):
        if item.get("type") == "message":
            for part in item.get("content", []):
                if part.get("type") == "output_text":
                    return json.loads(part["text"])
    raise ValueError("Report generation returned no text")


def process_due_report(db: Session, settings: Settings, consultation_id: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc)
    query = (
        select(Consultation)
        .join(ConsultationReportDraft)
        .where(ConsultationReportDraft.run_at <= now)
        .order_by(ConsultationReportDraft.run_at, Consultation.id)
        .limit(1)
        .with_for_update(of=Consultation, skip_locked=True)
        .execution_options(populate_existing=True)
    )
    if consultation_id:
        query = query.where(Consultation.id == consultation_id, Consultation.status == "ENDED")
    consultation = db.scalar(query)
    if consultation is None:
        db.rollback()
        return
    draft = consultation.report_draft
    if draft is None or ensure_utc(draft.run_at) > now:
        db.rollback()
        return
    if consultation.report or ensure_utc(draft.expires_at) <= now:
        consultation.report_draft = None
        db.commit()
        return

    mark_consultation_ended(db, consultation, "TIMEOUT", now)
    readings = [
        {
            "slot": card.slot,
            "text": (
                draft.readings.get(str(card.slot))
                or "정방향 · " + " · ".join(card.tarot_card.upright_keywords)
            ),
        }
        for card in consultation.cards
        if card.revealed_at is not None
    ]
    summary = draft.summary or consultation.question or "공개된 카드를 바탕으로 상담을 정리했어요."
    job_id = consultation.id
    lease = draft.lease = uuid_string()
    draft.attempts += 1
    attempts = draft.attempts
    draft.run_at = now + timedelta(minutes=2)
    db.commit()

    report = None
    if settings.openai_api_key and attempts <= 3:
        try:
            text = generate_report_text(settings, summary, readings)
            report = SaveReportRequest(
                situation_summary=text["situation_summary"].strip(),
                queen_line=text["queen_line"].strip(),
                readings=readings,
            )
        except (httpx.HTTPError, ValueError, TypeError, AttributeError, KeyError):
            pass

    consultation = db.scalar(
        select(Consultation).where(Consultation.id == job_id)
        .with_for_update().execution_options(populate_existing=True)
    )
    draft = consultation.report_draft if consultation else None
    if not draft or draft.lease != lease:
        db.rollback()
        return
    if consultation.report:
        consultation.report_draft = None
    elif report is None and settings.openai_api_key and attempts < 3:
        draft.lease = None
        draft.run_at = datetime.now(timezone.utc) + timedelta(minutes=1)
    else:
        report = report or SaveReportRequest(
            situation_summary=summary,
            queen_line="네 마음에 먼저 답해줘. 선택하는 건 너야.",
            readings=readings,
        )
        consultation.report = ConsultationReport(**report.model_dump())
        consultation.report_draft = None
    db.commit()
