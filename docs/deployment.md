# 배포 환경 및 Preview 설정

## 배포 구성

### Preview

현재 `dev` 브랜치 기준으로 프론트엔드와 백엔드를 각각 Vercel에 배포하고 있습니다.

| 구분 | Vercel 프로젝트 | 연결 브랜치 | Preview URL |
|---|---|---|---|
| 프론트엔드 | `ten-minites` | `dev` | [ten-minutes-dev.vercel.app](https://ten-minutes-dev.vercel.app/) |
| 백엔드 | `ten-minutes-api` | `dev` | [ten-minutes-api-git-dev-voice-uxlab.vercel.app](https://ten-minutes-api-git-dev-voice-uxlab.vercel.app/) |


프론트엔드와 백엔드는 서로 다른 origin을 사용하므로 Preview 환경에서도 프론트엔드·백엔드 URL과 인증 쿠키 설정이 일치해야 합니다.

## 프론트엔드 Vercel 설정


### 환경변수

Vercel 프로젝트의 환경변수에 다음 값을 설정합니다.

```env

---preveiw----
VITE_AUTH_API_ORIGIN=https://ten-minutes-api-git-dev-voice-uxlab.vercel.app
---preveiw----
VITE_AUTH_CONSENT_VERSION=2026-11-v1
```

`VITE_AUTH_API_ORIGIN`은 로그인과 상담 요청에 공통으로 사용하는 FastAPI 백엔드의 Preview origin입니다.

`VITE_AUTH_CONSENT_VERSION`은 사용자가 동의한 AI 처리 안내 문구의 버전을 식별하기 위한 값입니다. 예를 들어 `2026-11-v1`, `2026-11-v2`와 같은 형식으로 관리합니다. 음성 전송, AI 답변 처리 등 관련 동의 문구가 변경되면 새로운 버전으로 변경해야 합니다.

이 값은 `VITE_` 접두사가 붙는 브라우저 공개 설정이므로 비밀키를 저장해서는 안 됩니다. 

Vercel에서 환경변수를 변경한 경우 새 배포를 생성해야 프론트엔드 빌드에 반영됩니다.

### 환경변수 설정 설명
#### VITE_AUTH_CONSENT_VERSION: 동의 버전의 백엔드 처리

프론트엔드의 `VITE_AUTH_CONSENT_VERSION` 값은 회원 설정 저장 요청에서 `consent_version`이라는 이름으로 백엔드에 전달됩니다.

```http
PATCH /api/v1/users/me
```

백엔드는 해당 값을 `User.consent_version` 필드에 저장합니다. 회원 정보 저장 요청의 `consent_version`은 필수이며, 백엔드와 데이터베이스에서 최대 40자의 문자열로 검증·저장됩니다.

상담 생성 시 요청에 포함된 동의 버전과 사용자 계정에 저장된 버전이 일치하지 않으면 `409 CONSENT_REQUIRED` 오류가 반환됩니다.

관련 로직은 다음 파일에 구현되어 있습니다.

- `backend/app/schemas.py`: `consent_version`의 필수 여부 및 최대 40자 검증
- `backend/app/api.py`: 회원 정보 저장 및 상담 생성 전 동의 버전 비교
- `backend/app/models.py`: `User.consent_version` 데이터베이스 필드 정의
- `backend/app/serializers.py`: 동의 버전 저장 여부에 따른 `onboarding_required` 반환


## 백엔드 Vercel 설정


### 주요 환경변수

```env

---preveiw----
BACKEND_ORIGIN=https://ten-minutes-api-git-dev-voice-uxlab.vercel.app
PUBLIC_WEB_ORIGIN=https://ten-minutes-dev.vercel.app
---preveiw----

SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=none
```

| 변수 | 용도 |
|---|---|
| `BACKEND_ORIGIN` | OAuth callback 및 API의 기준 origin |
| `PUBLIC_WEB_ORIGIN` | 로그인 후 이동, CORS, 공유 링크에 사용할 프론트엔드 origin |
| `SESSION_COOKIE_SECURE` | HTTPS 환경에서 Secure 쿠키 사용 |
| `SESSION_COOKIE_SAMESITE` | 서로 다른 origin의 프론트엔드·백엔드 간 쿠키 전송을 위한 설정 |

그 외 데이터베이스, 세션, OAuth Provider, 카드 이미지와 관련된 환경변수도 백엔드 Vercel 프로젝트에 설정해야 합니다. 비밀값은 저장소나 프론트엔드 환경변수에 기록하지 않습니다.

서로 다른 HTTPS 도메인에 프론트엔드와 백엔드를 배포하는 경우 `SESSION_COOKIE_SECURE=true`와 `SESSION_COOKIE_SAMESITE=none`을 사용해야 합니다. OAuth Provider에는 백엔드 origin을 기준으로 callback URL을 등록합니다.


## Vercel Preview Protection

프론트엔드와 백엔드는 각각 별도의 Vercel 프로젝트로 배포되므로 Preview Protection도 프로젝트별로 확인하고 설정해야 합니다.

| 구분 | Vercel 프로젝트 | Preview URL | Protection 설정 | 확인 사항 |
|---|---|---|---|---|
| 프론트엔드 | `ten-minites` | [ten-minutes-dev.vercel.app](https://ten-minutes-dev.vercel.app/) | Preview 접근 시 Vercel Protection 적용 여부 확인 | 보호 페이지 통과 후 화면 로드, 로그인, API 요청 확인 |
| 백엔드 | `ten-minutes-api` | [ten-minutes-api-git-dev-voice-uxlab.vercel.app](https://ten-minutes-api-git-dev-voice-uxlab.vercel.app/) | Preview 접근 정책 및 프론트엔드 요청 허용 여부 확인 | `/health`, OAuth callback, 인증 API 요청이 보호 화면으로 가로막히지 않는지 확인 |

### 프론트엔드 Preview Protection

프론트엔드 Preview는 외부에 공개하지 않고 테스트에 필요한 사용자만 접근할 수 있도록 Vercel Protection을 적용합니다.

Protection이 활성화된 경우 다음을 확인합니다.

- 테스트 브라우저에서 Preview 보호 페이지 통과
- 보호 페이지 통과 후 React 앱 정상 로드
- 로그인 화면 접근
- OAuth 로그인 시작 및 callback 완료
- 백엔드 API 요청 정상 처리
- 회원 온보딩 및 상담 생성 정상 동작

### 백엔드 Preview Protection

백엔드 Preview는 API 서버이므로 브라우저에서 프론트엔드가 호출하는 요청까지 Protection에 의해 차단되지 않는지 확인해야 합니다.

다음 요청이 정상적으로 처리되어야 합니다.

- `GET /health`
- 현재 사용자 조회 API
- OAuth authorize 및 callback
- `PATCH /api/v1/users/me`
- 상담 생성 API
- 인증 쿠키가 포함된 프론트엔드의 API 요청

백엔드 Protection이 API 요청마다 별도의 Vercel 인증 화면을 반환하면 프론트엔드가 API 응답을 받을 수 없습니다. 이 경우 프론트엔드와 백엔드 Preview에 동일한 접근 권한을 부여하거나, 테스트 환경에서 API 요청이 허용되도록 Vercel Protection 정책을 조정해야 합니다.

## 프론트엔드·백엔드 연결 시 주의사항

프론트엔드와 백엔드는 서로 다른 origin을 사용합니다.

```env
VITE_AUTH_API_ORIGIN=https://ten-minutes-api-git-dev-voice-uxlab.vercel.app
PUBLIC_WEB_ORIGIN=https://ten-minutes-dev.vercel.app
```

따라서 두 Vercel 프로젝트의 Protection 정책이 서로 충돌하지 않아야 하며, Preview Protection을 통과한 브라우저에서 인증 쿠키와 API 요청이 정상적으로 전달되는지 확인해야 합니다.

보호된 Preview에서 테스트할 때는 Vercel Preview에 접근 권한이 있는 실제 테스트 브라우저를 사용하는 것이 안전합니다. 일반적인 `curl`이나 인증되지 않은 자동화 요청에서는 Vercel 인증 화면이 반환될 수 있습니다.

## 배포 후 확인 목록

- [ ] 프론트엔드 Preview 접속 확인
- [ ] 백엔드 Preview 접속 확인
- [ ] 백엔드 `/health` 응답 확인
- [ ] 프론트엔드의 `VITE_AUTH_API_ORIGIN` 설정 확인
- [ ] 프론트엔드의 `VITE_AUTH_CONSENT_VERSION` 설정 확인
- [ ] 백엔드의 `BACKEND_ORIGIN` 설정 확인
- [ ] 백엔드의 `PUBLIC_WEB_ORIGIN` 설정 확인
- [ ] `SESSION_COOKIE_SECURE=true` 설정 확인
- [ ] `SESSION_COOKIE_SAMESITE=none` 설정 확인
- [ ] OAuth callback URL 등록 확인
- [ ] Vercel Preview Protection 정책 확인
- [ ] 프론트엔드에서 로그인 및 회원 온보딩 확인
- [ ] 동의 버전 저장 및 상담 생성 검증 확인
- [ ] Preview Protection 상태에서 전체 흐름 확인


## 음성 상담 배포

배포 대상 DB의 마이그레이션 이력을 확인한 뒤 `20261125_0007`까지 적용합니다.
음성 상담 종료 요청이 OpenAI 연결을 닫고 DB에 종료를 기록하는지 확인합니다.
연결이 살아 있는 동안 브라우저가 약 30초마다 인증된 유지 신호를 보냅니다. 신호가
2분 이상 끊기면 DB가 다음 1분 점검에서 FastAPI에 종료를 요청합니다. 한 번에 최대
6개의 만료 연결을 확인하며, OpenAI 요청에 실패한 연결은 다음 점검의 대상에 남습니다.
상담 생성 9분 후 레나에게 마무리를 요청하고 10분에 브라우저가 통화를 종료합니다. 서버도 같은 만료 시각부터 재연결과 추가 합성을 거절하며, 남은 연결은 다음 예약 점검에서 종료합니다. 연결만 정리하고 리포트는 자동 생성하지 않습니다.

같은 Supabase DB에 다음 설정을 적용합니다.

1. Vercel 백엔드에 무작위 토큰을 `VOICE_CLEANUP_SECRET`으로 설정합니다.
2. 동일한 토큰은 Supabase Vault의 `voice_cleanup_secret`에, 해당 환경의 HTTPS 백엔드
   주소는 `voice_cleanup_backend_origin`에 저장합니다. Vercel 배포 보호가 있다면
   Vault의 `voice_cleanup_vercel_bypass`에 해당 프로젝트의 자동화용 키도 설정합니다.
3. 이 버전의 프론트와 백엔드를 배포한 뒤 DB 관리자 권한으로
   [예약 작업 SQL](../backend/sql/supabase_voice_cleanup.sql)을 적용합니다. 기존 버전에서
   열어 둔 연결은 배포 직후 바로 끊기지 않도록 2분의 유예를 둡니다.
4. 테스트 통화에서 브라우저를 강제 종료하고, 다음 점검 후 `realtime_calls.closed_at`이
   기록되는지 확인합니다. Supabase Cron 실행 이력은 HTTP 요청을 등록했는지 보여주므로,
   FastAPI 응답이나 DB의 종료 기록까지 확인합니다.
