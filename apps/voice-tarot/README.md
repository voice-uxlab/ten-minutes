# Voice Tarot · React

홍비님의 [프론트엔드 제안 PR #12](https://github.com/voice-uxlab/tbd/pull/12)에 이어 구현한 앱입니다. 제안 브랜치를 기반으로 추가했으며, 원본 제안서는 변경하지 않습니다.

## 실행

Node.js 24 이상, npm 사용. 이 디렉터리에서:

```sh
npm ci
npm run dev
```

- React: http://localhost:5173 (고정 포트)
- TypeScript API: http://127.0.0.1:3011 (Vite가 HTTP·WebSocket 프록시)
- 비교용 기존 화면: `npm run poc` → http://localhost:3012
- 빌드 실행: `npm run build` 후 `npm start` → http://localhost:3000

실제 음성 통화에는 로컬 `.env`가 필요합니다. env 파일은 저장소에 포함하지 않습니다.

| 서버 설정 | 용도 |
|---|---|
| `OPENAI_API_KEY` | Realtime 임시 토큰 발급 |
| `TYPECAST_API_KEY`, `TYPECAST_VOICE_ID` | 타입캐스트 스트리밍 음성 |
| `TYPECAST_MODEL` | 기존 PoC의 모델 설정 유지 |
| `APP_ORIGIN` | 개발 `http://localhost:5173`, 빌드 실행 `http://localhost:3000`, 배포 시 실제 HTTPS 주소 |
| `SESSION_SECRET` | 로그인 쿠키 서명용 고정 비밀 값 |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 네이버 개발자 앱 |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET` | 카카오 개발자 앱 |
| `READING_STORE_DIR` | 필요 시 서버 상담 데이터 보관 디렉터리 |

`npm run dev` / `npm start`는 `TTS_PROVIDER=typecast`로 실행합니다. OpenAI 정식 키와 OAuth 비밀 키는 프론트엔드에 전달하지 않습니다. Typecast 목소리는 서버의 `TYPECAST_VOICE_ID`로 지정하며 기본 합성 속도는 1.3배입니다. OAuth 개발자 앱에는 각각 `${APP_ORIGIN}/auth/naver/callback`, `${APP_ORIGIN}/auth/kakao/callback`을 등록해야 합니다. 개인 계정 가입·본인인증과 개발자 앱 키 발급은 별도 절차입니다.

### FastAPI 소셜 로그인 연결

Vite 환경 변수 `VITE_AUTH_API_ORIGIN`에 FastAPI 서버 주소를 지정합니다. `VITE_AUTH_CONSENT_VERSION`에는 서비스에서 승인한 AI 처리 동의 문구의 버전을 지정합니다. 프론트엔드를 실행하거나 빌드하기 전에 설정하며 두 값은 공개 설정입니다.

FastAPI의 `PUBLIC_WEB_ORIGIN`은 실제 프론트엔드 origin과 일치해야 합니다. OAuth 개발자 앱에는 FastAPI의 `BACKEND_ORIGIN`을 기준으로 콜백 URL을 등록합니다. 프론트엔드와 API가 서로 다른 사이트라면 HTTPS 및 `SESSION_COOKIE_SAMESITE=none`, `SESSION_COOKIE_SECURE=true`가 필요하며, 브라우저가 제3자 쿠키를 차단하는 환경에서는 동일 사이트 도메인에서 테스트합니다. 보호된 Preview를 사용할 때는 테스트 브라우저에도 해당 배포 접근 권한이 필요합니다.

`VITE_AUTH_API_ORIGIN`을 비워두면 기존 Node 소셜 로그인 경로를 사용합니다. 상담 API는 기존 앱 서버를 사용합니다.

FastAPI가 `onboarding_required`를 반환하면 첫 로그인 설정에서 기본 호칭(`DEFAULT`) 또는 사용자 닉네임(`CUSTOM`, 최대 40자)을 선택합니다. 동의 확인 후 `PATCH /api/v1/users/me`에 선택한 호칭과 `consent_version`을 저장합니다.

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
| 음성·서버 | 기존 Node HTTP + WebSocket API, Realtime WebRTC 입력 + Typecast 출력 |

```text
src/app/                    앱 설정·라우팅
src/pages/                  로그인·홈·상담·리포트
src/components/             카드·리더, 공통 UI
src/features/consultation/  Realtime 통화 컨트롤러·Typecast 음성 재생
src/api/                    API 요청·응답 타입, Query 설정
src/lib/                    로컬 프로필·상담 기록 저장
src/styles/                 Tailwind·디자인 변수·기존 화면 스타일
public/assets/              기존 Figma 원본 3x 에셋
server/                     TypeScript HTTP·인증·Realtime·Typecast API
shared/                     TypeScript 카드·리딩 규칙·대화 기록·공유 타입
tests/                      현재 TypeScript 모듈을 검증하는 Node 테스트
poc/                        비교용 JavaScript PoC·정적 자료 (현재 앱 로직 아님)
```

기존 `app.js`를 React 안에서 실행하지 않습니다. 화면은 React가 렌더링하고, 별도 `Consultation`이 음성 연결과 함수 호출을 담당합니다. 서버 카드 규칙·RWS 지식·Typecast 스트리밍은 `server/`와 `shared/`의 TypeScript 구현을 사용합니다. `strict` 타입 검사와 lint는 서버·공유 모듈도 포함합니다. Node 24 이상의 TypeScript 지원으로 `server/server.ts`를 직접 실행합니다. 기존 상담 파일은 호환을 위해 `poc/.reading-sessions/`에서 계속 읽고, 연구 문서는 기존 자료를 사용합니다. FastAPI 전환은 이 PR의 범위가 아닙니다.

## 보존한 실제 동작

- 78장 중 3장을 선택하고 과거·현재·미래 / 현 상태·장애물·대응책 / 나·상대·관계 흐름 / 선택지 A·B·조언 중 사연에 맞는 배치를 사용. 한 장 공개→짧은 해석과 질문→사용자 답변 듣기→다음 장 순서이며 추가 카드는 없음. 내부 설정을 읽거나 리딩 방식 선택을 요구하지 않음.
- 고르기 전에는 카드가 없고, 번호를 일부만 말하면 부족한 수만 요청. 확인 전 공개하지 않음.
- 카드·방향·배치는 서버 보관. 상담 URL 진입 시 기존 상태를 먼저 조회. 새로고침과 재연결은 새 상담 생성/중복 차감 없이 복원.
- event ID / response ID / tool call ID 중복 처리 방지, 순차 서버 변경, 응답 중 사용자 발화 시 TTS 취소.
- 마이크 권한, 음소거, 선택적 브라우저 녹음, 연결 실패 재시도, 10분 상담 타이머.
- 종료 후 상담 리포트와 이전 리포트 목록, 크리스마스 타로 초대 링크 공유.

## 검증

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Node 및 React/컨트롤러 테스트를 실행합니다. 테스트는 상담 시작과 부분 선택, 동일 URL 복원, 리포트 진입, 세 장의 순차 공개·해석, 중복 함수 호출 방지, 재연결 시 종료 시간 유지 등을 확인합니다. 실제 마이크/스피커와 모바일 Safari 음성 통화는 기기에서 별도 확인이 필요합니다.

## 남은 서비스 연동

회원별 상담 접근 제어와 다른 기기에서의 리포트 조회는 아직 구현하지 않았습니다. 상담 ID는 임의 생성된 접근 토큰이며, 서버가 회원 소유권을 검증하는 구조로 바꾸기 전에는 프로덕션 서비스로 공개하지 않습니다. 소셜 로그인 OAuth 코드는 유지했지만 실제 개발자 앱과 콜백 등록이 완료되어야 로그인할 수 있습니다.

개발 참고: [Vite](https://vite.dev/guide/), [Tailwind Vite 설치](https://tailwindcss.com/docs/installation/using-vite), [shadcn Vite 구성](https://ui.shadcn.com/docs/installation/vite).
