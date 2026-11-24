# REST API 상세 명세

> 상위 문서: [REST API 개요](./rest-api.md)  
> 기준일: 2026-11-12  
> 구현 기준: FastAPI + Pydantic  
> 미확정 사항은 **TBD**로 표시한다.

## 목차

- [1. 상세 명세 구성](#1-상세-명세-구성)
- [2. API 명세 규칙](#2-api-명세-규칙)
- [3. 공통 스키마](#3-공통-스키마)

## 1. 상세 명세 구성

| 영역 | 상세 문서 | 포함 API |
|---|---|---|
| 인증 및 사용자 | [인증 및 사용자 API](./api/auth-users.md) | OAuth, 로그아웃, 현재 사용자 조회와 수정 |
| 상담 | [상담 API](./api/consultations.md) | 상담, 음성, 카드, 클라이언트 이벤트, 리포트 |
| 관리자 | [관리자 API](./api/admin.md) | 운영 지표, 상담 운영 목록 |

전체 endpoint와 공통 HTTP 규칙은 [REST API 개요](./rest-api.md)에 있다. 구현 전에는 이 문서와 영역별 상세 문서를 FE와 BE의 명세로 사용한다. 구현 후에는 Pydantic 모델에서 생성되는 `/openapi.json`과 `/docs`를 실제 명세로 사용하며, 문서와 코드가 다르면 같은 PR에서 수정한다.

## 2. API 명세 규칙

각 API는 Request와 Response를 분리한다. JSON 표현과 FastAPI에서 사용할 Python 타입은 다음과 같다.

| JSON 표현 | FastAPI/Pydantic 타입 | 용도 |
|---|---|---|
| 문자열 UUID | `UUID` | 사용자, 상담, 이벤트 식별자 |
| 문자열 | `str` | 질문, 호칭, 설명 |
| 정수 | `int` | slot, 선택 번호, 기간 |
| 참/거짓 | `bool` | 온보딩 필요 여부 |
| 배열 | `list[T]` | 카드, 리딩 목록 |
| 문자열 enum | `Enum` 또는 `Literal` | 상태, 방향, 이벤트 종류 |
| ISO 8601 문자열 | timezone이 있는 `datetime` | 생성, 종료 시각 |
| `null` | `T | None` | 아직 값이 없는 선택 필드 |

별도 설명이 없으면 JSON body의 추가 필드는 허용하지 않는다. `Request 없음`은 body를 보내지 않는다는 뜻이다.

## 3. 공통 스키마

### 3.1 Error Response Schema `ErrorResponse`

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "요청한 리소스를 찾을 수 없습니다.",
    "request_id": "req_..."
  }
}
```

| 필드 | Python 타입 | 필수 | 설명 |
|---|---|---:|---|
| `error.code` | `str` | O | FE 분기용 오류 코드 |
| `error.message` | `str` | O | 사용자 또는 개발자용 설명 |
| `error.request_id` | `str` | O | 로그 추적 ID |

Pydantic 형식 오류도 이 구조로 변환할지 FastAPI 기본 `detail` 형식을 유지할지는 **TBD**다.

### 3.2 Card Response Schema `CardResponse`

| 필드 | Python 타입 | 설명 |
|---|---|---|
| `slot` | `int` | 1부터 시작하는 상담 내 위치 |
| `picked_number` | `int` | 사용자가 말한 1~78 번호 |
| `position` | `str` | 카드가 답하는 자리 |
| `card_id` | `int` | 서버 카드 ID |
| `card_code` | `str` | 프론트엔드 이미지 매핑에도 사용하는 안정적인 카드 코드 |
| `name` | `str` | 표시 이름 |
| `direction` | `CardDirection` | `UPRIGHT` |
| `keywords` | `list[str]` | 표시, 리딩용 핵심어 |
| `revealed_at` | `datetime | None` | 공개 전에는 `null` |

### 3.3 Consultation Response Schema `ConsultationResponse`

| 필드 | Python 타입 | 설명 |
|---|---|---|
| `id` | `UUID` | 상담 ID |
| `status` | `ConsultationStatus` | `CREATED`, `CONNECTING`, `ACTIVE`, `DISCONNECTED`, `ENDING`, `ENDED`, `FAILED` |
| `question` | `str | None` | 질문 확정 전에는 `null` |
| `deck_size` | `int` | MVP는 78 |
| `expected_card_count` | `int` | 상담 생성 시 확정된 카드 수 |
| `cards` | `list[CardResponse]` | 선택 전에는 빈 배열 |
| `report_status` | `ReportStatus | None` | 리포트가 없으면 `null` |
| `created_at` | `datetime` | 생성 시각 |
| `ended_at` | `datetime | None` | 종료 전에는 `null` |

### 3.4 Current User Response Schema `CurrentUserResponse`

| 필드 | Python 타입 | 설명 |
|---|---|---|
| `id` | `UUID` | 서비스 사용자 ID |
| `addressing_mode` | `AddressingMode | None` | `DEFAULT`, `CUSTOM`, 미설정이면 `null` |
| `nickname` | `str | None` | `CUSTOM`일 때 사용하는 호칭 |
| `onboarding_required` | `bool` | 호칭, 필수 동의가 더 필요한지 여부 |

### 3.5 Report Response Schema `ReportResponse`

| 필드 | Python 타입 | 설명 |
|---|---|---|
| `consultation_id` | `UUID` | 상담 ID |
| `status` | `ReportStatus` | `PENDING`, `COMPLETED`, `FAILED` |
| `question` | `str` | 서버에 저장된 확정 질문 |
| `cards` | `list[CardResponse]` | 공개된 카드 목록 |
| `summary` | `str | None` | 종합 리딩 |
| `readings` | `list[CardReading]` | slot별 카드 리딩 |
| `queen_line` | `str | None` | 마무리 문장 |
| `created_at` | `datetime` | 리포트 생성 시각 |
