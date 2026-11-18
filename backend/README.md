# Ten Minutes Backend

FastAPI 기반의 상담, 카드, 리포트, 공유 API입니다. OpenAI는 Realtime 음성 상담에만 사용하며 로그인 Provider는 카카오와 네이버만 지원합니다.

## 로컬 실행

Python 3.9 이상과 `uv`가 필요합니다.

```bash
cd backend
cp .env.example .env
uv sync --locked
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

- Health check: `GET http://localhost:8000/health`
- OpenAPI UI: `http://localhost:8000/docs`
- 테스트: `uv run pytest`

## API 문서 사용법

서버 실행 후 `http://localhost:8000/docs`에서 API별 요청 파라미터, 응답 필드와 상태 코드
예시를 확인할 수 있습니다. 테스트하려면 API 항목을 펼치고 `Try it out`을 누른 뒤 값을
입력해 `Execute`를 실행합니다. 인증이 필요한 API는 먼저 같은 브라우저에서 카카오 또는
네이버 로그인을 완료해야 HttpOnly 세션 쿠키가 자동으로 전달됩니다.

- `400`: OAuth state나 목록 cursor처럼 요청 자체가 올바르지 않음
- `401`: 서비스 세션이 없거나 만료되어 로그인 필요
- `404`: 본인 소유 리소스가 없거나 공개 공유 토큰이 유효하지 않음
- `409`: 카드 공개 순서, 종료 상태, 리포트 중복처럼 현재 서버 상태와 요청이 충돌
- `422`: 요청 body, path, query 또는 header 값의 형식과 검증 규칙이 맞지 않음
- `500`: 예상하지 못한 백엔드 또는 DB 처리 오류. 응답의 `request_id`로 서버 로그 확인
- `502`~`504`: OpenAI, Typecast 등 외부 서비스 오류, 미설정 또는 timeout

오류 응답은 모두 다음 형식이며 내부 예외와 비밀값은 응답에 포함하지 않습니다.

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "The server could not process the request.",
    "request_id": "req_..."
  }
}
```

`pyproject.toml`과 `uv.lock`이 의존성의 기준입니다. `requirements*.txt`는 Vercel과 `uv`를 사용할 수 없는 환경을 위한 호환 파일입니다.

로컬과 배포 환경 모두 PostgreSQL만 사용합니다. FastAPI는 `DATABASE_URL`, Alembic은
`MIGRATION_DATABASE_URL`을 사용합니다. migration URL을 생략하면 `DATABASE_URL`로
대체합니다. 스키마와 78장 카드 기준 데이터는 Alembic으로 관리하며 새 DB에는 서버를
실행하기 전에 `uv run alembic upgrade head`를 실행합니다. 앱 시작 시 테이블을 자동
생성하지 않습니다.

Supabase에서는 로컬 실행과 migration에 Session pooler(5432)를 사용할 수 있습니다.
Vercel에서는 FastAPI의 `DATABASE_URL`에 Transaction pooler(6543)를 사용하고 migration은
Session 또는 Direct 연결로 실행합니다. 런타임 연결 풀은 서버리스 인스턴스당 1개이며
transaction pooler 호환을 위해 psycopg prepared statement를 비활성화합니다.

PostgreSQL 연결 확인은 별도 테스트 DB의 `TEST_DATABASE_URL`을 설정한 뒤 실행합니다.

```bash
uv run pytest -m postgresql
```

이 테스트는 migration 적용 여부와 78장 seed를 읽기 전용으로 확인합니다. URL이 없으면
건너뛰며 일반 테스트는 계속 인메모리 DB 대역을 사용합니다.

OAuth callback의 API origin은 `BACKEND_ORIGIN`, 로그인 후 이동·CORS·공유 링크의 웹
origin은 `PUBLIC_WEB_ORIGIN`으로 설정합니다. 카드 이미지는 DB의
`tarot_cards.image_path`에 공개 경로를 저장하고 실제 PNG 파일은 현재 백엔드의
`app/static/cards`에서 제공합니다. 현재 앞면 이미지는 PoC의 별, 태양, 절제 세 장을
78장에 반복 매핑한 임시 데이터입니다. 정식 카드 이미지가 준비되면 파일과 seed 경로를
교체해야 합니다.

로컬 HTTP 환경에서는 `SESSION_COOKIE_SECURE=false`, `SESSION_COOKIE_SAMESITE=lax`를
사용합니다. 프론트엔드와 백엔드가 서로 다른 HTTPS 도메인으로 배포되는 Vercel 환경에서는
브라우저가 인증 쿠키를 교차 사이트 API 요청에도 보내도록
`SESSION_COOKIE_SECURE=true`, `SESSION_COOKIE_SAMESITE=none`으로 설정해야 합니다.
프론트엔드 요청에도 `credentials: "include"`가 필요합니다.

OAuth Provider의 프로필 닉네임은 상담용 `nickname`과 구분합니다. 상담용 호칭은
`PATCH /api/v1/users/me`에서 사용자가 `CUSTOM`을 선택했을 때만 저장하며, Provider 이메일은
현재 수집하거나 저장하지 않습니다.

## 구현된 API 범위

- 카카오/네이버 OAuth, HttpOnly 서비스 세션, 로그아웃, 사용자 설정
- 상담 생성/목록/조회/종료
- 78장 서버 덱, 4개 스프레드, 중복 없는 3장 확정, 카드 순차 공개
- OpenAI Realtime client secret 발급, Typecast 스트리밍 프록시
- 상담 이벤트, 개인 리포트 저장/조회
- 후킹 문구 기반 공유 링크 생성과 공유 미리보기 조회

공개 공유 API는 질문, 카드, 카드별 해석, 상황 요약, “언니”의 한마디를 반환하지 않습니다. 개인 리포트 전문은 인증된 상담 소유자만 조회할 수 있습니다.
