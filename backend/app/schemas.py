from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorDetail(StrictModel):
    code: str = Field(description="Stable error code used by the frontend for error handling")
    message: str = Field(description="Human-readable error message")
    request_id: str = Field(description="Request identifier used to correlate Vercel and application logs")


class ErrorResponse(StrictModel):
    error: ErrorDetail = Field(description="Error details included in every JSON error response")


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


class Arcana(str, Enum):
    MAJOR = "MAJOR"
    MINOR = "MINOR"


class TarotSuit(str, Enum):
    WANDS = "WANDS"
    CUPS = "CUPS"
    SWORDS = "SWORDS"
    PENTACLES = "PENTACLES"


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
    id: UUID = Field(description="Internal user ID")
    addressing_mode: AddressingMode = Field(description="How the user is addressed during consultations")
    nickname: Optional[str] = Field(description="Display name used when addressing mode is CUSTOM")
    provider: Optional[str] = Field(description="Connected OAuth provider, or null when no identity is linked")
    onboarding_required: bool = Field(description="Whether display-name or required-consent setup is incomplete")
    consent_version: Optional[str] = Field(description="The last AI-processing consent version accepted by this user")
    created_at: datetime = Field(description="User creation timestamp in UTC ISO 8601 format")


class UpdateCurrentUserRequest(StrictModel):
    addressing_mode: AddressingMode = Field(description="Display-name mode: DEFAULT or CUSTOM")
    nickname: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=40,
        description="Display name required for CUSTOM mode. Stored as null for DEFAULT mode.",
        examples=["대장"],
    )
    consent_version: str = Field(
        min_length=1,
        max_length=40,
        description="Version of the AI-processing terms accepted by the user",
        examples=["2026-11"],
    )

    @model_validator(mode="after")
    def validate_nickname(self):
        if self.addressing_mode == AddressingMode.CUSTOM and not (self.nickname or "").strip():
            raise ValueError("nickname is required when addressing_mode is CUSTOM")
        if self.addressing_mode == AddressingMode.DEFAULT:
            self.nickname = None
        elif self.nickname:
            self.nickname = self.nickname.strip()
        return self


class CreateConsultationRequest(StrictModel):
    consent_version: str = Field(
        min_length=1,
        max_length=40,
        description="Consent version that must match the version stored for the current user",
        examples=["2026-11"],
    )


class CardResponse(StrictModel):
    slot: int = Field(description="One-based card slot within the consultation")
    picked_number: int = Field(description="Number from 1 to 78 selected by the user")
    position: str = Field(description="Position represented by the card in the spread")
    revealed: bool = Field(description="Whether the card has been revealed")
    card_id: Optional[int] = Field(description="Database ID of the revealed card, or null before reveal")
    card_code: Optional[str] = Field(description="Stable code of the revealed card, or null before reveal")
    name: Optional[str] = Field(description="Korean card name, or null before reveal")
    arcana: Optional[Arcana] = Field(description="MAJOR or MINOR, or null before reveal")
    suit: Optional[TarotSuit] = Field(description="Minor-arcana suit, or null for major and unrevealed cards")
    rank: Optional[str] = Field(description="Major number or minor rank, or null before reveal")
    direction: Optional[CardDirection] = Field(description="UPRIGHT, or null before reveal")
    keywords: Optional[list[str]] = Field(description="Upright keywords, or null before reveal")
    revealed_at: Optional[datetime] = Field(description="Card reveal timestamp, or null before reveal")


class ReportCardResponse(CardResponse):
    reading: str


class ConsultationResponse(StrictModel):
    id: UUID = Field(description="Consultation ID")
    status: ConsultationStatus = Field(description="Current consultation state")
    question: Optional[str] = Field(description="Confirmed question, or null before card selection")
    spread_type: Optional[SpreadType] = Field(description="Selected three-card spread type")
    deck_size: int = Field(description="Number of cards in the shuffled server deck; currently 78")
    expected_card_count: int = Field(description="Number of cards required by the consultation; currently 3")
    cards: list[CardResponse] = Field(description="Selected cards, or an empty array before selection")
    report_status: Optional[ReportStatus] = Field(description="Report state, or null when no report exists")
    created_at: datetime = Field(description="Consultation creation timestamp")
    ended_at: Optional[datetime] = Field(description="Consultation end timestamp, or null while active")
    call_ends_at: datetime = Field(description="Server deadline for the ten-minute call")


