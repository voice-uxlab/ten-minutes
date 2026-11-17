# REST API 개요

> 상위 문서: [백엔드 설계 문서 안내](./README.md)  
> 상세 문서: [REST API 상세 명세](./rest-api-spec.md)  
> 기준일: 2026-11-12  
> 미확정 사항은 **TBD**로 표시한다.

## 목차

- [1. 문서 사용법](#1-문서-사용법)
- [2. 공통 규칙](#2-공통-규칙)
- [3. API 목록](#3-api-목록)
- [4. 소셜 로그인 처리](#4-소셜-로그인-처리)
- [5. FastAPI 구현 기준](#5-fastapi-구현-기준)
- [6. 공식 기준](#6-공식-기준)

## 1. 문서 사용법

이 문서에서는 공통 HTTP 규칙과 전체 endpoint를 확인한다. 각 API의 path, query, header, body, 성공 응답, 오류 코드는 [REST API 상세 명세](./rest-api-spec.md)에 적는다.

구현 전에는 두 문서를 FE와 BE의 명세로 사용한다. 구현 후에는 FastAPI Pydantic 모델에서 생성되는 `/openapi.json`과 `/docs`를 실제 명세로 사용한다. 문서와 코드가 다르면 같은 PR에서 수정한다.

## 2. 공통 규칙

- Base path: 일반 API는 `/api/v1`, OAuth redirect 진입점은 `/auth`를 사용한다.
- 인증: 서비스 세션 쿠키. OAuth 시작과 콜백을 제외한 API는 로그인이 필요하다.
- JSON 요청과 응답: `Content-Type: application/json`. TTS 성공 응답은 오디오 스트림이다.
- 시간: JSON에서는 UTC ISO 8601 문자열, FastAPI에서는 timezone이 있는 `datetime`으로 처리한다.
- 식별자: JSON에서는 UUID 문자열, FastAPI에서는 `UUID`로 검증한다.
- 쓰기 요청의 재시도: 필요한 API는 `Idempotency-Key` header를 사용한다. 저장 방식과 보존 시간은 **TBD**다.
- 소유권 은닉: 다른 사용자의 리소스는 존재 여부를 노출하지 않고 `404`를 반환한다.
- 알 수 없는 요청 필드: Pydantic 모델의 `extra="forbid"`로 거절한다.

공통 오류 응답은 다음 형태다.

```json
{
  "error": {
    "code": "CONSULTATION_STATE_CONFLICT",
    "message": "현재 상담 상태에서는 처리할 수 없습니다.",
    "request_id": "req_..."
  }
}
```

주요 응답 코드는 `200` 성공, `201` 생성, `204` 본문 없는 성공, `302` OAuth redirect, `400` 잘못된 요청, `401` 미인증, `403` 권한 부족, `404` 리소스 없음 또는 소유권 은닉, `409` 상태 충돌, `422` 필드 검증 실패, `429` 사용량 제한, `500` 서버 오류, `502` 외부 제공자 오류, `503` 일시 장애, `504` 외부 제공자 timeout이다.

## 3. API 목록

| 영역 | Method | Path | 목적 | 성공 |
|---|---|---|---|---:|
| 인증 | GET | `/auth/{provider}/authorize` | OAuth 인가 시작 | 302 |
| 인증 | GET | `/auth/{provider}/callback` | OAuth callback과 서비스 세션 발급 | 302 |
| 인증 | POST | `/api/v1/auth/logout` | 서비스 세션 종료 | 204 |
| 사용자 | GET | `/api/v1/users/me` | 현재 사용자 조회 | 200 |
| 사용자 | PATCH | `/api/v1/users/me` | 호칭과 필수 동의 갱신 | 200 |
| 상담 | POST | `/api/v1/consultations` | 상담과 서버 덱 생성 | 201 |
| 상담 | GET | `/api/v1/consultations` | 내 상담 및 리포트 목록 | 200 |
| 상담 | GET | `/api/v1/consultations/{consultation_id}` | 상담, 카드, 리포트 상태 조회 | 200 |
| 음성 | POST | `/api/v1/consultations/{consultation_id}/realtime-credentials` | Realtime client secret 발급 | 201 |
| 음성 | POST | `/api/v1/consultations/{consultation_id}/tts/stream` | Typecast 합성 오디오 전달 | 200 |
| 카드 | POST | `/api/v1/consultations/{consultation_id}/card-selection` | 질문과 자리, 선택 번호 확정 | 201/200 |
| 카드 | POST | `/api/v1/consultations/{consultation_id}/cards/{slot}/reveal` | 다음 카드 공개 저장 | 200 |
| 모니터링 | POST | `/api/v1/consultations/{consultation_id}/events` | 최소 UX 이벤트 저장 | 201/200 |
| 상담 | POST | `/api/v1/consultations/{consultation_id}/end` | 상담 종료 | 200 |
| 리포트 | PUT | `/api/v1/consultations/{consultation_id}/report` | 리포트 검증 후 저장 | 200/201 |
| 리포트 | GET | `/api/v1/consultations/{consultation_id}/report` | 리포트 조회 | 200 |
| 관리자 | GET | `/api/v1/admin/metrics/summary` | 기간별 기본 지표 | 200 |
| 관리자 | GET | `/api/v1/admin/consultations` | 상담 운영 목록 | 200 |

결제, 이용권, 포인트, 상품 구매 API는 MVP 범위에 포함하지 않는다.

## 4. 소셜 로그인 처리

`provider` 허용값은 `kakao`, `naver`, `openai`다. FE는 로그인 버튼 클릭 시 Provider API를 직접 호출하지 않고 브라우저를 `/auth/{provider}/authorize`로 이동시킨다.

1. 백엔드가 `state`, Provider별 PKCE verifier와 nonce를 만든다.
2. 브라우저를 Provider 인가 화면으로 redirect한다.
3. callback에서 code/state와 PKCE/OIDC 값을 검증한다.
4. 서버에서 token을 교환한 뒤 사용자를 조회하거나 생성한다.
5. `Secure`, `HttpOnly` 서비스 세션 쿠키를 설정하고 FE 결과 화면으로 redirect한다.

Provider Client Secret과 access/refresh token은 FE에 전달하지 않는다. OpenAI 로그인 credential과 Realtime API credential도 분리한다. OpenAI OAuth client를 발급받지 못한 환경의 UI와 응답 처리는 **TBD**다.

## 5. FastAPI 구현 기준

- 요청 모델과 JSON 응답 모델은 Pydantic `BaseModel`로 정의한다.
- path, query, header는 FastAPI의 `Path`, `Query`, `Header`로 범위와 형식을 검증한다.
- `response_model`과 실제 status code를 각 route에 명시한다.
- 상태값은 `Enum` 또는 `Literal`, 식별자는 `UUID`, 시각은 `datetime`을 사용한다.
- 공통 오류는 전역 exception handler에서 `ErrorResponse`로 변환한다.
- TTS route는 JSON `response_model` 대신 `StreamingResponse`를 사용한다.
- Pydantic 모델과 DB ORM 모델은 역할이 다르므로 분리한다.

Python 타입, JSON 표현과 PostgreSQL 컬럼의 차이는 [데이터베이스 설계의 타입 기준](./database.md#2-타입-표기-기준)을 따른다.

## 6. 공식 기준

- [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [RFC 6749 OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749)
- [RFC 6585 Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585)
- [FastAPI Request Body](https://fastapi.tiangolo.com/tutorial/body/)
- [FastAPI Response Model](https://fastapi.tiangolo.com/tutorial/response-model/)
- [FastAPI Handling Errors](https://fastapi.tiangolo.com/tutorial/handling-errors/)
