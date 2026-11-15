# Voice Tarot

- 이 앱의 기준은 저장소 루트 `frontend-setup-proposal.md`입니다.
- React 화면은 `src/`, 재사용 PoC API·음성·타로 도메인은 `poc/`에 있습니다.
- Typecast 출력과 Realtime 텍스트 응답 구조를 유지합니다.
- API 키, `.env*`, 로컬 상담 기록, 녹음 파일을 커밋하지 않습니다.
- Figma 래스터 이미지는 원본 노드에서 3x로 export하고 CSS 표시 크기는 디자인 크기를 유지합니다.
- 카드 숫자·방향은 서버에서 확정합니다. 새로고침/중복 이벤트로 새 카드를 뽑지 않습니다.
- 변경 후 typecheck, lint, 관련 테스트, build를 실행합니다.
