# Voice Tarot

- 이 앱의 기준은 저장소 루트 `frontend-setup-proposal.md`입니다.
- 현재 실행 코드는 TypeScript입니다. 화면·음성 재생은 `src/`, API·인증·TTS는 `server/`, 카드·리딩·공유 타입은 `shared/`입니다. `poc/`는 비교용 JavaScript 보관본과 정적 자료입니다. 현재 앱 수정은 PoC가 아니라 TypeScript 모듈에 적용합니다.
- 새 상담과 재연결은 OpenAI Realtime과 Typecast를 사용하며 기본 합성 속도는 1.3배입니다.
- API 키, `.env*`, 로컬 상담 기록, 녹음 파일을 커밋하지 않습니다.
- Figma 래스터 이미지는 원본 노드에서 3x로 export하고 CSS 표시 크기는 디자인 크기를 유지합니다.
- 카드 숫자·방향은 서버에서 확정합니다. 새로고침/중복 이벤트로 새 카드를 뽑지 않습니다.
- 변경 후 typecheck, lint, 관련 테스트, build를 실행합니다.

- 새 상담의 레나 퀸 말투는 `soul.md`에서 정하며 기존 상담의 `personaId`는 이어보기에서 읽습니다.

- 설명 방식은 `reading-style.md`에서 관리합니다. 핵심 결론과 카드 근거를 기본 1~2문장으로 말합니다.

- 리딩은 78장 중 3장 고정이며 timeline/situation/relationship/decision 네 배치만 사용합니다. 한 장 공개→그 카드 해석과 짧은 질문→사용자 반응 듣기→다음 장 공개 순서이며 추가 카드와 그룹 해석은 사용하지 않습니다.