class ConsultationListItem(StrictModel):
    id: UUID = Field(description="Consultation ID")
    question: Optional[str] = Field(description="Confirmed consultation question")
    spread_type: Optional[SpreadType] = Field(description="Selected spread type")
    status: ConsultationStatus = Field(description="Consultation state")
    expected_card_count: int = Field(description="Number of cards required")
    report_status: Optional[ReportStatus] = Field(description="Report generation state")
    situation_summary: Optional[str] = Field(description="One-line situation summary from the report")
    thumbnail_card_code: Optional[str] = Field(
        description="Stable code of the first revealed card for frontend thumbnail lookup"
    )
    created_at: datetime = Field(description="Consultation creation timestamp")
    ended_at: Optional[datetime] = Field(description="Consultation end timestamp")


class ConsultationListResponse(StrictModel):
    items: list[ConsultationListItem] = Field(description="Consultations on the current page in reverse chronological order")
    next_cursor: Optional[str] = Field(description="Consultation ID used as the next-page cursor, or null on the last page")


class CardSelectionRequest(StrictModel):
    question: str = Field(
        min_length=1,
        max_length=300,
        description="Consultation question, trimmed before storage",
        examples=["연락 없는 그 사람을 기다릴까?"],
    )
    spread_type: SpreadType = Field(description="Three-card spread type selected for the question")
    positions: Optional[list[str]] = Field(
        default=None,
        description="Position names for the selected spread. Omit to use server defaults.",
    )
    picks: list[int] = Field(description="Three unique card numbers from 1 to 78", examples=[[7, 22, 51]])

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("question must not be blank")
        return value

    @field_validator("picks")
    @classmethod
    def unique_picks(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("card numbers must be unique")
        if any(number < 1 or number > 78 for number in value):
            raise ValueError("card numbers must be between 1 and 78")
        return value


class CardSelectionResponse(StrictModel):
    question: str = Field(description="Question confirmed by the server")
    spread_type: SpreadType = Field(description="Confirmed spread type")
    cards: list[CardResponse] = Field(description="Three cards mapped from the server deck; details are null before reveal")


class CardRevealResponse(StrictModel):
    card: CardResponse = Field(description="Card revealed by this request or returned from a previous reveal")


class EndConsultationRequest(StrictModel):
    reason: str = Field(description="Termination reason: USER, TIMEOUT, or ERROR", examples=["USER"])

    @field_validator("reason")
    @classmethod
    def valid_reason(cls, value: str) -> str:
        if value not in {"USER", "TIMEOUT", "ERROR"}:
            raise ValueError("unsupported termination reason")
        return value


class CardReading(StrictModel):
    slot: int = Field(ge=1, le=10, description="Slot of the card being interpreted")
    text: str = Field(min_length=1, max_length=1000, description="Interpretation of the card in the consultation context")


class SaveReportRequest(StrictModel):
    situation_summary: str = Field(min_length=1, max_length=500, description="One-line situation summary")
    readings: list[CardReading] = Field(description="Per-slot readings for every revealed card")
    queen_line: str = Field(min_length=1, max_length=300, description="Closing message displayed in the report")


class ReportResponse(StrictModel):
    consultation_id: UUID = Field(description="Consultation ID associated with the report")
    status: ReportStatus = Field(description="Report generation state")
    spread_type: Optional[SpreadType] = Field(description="Spread type used for the consultation")
    consulted_at: datetime = Field(description="Consultation start timestamp")
    question: Optional[str] = Field(description="Confirmed question, or null if the call ended early")
    cards: list[ReportCardResponse] = Field(description="Revealed cards with images and individual readings")
    situation_summary: str = Field(description="One-line situation summary")
    readings: list[CardReading] = Field(description="Per-slot card readings")
    queen_line: str = Field(description="Closing message")
    created_at: datetime = Field(description="Report creation timestamp")


class CreateShareLinkRequest(StrictModel):
    hook_text: str = Field(
        min_length=1,
        max_length=100,
        description="Public hook text shown instead of private report content",
        examples=["이번 크리스마스 솔탈 확률은?"],
    )

    @field_validator("hook_text")
    @classmethod
    def strip_hook(cls, value: str) -> str:
        return value.strip()


class SharePreviewResponse(StrictModel):
    title: str = Field(description="Link preview title")
    description: str = Field(description="Link preview description")
    image_url: Optional[str] = Field(description="Share image URL, or null when no image is available")


class ShareLinkResponse(StrictModel):
    token: str = Field(description="Random token used to retrieve the public share page")
    share_path: str = Field(description="Relative frontend path for the share page")
    share_url: str = Field(description="Absolute public share URL")
    hook_text: str = Field(description="Hook text displayed on the share page")
    cta_text: str = Field(default="나도 해보기", description="Service CTA label")
    preview: SharePreviewResponse = Field(description="Preview metadata for Open Graph and similar consumers")


class PublicShareResponse(StrictModel):
    hook_text: str = Field(description="Public hook text; excludes the private question and report content")
    cta_text: str = Field(description="Service CTA label")
    cta_path: str = Field(description="Relative frontend path for the CTA")
    cta_url: str = Field(description="Absolute CTA URL")
    preview: SharePreviewResponse = Field(description="Share link preview metadata")
    created_at: datetime = Field(description="Share link creation timestamp")


class ClientEventRequest(StrictModel):
    event: str = Field(description="Supported consultation UX event name")
    occurred_at: datetime = Field(description="Timestamp when the event occurred on the client")
    stage: Optional[str] = Field(default=None, description="Required screen stage for FLOW_STAGE_ENTERED")
    reason_code: Optional[str] = Field(default=None, max_length=80, description="Machine-readable failure or interruption reason code")
    duration_ms: Optional[int] = Field(default=None, ge=0, description="Measured duration in milliseconds")
    slot: Optional[int] = Field(default=None, ge=1, le=10, description="Card slot associated with the event")

    @field_validator("event")
    @classmethod
    def valid_event(cls, value: str) -> str:
        allowed = {
            "FLOW_STAGE_ENTERED", "REALTIME_CONNECTION_FAILED", "REALTIME_DISCONNECTED",
            "RECONNECT_ATTEMPTED", "RECONNECT_SUCCEEDED", "TTS_FAILED",
            "TTS_PLAYBACK_CANCELLED", "PAGE_HIDDEN",
        }
        if value not in allowed:
            raise ValueError("unsupported event")
        return value

    @model_validator(mode="after")
    def validate_stage(self):
        if self.event == "FLOW_STAGE_ENTERED" and not self.stage:
            raise ValueError("stage is required for FLOW_STAGE_ENTERED")
        return self


class ClientEventResponse(StrictModel):
    event_id: UUID = Field(description="Stored event ID")
    stored_at: datetime = Field(description="Server storage timestamp")


class RealtimeCredentialRequest(StrictModel):
    connection_reason: str = Field(description="Connection reason: INITIAL or RECONNECT", examples=["INITIAL"])

    @field_validator("connection_reason")
    @classmethod
    def valid_reason(cls, value: str) -> str:
        if value not in {"INITIAL", "RECONNECT"}:
            raise ValueError("unsupported connection reason")
        return value


class RealtimeCredentialResponse(StrictModel):
    client_secret: str = Field(description="Short-lived secret used only for a direct browser connection to OpenAI Realtime")
    expires_at: int = Field(description="Client secret expiration time as a Unix timestamp")
    realtime_model: str = Field(description="OpenAI Realtime model to connect to")


class TTSRequest(StrictModel):
    response_id: str = Field(min_length=1, max_length=200, description="ID used to associate an OpenAI response with TTS playback order")
    segment_index: int = Field(ge=0, description="Zero-based audio segment index within the response")
    text: str = Field(min_length=1, max_length=500, description="Text sent to Typecast for synthesis; never stored or logged")
