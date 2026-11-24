# 운영 및 기술 검증

> 상위 문서: [백엔드 설계 문서 안내](./README.md)
> 기준일: 2026-11-12
> 미확정 사항은 **TBD**로 표시한다.

## 목차

- [8. 비용과 환경 준비](#8-비용과-환경-준비)
  - [8.1 예상 비용](#81-예상-비용)
  - [8.2 개발 및 배포 일정](#82-개발-및-배포-일정)
  - [8.3 인프라 증설 조건](#83-인프라-증설-조건)
- [9. 모니터링 수집 항목](#9-모니터링-수집-항목)
  - [9.1 구조화 로그](#91-구조화-로그)
  - [9.2 PostgreSQL 최소 상담 이벤트](#92-postgresql-최소-상담-이벤트)
  - [9.3 수집 이벤트와 지표](#93-수집-이벤트와-지표)
- [10. 백엔드 기술 검증 결과](#10-백엔드-기술-검증-결과)
  - [10.1 검증 상태](#101-검증-상태)
  - [10.2 검증표](#102-검증표)
  - [10.3 리포트 처리 방식 검증 계획](#103-리포트-처리-방식-검증-계획)
  - [10.4 Vercel/PostgreSQL 검증 시나리오](#104-vercelpostgresql-검증-시나리오)
- [11. 구현 순서와 완료 기준](#11-구현-순서와-완료-기준)
  - [11.1 구현 순서](#111-구현-순서)
  - [11.2 백엔드 MVP 완료 기준](#112-백엔드-mvp-완료-기준)
- [12. 공식 문서 참고](#12-공식-문서-참고)

## 8. 비용과 환경 준비

### 8.1 예상 비용

아래 금액은 서버와 DB의 공개 정가를 합산한 예시다. 실제 청구액은 사용량에 따라 달라진다.

| 구성 예시 | 월 기본 비용 | 가정 및 유의사항 |
|---|---:|---|
| Vercel Pro + Supabase Free | 약 `$20` | 배포 권한 1명, 개발/검증용 DB. Free DB는 비활성 시 일시정지 가능 |
| Vercel Pro + Supabase Pro | 약 `$45` | 배포 권한 1명, 관리형 DB 백업 포함. 추가 사용량과 좌석 비용은 별도 |

OpenAI Realtime, Typecast TTS, 리포트 생성, 도메인과 초과 트래픽 비용은 별도다. 상담 1회당 실제 AI 비용은 PoC에서 측정한 뒤 월 운영비에 반영한다.

- Vercel Pro: https://vercel.com/docs/plans/pro-plan
- Supabase: https://supabase.com/pricing

### 8.2 개발 및 배포 일정

| 단계 | 준비 범위 |
|---|---|
| 명세 | 기술 스택, 담당 기능, 데이터, 비용, TBD 정리. 이 단계에서는 계정과 서버를 만들지 않아도 됨 |
| 백엔드 개발 예정 | 2026년 11월 3주차부터 FastAPI 프로젝트 구성, PostgreSQL 연결, 인증, 상담, 카드 API 구현 시작 |
| PoC/로컬 개발 | Python 환경, FastAPI, 개발 DB, `.env`, 기본 로그와 프롬프트 준비 |
| 통합 테스트 | Vercel Preview에서 HTTPS, 환경 변수, 시크릿, Typecast 스트리밍 중단, 카드 및 상담 단계 연동 확인 |
| MVP 배포 전 | 오류 모니터링, 백업/복구, 비용 알림, 사용량 상한, 접근 권한, 프롬프트 점검 |

현재 Vercel Pro는 백엔드 담당자의 개인 카드로 결제하며, 같은 담당자가 계정과 비용을 관리한다. Supabase는 Free 플랜으로 시작한다. Free 플랜의 프로젝트 일시정지, 자동 백업 부재, DB 자원 또는 연결 제한 때문에 운영이 어려우면 Pro로 전환한다. 전환 전에는 추가 비용을 누가 부담하고 어떻게 승인할지 팀에서 정한다.

### 8.3 인프라 증설 조건

MVP 부하 테스트는 사용자 약 100명과 동시 상담 10명을 기준으로 실행한다. 100명은 팀원 7명이 각 10명에게 공유한 70명에 추가 유입 30명을 더한 값이다. 동시 상담 10명은 초기 테스트 조건이며, 두 수치 모두 서버 수용 한도나 서비스 이용 상한이 아니다.

배포 후에는 이용량, API 지연, 오류율, DB 연결 수, 쿼리 성능, 음성 지연, 연결 성공률, 월 운영 비용을 측정한다. 경고 임계값에 가까워지거나 사용자 증가가 예상되면 부하 테스트를 다시 실행하고 증설 여부를 정한다. 경고 임계값은 PoC 결과를 본 뒤 확정하며 현재는 **TBD**다.

## 9. 모니터링 수집 항목

### 9.1 구조화 로그

FastAPI는 요청마다 한 줄짜리 JSON 로그를 Vercel Logs에 남긴다. PostgreSQL에는 요청 로그를 복제하지 않는다.

```json
{
  "timestamp": "2026-11-10T10:05:30Z",
  "level": "ERROR",
  "event": "realtime_client_secret_failed",
  "request_id": "req_...",
  "consultation_id": "52eeb1b0-...",
  "user_id_hash": "sha256:...",
  "provider": "openai",
  "upstream_status": 502,
  "duration_ms": 821
}
```

금지 필드: OAuth token, OpenAI/Typecast API key와 client secret, 세션 쿠키, Typecast 합성 텍스트, 원문 고민, transcript, 리포트 본문, 이메일, 전화번호.

### 9.2 PostgreSQL 최소 상담 이벤트

`consultation_events`에는 상담 단계별 이탈과 음성 오류를 집계하는 데 필요한 정보만 저장한다.

- 주요 화면과 상담 단계 진입
- Realtime 연결 실패/중단, 재연결 시도/성공
- TTS 실패와 재생 취소
- 상담 중 페이지 비활성화

이벤트 API는 `event_type`, `stage`, `reason_code`, `duration_ms`, `slot`만 받는다. 임의 `metadata`, 사용자 발화, 질문, transcript, 합성 문장은 저장하지 않는다. 상담 생성, 카드 확정, 공개, 종료, 리포트 결과는 기존 테이블에서 조회할 수 있으므로 이벤트 테이블에 다시 저장하지 않는다.

### 9.3 수집 이벤트와 지표

| 분류 | 이벤트/지표 | 저장 위치 | 목적 |
|---|---|---|---|
| API | 요청 수, 4xx/5xx, p50/p95 지연, DB 오류 | Vercel Logs | 기본 안정성 |
| 인증 | provider별 시작, 성공, 실패, state 불일치 | Vercel Logs | 로그인 장애 파악 |
| 상담 UX | 단계 진입 수, 단계별 이탈률 | PostgreSQL 이벤트와 기존 상담 테이블 | 사용자 흐름 개선 |
| Realtime | 연결 실패, 중단, 재연결 시도, 성공률 | PostgreSQL 이벤트, 상세 오류는 Vercel Logs | 음성 연결 품질 |
| Typecast | 실패, 취소율 | PostgreSQL 이벤트 | 사용자 영향 파악 |
| Typecast | 요청별 TTFB, 전체 시간, 글자 수 | Vercel Logs | 성능, 비용 분석 |
| 상담 | 생성, 활성, 종료, 실패, end reason | 기존 상담 테이블 | 퍼널과 비정상 종료 |
| 카드 | 선택 성공, 충돌, 공개 순서 오류 | 기존 카드 테이블과 Vercel Logs | 데이터 일관성 |
| 리포트 | 요청, 성공, 실패, 생성 시간, fallback 비율 | 기존 리포트 테이블과 Vercel Logs | 처리 방식 검증 |
| 관리자 | 관리자 API 접근 거절, 조회 성공, 집계 지연 | Vercel Logs | 권한, 운영 가시성 |

사용자 발화 내용 기반 분석은 MVP 기본 수집에 포함하지 않는다. PostgreSQL 상담 이벤트와 Vercel Logs의 보존 기간, 알림 채널, 외부 오류 추적 도구 도입은 **TBD**다.

## 10. 백엔드 기술 검증 결과

### 10.1 검증 상태

| 상태 | 의미 |
|---|---|
| 확인 | 코드, 테스트 또는 공식 문서로 확인함 |
| 부분 확인 | 문서나 구조는 확인했지만 실제 계정, 배포 또는 기기 테스트가 남음 |
| 미검증 | 환경 또는 정책이 없어 실행하지 못함 |

### 10.2 검증표

| 항목 | 방법 | 결과 | 상태 | 후속 검증 |
|---|---|---|---|---|
| PoC 카드 무결성 | `npm test` | 78장 unique, 잘못된 선택 거절, 선택 고정, 순차 공개 테스트 1건 통과 | 확인 | 백엔드 이관 후 DB 통합 테스트 |
| PoC 서버 로컬 실행 | `npm start` | 작업 샌드박스의 포트 바인딩 제한으로 `listen EPERM 127.0.0.1:3000` | 미검증 | 일반 로컬/Preview 환경에서 E2E |
| PoC Realtime 구조 | `server.mjs`, `app.js`와 OpenAI 공식 문서 대조 | 현재 PoC는 OpenAI 오디오 출력을 직접 재생함. 목표 구조는 `text` 출력으로 변경 필요 | 부분 확인 | `output_modalities: ["text"]`, 툴 호출, 입력 전사 실통화 검증 |
| FastAPI on Vercel | Vercel 공식 문서 | FastAPI `app`을 단일 Vercel Function으로 배포 가능, Python runtime은 현재 Beta, bundle 500MB 제한 | 부분 확인 | Preview에 최소 앱 배포 후 `/health`, cold/warm 호출 |
| Vercel 응답 스트리밍 | Vercel 공식 문서 | Python/FastAPI Function의 `StreamingResponse` 지원 확인 | 부분 확인 | Typecast 오디오 chunk를 Preview에서 브라우저까지 전달, 취소, backpressure 검증 |
| Vercel Pro 실행 시간 | Vercel 공식 문서 | Fluid compute 기본 사용 및 함수 duration 설정 가능. 장시간 WebRTC 중계는 없고 짧은 TTS 스트림만 통과 | 확인 | TTS p95, 동시 요청, 메모리, 비용 검증 |
| Typecast TTS | Typecast 공식 문서 | API key 인증, JavaScript SDK, 스트리밍 TTS와 자체 proxy 설정 지원 확인 | 부분 확인 | 실제 요금제로 한국어 voice, TTFB, 동시성, 상업 이용 조건 검증 |
| Typecast 키 보호 | Typecast 공식 문서와 위협 검토 | 브라우저 직접 키 포함은 금지하고 FastAPI proxy 사용 | 설계 확인 | DevTools에 키 미노출, 인증, 글자 수, rate limit 우회 테스트 |
| 끼어들기 | 구조 검토 | 외부 TTS 사용 시 OpenAI 생성 텍스트와 실제 청취 범위가 달라질 수 있음 | 미검증 | 재생 중 발화, response cancel, 요청 중단, 이전 오디오 미재생 확인 |
| PostgreSQL 연결 | 설계 검토 | Vercel Functions에서는 연결 풀/managed pooler가 필요 | 미검증 | DB 제공사, 리전 확정, cold/warm/동시 10 연결 테스트 |
| 데이터 저장, 조회 | 스키마, API 설계 | 구현 전이므로 실행 결과 없음 | 미검증 | 사용자→상담→카드→리포트 트랜잭션 통합 테스트 |
| 카카오 로그인 | 카카오 공식 REST API 문서 | 인가 코드→토큰→사용자 정보 조회 흐름 확인 | 부분 확인 | 앱 등록, redirect URI, 동의항목, 모바일 웹 검수 |
| 네이버 로그인 | 네이버 공식 API 문서 | code/state→토큰→프로필 조회 흐름 확인 | 부분 확인 | 앱 등록, callback URL, 제공 정보 검수 |
| OpenAI 로그인 | OpenAI 공식 “Sign in with ChatGPT” 문서 | Authorization Code + PKCE + OIDC 흐름 확인. 제한된 상용 파트너 시험 기능 | 미검증 | OAuth client 발급 가능 여부, callback, `state`, `nonce`, ID token 검증, 공식 브랜딩 확인 |
| 재연결 | PoC 코드 검토 | 현재는 중단 시 종료하며 자동/수동 재연결 미구현 | 미검증 | 새 client secret, 서버 상태 복원, iPhone Safari 테스트 |
| 리포트 | PoC 코드 검토 | OOB 생성, 25초 timeout, fallback 코드는 있으나 핸드오프에도 실통화 미검증으로 기록 | 미검증 | 아래 비교 실험 후 생성 주체 결정 |
| 모니터링 | 설계 | Vercel 기술 로그와 PostgreSQL 최소 상담 이벤트를 분리 정의, 알림, 보존 미정 | 미검증 | Preview 오류 주입, 이벤트 중복, 허용 필드, 민감정보 점검 |

### 10.3 리포트 처리 방식 검증 계획

동일한 상담 fixture 10개로 두 방식을 비교한 뒤 하나만 구현한다.

| 비교 항목 | A. Realtime OOB 후 저장 | B. FastAPI가 종료 시 별도 생성 |
|---|---|---|
| PoC 변경량 | 작음 | 큼 |
| Vercel 함수 대기 | 저장 요청만 짧음 | 모델 응답 동안 대기 |
| 클라이언트 종료 영향 | 연결이 먼저 닫히면 실패 가능 | 비교적 독립적 |
| 서버 신뢰성 | 클라이언트 생성 결과를 검증해 저장 | 서버가 생성, 저장 |
| 필요한 입력 | 활성 Realtime 대화 | transcript 전달/저장 정책 |
| 현재 결론 | **TBD** | **TBD** |

성공률, p95 생성 시간, JSON 스키마 준수율, 비공개 카드 포함 여부, 재시도 시 중복 생성 여부를 비교한다. 합격 수치와 transcript 보존 정책은 **TBD**다.

### 10.4 Vercel/PostgreSQL 검증 시나리오

1. 최소 FastAPI 앱을 Vercel Preview에 배포하고 `/health`가 200인지 확인한다.
2. 동일 리전의 PostgreSQL 후보를 연결하고 `SELECT 1`, insert, read, transaction rollback을 확인한다.
3. cold start 1회, warm request 20회, 동시 10요청에서 연결 수, 오류, p95를 기록한다.
4. 상담 생성과 카드 확정을 동시에 중복 요청하여 한 선택만 저장되는지 확인한다.
5. 테스트 설정에서 기본값과 다른 카드 수로 상담을 생성하여 선택 개수 검증, 순차 공개, 재연결 복원, 리포트 배열이 동일한 개수를 유지하는지 확인한다.
6. 함수 인스턴스가 바뀌어도 세션 상태가 PostgreSQL에서 복원되는지 확인한다.
7. OpenAI upstream timeout과 DB timeout을 주입해 `502/503`, 로그, 사용자 재시도 경로를 확인한다.
8. Typecast 스트리밍을 FastAPI `StreamingResponse`로 프록시하여 첫 오디오 도착 시간, 전체 지연, 동시 10요청, 클라이언트 취소 시 upstream 종료 여부를 기록한다.
9. 브라우저에서 Typecast API 키가 노출되지 않는지 확인하고 비로그인, 타 사용자 상담, 종료 상담, 글자 수 초과 요청을 거절한다.

DB 연결은 모듈 전역에 작은 pool을 초기화하되 인스턴스 재사용을 가정하지 않는다. DB 제공사의 transaction pooler URL 사용 여부와 pool 크기는 실제 제공사 확정 후 **TBD**다.

## 11. 구현 순서와 완료 기준

### 11.1 구현 순서

1. FastAPI Vercel Preview와 PostgreSQL 연결 PoC
2. 카드 78장 seed와 상담/덱/선택 트랜잭션
3. 카카오, 네이버, OpenAI 로그인과 사용자 호칭 API
4. Realtime credential 발급, FE 직접 WebRTC 입력과 text 출력 연결
5. Typecast 스트리밍 프록시와 FE 문장 분할, 재생, 중단 연결
6. 카드 선택, 공개 API를 PoC 툴 호출에 연결
7. 종료, 재연결 상태와 상담 조회
8. 리포트 방식 검증, 확정 후 저장/조회
9. 구조화 로그, 최소 상담 이벤트와 오류 시나리오 점검
10. `ADMIN` 권한 검사, 관리자 조회 API와 기본 지표 집계 검증

### 11.2 백엔드 MVP 완료 기준

- [ ] Vercel Pro Preview/Production에서 FastAPI가 배포되고 health check가 성공한다.
- [ ] 카카오, 네이버, OpenAI 각각 로그인, 재로그인, state 위조 거절을 확인한다.
- [ ] OpenAI 로그인에서 PKCE, nonce와 ID token의 서명, issuer, audience, 만료 오류를 각각 거절한다.
- [ ] Provider 프로필과 별개로 로그인 후 기본 호칭 또는 직접 입력 호칭이 저장된다.
- [ ] 동일 이메일의 서로 다른 Provider 계정이 사용자 확인 없이 자동 병합되지 않는다.
- [ ] 사용자 A가 사용자 B의 상담, 리포트를 조회하거나 변경할 수 없다.
- [ ] 한 상담에서 78장 서버 덱이 고정되고 `expected_card_count`만큼 서로 다른 번호가 한 번만 확정된다.
- [ ] 재시도와 동시 요청에도 카드 결과가 바뀌지 않는다.
- [ ] 카드 공개는 1부터 해당 상담의 `expected_card_count`까지 순서대로만 허용되며 재연결 후 같은 상태가 복원된다.
- [ ] 서비스의 기본 카드 수를 변경해도 이미 생성된 상담의 `expected_card_count`와 선택 결과는 바뀌지 않는다.
- [ ] 브라우저가 OpenAI와 직접 WebRTC로 연결되고 OpenAI는 text 응답만 반환하며 메인 API 키가 노출되지 않는다.
- [ ] Typecast API 키가 브라우저에 노출되지 않고 인증된 활성 상담만 TTS 프록시를 호출한다.
- [ ] Typecast 음성이 순서대로 재생되고 끼어들기, 종료 시 진행 중 요청과 남은 오디오가 즉시 중단된다.
- [ ] Typecast 실패 시 확정된 fallback 정책에 따라 상담이 중복 재생 없이 계속되거나 종료된다.
- [ ] 연결 중단 후 **TBD** 정책 안에서 새 client secret으로 같은 상담을 복구한다.
- [ ] 종료 요청을 반복해도 한 번만 종료되며 늦은 이벤트가 상태를 되돌리지 않는다.
- [ ] 확정된 한 가지 리포트 경로가 성공, 실패, 재시도 시나리오를 통과한다.
- [ ] 로그에 token, client secret, cookie, transcript, 고민, 리포트 본문이 남지 않는다.
- [ ] 상담 단계, 연결 중단, 재연결, TTS 실패 이벤트가 중복 없이 저장되고 허용되지 않은 필드와 민감정보는 거절된다.
- [ ] 일반 사용자는 관리자 API에 접근할 수 없고 관리자는 제한된 운영 필드와 집계만 조회한다.

## 12. 공식 문서 참고

- [Vercel FastAPI 배포](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Python Runtime](https://vercel.com/docs/functions/runtimes/python)
- [Vercel FastAPI 응답 스트리밍](https://vercel.com/kb/guide/ship-a-fastapi-app-on-vercel)
- [Vercel Function 실행 시간 설정](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel Functions DB connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions)
- [OpenAI Realtime 시작 가이드](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI Realtime 대화와 text 출력](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI Realtime client secret API](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create)
- [OpenAI Sign in with ChatGPT 웹사이트 연동](https://developers.openai.com/siwc/website)
- [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api)
- [네이버 로그인 API 명세](https://developers.naver.com/docs/login/api/api.md)
- [Typecast API 개요](https://typecast.ai/docs/overview)
- [Typecast JavaScript SDK와 proxy 설정](https://typecast.ai/docs/sdk/javascript)
