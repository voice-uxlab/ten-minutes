# Voice UX Lab — 프로젝트 아이디어 제출

Voice UX Lab 팀원들의 프로젝트 아이디어를 모으는 저장소입니다.

## 제출 방법

1. 저장소 루트에 `{project-name}.md` 형식으로 Markdown 파일을 생성합니다.
   - 예: `hands-free-work-log.md`
   - 파일명은 프로젝트를 알아볼 수 있는 영문 소문자와 하이픈으로 작성합니다.
2. [TEMPLATE.md](TEMPLATE.md)를 복사하고, 제안자와 프로젝트명을 입력한 뒤 모든 문항의 답변을 직접 작성합니다.
   - 아직 확인하지 못한 내용은 가정과 추가로 확인할 내용을 구분해 적습니다.
   - 해당하지 않는 문항은 그 이유를 적습니다.
3. 작성한 파일을 `main` 브랜치에 직접 커밋하여 업로드합니다.
   - Pull Request(PR)는 생성하지 않습니다.
   - 다른 팀원의 제출 파일을 덮어쓰지 않도록 파일명 중복을 확인합니다.

## 실행 가능한 프론트엔드

홍비님의 `frontend-setup-proposal`을 기준으로 구현한 React 앱은 [`apps/voice-tarot`](apps/voice-tarot/README.md)에 있습니다.

```sh
cd apps/voice-tarot
npm ci
npm run dev
```

http://localhost:5173 — API 키 없이 시범 통화 가능. Typecast 실제 음성 및 OAuth 설정은 앱 README를 참고하세요. 기존 PoC도 `npm run poc`로 비교 실행할 수 있습니다.
