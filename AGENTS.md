# AGENTS.md

## Project

This repository contains a real-time voice-based AI tarot consultation service.

Users interact with an AI tarot reader through voice conversations, select tarot cards, and receive interpretations.

The repository is a monorepo containing a web frontend and backend. A mobile application may be added in the future.

## Repository Layout

```text
/
├── apps/
│   └── web/          # Web frontend
├── backend/          # Backend services
├── specs/            # Technical specifications
├── docs/             # Project documentation
├── .github/          # GitHub configuration and templates
├── AGENTS.md
└── README.md
```

Potential future directories:

- `apps/mobile/`: Mobile application
- `packages/`: Shared modules

Treat this layout as the intended structure. Inspect the actual repository before making changes.

Do not create future directories or reorganize existing directories unless required by the task.

## Source of Truth

Before implementing a change, consult the relevant existing files:

- `README.md`: Project setup and development instructions.
- `specs/`: Feature requirements, API contracts, and technical specifications.
- `docs/git-flow.md`: Branching, commit, and pull request conventions.
- Existing source code and tests: Current implementation and coding patterns.

If documentation conflicts with the implementation, identify the discrepancy. Do not silently change established behavior.

Do not assume that a documented feature has already been implemented.

## Working Rules

1. Inspect relevant files and existing patterns before editing.
2. Keep changes focused on the requested task.
3. Preserve unrelated code, files, and behavior.
4. Prefer existing dependencies, utilities, and conventions.
5. Do not introduce new frameworks or major architectural changes without approval.
6. Do not modify API contracts, shared schemas, or authentication flows without checking affected components.
7. Follow existing specifications for AI prompts, tarot logic, and voice sessions.
8. Do not overwrite or revert changes made by other contributors.
9. Avoid unnecessary abstractions, speculative features, and premature optimization.
10. Ask for clarification only when missing information prevents safe implementation or requires a significant product or architectural decision.

## Area-Specific Rules

### Web (`apps/web/`)

- Follow existing frontend architecture and component conventions.
- Prioritize mobile web usability.
- Handle loading, errors, microphone permissions, and connection states.
- Do not embed server-side credentials in client code.
- Check backend API contracts before changing requests or responses.

### Backend (`backend/`)

- Follow existing backend architecture and data models.
- Validate external inputs and handle errors explicitly.
- Keep API behavior consistent with existing frontend integrations.
- Handle session creation, interruption, expiration, and termination according to specifications.
- Do not expose sensitive information in responses or logs.

### Specifications (`specs/`)

- Preserve the intent and structure of existing specifications.
- Keep specifications consistent with approved requirements.
- Do not treat proposals or unresolved decisions as implemented behavior.
- Update affected specifications when an approved implementation changes an existing contract.

## Git Workflow

Follow `docs/git-flow.md`.

### Branches

- `main`: Stable release branch.
- `dev`: Development integration branch.
- Create task branches from `dev`.
- Use `hotfix/*` from `main` only for urgent release fixes.

Branch naming:

```text
<type>/<scope>-<description>
```

Examples:

```text
feat/web-login
feat/web-call
feat/api-session
fix/web-audio
docs/git-flow
```

Use `web` for `apps/web/`, `api` for `backend/`, and `app` for future mobile development.

For cross-area changes, the scope may be omitted.

### Git Safety

- Inspect the current branch and working tree before making changes.
- Do not automatically switch or create branches.
- Do not commit, push, merge, or open pull requests unless explicitly requested.
- Never push directly to `main` or `dev`.
- Never force-push to shared branches.
- Do not discard uncommitted changes or rewrite Git history without explicit approval.
- Do not stage unrelated changes.

### Commits

Use Conventional Commits:

```text
<type>: <description>
```

Examples:

```text
feat: implement voice call
fix: resolve audio playback error
docs: update backend specification
refactor: simplify session management
chore: update dependencies
```

Write commit descriptions in English.

## Agent Permissions

The coding agent may:

- Read repository files and inspect the working tree.
- Modify files within the explicitly requested scope.
- Run relevant tests, linters, type checks, and builds.
- Report changes, validation results, and remaining limitations.

The coding agent must not do the following unless the user explicitly requests it:

- Commit, push, merge, or create or merge pull requests.
- Delete branches or rewrite Git history.
- Deploy to production or modify production resources.
- Delete files or run other destructive operations.
- Change API contracts, shared schemas, authentication flows, or major architecture without approval.

## Human Review Responsibility

The developer is responsible for reviewing and approving AI-generated or AI-modified code. Before accepting a change, verify that:

- It satisfies the task and the relevant specification.
- It does not break existing behavior or contracts.
- Tests and other validation were actually executed.
- No secrets or sensitive data were introduced.
- New dependencies and configuration changes are necessary and safe.

## Validation

After making changes:

1. Review the diff for unintended modifications.
2. Run relevant tests, lint, type checks, or builds when available.
3. Use the smallest relevant validation scope first.
4. Report failed or skipped checks and their reasons.
5. Do not claim that a test passed unless it was executed.
6. Do not modify or remove tests merely to hide implementation failures.

If validation commands are unavailable, state what was verified manually.

## Security

- Never expose or commit API keys, passwords, tokens, or other secrets.
- Do not commit credential-bearing `.env` files.
- Use environment variables for sensitive configuration.
- Never expose backend credentials to frontend code.
- Avoid logging sensitive user or consultation data.
- Do not run destructive commands without explicit authorization.
- Do not modify production resources or deploy without explicit authorization.

## Completion Report

After completing a task, provide a concise summary of:

- What changed
- Files changed
- Validation performed and results
- Remaining issues or limitations

Do not claim that unimplemented or untested functionality is complete.
