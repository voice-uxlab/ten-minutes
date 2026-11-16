# Git Flow

## 1. 기본 원칙

1. **`main`과 `dev`에 직접 Push하지 않는다.**
2. 모든 작업은 `dev`에서 새 브랜치를 생성하여 진행한다. 단, 배포 버전의 긴급 수정은 `main`에서 분기한다.
3. 작업 완료 후 Pull Request(PR)를 생성하고, 팀원 리뷰를 거쳐 병합한다.
4. 하나의 브랜치에서는 하나의 기능 또는 작업 단위를 처리한다.
5. 병합이 완료되고 추가 작업이나 보존 필요성이 없는 작업 브랜치는 삭제한다.
   삭제 여부가 불확실한 경우에는 브랜치를 삭제하지 말고 담당자에게 확인한다.

## 2. 브랜치 전략

### 2.1 브랜치 구성

| 브랜치       | 용도                               | 분기 기준            |
| ------------ | ---------------------------------- | -------------------- |
| `main`       | 배포 및 시연용 안정 버전           | -                    |
| `dev`        | 팀원들의 작업을 통합하는 개발 버전 | `main`에서 최초 생성 |
| `feat/*`     | 새로운 기능 개발                   | `dev`                |
| `fix/*`      | 버그 수정                          | `dev`                |
| `refactor/*` | 코드 구조 개선                     | `dev`                |
| `chore/*`    | 환경 설정 및 유지보수              | `dev`                |
| `docs/*`     | 문서 작성 및 수정                  | `dev`                |
| `hotfix/*`   | 배포 버전의 긴급 수정              | `main`               |

### 2.2 브랜치 명명 규칙

**`<type>/<scope>-<description>`**

Scope는 작업 영역을 나타낸다.

| Scope    | 작업 영역      |
| -------- | -------------- |
| `web`    | 웹 프론트엔드  |
| `api`    | 백엔드         |
| `app`    | 모바일 앱      |
| `shared` | 공통 기능      |
| `infra`  | 개발·배포 환경 |

브랜치 이름은 영어 소문자와 하이픈(`-`)을 사용한다.

```text
feat/web-login
feat/web-call
feat/api-session
fix/web-audio
refactor/api-session
chore/infra-setup
docs/git-flow
```

여러 작업 영역에 걸친 기능은 Scope를 생략할 수 있다.

```text
feat/voice-session
fix/session-sync
```

### 2.3 전체 Git Flow

```text
main ───────────────────────────────────────●──────
  │                                         ▲
  │                                         │
  └── dev ────────●──────●──────●────────────┤
        │        ▲      ▲      ▲            │
        │        │      │      │            │
        ├── feat/web-login ────┘            │
        │        │                          │
        ├── feat/api-session ──┘            │
        │        │                          │
        └── fix/web-audio ────┘             │
                                           │
                                    통합 테스트 후
                                    dev → main
```

**기본 흐름**

`dev` → 작업 브랜치 → PR → `dev` → 통합 테스트 → `main`

각 작업 브랜치는 `dev`에서 분기하고, 작업 완료 후 PR을 통해 다시 `dev`에 병합한다.

배포 및 시연이 필요한 시점에는 `dev`의 변경 사항을 검증한 뒤 `main`으로 병합한다.

배포 버전에서 긴급 수정이 필요한 경우에는 별도의 `hotfix/*` 브랜치를 사용한다.

```text
main
  └── hotfix/api-auth
        ├── main
        └── dev
```

## 3. 작업 절차

### ① 작업 브랜치 생성

최신 `dev`를 가져온 후 새 브랜치를 생성한다.

```bash
git switch dev
git pull origin dev
git switch -c feat/web-login
```

### ② 작업 및 커밋

파일을 수정한 후 변경 사항을 확인하고 커밋한다.

```bash
git status
git add .
git commit -m "feat: implement social login"
```

`git add .` 실행 전에는 의도하지 않은 파일이 포함되지 않았는지 확인한다.

### ③ 원격 저장소에 Push

```bash
git push -u origin feat/web-login
```

### ④ Pull Request 생성

GitHub에서 다음과 같이 PR을 생성한다.

```text
base: dev
compare: feat/web-login
```

