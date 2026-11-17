# Voice Tarot

- 이 앱의 기준은 저장소 루트 `frontend-setup-proposal.md`입니다.
- 현재 실행 코드는 TypeScript입니다. 화면·음성 재생은 `src/`, API·인증·TTS는 `server/`, 카드·리딩·공유 타입은 `shared/`입니다. `poc/`는 비교용 JavaScript 보관본과 정적 자료입니다. 현재 앱 수정은 PoC가 아니라 TypeScript 모듈에 적용합니다.
- 사용자의 최신 요청으로 홈에서 Realtime + Typecast(기본)와 Live + Typecast 중 선택하며 기본 합성 속도는 1.3배입니다. 레나 퀸 soul을 유지합니다. 저장된 기존 노을·Realtime 상담은 해당 엔진으로 이어집니다.
- API 키, `.env*`, 로컬 상담 기록, 녹음 파일을 커밋하지 않습니다.
- Figma 래스터 이미지는 원본 노드에서 3x로 export하고 CSS 표시 크기는 디자인 크기를 유지합니다.
- 카드 숫자·방향은 서버에서 확정합니다. 새로고침/중복 이벤트로 새 카드를 뽑지 않습니다.
- 변경 후 typecheck, lint, 관련 테스트, build를 실행합니다.

- 기본 레나 퀸은 `soul.md`, 선택 가능한 테스트 페르소나는 `personas/test-friend.md`가 기준입니다. 상담에 저장된 `personaId`를 따르며 두 문서를 섞지 않습니다. `server/instructions.ts`가 읽어 Live·Realtime·위임 리딩에 주입합니다. 기능이나 음성 엔진을 변경할 때 이 페르소나를 일반 상담사 문구로 대체하지 않습니다.

- 세 번째 테스트 페르소나는 `personas/cool-unnie.md` (`cool-unnie`)이며 새 상담 UI 기본 선택입니다. 설명 방식은 `reading-style.md`에서 관리합니다. 핵심 결론과 카드 근거를 기본 1~2문장으로 말합니다.

- 리딩은 78장 중 3장 고정이며 timeline/situation/relationship/decision 네 배치만 사용합니다. 한 장 공개→그 카드 해석과 짧은 질문→사용자 반응 듣기→다음 장 공개 순서이며 추가 카드와 그룹 해석은 사용하지 않습니다.
