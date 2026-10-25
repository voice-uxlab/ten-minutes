# Astra build handoff

This kit prepares a first implementation; it does not claim that the product already exists. The voice tarot direction comes from Meetup #3. The name, rabbit character, five-minute limit, 22-card deck, OpenAI adapter, and hosting target are explicit build defaults rather than recorded team votes.

## Use the documents

1. Review `docs/V1_BUILD_BRIEF.md` and adopt or amend its defaults in one spec PR. Do not let final naming block the first voice-flow test.
2. Put `AGENTS.md` at the product repository root and use `CONTRIBUTING.md` as the team workflow.
3. Start a new Codex task in the product repository, select GPT-6 Astra, and provide the prompt below.
4. Supply real API credentials through the runtime secret mechanism. Never paste them into an issue, PR, or committed file.
5. After implementation, a teammate performs the real mobile/audio acceptance check and reviews the PR. The integration maintainer handles the merge and deployment.

## Build prompt

```text
Read AGENTS.md, CONTRIBUTING.md, and docs/V1_BUILD_BRIEF.md.
Build the complete v1.0 website described in the brief, using its explicit defaults.
Preserve existing work and use a separate implementation branch.
Implement the full user journey, real provider adapter, labeled test adapter,
meaningful tests, CI, setup documentation, and demo instructions.
Continue through implementation, verification, and repairs in this task.
Only ask for missing credentials/access or contradictory requirements;
record other implementation choices and continue.
Do not claim real voice or physical-device testing unless performed.
Prepare a draft PR with test evidence and remaining external prerequisites.
Do not merge or deploy the demo environment without the maintainer's authorization.
```

## Before the team calls it v1.0

A teammate must complete an HTTPS mobile session with real audio, pick a card, hear the same card interpreted, interrupt the reader, and end cleanly. A mock walkthrough is useful implementation evidence but does not establish live voice quality. Record unavailable devices and unresolved provider errors explicitly.

## Confirm without blocking independent implementation

- Product coordinator: working name, target user, reader personality, and conversation boundaries.
- Technical coordinator: provider model/voice availability, latency, deployment account, and runtime constraints.
- Leader: credential access, cost ceiling, integration maintainer and backup, demo submission deadline.
- Each member: preferred outcome, available hours, support needed, and reviewer pairing.

The proposed target is a demo build by November 30 and rehearsals before December 16. Confirm the organizer's actual submission deadline.
