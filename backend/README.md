# Ten Minutes Backend

FastAPI 기반의 상담, 카드, 리포트, 공유 API입니다. OpenAI는 Realtime 음성 상담에만 사용하며 로그인 Provider는 카카오와 네이버만 지원합니다.

## 로컬 실행

Python 3.9 이상과 `uv`가 필요합니다.

```bash
cd backend
cp .env.example .env
uv sync --locked
uv run uvicorn app.main:app --reload --port 8000
```

- Health check: `GET http://localhost:8000/health`
- OpenAPI UI: `http://localhost:8000/docs`
- 테스트: `uv run pytest`

`pyproject.toml`과 `uv.lock`이 의존성의 기준입니다. `requirements*.txt`는 Vercel과 `uv`를 사용할 수 없는 환경을 위한 호환 파일입니다.

로컬 기본 DB는 SQLite입니다. 배포 시 `DATABASE_URL`을 PostgreSQL URL로 설정합니다. 현재 스키마는 `AUTO_CREATE_SCHEMA=true`일 때 앱 시작 시 생성되므로, 운영 배포 전에 Alembic migration으로 전환해야 합니다.

OAuth callback의 API origin은 `BACKEND_ORIGIN`, 로그인 후 이동·CORS·공유 링크의 웹
origin은 `PUBLIC_WEB_ORIGIN`으로 설정합니다. 카드 이미지는 DB의
`tarot_cards.image_path`에 공개 경로를 저장하고 실제 PNG 파일은 정적 파일 호스팅이나
오브젝트 스토리지에 두는 구조로 추가할 예정입니다. 이미지 저장소가 연결되기 전까지
`image_url`과 `thumbnail_image_url`은 `null`입니다.

OAuth Provider의 프로필 닉네임은 상담용 `nickname`과 구분합니다. 상담용 호칭은
`PATCH /api/v1/users/me`에서 사용자가 `CUSTOM`을 선택했을 때만 저장하며, Provider 이메일은
현재 수집하거나 저장하지 않습니다.

## 구현된 API 범위

- 카카오/네이버 OAuth, HttpOnly 서비스 세션, 로그아웃, 사용자 설정
- 상담 생성/목록/조회/종료
- 78장 서버 덱, 4개 스프레드, 중복 없는 3장 확정, 카드 순차 공개
- OpenAI Realtime client secret 발급, Typecast 스트리밍 프록시
- 상담 이벤트, 개인 리포트 저장/조회
- 후킹 문구 기반 공유 링크 생성과 공개 teaser 조회

공개 공유 API는 질문, 카드, 카드별 해석, 상황 요약, “언니”의 한마디를 반환하지 않습니다. 개인 리포트 전문은 인증된 상담 소유자만 조회할 수 있습니다.
