# 상담 API 상세 명세

> 상위 문서: [REST API 상세 명세](../rest-api-spec.md)  
> 공통 규칙: [REST API 개요](../rest-api.md)  
> 상담 상태 기준: [음성 상담 흐름](../voice-consultation-flow.md)  
> 기준일: 2026-11-12  
> 구현 기준: FastAPI + Pydantic

## 목차

- [1. 상담 API](#1-상담-api)
- [2. 음성 API](#2-음성-api)
- [3. 카드 API](#3-카드-api)
- [4. 클라이언트 이벤트 API](#4-클라이언트-이벤트-api)
- [5. 리포트 API](#5-리포트-api)

## 1. 상담 API

### 1.1 상담 생성

`POST /api/v1/consultations`

**Request body `CreateConsultationRequest`**

```json
{
  "consent_version": "TBD"
}
```

카드 수와 덱 크기는 서버가 정한다. `call_ends_at`은 상담 생성 시각에서 10분 후이며 재연결해도 유지된다.

**Response `201` — `ConsultationResponse`**

```json
{
  "id": "52eeb1b0-6e2d-4d83-9a9a-7f626164eb8e",
  "status": "CREATED",
  "question": null,
  "deck_size": 78,
  "expected_card_count": 3,
  "cards": [],
  "report_status": null,
  "created_at": "2026-11-12T10:00:00Z",
  "ended_at": null,
  "call_ends_at": "2026-11-12T10:10:00Z"
}
```

**주요 오류:** `409 ONBOARDING_REQUIRED`, `409 CONSENT_REQUIRED`

### 1.2 상담 목록

`GET /api/v1/consultations`

**Request query**

| 필드 | Python 타입 | 기본값, 규칙 |
|---|---|---|
| `limit` | `int` | 기본 20, 최댓값 **TBD** |
| `cursor` | `str | None` | 첫 페이지는 생략 |

**Response `200`**

```json
{
  "items": [
    {
      "id": "52eeb1b0-6e2d-4d83-9a9a-7f626164eb8e",
      "question": "연락 없는 그 사람을 기다릴까?",
      "status": "ENDED",
      "expected_card_count": 3,
      "report_status": "COMPLETED",
      "situation_summary": "관계를 기다리기보다 내 기준을 세울 때야.",
      "thumbnail_card_code": "major-17-star",
      "created_at": "2026-11-12T10:00:00Z",
      "ended_at": "2026-11-12T10:10:00Z"
    }
  ],
  "next_cursor": null
}
```

`thumbnail_card_code`는 첫 번째로 공개된 카드의 안정적인 코드다. 프론트엔드는 이 값을
정적 카드 이미지와 매핑한다. 공개된 카드가 없으면 `null`이다. 백엔드는 카드 이미지 URL을
반환하지 않는다.

### 1.3 상담 상세

`GET /api/v1/consultations/{consultation_id}`

**Request:** Path `consultation_id: UUID`, body 없음  
**Response:** `200 ConsultationResponse`  
**주요 오류:** `404 CONSULTATION_NOT_FOUND`

### 1.4 상담 종료

`POST /api/v1/consultations/{consultation_id}/end`

**Request body `EndConsultationRequest`**

```json
{
  "reason": "USER"
}
```

`reason`은 우선 `USER`, `TIMEOUT`, `ERROR`만 허용한다. 최종 enum은 상담 종료 정책을 정할 때 확정한다.

**Response:** `200 ConsultationResponse`  
이미 종료된 상담의 종료 요청을 다시 받으면, 남아 있는 OpenAI 연결만 종료한다. 연결 종료와 리포트 완료는 별도 상태다.

리포트 메모를 저장한 클라이언트는 선택 필드 `defer_voice_cleanup: true`를 보낼 수 있다.
이 경우 상담 종료와 만료 시각을 커밋하고 응답한다. 클라이언트는 이후 일반 종료
요청과 리포트 생성 요청을 독립적으로 보낸다. 통화 종료 실패나 요청 유실은 기존
예약 작업이 보완한다. 상담 조회의 `has_report_draft`는 메모 저장 여부를 나타낸다.

### 1.5 리포트용 중간 저장과 생성

- `PUT /api/v1/consultations/{consultation_id}/report-draft`는 소유자의 활성 상담에
  `summary`(최대 300자) 또는 `readings`(`slot`과 최대 300자의 `text`)를 부분 갱신하고
  `204`를 반환한다. 서버에서 공개한 슬롯만 허용한다.
- `POST /api/v1/consultations/{consultation_id}/report/generate`는 소유자의 종료된
  상담에서 실행 가능한 작업을 한 번 처리하고 `204`를 반환한다.
- `GET /api/v1/consultations/{consultation_id}/report`는 종료 후 리포트 작업이 남아
  있으면 `202`를, 완료 후에는 기존 리포트 응답을 반환한다.
- 종료 요청이 유실되면 예약 작업이 10분 기한이 지난 상담에서 마지막 저장 메모를 사용한다.
  중간 메모는 리포트 작성 후 삭제하며, 기한 이후 24시간이 지난 미완료 메모도 정리한다.

## 2. 음성 API

### 2.1 Realtime WebRTC 연결

`POST /api/v1/consultations/{consultation_id}/realtime-connection`

인증된 브라우저가 JSON의 `sdp` 필드로 WebRTC SDP offer를 보낸다. FastAPI가 OpenAI에 세션 설정과 offer를 전달하고 `201 application/sdp`로 answer를 반환한다. 응답은 캐시하지 않는다. OpenAI 서비스 키는 백엔드에만 있고 call ID는 종료 작업을 위해 DB에 저장한다.

계정마다 활성 통화는 하나만 허용한다. 같은 상담을 재연결하면 이전 OpenAI 통화를 닫는다.
같은 계정의 이전 상담이 열려 있으면 종료를 기록하고 OpenAI 연결을 끊은 후 새 연결을 생성한다. 이전 연결 종료가 실패하면 새 연결을 열지 않으며 다시 요청할 수 있다. 같은 상담에 재연결하면 기존 만료 시각을 유지한다. 같은 계정에서 연결 생성이 이미 진행 중이거나 요청한 상담이 종료됐으면 `409`다.
상담 또는 계정의 발급 한도에 도달하면 `429`다.

사용자가 상담을 종료하면 FastAPI가 OpenAI WebRTC 연결에 종료 요청을 보낸다.
일시적인 실패는 `503`으로 반환하여 클라이언트가 종료 요청을 다시 보낼 수 있다.
연결 응답의 `X-Voice-Connection`을 `POST /api/v1/consultations/{consultation_id}/voice-heartbeat`
요청의 `connection_token`으로 보낸다. 정상 신호의 응답은 `204`이며, 만료되었거나
다른 연결의 토큰이면 `409`다. 마지막 신호 후 2분부터 연결이 만료되며, Supabase 예약
작업이 다음 점검에서 만료된 OpenAI 연결의 종료를 요청한다.

### 2.2 Typecast 음성 합성

`POST /api/v1/consultations/{consultation_id}/tts/stream`

**Request body**

```json
{
  "response_id": "oai-response-id",
  "segment_index": 0,
  "text": "지금 네 마음부터 천천히 살펴보자."
}
```

| 필드 | Python 타입 | 규칙 |
|---|---|---|
| `response_id` | `str` | OpenAI 응답과 재생 순서 연결 |
| `segment_index` | `int` | 0 이상 |
| `text` | `str` | 1–500자 |

**Response `200`**

- `StreamingResponse`
- `Content-Type`: `audio/wav` 스트림, 합성 속도 1.3배
- JSON body 없음

FastAPI 연결이 활성 상태여야 하고, 상담 종료 시각을 넘긴 합성은 허용하지 않는다.
상담별/계정별 합성 글자 수나 동시 합성 요청 제한을 초과하면 `429`다.

활성 상담의 소유자만 호출할 수 있다. 모델과 voice ID는 서버 설정에서 정하며 요청 body로 받지 않는다. 상담별 글자 수, 호출 빈도, 동시 합성 수 제한은 **TBD**다. 텍스트와 생성 오디오는 DB나 로그에 저장하지 않는다.

## 3. 카드 API

### 3.1 카드 선택 확정

`POST /api/v1/consultations/{consultation_id}/card-selection`

**Request headers:** `Idempotency-Key: str` 필수

**Request body**

```json
{
  "question": "연락 없는 그 사람을 기다릴까?",
  "positions": ["나의 마음", "그 사람의 마음", "관계의 흐름"],
  "picks": [7, 22, 51]
}
```

| 필드 | Python 타입 | 규칙 |
|---|---|---|
| `question` | `str` | 공백 제거 후 길이 제한 **TBD** |
| `positions` | `list[str]` | 길이가 `expected_card_count`와 같음 |
| `picks` | `list[int]` | 길이가 카드 수와 같고, 중복 없는 1~78 |

**Response `201` 또는 멱등 재요청 `200`**

```json
{
  "question": "연락 없는 그 사람을 기다릴까?",
  "cards": [
    {
      "slot": 1,
      "picked_number": 7,
      "position": "나의 마음",
      "card_id": 42,
      "name": "컵 7",
      "direction": "UPRIGHT",
      "keywords": ["환상", "많은 선택지", "망상"],
      "revealed_at": null
    }
  ]
}
```

실제 `cards` 길이는 `expected_card_count`와 같다. 다른 선택으로 재요청하면 `409 CARD_SELECTION_LOCKED`다.

### 3.2 카드 공개

`POST /api/v1/consultations/{consultation_id}/cards/{slot}/reveal`

**Request:** Path `consultation_id: UUID`, `slot: int`, body 없음

**Response `200`**

```json
{
  "card": {
    "slot": 1,
    "picked_number": 7,
    "position": "나의 마음",
    "card_id": 42,
    "name": "컵 7",
    "direction": "UPRIGHT",
    "keywords": ["환상", "많은 선택지", "망상"],
    "revealed_at": "2026-11-12T10:05:00Z"
  }
}
```

slot 1부터 순서대로 공개한다. 이미 공개한 slot은 같은 결과를 반환하고, 앞 slot이 공개되지 않았으면 `409 PREVIOUS_CARD_NOT_REVEALED`다.

## 4. 클라이언트 이벤트 API

### 4.1 클라이언트 이벤트 저장

`POST /api/v1/consultations/{consultation_id}/events`

**Request headers:** `Idempotency-Key: str` 필수

**Request body**

```json
{
  "event": "REALTIME_DISCONNECTED",
  "occurred_at": "2026-11-12T10:05:30Z",
  "reason_code": "PEER_CONNECTION_DISCONNECTED"
}
```

| 필드 | Python 타입 | 필수 | 규칙 |
|---|---|---:|---|
| `event` | `ConsultationEventType` | O | 허용 목록만 사용 |
| `occurred_at` | `datetime` | O | 허용 가능한 시각 범위 **TBD** |
| `stage` | `FlowStage | None` | 조건부 | `FLOW_STAGE_ENTERED`이면 필수 |
| `reason_code` | `str | None` | X | 자유문 대신 허용 코드 사용 |
| `duration_ms` | `int | None` | X | 0 이상 |
| `slot` | `int | None` | X | 상담 카드 수 범위 |

허용 이벤트는 `FLOW_STAGE_ENTERED`, `REALTIME_CONNECTION_FAILED`, `REALTIME_DISCONNECTED`, `RECONNECT_ATTEMPTED`, `RECONNECT_SUCCEEDED`, `TTS_FAILED`, `TTS_PLAYBACK_CANCELLED`, `PAGE_HIDDEN`이다.

**Response `201` 또는 멱등 재요청 `200`**

```json
{
  "event_id": "ca8ce5cd-f850-4db8-9a76-78a12ca842e0",
  "stored_at": "2026-11-12T10:05:31Z"
}
```

질문, 사용자 발화, transcript, TTS 문장, 리포트 본문은 받지 않는다. 스키마에 없는 JSON 속성도 거절한다.

## 5. 리포트 API

### 5.1 리포트 저장

`PUT /api/v1/consultations/{consultation_id}/report`

**Request body**

```json
{
  "situation_summary": "세 장의 카드는 자신의 기준을 살피라고 말해.",
  "readings": [
    {"slot": 1, "text": "첫 번째 카드 해석"}
  ],
  "queen_line": "선택받으려고 애쓰지 마. 선택하는 건 너야."
}
```

`readings`의 slot은 공개된 카드와 일치해야 한다. 통화가 종료됐다면 일부 카드 또는 카드가 없는 상태에서도 요약을 저장할 수 있다. 상황 요약은 최대 500자, 해석은 카드별 최대 1,000자, 마무리는 최대 300자다. 질문과 카드 정보는 서버 기록을 사용한다.

**Response:** `201` 최초 저장, `200` 동일 결과 재요청 — `ReportResponse`  
**주요 오류:** `409 CARDS_NOT_FULLY_REVEALED`, `422 VALIDATION_ERROR`

생성 주체가 백엔드로 확정되면 이 API는 내부 처리 또는 리포트 생성 요청 API로 변경할 수 있다.

### 5.2 리포트 조회

`GET /api/v1/consultations/{consultation_id}/report`

**Request:** Path `consultation_id: UUID`, body 없음

**Response `200` 예시**

```json
{
  "consultation_id": "52eeb1b0-6e2d-4d83-9a9a-7f626164eb8e",
  "status": "COMPLETED",
  "question": "연락 없는 그 사람을 기다릴까?",
  "cards": [],
  "summary": "세 장의 카드는 자신의 기준을 살피라고 말해.",
  "readings": [{"slot": 1, "text": "첫 번째 카드 해석"}],
  "queen_line": "선택하는 건 너야.",
  "created_at": "2026-11-12T10:11:00Z"
}
```

`cards`에는 공개된 `CardResponse` 전체가 들어간다. 리포트가 없으면 `404 REPORT_NOT_FOUND`다.
