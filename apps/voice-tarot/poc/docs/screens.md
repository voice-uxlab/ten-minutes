# Voice Tarot 화면 및 동작 검토표

기준: [Figma B · METALLIC](https://www.figma.com/design/DORR9kY17Uxgci17Qd1Jqb/?node-id=133-46696).
기존 voice-uxlab/tarot-voice의 Node.js, 순수 HTML/CSS/JavaScript, WebSocket 구조를 유지한다. 음성 입력과 답변 텍스트는 OpenAI Realtime, 출력은 Typecast다. Typecast 기본 말하기 속도는 1.2.

[실제 앱](http://localhost:3000/) · [페이지별 검토표](http://localhost:3000/screens)

| 번호 | 화면 | 연결된 동작 | 미리보기 |
|---|---|---|---|
| 01 | 홈 | OAuth 시작·닉네임 체험 | [열기](http://localhost:3000/?preview=welcome) |
| 02 | 소개 | 마이크 허용·선택 녹음·음성 처리 안내 | [열기](http://localhost:3000/?preview=intro) |
| 03 | 준비 완료 | 실제 상담 시작 | [열기](http://localhost:3000/?preview=ready) |
| 04 | 고민 듣기 | 음성 입력·자막·Typecast·음소거 | [열기](http://localhost:3000/?preview=listening) |
| 05 | 질문 확인 | 확인 또는 직접 수정 | [열기](http://localhost:3000/?preview=question) |
| 06 | 번호 선택 | 음성·터치 누적, 중복·범위 검증 | [열기](http://localhost:3000/?preview=picking) |
| 07 | 번호 확인 | 확정·전체 다시 선택 | [열기](http://localhost:3000/?preview=confirm) |
| 08 | 첫 카드 공개 | 실제 셔플 결과의 첫 카드 | [열기](http://localhost:3000/?preview=reveal1) |
| 09 | 두 번째 공개 | 순차 공개 검사 | [열기](http://localhost:3000/?preview=reveal2) |
| 10 | 세 번째 공개 | 순차 공개 검사 | [열기](http://localhost:3000/?preview=reveal3) |
| 11 | 첫 카드 해석 | show_reading(1) | [열기](http://localhost:3000/?preview=reading1) |
| 12 | 두 번째 해석 | show_reading(2) | [열기](http://localhost:3000/?preview=reading2) |
| 13 | 세 번째 해석 | show_reading(3) | [열기](http://localhost:3000/?preview=reading3) |
| 14 | 종합 리딩 | show_reading(0) | [열기](http://localhost:3000/?preview=summary) |
| 15 | 종료 | 요약 생성·선택 녹음 다운로드 | [열기](http://localhost:3000/?preview=ended) |
| 16 | 연결 중 | WebRTC·TTS 연결, 취소·시간 초과 | [열기](http://localhost:3000/?preview=connecting) |
| 17 | 권한 오류 | 안내·마이크 다시 요청 | [열기](http://localhost:3000/?preview=permission) |
| 18 | 연결 실패 | 같은 페이지에서 상태·남은 시간 복원, 재차감 없음 | [열기](http://localhost:3000/?preview=connection-error) |
| 19 | 번호 부족 | 선택한 2개 유지, 나머지 1개 요청 | [열기](http://localhost:3000/?preview=retry-numbers) |
| 20 | 팀 리뷰 메모 | 앱 화면이 아닌 검토 기준 | [열기](http://localhost:3000/screens#review) |
| 21 | 기존 PoC 리포트 | 브라우저 저장·이미지 공유·남은 카드 이어보기 | [열기](http://localhost:3000/?preview=report) |

## 검증 기록

- `npm test`: 22개 통과.
- `app.test.mjs`: 20개 사용자 화면 렌더링; 질문 수정부터 선택 취소·확정·3장 공개·해석·리포트 저장까지 실제 앱 핸들러 검증.
- Realtime 이벤트와 네트워크를 대체한 통합 테스트: 2개 번호 누적·재연결·이용권 재차감 방지·도구 결과 연결·답변 중 버튼 선택 시 취소 후 재개 검증.
- OAuth: 상태 토큰과 브라우저 쿠키 결합, 재사용 차단, 세션 위조 차단 검증. 제공업체 응답은 테스트 대체값이다.
- Typecast: PCM 스트리밍·문장 단위 생성·취소·속도 전달 기존 테스트 통과.
- 브라우저에서 실제 통화가 Realtime 응답 및 카드 선택·공개로 이어진 상태를 확인했다. 콘솔의 수정 전 통화 샘플은 발화 종료부터 첫 음성까지 0.702~3.398초였다. 모든 음성 턴의 정확도나 수정 전후 지연 차이를 측정한 것은 아니다.
- 전체 페이지의 원본 대비 픽셀 단위 시각 검토는 미완료. 모든 상태의 렌더링 자동 검증과 주요 화면 시각 확인을 구분한다.

## 남은 설정과 범위

- 네이버·카카오 개발자 앱의 키와 callback 등록이 필요하다. `.env.example`의 `APP_ORIGIN`, `SESSION_SECRET`, 각 제공업체 키를 설정한다. 콜백은 `/auth/naver/callback`, `/auth/kakao/callback`. 운영 계정 로그인을 검증한 상태는 아니다.
- 로그인 세션은 서버 서명 쿠키로 처리하지만 상담 기록·이용권은 기존 PoC대로 이 브라우저에 저장한다. 계정 간 동기화·실제 결제는 구현 범위에 포함되어 있지 않다. 이용권 추가는 UI에 명시된 데모 기능이다.
- 녹음은 기본 꺼짐이며 마이크 음성만 기기 내 녹음한다. AI 음성은 녹음에 포함되지 않는다.
- 원본 이미지 7개는 Figma 노드에서 3x로 추출했다. 카드 앞면 전용 그림은 별·태양·절제 3개만 확보했다. 나머지 75개는 이름·방향·키워드는 실제 카드이며 그림은 공통 심볼이다.
- 재연결 보존은 현재 페이지의 통화에 적용된다. 페이지 새로고침 후에는 마지막 저장된 확정 카드로 새 상담을 시작하는 기존 이어보기 규칙이다.

## 선택 응답 플로우

음성: 발화 종료 감지 → Realtime 함수 호출 → 선택 검증·화면 갱신 → 함수 결과 전달 → 답변 텍스트 → 문장 단위 Typecast 합성 → PCM 재생.

터치: 즉시 선택 검증·화면 갱신 → 180ms 안의 연속 선택 묶기 → 이전 답변·음성 취소 → 선택 상태 전달 → 새 답변·Typecast 재생.

속도를 높이는 변경은 이전 응답 종료 대기와 불필요한 연속 호출을 줄인다. 네트워크·모델·Typecast 합성 지연 자체가 없어지지는 않는다. `voice_turn_to_audio_ms` 콘솔 값으로 발화 종료/버튼 선택부터 첫 음성까지 확인할 수 있다.
