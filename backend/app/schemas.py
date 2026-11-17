from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AddressingMode(str, Enum):
    DEFAULT = "DEFAULT"
    CUSTOM = "CUSTOM"


class SpreadType(str, Enum):
    TIMELINE = "TIMELINE"
    SITUATION = "SITUATION"
    RELATIONSHIP = "RELATIONSHIP"
    DECISION = "DECISION"


class ConsultationStatus(str, Enum):
    CREATED = "CREATED"
    CONNECTING = "CONNECTING"
    ACTIVE = "ACTIVE"
    DISCONNECTED = "DISCONNECTED"
    ENDING = "ENDING"
    ENDED = "ENDED"
    FAILED = "FAILED"


class CardDirection(str, Enum):
    UPRIGHT = "UPRIGHT"
    REVERSED = "REVERSED"


class ReportStatus(str, Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


SPREAD_POSITIONS = {
    SpreadType.TIMELINE: ["과거", "현재", "미래"],
    SpreadType.SITUATION: ["현 상태", "장애물", "대응책/조언"],
    SpreadType.RELATIONSHIP: ["나", "상대", "관계 흐름"],
    SpreadType.DECISION: ["선택지 A", "선택지 B", "조언"],
}


class CurrentUserResponse(StrictModel):
    id: UUID
    addressing_mode: AddressingMode
    nickname: Optional[str]
    provider: Optional[str]
    onboarding_required: bool
    created_at: datetime


class UpdateCurrentUserRequest(StrictModel):
    addressing_mode: AddressingMode
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=40)
    consent_version: str = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def validate_nickname(self):
        if self.addressing_mode == AddressingMode.CUSTOM and not (self.nickname or "").strip():
            raise ValueError("CUSTOM 호칭에는 nickname이 필요합니다.")
        if self.addressing_mode == AddressingMode.DEFAULT:
            self.nickname = None
        elif self.nickname:
            self.nickname = self.nickname.strip()
        return self


class CreateConsultationRequest(StrictModel):
    consent_version: str = Field(min_length=1, max_length=40)


class CardResponse(StrictModel):
    slot: int
    picked_number: int
    position: str
    revealed: bool
    card_id: Optional[int]
    card_code: Optional[str]
    name: Optional[str]
    direction: Optional[CardDirection]
    image_url: Optional[str]
    keywords: Optional[list[str]]
    revealed_at: Optional[datetime]


class ReportCardResponse(CardResponse):
    reading: str


class ConsultationResponse(StrictModel):
    id: UUID
    status: ConsultationStatus
    question: Optional[str]
    spread_type: Optional[SpreadType]
    deck_size: int
    expected_card_count: int
    cards: list[CardResponse]
    report_status: Optional[ReportStatus]
    created_at: datetime
    ended_at: Optional[datetime]


class ConsultationListItem(StrictModel):
    id: UUID
    question: Optional[str]
    spread_type: Optional[SpreadType]
    status: ConsultationStatus
    expected_card_count: int
    report_status: Optional[ReportStatus]
    situation_summary: Optional[str]
    thumbnail_image_url: Optional[str]
    created_at: datetime
    ended_at: Optional[datetime]


class ConsultationListResponse(StrictModel):
    items: list[ConsultationListItem]
    next_cursor: Optional[str]


class CardSelectionRequest(StrictModel):
    question: str = Field(min_length=1, max_length=300)
    spread_type: SpreadType
    positions: Optional[list[str]] = None
    picks: list[int]

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("질문을 입력해 주세요.")
        return value

    @field_validator("picks")
    @classmethod
    def unique_picks(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("카드 번호는 중복될 수 없습니다.")
        if any(number < 1 or number > 78 for number in value):
            raise ValueError("카드 번호는 1부터 78까지입니다.")
        return value


class CardSelectionResponse(StrictModel):
    question: str
    spread_type: SpreadType
    cards: list[CardResponse]


class CardRevealResponse(StrictModel):
    card: CardResponse


class EndConsultationRequest(StrictModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def valid_reason(cls, value: str) -> str:
        if value not in {"USER", "TIMEOUT", "ERROR"}:
            raise ValueError("지원하지 않는 종료 사유입니다.")
        return value


class CardReading(StrictModel):
    slot: int = Field(ge=1, le=10)
    text: str = Field(min_length=1, max_length=1000)


class SaveReportRequest(StrictModel):
    situation_summary: str = Field(min_length=1, max_length=500)
    readings: list[CardReading]
    queen_line: str = Field(min_length=1, max_length=300)


class ReportResponse(StrictModel):
    consultation_id: UUID
    status: ReportStatus
    spread_type: SpreadType
    consulted_at: datetime
    question: str
    cards: list[ReportCardResponse]
    situation_summary: str
    readings: list[CardReading]
    queen_line: str
    created_at: datetime


class CreateShareLinkRequest(StrictModel):
    hook_text: str = Field(min_length=1, max_length=100)

    @field_validator("hook_text")
    @classmethod
    def strip_hook(cls, value: str) -> str:
        return value.strip()


class SharePreviewResponse(StrictModel):
    title: str
    description: str
    image_url: Optional[str]


class ShareLinkResponse(StrictModel):
    token: str
    share_path: str
    share_url: str
    hook_text: str
    cta_text: str = "나도 해보기"
    preview: SharePreviewResponse


class PublicShareResponse(StrictModel):
    hook_text: str
    cta_text: str
    cta_path: str
    cta_url: str
    preview: SharePreviewResponse
    created_at: datetime


class ClientEventRequest(StrictModel):
    event: str
    occurred_at: datetime
    stage: Optional[str] = None
    reason_code: Optional[str] = Field(default=None, max_length=80)
    duration_ms: Optional[int] = Field(default=None, ge=0)
    slot: Optional[int] = Field(default=None, ge=1, le=10)

    @field_validator("event")
    @classmethod
    def valid_event(cls, value: str) -> str:
        allowed = {
            "FLOW_STAGE_ENTERED", "REALTIME_CONNECTION_FAILED", "REALTIME_DISCONNECTED",
            "RECONNECT_ATTEMPTED", "RECONNECT_SUCCEEDED", "TTS_FAILED",
            "TTS_PLAYBACK_CANCELLED", "PAGE_HIDDEN",
        }
        if value not in allowed:
            raise ValueError("지원하지 않는 이벤트입니다.")
        return value

    @model_validator(mode="after")
    def validate_stage(self):
        if self.event == "FLOW_STAGE_ENTERED" and not self.stage:
            raise ValueError("FLOW_STAGE_ENTERED에는 stage가 필요합니다.")
        return self


class ClientEventResponse(StrictModel):
    event_id: UUID
    stored_at: datetime


class RealtimeCredentialRequest(StrictModel):
    connection_reason: str

    @field_validator("connection_reason")
    @classmethod
    def valid_reason(cls, value: str) -> str:
        if value not in {"INITIAL", "RECONNECT"}:
            raise ValueError("지원하지 않는 연결 사유입니다.")
        return value


class RealtimeCredentialResponse(StrictModel):
    client_secret: str
    expires_at: int
    realtime_model: str


class TTSRequest(StrictModel):
    response_id: str = Field(min_length=1, max_length=200)
    segment_index: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=500)
