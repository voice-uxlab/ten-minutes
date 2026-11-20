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

### FastAPI 소셜 로그인 연결

Vite 환경 변수 `VITE_AUTH_API_ORIGIN`에 FastAPI 서버 주소를 지정합니다. `VITE_AUTH_CONSENT_VERSION`에는 서비스에서 승인한 AI 처리 동의 문구의 버전을 지정합니다. 프론트엔드를 실행하거나 빌드하기 전에 설정하며 두 값은 공개 설정입니다.

FastAPI의 `PUBLIC_WEB_ORIGIN`은 실제 프론트엔드 origin과 일치해야 합니다. OAuth 개발자 앱에는 FastAPI의 `BACKEND_ORIGIN`을 기준으로 콜백 URL을 등록합니다. 프론트엔드와 API가 서로 다른 사이트라면 HTTPS 및 `SESSION_COOKIE_SAMESITE=none`, `SESSION_COOKIE_SECURE=true`가 필요하며, 브라우저가 제3자 쿠키를 차단하는 환경에서는 동일 사이트 도메인에서 테스트합니다. 보호된 Preview를 사용할 때는 테스트 브라우저에도 해당 배포 접근 권한이 필요합니다.

`VITE_AUTH_API_ORIGIN`을 비워두면 기존 Node 소셜 로그인 경로를 사용합니다. 닉네임 체험과 상담 API는 기존 앱 서버를 계속 사용합니다.

FastAPI가 `onboarding_required`를 반환하면 첫 로그인 설정에서 기본 호칭(`DEFAULT`) 또는 사용자 닉네임(`CUSTOM`, 최대 40자)을 선택합니다. 동의 확인 후 `PATCH /api/v1/users/me`에 선택한 호칭과 `consent_version`을 저장합니다.

### 로그인 하단 정책 안내

