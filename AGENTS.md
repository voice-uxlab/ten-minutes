# Repository instructions for Codex agents

Applies to the voice tarot product repository. Place this file at the repository root as `AGENTS.md`. During the initial build, implement the build brief; after that, apply these rules to every task. These are proposed team rules until the team adopts this kit.

## Product and context

- Build the mobile Korean voice tarot experience described in `docs/V1_BUILD_BRIEF.md`. Sona is optional tooling, not the deliverable.
- Read the relevant issue, acceptance criteria, `CONTRIBUTING.md`, and applicable nested instructions. Inspect the code before proposing changes.
- Treat the approved brief and recorded decisions as durable context. Chat history is not automatically shared among teammates or agents.
- Do not implement later-scope features merely because they appeared in meeting notes. Put a proposed scope change in an issue or spec PR.
- Use plain Korean for member-facing explanations unless the requester prefers English. Do not use the middle-dot separator in new text.

## Work isolation and ownership

- Before edits, inspect current branch, working-tree changes, and latest `origin/main`. Preserve unrelated and uncommitted work.
- One issue, one accountable person, one task branch. Use `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, or `docs/<issue>-<slug>`. Use `bootstrap/<slug>` before numbered issues exist.
- Do not implement product changes directly on `main`. Use a separate clone/worktree for simultaneous tasks; never run two agents against the same writable checkout.
- Keep changes bounded. Announce overlaps in session state, API contracts, provider adapters, shared UI, dependencies, or deployment before parallel implementations diverge.
- If resolving conflicts requires choosing product behavior or changing an interface, explain the options to the relevant human coordinator. Never discard the other author's work to make Git merge.
- Do not force-push shared branches or `main`. Prefer merging current `origin/main` into the task branch. Do not rewrite another contributor's history.

## Contracts that must hold

- One session has at most one locked card draw. Repeated requests cannot reroll it.
- Spoken interpretation and the visible result reference the same authoritative card.
- Every ending/error path releases microphone, playback, connection, listeners, and timers. Late events cannot resurrect an ended session.
- Provider protocol types remain inside the voice adapter. Never claim providers are interchangeable without implementing and testing an adapter.
- Permanent API credentials and signing/access secrets stay server-side and out of logs, commits, screenshots, and browser bundles.
- No raw audio, transcript, or private question in analytics or public artifacts. Any user-requested share requires a preview and explicit action.
- Mock voice behavior is visibly identified. Never silently replace a failing live provider with simulated success.
- Preserve mobile accessibility, Korean copy, touch targets, focus, and reduced-motion behavior.

## Verification

After the initial scaffold, these are the intended scripts: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`. Inspect package.json and README; do not claim an unimplemented command ran. The bootstrap agent must create and reconcile them.

Run checks relevant to the change. For changed voice/session logic, include interruption, cleanup, duplicate-event, and failure cases. For changed UI, inspect a narrow mobile viewport and provide a screenshot. For contract changes, verify both producers and consumers. CI uses a mock provider and must not need a paid API key.

Report actual commands/results, what was not tested, and remaining risks. Physical-device/live audio verification is separate from mock browser tests. Do not disable assertions, required checks, or access controls to obtain green CI.

## Pull requests and integration

- Open a draft PR early when coordination helps; mark ready only when acceptance criteria and relevant checks are met.
- PR body: problem, resulting behavior, linked issue (`Closes #N` only when the whole issue is complete), test evidence, screenshots for UI, risks, and any migration/configuration steps.
- Request an appropriate human reviewer. Codex review is supplementary and is not a human approval.
- After changes, rerun affected checks. Obtain renewed review after substantial changes to reviewed behavior.
- Do not merge, enable auto-merge, approve on behalf of a human, deploy to production, or change repository protections without explicit human authorization for that action.
- An explicitly authorized merge must follow the team's eligibility rules: ready PR, current checks, independent human review, resolved discussions, and no conflicts. Never bypass a failed check.
- The author addresses review comments and explains fixes. Preserve relevant discussion; do not mark substantive threads resolved to hide an unresolved concern.

## Release and records

The integration maintainer merges eligible changes. Staging deployment follows successful checks on merged `main`; production/demo promotion is a separate maintainer action. Verify the deployed build and record its commit. A merge is not proof of a successful release.

Keep setup, contracts, and decisions current when they change. Do not upload raw meeting transcripts, private coaching notes, participant data, or participant-only orientation material to public repositories. Public progress records distinguish completed work, proposals, and pending verification.
