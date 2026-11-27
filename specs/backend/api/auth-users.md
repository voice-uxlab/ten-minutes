# 인증 및 사용자 API 상세 명세

> 상위 문서: [REST API 상세 명세](../rest-api-spec.md)  
> 공통 규칙: [REST API 개요](../rest-api.md)  
> 기준일: 2026-11-12  
> 구현 기준: FastAPI + Pydantic

## 목차

- [1. 인증 API](#1-인증-api)
- [2. 사용자 API](#2-사용자-api)

## 1. 인증 API

### 1.1 OAuth Authorization

`GET /auth/{provider}/authorize`

**Request**

- Path `provider: Literal["kakao"]`
- JSON body 없음

**Response**

- `302 Found`, `Location` header에 Provider 인가 URL
- JSON body 없음
- 인증 시작 처리 중 내부 오류가 발생하면 프론트 로그인 화면으로 리다이렉트한다. `auth_error=failed`와 문의에 사용할 `auth_request_id`를 전달한다.

미지원 Provider는 `404`, credential 미설정은 `503`을 우선안으로 하며 최종 코드는 **TBD**다.

### 1.2 OAuth Callback

`GET /auth/{provider}/callback`

**Request**

- Path `provider`
- Query `code: str | None`, `state: str`, `error: str | None`
- JSON body 없음

**Response**

- 성공 또는 사용자 취소 시 정해진 프론트 화면으로 `302` 리다이렉트한다. 상태 검증과 Provider 요청 실패는 HTTP 오류로 응답한다.
- 성공 시 `Set-Cookie`로 서비스 세션 발급
- 성공 리다이렉트에는 `auth_callback=session_issued`가 포함된다. 이 값은 콜백 응답이 세션 쿠키를 발급했다는 진단 표시이며, 로그인 상태는 `/api/v1/users/me`에서 확인한다.
- OAuth token을 JSON 또는 URL에 포함하지 않음

### 1.3 Logout

`POST /api/v1/auth/logout`

**Request:** body 없음, 서비스 세션 쿠키 필요  
**Response:** `204 No Content`, 세션 쿠키 만료

## 2. 사용자 API

### 2.1 현재 사용자 조회

`GET /api/v1/users/me`

**Request:** body 없음

**Response `200` — `CurrentUserResponse`**

```json
{
  "id": "52eeb1b0-6e2d-4d83-9a9a-7f626164eb8e",
  "addressing_mode": null,
  "nickname": null,
  "onboarding_required": true
}
```

프로필 표시명, 이미지, 이메일은 사용 목적과 Provider 동의 범위를 정한 뒤 추가한다.

`401 AUTHENTICATION_REQUIRED` 응답에는 공통 메시지와 `error.request_id`가 포함된다. `error.support_code`는 고객 문의에 사용하는 코드다. 사용자 화면에는 재시도 안내와 문의 ID를 표시한다. 코드별 의미는 [로그인 문의 ID](../../../docs/login-support-codes.md)에서 확인한다.

### 2.2 현재 사용자 수정

`PATCH /api/v1/users/me`

**Request body `UpdateMeRequest`**

```json
{
  "addressing_mode": "CUSTOM",
  "nickname": "대장",
  "age_confirmed": true,
  "ai_processing_consent_version": "TBD"
}
```

| 필드 | Python 타입 | 규칙 |
|---|---|---|
| `addressing_mode` | `AddressingMode` | `DEFAULT`, `CUSTOM` |
| `nickname` | `str | None` | `CUSTOM`이면 필수, 길이 제한 **TBD** |
| `age_confirmed` | `bool` | 필수 |
| `ai_processing_consent_version` | `str` | 서버가 허용한 최신 버전 |

**Response:** `200 CurrentUserResponse`  
**주요 오류:** `409 CONSENT_VERSION_INVALID`, `422 VALIDATION_ERROR`
