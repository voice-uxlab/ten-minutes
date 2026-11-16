# 퀸의 타로 MVP 백엔드 설계

> 기준일: 2026-11-12  
> 상태: 구현 전 설계 초안  
> 기준 자료: 2026-11-12 컨셉안과 TEAM REVIEW, 2026-11-12 시점의 Frontend 프로젝트 `tarot-voice`  
> 문서 운영: [PR #7 백엔드/인프라 스펙 초안과 작성자 코멘트](https://github.com/voice-uxlab/tbd/pull/7)는 초기 논의 기록이다. TBD 항목은 검증과 팀 합의를 마친 뒤 확정한다.  
> 표기: 결정되지 않았거나 실환경에서 확인하지 못한 내용은 **TBD**로 표시한다.

## MVP 범위

| 항목 | 현재 기준 |
|---|---|
| 플랫폼 | 모바일 웹 Safari, Chrome |
| 초기 이용 규모 가정 | 약 100명: 팀원 7명 × 10명 + 추가 유입 약 30명 합산 |
| 초기 동시 이용 가정 | 동시 10명: 초기 통합 테스트와 사용자 테스트에 적용 |
| 주요 기능 | 카카오, 네이버, OpenAI 로그인, 서비스 호칭, 음성 상담, 번호 기반 카드 선택(현재 컨셉 기본 3장), 카드별 리딩과 종합 리딩, 관리자 기본 지표, 상담 리포트 |
| 카드 | 사전 정의된 78장, 정방향 또는 역방향. 기본 3장이며 상담 주제와 시나리오에 따라 변경 가능 |
| 확장 방식 | 최소 구성으로 배포한 뒤 이용량, 비용, 오류를 측정해 증설 여부 결정 |
| MVP 제외 항목 | 결제, 이용권, 포인트, 상품 구매 |

100명과 동시 10명은 서버의 수용 한도나 서비스 이용 상한이 아니다. MVP 비용 계산과 부하 테스트에 넣은 예상치다. 배포 후에는 실제 이용량, API 응답 시간, 오류율, DB 연결 수, 음성 지연, 연결 안정성, 월 운영 비용을 보고 증설 시점과 방법을 정한다.

## 기술 스택

| 영역 | 기준 | 용도 |
|---|---|---|
| 언어/API | Python, FastAPI | 인증, 상담, 카드, 리포트 API 구현과 입력값 검증 |
| 데이터베이스 | PostgreSQL | 사용자, 상담, 카드, 리포트와 최소 상담 이벤트 저장. 관리형 제공사는 **TBD** |
| 음성 이해 | OpenAI Realtime API | 브라우저 WebRTC 음성 입력, 텍스트 응답과 Tool Calling |
| 음성 합성 | Typecast Streaming TTS | OpenAI 텍스트 응답을 음성으로 합성 |
| 배포 | Vercel Pro | FE 정적 배포, FastAPI Function 실행, 환경 변수 관리, Preview/Production 배포 |
| 프롬프트 | Markdown 파일 | 페르소나, 상담 진행 규칙, 카드 해석 지침 관리. 세부 구성은 **TBD** |

MVP는 서버 설정과 운영에 드는 시간을 줄이고 FE Preview와 바로 연동하기 위해 Vercel Pro에 배포한다. 장기 운영 환경까지 Vercel로 확정한 것은 아니다. PoC에서 Python Function의 실행 시간, 스트리밍, 동시 요청, 세션, DB 연결을 테스트한다. 테스트를 통과하지 못하면 AWS 등으로 옮길 수 있도록 Python/FastAPI 코드에 Vercel 전용 로직을 넣지 않는다.

### 용어 설명

| 용어 | 설명 |
|---|---|
| Pydantic | FastAPI에서 요청과 응답 데이터의 타입, 필수값, 길이와 허용값을 검사하는 Python 라이브러리 |
| ORM | Python 객체와 PostgreSQL 테이블을 연결해 SQL 작성과 조회 결과 변환을 돕는 도구 |
| Provider | 카카오, 네이버, OpenAI처럼 로그인이나 외부 API 기능을 제공하는 서비스 |
| client secret | 브라우저가 OpenAI Realtime에 접속할 때 쓰는 짧은 수명의 임시 인증 값. 서버의 메인 API 키와 다름 |
| PoC | 선택한 기술이 실제 환경에서 동작하는지 작은 범위로 먼저 확인하는 검증 작업 |

## 문서 구성

| 순서 | 문서 | 주요 내용 | 주요 독자 |
|---:|---|---|---|
| 1 | [시스템 아키텍처와 사용자 관리](./system-architecture.md) | 시스템 구성, 신뢰 경계와 서버 검증 원칙, 로그인, FE 협의 항목 | FE, BE |
| 2 | [데이터베이스 설계](./database.md) | PostgreSQL 타입, ERD, 테이블과 제약 조건 | BE |
| 3 | [REST API 개요](./rest-api.md), [REST API 상세 명세](./rest-api-spec.md) | 공통 규칙과 엔드포인트 목록, API별 Request/Response, 타입, 검증과 오류 | FE, BE |
| 4 | [음성 상담 흐름](./voice-consultation-flow.md) | 음성/TTS 시퀀스, 상태 전이, 중단과 재연결 | FE, BE |
| 5 | [운영 및 기술 검증](./operations-and-validation.md) | 비용과 환경 준비, 모니터링, 검증 결과, 구현 순서와 완료 조건 | BE, 운영 |
| 6 | [TBD 목록](./decision-gates.md) | 미확정 이유, 결정 시점과 조건 | 기획, FE, BE, 운영 |

전체 구조는 이 README에서 확인하고, 구현할 때는 담당 영역의 문서를 함께 본다. 공통 항목을 바꾸면 README와 관련 세부 문서를 같은 PR에서 수정한다.

## 백엔드 구성

브라우저는 FastAPI에서 짧은 수명의 Realtime client secret을 받은 뒤 OpenAI Realtime API와 WebRTC로 직접 연결한다. OpenAI 응답은 텍스트로 받고, FE가 FastAPI의 Typecast 프록시를 통해 음성 합성과 재생을 제어한다. 백엔드는 사용자 마이크나 OpenAI WebRTC 연결을 중계하지 않는다.

FastAPI의 책임은 다음으로 제한한다.

1. 카카오, 네이버, OpenAI 로그인과 서비스 사용자 식별
2. 상담 생성과 상태 기록, Realtime client secret 발급
3. 서버 덱을 기준으로 카드 선택을 확정하고 순서대로 공개
4. Typecast 키 보호, 상담별 사용량 검증과 오디오 스트리밍 프록시
5. 상담 종료와 리포트 저장/조회
6. 최소 상담 이벤트 저장과 관리자 조회 API 제공

PostgreSQL에는 사용자, 카드, 리포트 상태와 최소 상담 이벤트만 저장한다. 장애와 성능 로그는 Vercel Logs에 남긴다. API 요청 전체와 대화 원문은 PostgreSQL에 복제하지 않는다. MVP에는 별도 음성 중계 서버, Redis, 메시지 큐, 워커, 마이크로서비스를 두지 않는다.

리포트 생성 주체는 Realtime 방식과 백엔드 별도 생성 방식을 비교한 뒤 확정하며, 검증 전까지 **TBD**다.

## 구현 규칙

- 브라우저는 선택 번호만 보내고 카드 ID와 방향은 서버가 확정한다.
- 현재 컨셉에서는 카드 3장을 기본값으로 사용하지만 확정된 고정값은 아니다. 카드 수는 상담 주제나 시나리오에 따라 변경할 수 있으며, 상담을 생성할 때 적용한 값을 저장한다. 이후 기본값이 바뀌어도 이미 생성된 상담의 카드 수는 바꾸지 않는다.
- OpenAI Realtime, Typecast, OAuth, DB 비밀 값은 Vercel 환경 변수에만 둔다.
- OpenAI Realtime은 텍스트를 출력하고 Typecast가 최종 음성을 합성한다.
- 로그에는 OAuth token, API key/client secret, 쿠키, 원문 고민, transcript, TTS 문장, 리포트 본문을 남기지 않는다.
- 관리자 API는 기존 운영 데이터 중 허용된 필드만 읽을 수 있다.
