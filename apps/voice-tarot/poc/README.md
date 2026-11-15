> 이 폴더는 비교용 JavaScript PoC 보관본입니다. 현재 앱은 상위 폴더의 `server/*.ts`, `shared/*.ts`, `src/`에서 실행합니다. 현재 기능을 수정할 때 이 보관본을 수정하지 마세요.

# 퀸의 타로 · Codex PoC

Codex로 구현한 모바일 웹 음성 타로 상담.

## 기술 스택

| 영역 | 현재 사용 기술 | 역할 |
|---|---|---|
| 프런트엔드 | HTML5, CSS3, JavaScript ES Modules | 모바일 화면, 카드 렌더링, 상담 흐름. React·Next.js 미사용 |
| 서버 | Node.js 22 이상, 내장 HTTP 서버 | 정적 파일, API, 임시 음성 세션 발급, 카드 상태 관리. Express 미사용 |
| 실시간 대화 | OpenAI Realtime API, WebRTC DataChannel | 마이크 입력, 텍스트 답변, 함수 호출 |
| 음성 출력 | Typecast HTTP 스트리밍, Web Audio API | 답변을 음성으로 합성하고 32kHz PCM 재생. 현재 프로젝트 사용 제공자 |
| 음성 전송 | WebSocket, `ws` | 브라우저와 서버 사이의 합성 요청·스트리밍·취소 |
| 로그인 | 네이버·카카오 OAuth, 서버 서명 HttpOnly 쿠키 | 연동 코드 구현. 제공업체 키·콜백 설정과 실계정 검증 필요 |
| 저장 | 서버 JSON 파일, 브라우저 localStorage | 서버에 덱·선택·배치 상태, 브라우저에 대화 노트·리포트·데모 이용권. 별도 DB 미사용 |
| 테스트 | Node.js 내장 test runner, jsdom | 상태 전이, DOM, HTTP, 음성 스트리밍 테스트 |

음성 흐름: **마이크 → OpenAI Realtime(WebRTC) → 텍스트·함수 호출 → Typecast(서버 HTTP 스트리밍) → WebSocket → 브라우저 Web Audio 재생**.

서버에서 API 키를 보관하고 브라우저에는 Realtime 임시 토큰만 전달한다. 아직 뽑지 않은 덱은 서버에 유지한다. 상담 방식은 사연에 맞춰 내부적으로 정하며 사용자에게 설정 메뉴를 제시하지 않는다.

## 실행

```sh
npm ci
npm run start:typecast
```

http://localhost:3000 에서 닉네임을 입력하고 **시범 통화**로 체험한다. 시범 통화는 마이크·외부 유료 API 없이 자막으로 진행하며, 질문별 카드 선택부터 리포트와 대화 노트까지 확인할 수 있다.

실제 통화에는 로컬 `.env`에 다음 항목을 설정한다. 기존 파일은 덮어쓰지 않는다. 실제 키와 `.env` 파일은 Git에 올리지 않는다.

```dotenv
OPENAI_API_KEY=...
TTS_PROVIDER=typecast
TYPECAST_API_KEY=...
TYPECAST_VOICE_ID=계정에서_사용할_수_있는_API_보이스_ID
TYPECAST_MODEL=ssfm-v30
```

보이스 ID와 모델은 본인 계정에서 지원하는 조합을 사용한다. `npm run start:typecast`는 Typecast를 명시적으로 선택한다. `npm start`를 쓰려면 `.env`의 `TTS_PROVIDER=typecast`를 설정한다. 코드에는 기존 ElevenLabs 경로도 남아 있으며, 제공자 설정이 없으면 ElevenLabs가 선택될 수 있다. 현재 프로젝트의 음성 제공자는 Typecast다.

선택 설정: `REALTIME_MODEL`(코드 기본값 `gpt-realtime-2.1`), `PORT`(기본 3000). 실제 음성 상담은 OpenAI와 Typecast API 사용료가 발생한다.

