# Ten Minutes

실시간 음성으로 고민을 나누고 타로 카드를 선택해 해석을 듣는 AI 타로 상담 서비스입니다.

## 개발 환경

React 프론트엔드는 [`apps/voice-tarot`](apps/voice-tarot/README.md), FastAPI 서버는 [`backend`](backend/README.md)에 있습니다. 프론트엔드 개발에는 Node.js 24 이상과 npm을 사용합니다.

- 인증 정보와 API 키는 서버 환경 변수로 관리합니다.
- 개인용 `.env`, 상담 로그, 녹음 파일은 커밋하지 않습니다.
- 의존성은 앱의 `package-lock.json`을 기준으로 설치합니다.
- 백엔드 설계와 API 명세는 [`specs/backend`](specs/backend/README.md)를 참고하세요. 설계 문서의 기능과 현재 테스트 앱의 구현 범위는 다를 수 있습니다.

## 실행 방법

[백엔드 실행 안내](backend/README.md)에 따라 FastAPI를 `8000` 포트에서 먼저 실행합니다.

```sh
cd apps/voice-tarot
npm ci
npm run dev
```

http://localhost:5173에서 Vite가 프론트엔드를 띄웁니다. 소셜 로그인과 음성 상담 요청은 FastAPI로 연결됩니다.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

기존 JavaScript PoC는 비교용 보관본이며 `npm run poc`로 실행할 수 있습니다.

## 협업

브랜치와 PR 규칙은 [`docs/git-flow.md`](docs/git-flow.md)를 따릅니다. 작업 브랜치에서 PR을 만들고 `dev`로 병합합니다.
