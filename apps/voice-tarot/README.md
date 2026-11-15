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

Node 테스트 39개 + React/컨트롤러 테스트 11개 (총 50개). 새 테스트는 StrictMode 하에서 닉네임→데모→부분 선택→공개→리포트, 카드 DOM 유지, 같은 URL 복원, 5장 비교+추가 카드, 중복 함수 호출, 재연결 중복 차감 방지를 확인합니다. 실제 마이크/스피커와 모바일 Safari 음성 통화는 기기에서 별도 확인이 필요합니다.

## 남은 서비스 연동

이용권·결제는 **로컬 데모**입니다. 실결제·서버 원장·회원별 상담 접근 제어·다른 기기에서의 리포트 조회는 아직 구현하지 않았습니다. 상담 ID는 임의 생성된 접근 토큰이며, 서버가 회원 소유권을 검증하는 구조로 바꾸기 전에는 프로덕션 서비스로 공개하지 않습니다. 소셜 로그인 OAuth 코드는 유지했지만 실제 개발자 앱과 콜백 등록이 완료되어야 로그인할 수 있습니다.

개발 참고: [Vite](https://vite.dev/guide/), [Tailwind Vite 설치](https://tailwindcss.com/docs/installation/using-vite), [shadcn Vite 구성](https://ui.shadcn.com/docs/installation/vite).

## GPT-Live 자막 → Typecast 비교 경로

`/live-lab`에서 시작하면 GPT-Live WebRTC로 마이크를 보내고, Live의 `session.output_transcript.delta`만 Typecast로 재합성합니다. Live 원본 음성은 재생하지 않습니다. 기본 `/`의 Realtime 통화는 유지됩니다. 선택한 엔진은 상담 기록에 보관되어 재연결에도 유지됩니다.

서버 `server/live.mjs`가 세션을 생성합니다. `LIVE_MODEL` 기본값은 `gpt-live-1`, 도구를 처리할 `LIVE_BACKEND_MODEL` 기본값은 `gpt-5.6-luna`입니다. Responses 위임의 개별 완료 항목에서 함수를 수집하고, 모든 결과를 반환한 뒤 한 번 이어갑니다. 백엔드 답변 텍스트를 음성으로 중복 재생하지 않습니다. 종료 리포트는 별도 Responses 요청으로 생성하고 실패하면 기존 기록 기반 요약을 사용합니다.

자막을 짧은 단어 조각 그대로 합성하면 발음이 끊기거나 문장부호만 있는 요청이 Typecast에서 거부될 수 있습니다. 문장 끝은 즉시 전달하고, 나머지는 완성된 단어 묶음 또는 약 800ms 대기 후 전달합니다. 로컬 마이크 활동 감지 시 Typecast 큐와 보류 자막을 취소하며, 이전 타임스탬프의 자막을 버립니다. 마이크 활동 감지는 에너지 기반 휴리스틱이라 소음 환경에서는 기기 검증이 필요합니다.

### 지연 실측 (2026-11-15, 한국어 인사)

- 브라우저: 첫 자막 구간 → 첫 Typecast 재생 예약 **1,404ms**. 후속 구간 1,166ms / 481ms.
- 같은 자막 분할 코드를 사용한 서버 측 프로브: 첫 자막 → 첫 PCM **1,496ms** (분할 대기 807ms + 합성 응답 689ms).
- 소수의 합성 인사 테스트이며 일반적인 평균/백분위 수치가 아닙니다. 사용자 발화 종료부터 Live 자막까지의 시간, 해석/함수 실행 시간은 별도입니다. 더 빠르거나 더 자연스럽다고 아직 결론내릴 수 없습니다.

```sh
npm run live:latency
```

위 프로브는 실제 Live·Typecast API를 호출하며 과금됩니다. 마이크 대신 무음을 보내 인사 자막을 생성합니다. Live 음성을 재생하지 않아도 Live 음성 세션 사용료가 발생하고, Typecast 및 위임 모델 비용도 별도입니다. 자막 기반 재합성에서는 Live가 생각하는 발화 시점과 실제 들리는 음성 시점이 다르므로 네이티브 Live의 동시 대화 경험과 동일하지 않습니다.

검증: Live 세션 생성, 브라우저 Typecast 음성 재생, 실제 위임 함수로 질문 화면 변경, 카드 선택/공개, 종료·리포트, 자막 중복/문장부호 제거/중단/함수 배치 처리 테스트. 실제 사람의 마이크 발화와 모바일 Safari 비교 청취는 별도 확인이 필요합니다.

참고: [Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live), [자막 이벤트](https://developers.openai.com/api/docs/guides/live-conversations#display-captions), [위임 함수 처리](https://developers.openai.com/api/docs/guides/live-delegation#return-tool-results-and-approvals).