사용자 발화가 감지되면 진행 중인 합성 요청과 재생 큐를 취소한다. 통화 종료·화면 이탈 시에도 취소하며 리포트 JSON은 읽지 않는다. 음성 생성 실패는 안내하고 자막은 유지한다. 개발자 콘솔의 `voice_turn_to_audio_ms`는 발화 종료 이벤트 수신부터 첫 PCM 재생 예약까지의 시간이다(실제로 스피커에서 소리가 난 순간까지 측정하지는 않는다).

## 타입캐스트 HTTP 스트리밍 테스트

팀원 첫 실행: Node 22 이상에서 `npm ci`를 실행하고, `.env`가 없다면 `.env.example`을 `.env`로 복사한다. 본인의 `TYPECAST_API_KEY`를 입력하면 `npm run typecast:check`로 타입캐스트만 단독 테스트할 수 있다. 예제에는 Lamie ID가 들어 있다. 전체 통화 테스트에는 본인의 `OPENAI_API_KEY`도 필요하다. `.env`는 Git에서 제외되며 키를 공유하거나 커밋하지 않는다.

개발 계정에서 처음에는 `403 UNUSUAL_ACTIVITY_DETECTED`로 거절됐으나, VPN을 끈 뒤 같은 혜민 보이스와 `ssfm-v30`으로 스트리밍 합성에 성공했다. 단일 측정에서 첫 PCM 도착은 756ms, 생성 음성은 약 5.77초였다. VPN 경로 관련 가능성을 보여주는 결과이며 제공자의 차단 기준이나 전체 통화 지연을 확정하지는 않는다. 동일 오류가 나면 테스트 명령이 오류 코드를 출력한다. 실제 청음과 다른 계정에서의 검증은 별도로 필요하다.

기존 ElevenLabs 설정은 유지한다. `.env`에 `TYPECAST_API_KEY`를 넣고 API에서 제공되는 혜민 보이스를 조회한다. 키는 서버에서만 사용하며 채팅이나 Git에 올리지 않는다.

```sh
npm run typecast:voices
# 다른 이름 검색: npm run typecast:voices -- 검색어
```

출력된 `voice_id`와 지원 모델을 확인해 `.env`에 설정한다. Studio의 혜민이 API 목록에도 있는지는 실제 계정으로 확인해야 한다. ElevenLabs 보이스 ID는 사용할 수 없다.

```dotenv
TYPECAST_API_KEY=...
TYPECAST_VOICE_ID=조회한_API_보이스_ID
TYPECAST_MODEL=ssfm-v30
```

`TYPECAST_MODEL`은 조회 결과에서 해당 보이스가 지원하는 모델로 설정한다. 다음 명령으로 짧은 대사의 합성 성공과 첫 PCM 도착 시간을 확인할 수 있다. 크레딧을 사용하며 소리를 재생하는 명령은 아니다.

```sh
npm run typecast:check
```

기존 개발 서버를 직접 종료한 뒤 아래 명령으로 실행하고, 브라우저를 새로고침해 **실제 통화**로 청음한다. OpenAI 키도 필요하다.

```sh
npm run start:typecast
```

이 명령은 이번 실행에만 `TTS_PROVIDER=typecast`를 적용한다. `.env`의 `TTS_PROVIDER=elevenlabs`를 유지하면 `npm start`로 ElevenLabs로 돌아갈 수 있다. 기본 실행도 타입캐스트로 바꾸려면 `.env`의 `TTS_PROVIDER`를 `typecast`로 설정한다.

브라우저 ↔ 서버는 기존 WebSocket을 유지하고, 서버 → 타입캐스트 구간은 문장별 HTTP 스트리밍을 사용한다. WAV 헤더를 제거한 32kHz PCM을 도착하는 대로 재생한다. 전체 답변이 완성될 때까지 기다리지 않지만, 문장 경계나 일정 길이까지 텍스트를 모으는 시간은 발생한다. 사용자가 끼어들면 진행 중인 HTTP 요청과 대기 문장·재생 큐를 취소한다. ElevenLabs 전용 연기 태그 생성은 끄고, v30/v31에서는 `smart` 감정 모드에 이전 문장 맥락을 전달한다.