로그인 화면 하단의 이용약관과 개인정보처리방침은 화면 안의 다이얼로그에서 열립니다. 데모 안내 문구는 `src/pages/home.tsx`에서 관리하며 팀이 확정한 본문으로 교체할 수 있습니다.

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
src/features/consultation/  통화 컨트롤러·Live 연결·TypeScript 음성 재생
src/api/                    API 요청·응답 타입, Query 설정
src/lib/                    로컬 프로필·상담 기록 저장
src/styles/                 Tailwind·디자인 변수·기존 화면 스타일
public/assets/              기존 Figma 원본 3x 에셋
server/                     TypeScript HTTP·인증·Realtime/Live·TTS API
shared/                     TypeScript 카드·리딩 규칙·대화 기록·공유 타입
tests/                      현재 TypeScript 모듈을 검증하는 Node 테스트
poc/                        비교용 JavaScript PoC·정적 자료 (현재 앱 로직 아님)
```

기존 `app.js`를 React 안에서 실행하지 않습니다. 화면은 React가 렌더링하고, 별도 `Consultation`이 음성 연결과 함수 호출을 담당합니다. 서버 카드 규칙·RWS 지식·Typecast 스트리밍은 `server/`와 `shared/`의 TypeScript 구현을 사용합니다. `strict` 타입 검사와 lint는 서버·공유 모듈도 포함합니다. Node 24 이상의 TypeScript 지원으로 `server/server.ts`를 직접 실행합니다. 기존 상담 파일은 호환을 위해 `poc/.reading-sessions/`에서 계속 읽고, 정적 연구 문서·개발자 음성 설정 화면도 기존 자산을 사용합니다. FastAPI 전환은 이 PR의 범위가 아닙니다.

## 보존한 실제 동작

- 78장 중 3장을 선택하고 과거·현재·미래 / 현 상태·장애물·대응책 / 나·상대·관계 흐름 / 선택지 A·B·조언 중 사연에 맞는 배치를 사용. 한 장 공개→짧은 해석과 질문→사용자 답변 듣기→다음 장 순서이며 추가 카드는 없음. 내부 설정을 읽거나 리딩 방식 선택을 요구하지 않음.
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

Node 및 React/컨트롤러 테스트를 실행합니다. 새 테스트는 StrictMode 하에서 닉네임→데모→부분 선택→공개→리포트, 카드 DOM 유지, 같은 URL 복원, 네 유형의 3장 선택과 개별 공개·해석 순서, 중복 함수 호출, 재연결 중복 차감 방지를 확인합니다. 실제 마이크/스피커와 모바일 Safari 음성 통화는 기기에서 별도 확인이 필요합니다.

## 남은 서비스 연동

이용권·결제는 **로컬 데모**입니다. 실결제·서버 원장·회원별 상담 접근 제어·다른 기기에서의 리포트 조회는 아직 구현하지 않았습니다. 상담 ID는 임의 생성된 접근 토큰이며, 서버가 회원 소유권을 검증하는 구조로 바꾸기 전에는 프로덕션 서비스로 공개하지 않습니다. 소셜 로그인 OAuth 코드는 유지했지만 실제 개발자 앱과 콜백 등록이 완료되어야 로그인할 수 있습니다.

개발 참고: [Vite](https://vite.dev/guide/), [Tailwind Vite 설치](https://tailwindcss.com/docs/installation/using-vite), [shadcn Vite 구성](https://ui.shadcn.com/docs/installation/vite).

## GPT-Live 자막 → Typecast 비교 경로

`/live-lab`에서 시작하면 GPT-Live WebRTC로 마이크를 보내고, Live의 `session.output_transcript.delta`만 Typecast로 재합성합니다. Live 원본 음성은 재생하지 않습니다. 기본 `/`도 현재는 Live→Typecast 통화입니다. 선택한 엔진은 상담 기록에 보관되어 재연결에도 유지됩니다.

서버 `server/live.ts`가 세션을 생성합니다. `LIVE_MODEL` 기본값은 `gpt-live-1`, 도구를 처리할 `LIVE_BACKEND_MODEL` 기본값은 `gpt-5.6-luna`입니다. Responses 위임의 개별 완료 항목에서 함수를 수집하고, 모든 결과를 반환한 뒤 한 번 이어갑니다. 백엔드 답변 텍스트를 음성으로 중복 재생하지 않습니다. 종료 리포트는 별도 Responses 요청으로 생성하고 실패하면 기존 기록 기반 요약을 사용합니다.

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


기본 홈(`/`)에서 Realtime + Typecast(기본)와 Live + Typecast 중 선택해 새 상담을 시작합니다. 두 버전 모두 문장 단위로 합성하고 음성 재생 시작에 자막을 표시합니다. OpenAI와 Typecast 키를 사용합니다. `/live-lab`도 동일한 음성 경로입니다. Typecast 기본 속도는 실제 API의 `output.audio_tempo: 1.3`로 설정합니다. `/voice-lab`에서 목소리·속도를 미리 듣고 적용할 수 있으며, 적용 후 새 통화를 시작해야 합니다. 이미 저장된 상담은 저장된 엔진으로 이어집니다.

노을 말속도 목표 기본값은 2.0입니다. 로컬 개발 통화 화면의 `개발자 · 노을 말속도`에서 0.8~2.0으로 선택하고 `통화 중 적용`을 누르면 `session.instructions.append`로 갱신합니다. 고정 재생 배속이 아니라 이후 발화의 목표이며, 생성 중인 음성이 즉시 바뀐다는 보장은 없습니다. 설정은 이 브라우저에 저장되고 다음 통화 시작 시에도 전달됩니다. 개발자 조절기는 production build에서는 숨깁니다.

2배 목표 요청에 맞춰 말속도 저장 키를 v2로 갱신했습니다. 이전 1.3배 설정 대신 새 기본값 2.0으로 시작하며, 이후 개발자 패널에서 선택한 값은 유지합니다.

레나 퀸의 페르소나는 앱 루트 `soul.md`에서 관리합니다. 서버 시작 시 파일을 읽어 Live·Realtime·위임 리딩 및 Live 리포트 생성에 사용하며, 파일을 읽을 수 없으면 서버가 시작되지 않습니다. 수정 후 API 서버를 재시작하고 새 상담을 시작하면 적용됩니다.

## 페르소나 비교

홈의 **테스트 · 페르소나 선택**에서 고른 설정을 새 상담에 저장합니다. Realtime과 Live 모두 적용되며, Live 위임 모델과 리포트도 같은 설정을 사용합니다. 기존 상담은 저장된 선택을 유지하고, 선택 정보가 없는 이전 상담은 레나를 사용합니다. 시범 통화는 고정 예시여서 페르소나의 실제 말투를 검증하지 않습니다.

- 기존 레나 퀸: `soul.md`
- 테스트 · 솔직한 상담 친구: `personas/test-friend.md` (사용자가 제공한 원문)
- 선택 항목: `shared/personas.ts`, 서버 파일 매핑: `server/instructions.ts`

Markdown을 수정하면 다음 새 음성 연결에서 읽습니다. 통화 중에는 바뀌지 않습니다. API는 허용된 페르소나 ID만 받으며 임의 파일 경로나 프롬프트 본문은 받지 않습니다. 목소리와 속도는 별도 설정으로, 페르소나 선택으로 변경되지 않습니다.

## 로컬 테스트 대화 로그

`npm run dev`의 새 실제 음성 통화는 `.test-logs/<상담 ID>-<연결 ID>.md`와 원본 이벤트 JSON을 자동 저장합니다. 약 2초마다 전송하고 종료 때 남은 이벤트를 저장합니다. 새로 연결하면 파일을 나누므로 재연결 전후를 구별할 수 있습니다. 갑자기 브라우저나 서버가 종료되면 마지막 미전송 이벤트는 빠질 수 있습니다.

- 양쪽 전사문, 함수 이름·인자·결과, 전송된 TTS 문장, 재생 시작 문장, 중단·오류·지연·통화 종료 기록
- 10초 안의 같은 도구·인자 재요청과 오류·긴 Live 자막→오디오 수신 지연을 검토 후보로 표시 (오류 판정이나 의미 분석은 아님)
- 생성된 전사와 재생 시작 기록은 구별하며, 문장 전체를 사용자가 들었다고 단정하지 않음
- 녹음 선택을 켠 경우 사용자 마이크 WebM 파일도 저장. 상담자 오디오는 포함하지 않으며, WebM 이외 브라우저 녹음 형식은 화면 다운로드로 보관
- 홈의 **이 브라우저의 이전 대화도 .md로 저장**으로 이전 노트·전사·리포트를 가져오기. 과거 오디오·도구 시각은 복원하지 못함

`.test-logs/`는 Git에서 제외하고 파일은 로컬에만 저장합니다. 서버 API는 프로덕션/`SERVE_REACT=1`에서 비활성화합니다. API 키·임시 토큰·인증 헤더·SDP·미공개 덱은 로그에 포함하지 않습니다. 대화 내용 자체는 사용자가 요청한 디버깅 자료로 보관되므로 테스트 후 필요 없어진 파일은 삭제하세요.

타로 설명 분량·근거 전달·진행 방식은 `reading-style.md`에서 공통 관리합니다. `soul.md`와 `personas/test-friend.md`는 성격과 말투를 담당합니다. 기본 리딩은 핵심 근거와 결론을 1~2문장으로 전달하고, 요청할 때 자세히 풉니다. Realtime·Live·위임 리딩에 적용되며 새 음성 연결부터 반영됩니다.

세 번째 테스트 페르소나 `cool-unnie`는 `personas/cool-unnie.md`에 있습니다. 홈의 새 상담 기본 선택은 **테스트 3 · 쿨한 언니**이며 기존 상담의 페르소나는 유지됩니다. 사용자 원문의 출력 분량은 최신 요청에 따라 공통 설명 규칙(결론 먼저, 1~2문장)으로 대체했습니다.
