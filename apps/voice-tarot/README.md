# Voice Tarot · React

홍비님의 [프론트엔드 제안 PR #12](https://github.com/voice-uxlab/tbd/pull/12)에 이어 구현한 앱입니다. 제안 브랜치를 기반으로 추가했으며, 원본 제안서는 변경하지 않습니다.

## 실행

백엔드를 먼저 실행합니다. PostgreSQL 연결, 소셜 로그인, OpenAI와 Typecast 키는 FastAPI 환경에서 설정합니다. [백엔드 실행 안내](../../backend/README.md)

이 디렉터리에서는 Node.js 24 이상과 npm을 사용합니다.

```sh
npm ci
npm run dev
```

React는 http://localhost:5173에서 실행됩니다. `VITE_AUTH_API_ORIGIN`은 로그인과 상담에 공통으로 사용하는 FastAPI 주소입니다. 로컬에서 비워 두면 Vite가 `/auth`와 `/api/v1`을 http://127.0.0.1:8000으로 전달합니다. `VITE_AUTH_CONSENT_VERSION`에는 승인된 AI 처리 동의 버전을 지정합니다. 두 설정은 브라우저에 공개됩니다.

FastAPI의 `PUBLIC_WEB_ORIGIN`은 브라우저에 표시된 프론트엔드 주소와 일치해야 합니다. 배포 시 FastAPI origin, OAuth 콜백, CORS와 쿠키 설정을 [배포 문서](../../docs/deployment.md)에 맞춥니다.

`npm run dev`는 Vite만 실행합니다. 로그인·상담에는 FastAPI와 PostgreSQL을 사용합니다. 보관된 JavaScript 데모는 `npm run poc`로 따로 실행할 수 있습니다.

### 로그인 하단 정책 안내

로그인 화면 하단의 이용약관과 개인정보처리방침은 화면 안의 다이얼로그에서 열립니다. 안내 문구는 `src/pages/home.tsx`에서 관리하며 팀이 확정한 본문으로 교체할 수 있습니다.

## 구성

| 항목 | 구현 |
|---|---|
| UI | React 19, TypeScript strict, Vite 8 |
| 경로 | React Router 7 |
| 스타일 | Tailwind CSS 4, CSS 변수, 기존 3x 이미지와 디자인 스타일 |
| 공통 UI | shadcn/ui 구성 방식의 Button·Input·Radix Dialog, `components.json` |
| 모션 | Motion, 안정적인 카드 key, 동작 줄이기 설정 반영 |
| 서버 데이터 | TanStack Query: 인증·상담 조회/캐시, 상담 생성 mutation |
| 품질 | ESLint, Prettier, Vitest, Testing Library, 기존 Node 테스트 |
| 음성·서버 | FastAPI + PostgreSQL, Realtime WebRTC 입력 + Typecast HTTP 스트리밍 |

```text
src/app/                    앱 설정·라우팅
src/pages/                  로그인·홈·상담·리포트
src/components/             카드·리더, 공통 UI
src/features/consultation/  Realtime 통화 컨트롤러·Typecast 음성 재생
src/api/                    API 요청·응답 타입, Query 설정
src/lib/                    탭 내 미확정 상담 상태·기존 로컬 리포트 읽기
src/styles/                 Tailwind·디자인 변수·기존 화면 스타일
public/assets/              기존 Figma 원본 3x 에셋
server/                     이전 Node 서버 소스와 비교 테스트용 구현
shared/                     TypeScript 카드·리딩 규칙·대화 기록·공유 타입
tests/                      현재 TypeScript 모듈을 검증하는 Node 테스트
poc/                        비교용 JavaScript PoC·정적 자료 (현재 앱 로직 아님)
```

## 상담 흐름

- 로그인·동의 → FastAPI 상담 생성 → FastAPI에 WebRTC SDP 전송 → 브라우저에서 OpenAI로 WebRTC 연결.
- 질문 확인과 임시 번호 선택은 현재 탭에서 이어갑니다. 사용자가 3장을 확정하면 서버 덱에 매핑되며, 공개 전에는 카드 정체를 반환하지 않습니다.
- FastAPI가 공개한 카드의 한국어 이름과 키워드를 해석에 쓰고, 카드 ID로 웹 에셋을 찾습니다. 답변 텍스트는 FastAPI의 Typecast 스트림에서 받아 재생하고, 사용자가 끼어들면 현재 합성과 대기 음성을 취소합니다.
- 10분 기준 시각은 FastAPI가 반환합니다. 같은 상담 ID로 재연결하면 시간이 초기화되지 않습니다. 통화 종료 뒤 상황 요약과 공개된 카드 해석을 서버에 저장합니다. 내 리포트 목록과 상세는 로그인 계정으로 조회합니다.
- 녹음에 동의한 경우 본인 마이크를 브라우저에서 녹음하고 내려받을 수 있습니다.

## 검증

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Node 및 React/컨트롤러 테스트를 실행합니다. 테스트는 상담 시작과 부분 선택, 동일 URL 복원, 리포트 진입, 세 장의 순차 공개·해석, 중복 함수 호출 방지, 재연결 시 종료 시간 유지 등을 확인합니다. 실제 마이크/스피커와 모바일 Safari 음성 통화는 기기에서 별도 확인이 필요합니다.

기존 Node 상담의 리포트는 저장된 브라우저의 이전 상세 링크에서 볼 수 있습니다. 기존 Node 상담은 새 서버에서 재연결할 수 없습니다. 계정별 FastAPI 리포트 목록에는 새 상담의 리포트가 표시됩니다.