PR에는 주요 변경 사항과 테스트 결과를 작성한다.

### ⑤ 리뷰 및 병합

팀원 1명 이상에게 리뷰를 요청한다.

수정 요청이 있다면 같은 브랜치에서 수정 후 다시 Push한다.

리뷰와 검증이 완료되면 **Squash and Merge**로 `dev`에 병합한다.

PR이 병합된 후에는 해당 작업 브랜치에 추가 작업이 남아 있지 않고,
롤백·비교·기록을 위해 보존할 필요가 없는지 확인한다. 삭제해도 되는 경우에만
작업 브랜치를 삭제한다. 삭제 여부가 불확실하면 삭제하지 말고 담당자에게 확인한다.

### ⑥ 다음 작업 시작

새 작업을 시작하기 전에 `dev`를 최신화한다.

```bash
git switch dev
git pull origin dev
git switch -c feat/web-call
```

### 작업 중 dev 변경 사항 반영

다른 팀원의 변경 사항을 현재 작업에 반영해야 할 경우 다음 명령어를 사용한다.

```bash
git switch dev
git pull origin dev

git switch feat/web-login
git merge dev
```

충돌이 발생하면 관련 팀원과 확인한 후 수정한다.

## 4. 커밋 및 PR 규칙

### 4.1 커밋 메시지

커밋 메시지는 Conventional Commits 형식을 따른다.

**`<type>: <description>`**

| Type       | 용도                |
| ---------- | ------------------- |
| `feat`     | 기능 추가           |
| `fix`      | 버그 수정           |
| `docs`     | 문서 수정           |
| `refactor` | 코드 구조 개선      |
| `style`    | 코드 포맷 수정      |
| `test`     | 테스트 추가 및 수정 |
| `chore`    | 설정 및 유지보수    |
| `ci`       | CI/CD 설정 변경     |

예시:

```text
feat: add login page
fix: resolve audio error
docs: update git flow
refactor: simplify session logic
chore: update dependencies
```

커밋 메시지는 영어로 작성하며, 변경 내용을 간결하고 명확하게 표현한다.

```text
feat: add login page
fix: resolve audio error
docs: update git workflow
```

### 4.2 Pull Request

PR 제목은 커밋 메시지와 동일한 형식을 사용한다.

```text
feat: implement voice call
fix: resolve session timeout
docs: update git flow
```

PR에는 다음 내용을 포함한다.

- 변경 목적 및 주요 수정 사항
- 테스트 및 확인 결과
- 리뷰어가 알아야 할 사항

**병합 규칙**

1. `main`과 `dev`에 직접 Push하지 않는다.
2. 최소 1명의 팀원에게 리뷰를 요청한다.
3. 리뷰 및 검증 완료 후 병합한다.
4. 작업 브랜치 → `dev` PR은 **Squash and Merge**를 사용한다.
5. `dev` → `main` PR은 **Merge Commit**을 사용한다.
6. `main`에 반영된 `hotfix`를 `dev`에 반영할 때도 **Merge Commit**을 사용한다.
7. 병합 후 작업 브랜치는 추가 작업이나 보존 필요성이 없는 경우에만 삭제한다.

일반 작업 PR은 최소 1명 이상의 리뷰 승인을 받은 후 병합한다.
`dev → main` 배포 PR은 릴리스 담당자 또는 지정된 담당자의 최종 확인 후 병합한다.

## 5. 배포 및 긴급 수정

### 5.1 배포

기능 개발과 통합 테스트가 완료되면 `dev → main` PR을 생성한다.

```text
base: main
compare: dev
```

리뷰와 검증이 완료되면 **Merge Commit** 방식으로 병합한다.
`dev → main` 병합에서는 **Squash and Merge**를 사용하지 않는다.
Merge Commit을 사용하여 `dev`와 `main`의 공통 커밋 이력을 유지한다.

배포 후에는 Merge Commit이 정상적으로 생성되었는지, 배포가 성공했는지,
배포 대상 커밋과 실제 배포 결과가 일치하는지 확인하고 관련 PR과 커밋 정보를 기록한다.
배포 실패나 예상하지 못한 변경이 발견되면 성공으로 기록하지 않고 원인을 확인한다.