자동 테스트는 가짜 스트림으로 분할 헤더·즉시 재생·취소·오류·32kHz 재생을 확인한다. 실제 혜민 보이스의 사용 가능 여부, 음질과 통화 지연은 키와 ID 설정 후 확인해야 한다.

API 참고: [타입캐스트 HTTP 스트리밍](https://typecast.ai/docs/api-reference/text-to-speech/streaming-text-to-speech), [API 보이스 목록](https://studio.typecast.ai/developers/api/voices).

## 구조

- server.mjs: 정적 파일, 임시 토큰 발급, 리딩 API, 음성 소켓 연결, 암호학적 덱 셔플. localhost에만 바인딩.
- speech-socket.mjs: 서버 인증 WebSocket 프록시, 답변 context 관리.
- typecast-speech.mjs: 문장별 HTTP 합성, WAV 헤더 처리, 스트리밍 전달과 취소.
- tts-config.mjs: TTS 제공자와 서버 환경변수 선택.
- speech.mjs: 텍스트 증분 전송, PCM 스트리밍 재생, 발화 중단 시 취소.
- instructions.mjs: 레나 페르소나와 진행 지침.
- state.mjs: 번호 검증, 카드 확정, 순서대로 공개. 탭과 음성 호출이 같은 코드를 사용.
- app.js: WebRTC 음성/데이터 채널, 함수 실행과 결과 반환, 시범 통화, 시간·이용권·리포트·PNG 공유.
- cards.mjs: 원래 핸드오프의 78장 데이터.

함수는 review_question, confirm_question, select_numbers, confirm_cards, reveal_card, show_reading, request_clarifier, confirm_clarifier, cancel_clarifier, extend_call, end_call이다. 음성과 터치 선택은 같은 서버 리딩 상태에 반영하고 모델에 결과를 전달한다. 실제 통화 연결 성공 후 무료/이용권을 차감한다. 만료 시 진행 중인 말을 최대 30초 기다린다. 새 통화 실패는 차감하지 않는다.

## 확인

`npm test`: 78장 중복 없음, 잘못된 선택 거절, 번호와 카드 고정, 재추첨 거절, 공개 순서와 중복 공개 검증. 추가로 가짜 API 응답을 사용해 텍스트 전용 세션 설정, 키 비노출, 한국어 TTS 프록시, PCM 분할 수신과 취소·오류 처리를 검증한다. 실제 API 비용은 발생하지 않는다.

ElevenLabs 실제 보이스의 음질과 전체 통화 지연은 API 키·보이스 설정 후 실기기에서 검증해야 한다.

실제 음성 API, 리포트의 모델 응답, iPhone Safari 화면 꺼짐·음향 피드백은 실기기 검증이 필요하다. 연결 단절 시 저장한 카드로 다시 전화할 수 있으며 새 이용권을 사용한다. 리포트 생성 실패 시 자막과 카드 키워드로 대체한다.

PoC 한계: 이용권/마지막 기록은 localStorage, 결제는 데모. 덱과 리딩 상태는 서버 파일에 저장한다. 실결제·다중 서버 운영에는 계정 기반 권한과 공유 저장소 설계가 추가로 필요하다. 시범 리딩은 카드 키워드를 보여주는 정해진 자막이다. BGM/효과음은 WebAudio 합성이다.

공식 API 참고: https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime 및 https://developers.openai.com/api/docs/guides/realtime-conversations

보이스를 바꾼 뒤 `voice_id_does_not_exist`가 나오면 `npm run voice:check`로 확인할 수 있다. 이 명령은 짧은 테스트 문장 합성으로 크레딧을 사용한다. WebSocket에서 해당 오류가 나면 HTTP 합성을 한 번 시도한 후 WebSocket을 재확인한다. 실제로 HTTP 성공 이후 WebSocket도 성공한 사례가 있으나, 제공자 내부 원인은 확인되지 않았다. 이 명령은 개발 서버를 실행하거나 재시작하지 않으며, 기존 서버가 읽은 환경변수도 변경하지 않는다.


연기 제어: `eleven_v4_turbo`는 Text to Dialogue multi-stream-input으로 연결한다. OpenAI에 친한 언니처럼 자연스럽게, 공감은 부드럽게 조언은 단호하게 말하는 지침을 추가하고 필요한 문장에만 `[confident]`, `[warmly]`, `[thoughtful]` 태그를 생성하게 한다. 태그는 합성에 전달하되 자막과 상담 기록에서는 숨긴다. 리포트에는 태그를 넣지 않는다. `ELEVENLABS_MODEL=eleven_flash_v2_5`로 되돌리면 기존 TTS 프로토콜과 태그 없는 지침을 사용한다. 모델 변경 후에는 개발 서버를 재시작한다.

실제 보이스에 대한 짧은 개별 측정에서 첫 음성 도착(텍스트 전송 기준)은 Flash 409ms, v4 Turbo 694ms였으며, v3 Conversational은 3021ms 후 재측정에서 245ms로 편차가 컸다. 통화 전체의 지연이나 음질 개선을 보장하는 수치는 아니다. 실제 한국어 청음 비교가 필요하다.

## 목소리 테스트 화면

서버를 재시작한 뒤 `/voice-lab` 또는 메인 하단의 **레나 목소리 테스트**를 연다. 보이스 ID, 지원 모델, 자동/고정 감정, 강도, 속도, 음높이, 침묵과 목표 음량을 조절할 수 있다. **이 설정으로 들어보기**는 선택한 설정으로 짧게 합성하며 API 크레딧을 사용한다. **다음 실제 통화에 적용**을 누르면 서버의 다음 통화가 타입캐스트와 해당 설정을 사용한다. 진행 중 통화에는 적용되지 않는다. 설정은 서버 메모리에만 유지되며 서버 재시작 시 `.env`로 돌아간다. 키는 화면으로 전달하지 않는다. 기본 설정은 smart 감정, 속도 1.1배, 음높이 0이다.


## 질문별 RWS 리딩

- 리딩 방식은 선택 메뉴 없이 사연과 반응에 맞춰 레나가 자연스럽게 정합니다. 음성은 기존 Typecast 설정을 사용합니다.
- 질문 확인 화면에서는 고민만 확인합니다. 1~5장 배치와 비교할 선택지는 대화를 바탕으로 내부적으로 정하며, 설정 설명을 낭독하지 않습니다.
- 서버에서 덱을 한 번 섞고 번호를 누적합니다. 부족한 번호만 추가로 요청하며, 확정한 카드는 다시 뽑지 않습니다.
- 종합 리딩 뒤 구체적인 미해결 질문에 한해 동의 후 추가 카드 1장을 선택할 수 있습니다.
- 78장의 RWS 참고 도상·현대적 해석·역방향 가능성·출처를 사용합니다. 해석은 전문가 감수 완료 또는 예측 정확도 검증을 뜻하지 않습니다.
- 질문·덱·카드·배치·진행 상태는 `.reading-sessions/`에 저장합니다. 원본 음성은 저장하지 않습니다. 이 디렉터리는 Git과 정적 파일 제공 대상에서 제외됩니다. 서버를 배포할 때는 `READING_STORE_DIR`를 영속 저장소로 지정해야 합니다. 폴더를 삭제하면 서버의 이어보기 상태도 삭제됩니다.
- 상담 요약과 대화 기록은 기존처럼 브라우저 저장소에 남습니다. 리포트에는 배치와 리딩 방식도 보존합니다.

설계와 검증: [조사](docs/research/tarot-reading-research.md), [구현 내역](docs/research/reading-implementation.md).

상담 종료 후 `상담 흐름 · 대화 노트`에서 단계별 발언과 카드 진행 기록을 볼 수 있습니다. 시범 통화는 종료 화면에서 자동으로 펼쳐지고, 실제 사용자 발언과 시범 사연은 구분됩니다. 내부 운영 안내는 발언 노트에 포함하지 않습니다. 노트는 이 브라우저에 저장됩니다.
