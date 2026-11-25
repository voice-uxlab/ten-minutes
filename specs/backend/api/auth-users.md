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

미지원 Provider는 `404`, credential 미설정은 `503`을 우선안으로 하며 최종 코드는 **TBD**다.

### 1.2 OAuth Callback

`GET /auth/{provider}/callback`

**Request**

- Path `provider`
- Query `code: str | None`, `state: str`, `error: str | None`
- JSON body 없음

**Response**

- 성공 또는 실패 모두 정해진 FE 화면으로 `302` redirect
- 성공 시 `Set-Cookie`로 서비스 세션 발급
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