```text
dev
   ↓
통합 테스트
   ↓
Pull Request
   ↓
main
   ↓
배포 및 시연
```

### 5.2 긴급 수정(Hotfix)

이미 배포된 버전에 긴급 오류가 발생한 경우 `main`에서 `hotfix/*` 브랜치를 생성한다.

```bash
git switch main
git pull origin main
git switch -c hotfix/api-auth
```

수정 및 검증 후 `hotfix/*`에서 `main`으로 PR을 생성한다.
리뷰와 검증이 완료되면 **Merge Commit** 방식으로 `main`에 병합한다.

`main` 병합이 완료되면 `main`을 compare, `dev`를 base로 하는 PR을 생성하여
동일한 hotfix를 `dev`에도 반영한다.

```text
base: dev
compare: main
```

이 PR도 **Merge Commit** 방식으로 병합하여 `main`과 `dev`의 커밋 이력을
동기화한다.

`main → dev` 동기화 중 병합 충돌이 발생하면 충돌 상태로 병합하지 않는다.
관련 담당자가 변경 의도를 확인하여 충돌을 해결한 뒤 CI와 관련 테스트를 다시 실행하고,
검증이 완료된 경우에만 PR을 병합한다.

`hotfix/*` 브랜치는 `main` 병합과 `main → dev` 동기화가 모두 완료된 후,
추가 작업이나 롤백·비교·기록을 위해 보존할 필요가 없는 경우에만 삭제한다.
삭제 여부가 불확실하면 브랜치를 삭제하지 않고 담당자에게 확인한다.

## 5.3 배포 실패 및 롤백

배포 후 장애가 발생하면 `main`의 커밋을 삭제하거나 강제로 이전 상태로 되돌리지 않는다.
문제가 된 Merge Commit 또는 관련 변경을 되돌리는 Revert PR을 생성하고,
리뷰와 CI 검증을 완료한 후 `main`에 병합한다.
원인 수정은 다시 `dev`에서 진행하며, 검증이 완료되면 정상적인 배포 PR을 통해 재배포한다.

## 6. 협업 시 주의사항

**공통 파일 수정**

API 구조, 공통 설정, 인증 및 세션 관련 파일을 수정할 때는 관련 담당자와 먼저 협의한다.

**충돌 관리**

다른 팀원의 작업과 충돌이 발생하면 임의로 덮어쓰지 않고 변경 내용을 확인한 후 해결한다.

**민감 정보 관리**

API 키, 비밀번호, 인증 토큰 및 `.env` 파일은 커밋하지 않는다.

**강제 Push 금지**

`main`과 `dev`에 `git push --force`를 사용하지 않는다.

---

## 작업 흐름 요약

```text
dev 최신화
      ↓
작업 브랜치 생성
      ↓
파일 수정 및 Commit
      ↓
Push
      ↓
Pull Request 생성
      ↓
팀원 리뷰
      ↓
Squash and Merge → dev
      ↓
작업 브랜치 삭제 여부 확인
      ↓
통합 테스트
      ↓
Merge Commit → main
      ↓
배포 및 시연
```

## GitHub 협업 환경 설정

- [ ] 브랜치 보호 정책 설정하기
- [x] PR 템플릿 생성하기
- [x] 프론트엔드 `.gitignore` 샘플 작성하기
- [x] 백엔드 `.gitignore` 샘플 작성하기

## `.gitignore` 샘플

### 프론트엔드 (Node.js, React)

```gitignore
# Dependencies
node_modules/

# Build output
dist/
build/
.next/
out/

# Environment files
.env
.env.*
!.env.example

# Logs and caches
*.log
.cache/
.eslintcache
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# OS files
.DS_Store
Thumbs.db
```

### 백엔드 (Python)

```gitignore
# Python cache and compiled files
__pycache__/
*.py[cod]
*$py.class

# Virtual environments
.venv/
venv/
env/

# Environment files
.env
.env.*
!.env.example

# Test and coverage output
.pytest_cache/
.coverage
.coverage.*
htmlcov/
.tox/
.nox/

# Packaging
*.egg-info/
dist/
build/

# Tooling caches
.mypy_cache/
.ruff_cache/
.pyre/

# Logs and OS files
*.log
.DS_Store
Thumbs.db
```
