# Voice Tarot · React

홍비님의 [프론트엔드 제안 PR #12](https://github.com/voice-uxlab/tbd/pull/12)에 이어 구현한 앱입니다. 제안 브랜치를 기반으로 추가했으며, 원본 제안서는 변경하지 않습니다.

## 실행

Node.js 24 이상, npm 사용. 이 디렉터리에서:

```sh
npm ci
npm run dev
```

- React: http://localhost:5173 (고정 포트)
- PoC API: http://127.0.0.1:3011 (Vite가 HTTP·WebSocket 프록시)
- 비교용 기존 화면: `npm run poc` → http://localhost:3012
- 빌드 실행: `npm run build` 후 `npm start` → http://localhost:3000
- 화면 확인표: http://localhost:5173/screens

API 키 없이 **시범 통화** 전체 흐름을 실행할 수 있습니다. 실제 음성 통화에는 로컬 `.env`가 필요합니다. env 파일은 저장소에 포함하지 않습니다.

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

`npm run dev` / `npm start`는 `TTS_PROVIDER=typecast`로 실행합니다. OpenAI 정식 키와 OAuth 비밀 키는 프론트엔드에 전달하지 않습니다. Typecast 속도·목소리는 기존 `/voice-lab` 설정 화면과 서버 설정을 재사용합니다. OAuth 개발자 앱에는 각각 `${APP_ORIGIN}/auth/naver/callback`, `${APP_ORIGIN}/auth/kakao/callback`을 등록해야 합니다. 개인 계정 가입·본인인증과 개발자 앱 키 발급은 별도 절차입니다.

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
src/pages/                  로그인·홈·상담·리포트·이용권·화면표
src/components/             카드·리더·노트, 공통 UI
src/features/consultation/  DOM에 의존하지 않는 통화 컨트롤러·기존 도메인 어댑터
src/api/                    API 요청·응답 타입, Query 설정
src/lib/                    로컬 프로필·상담 기록 저장
src/styles/                 Tailwind·디자인 변수·기존 화면 스타일
public/assets/              기존 Figma 원본 3x 에셋
poc/                        실행 가능한 원본 PoC 및 재사용 서버·음성·카드 모듈
```

기존 `app.js`를 React 안에서 실행하지 않습니다. 화면은 React가 렌더링하고, 별도 `Consultation`이 음성 연결과 함수 호출을 담당합니다. 서버 카드 규칙·RWS 지식·Typecast 스트리밍은 검증된 PoC 모듈을 재사용합니다. FastAPI 전환은 이 PR의 범위가 아닙니다.

## 보존한 실제 동작

- 사연에 따라 1~5장과 해석 그룹을 선택하고, 동의 후 추가 카드 최대 1장. 내부 설정을 읽거나 리딩 방식 선택을 요구하지 않음.
- 고르기 전에는 카드가 없고, 번호를 일부만 말하면 부족한 수만 요청. 확인 전 공개하지 않음.
- 카드·방향·배치는 서버 보관. 상담 URL 진입 시 기존 상태를 먼저 조회. 새로고침과 재연결은 새 상담 생성/중복 차감 없이 복원.
- event ID / response ID / tool call ID 중복 처리 방지, 순차 서버 변경, 응답 중 사용자 발화 시 TTS 취소.
- 마이크 권한, 음소거, 배경음, 선택적 내 음성 녹음, 연결 실패 재시도, 시간 만료·연장.
- 종료 후 리포트와 흐름별 대화 노트. 데모 사연·사용자 발화·진행 기록 구분, 데모 종료 시 노트 펼침. 공유 이미지와 남은 카드 이어보기.

## 검증

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

기존 37개 테스트 + React/컨트롤러 테스트. 새 테스트는 StrictMode 하에서 닉네임→데모→부분 선택→공개→리포트, 카드 DOM 유지, 같은 URL 복원, 5장 비교+추가 카드, 중복 함수 호출, 재연결 중복 차감 방지를 확인합니다. 실제 마이크/스피커와 모바일 Safari 음성 통화는 기기에서 별도 확인이 필요합니다.

## 남은 서비스 연동

이용권·결제는 **로컬 데모**입니다. 실결제·서버 원장·회원별 상담 접근 제어·다른 기기에서의 리포트 조회는 아직 구현하지 않았습니다. 상담 ID는 임의 생성된 접근 토큰이며, 서버가 회원 소유권을 검증하는 구조로 바꾸기 전에는 프로덕션 서비스로 공개하지 않습니다. 소셜 로그인 OAuth 코드는 유지했지만 실제 개발자 앱과 콜백 등록이 완료되어야 로그인할 수 있습니다.

개발 참고: [Vite](https://vite.dev/guide/), [Tailwind Vite 설치](https://tailwindcss.com/docs/installation/using-vite), [shadcn Vite 구성](https://ui.shadcn.com/docs/installation/vite).
