# 관리자 API 상세 명세

> 상위 문서: [REST API 상세 명세](../rest-api-spec.md)  
> 공통 규칙: [REST API 개요](../rest-api.md)  
> 기준일: 2026-11-12  
> 구현 기준: FastAPI + Pydantic

## 목차

- [1. 접근 권한](#1-접근-권한)
- [2. 운영 지표](#2-운영-지표)
- [3. 상담 운영 목록](#3-상담-운영-목록)

## 1. 접근 권한

관리자 API는 `users.role = ADMIN`인 서비스 세션만 허용한다. 일반 사용자는 `403 ADMIN_REQUIRED`다.

## 2. 운영 지표

`GET /api/v1/admin/metrics/summary`

**Request query:** `from: datetime`, `to: datetime`

**Response `200`**

```json
{
  "period": {
    "from": "2026-11-01T00:00:00Z",
    "to": "2026-12-01T00:00:00Z"
  },
  "users": {"new": 100, "total": 100},
  "consultations": {"created": 80, "ended": 65, "failed": 3},
  "reports": {"completed": 60, "failed": 2}
}
```

Provider별 identity 수, 평균 선택 카드 수, 재연결 상담 수는 현재 응답에서 제외한다. DB에서 집계할 수 있는지 확인한 뒤 추가 여부를 정하며, 현재는 **TBD**다.

## 3. 상담 운영 목록

`GET /api/v1/admin/consultations`

**Request query**

| 필드 | Python 타입 | 규칙 |
|---|---|---|
| `from` | `datetime` | 조회 시작 |
| `to` | `datetime` | 조회 종료 |
| `status` | `ConsultationStatus | None` | 선택 필터 |
| `limit` | `int` | 기본 20, 최댓값 **TBD** |
| `cursor` | `str | None` | 다음 페이지 cursor |

**Response `200`**

```json
{
  "items": [
    {
      "id": "52eeb1b0-6e2d-4d83-9a9a-7f626164eb8e",
      "status": "ENDED",
      "expected_card_count": 3,
      "report_status": "COMPLETED",
      "created_at": "2026-11-12T10:00:00Z",
      "connected_at": "2026-11-12T10:00:10Z",
      "ended_at": "2026-11-12T10:10:00Z"
    }
  ],
  "next_cursor": null
}
```

사용자 이메일, 원문 고민, transcript와 리포트 본문은 반환하지 않는다. 최대 조회 기간과 page size는 **TBD**다.
