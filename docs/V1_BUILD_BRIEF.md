# Build the mobile voice tarot website v1.0

Status: implementation-ready proposal based on Meetup #3, October 25, 2026. This document distinguishes meeting decisions from implementation defaults. Defaults are authorized design choices for the first build, not claims that the team voted on them. The deliverable requested here is a complete working website. One-shot means complete the implementation, tests, repairs, and handoff in one sustained task; it does not mean skip verification.

## 1. Mission for GPT-6 Astra

Build a Korean-first website for mobile browsers where a user has a short, playful, two-way voice tarot conversation with one AI character. Deliver the working application, real voice integration, tests, setup instructions, and a reproducible demo. Inspect the repository first, preserve existing work, and implement this specification using the smallest maintainable architecture. Do not stop at a landing page, static mockup, plan, or scaffold.

The team’s success is a complete, convincing product and an excellent December 16 demo. Finish the demo build by November 30. Sona is an optional tool supplied by the leader; do not build Sona or make it a dependency. MIND DETOXING is historical context, not the current product name or a requirement to implement therapy, journaling, or cognitive behavioral therapy.

Use the defaults below when no approved repository decision supersedes them. Record material deviations in `docs/decisions.md`. Only ask for missing credentials, access, or a genuine contradictory requirement. Continue independent implementation while a deployment or credential dependency is unresolved. Never invent successful live testing.

## 2. Product decisions and explicit defaults

**Confirmed in the meeting:** voice tarot; interactive spoken interpretation; call-like experience inside the product; immediate user-requested connection first; web first; cute and playful direction; later consideration of scheduling and payments; final name and voice provider unresolved.

**Chosen defaults for this build:**

| Decision | v1.0 default |
|---|---|
| Audience | Korean-speaking adults seeking a light reading about one everyday question, in a place where they can speak privately |
| Working name | `타로 한 통` / `Tarot Call`; place all naming in one configuration file; final brand remains open |
| Character | One original round rabbit called `모모`, warm and lightly witty; no impersonation of an existing character or celebrity |
| Language | Korean UI and conversation; English code identifiers and developer docs |
| Session | One question, one card, follow-up conversation, maximum five minutes from voice connection |
| Tarot | 22 Major Arcana cards, upright only; three selectable card backs; exactly one draw per session |
| Voice | OpenAI Realtime speech-to-speech over WebRTC; `gpt-realtime-2.1` as documented on October 25, configurable and rechecked against official docs during implementation |
| Voice selection | Start with a currently supported natural voice, default `marin` if supported by the selected model; verify support and document the actual value |
| Data | Anonymous sessions, no account, no database of user conversations, no audio recording |
| Summary | A short structured recap in the session; not stored after the session unless the user explicitly copies or shares it |
| Sharing | System share sheet for a short user-previewed text, fallback copy; no automatic posting |
| Access | Private team demo protected by a server-checked access code; no payment required |
| Hosting | A single Node server with HTTPS and server-only secrets; target Render using a standalone deployment configuration; deployment depends on an existing account and user-authorized hosting |

The core demo must work without a paid telephony provider, native app, scheduled call, push notification, live image generation, additional reader marketplace, payment integration, or persistent memory. Do not show controls for unbuilt features.

## 3. Complete user journey

1. **Welcome `/`:** brand, character, one-sentence promise, and `모모와 이야기하기`. Explain `AI 타로 캐릭터와 즐기는 가벼운 대화예요. 미래를 확정하는 상담은 아니에요.` Below: `약 5분`, `대화는 저장하지 않아요`, and a link to the short privacy explanation. Do not ask for birth date, gender, phone number, or an account.
2. **Demo access:** when the server requires it, ask for a team access code. Validate on the server and set a signed, HttpOnly, SameSite cookie. Do not put the access code in the URL, bundle, or local storage. A valid session skips repeated entry. Invalid attempts show a neutral error and are rate-limited.
3. **Prepare `/session`:** explain microphone use and that audio goes to the voice provider to generate replies. Obtain microphone permission only after a deliberate tap on `통화 시작`. Explain that the app does not retain recordings, while provider processing follows the provider's policy. Allow back navigation.
4. **Connect:** call-style screen with the character, `연결 중`, and cancel. Never label the connection as active until the provider signals readiness. There is no fake phone number, queue, scarcity, or fabricated incoming call while the page is closed. A subtle brief connecting animation must reflect real state.
5. **Listen:** character greets in Korean and asks for one question. Show the user's and character's latest transcript lines with an optional expanded transcript. Keep the transcript collapsed by default so this feels like a voice experience rather than a chat dashboard.
6. **Clarify:** reader asks at most one concise clarification before offering the draw. The user may interrupt, correct context, or ask for repetition. A correction must change the subsequent interpretation.
7. **Draw:** model calls `offer_draw`; show three card backs with touch targets `왼쪽`, `가운데`, `오른쪽`. User can tap a card or say the position. Model calls `choose_card` for a spoken selection. Both paths use the same application operation. Reveal the actual card, title, and art; deliver its authoritative result to the voice agent before interpretation. Never let the model invent which card was drawn.
8. **Interpret:** character gives a brief interpretation connected to the user's stated situation, then asks whether they want to explore one part. It speaks the card name and enough imagery that the experience also works without looking at the screen. No guaranteed exam, relationship, financial, health, or other real-world outcome.
9. **Follow up:** support a normal back-and-forth, barge-in, repeat, and clarification. No second card or new paid session in v1. Explain gently that this reading uses the selected card.
10. **Close:** persistent `통화 종료` stops microphone tracks, playback, provider connection, timers, and outstanding work immediately. Do not wait for summary generation to release audio resources. At 4:30 show a visible remaining-time notice; at 5:00 end automatically and disclose the limit beforehand.
11. **Recap `/result`:** selected card and at most three short fields: `오늘의 질문`, `카드의 메시지`, `가져갈 질문`. Copy and share only after preview. Default share excludes the private question and uses only the card name and a generic reflection. A user can explicitly include their recap. Provide `새로 시작` and `내용 지우기`. If the call ended before a card or recap existed, show a truthful partial result instead of fabricating one.

## 4. Mobile design specification

Design at 390 × 844 first and verify at widths 320, 360, 390, and 430 px. Expand gracefully to tablet and desktop with a centered content width around 480 px. No horizontal page scrolling. Use safe-area padding, dynamic viewport height, and layouts that remain usable with the mobile keyboard open.

Visual default: warm ivory background `#FFF9F2`, ink `#292338`, muted lavender `#E7DBFF`, peach `#FFD6C4`, primary plum `#624282`. Validate actual text contrast rather than assuming the palette passes. Use a Korean system font stack, body text at least 16 px, clear hierarchy, and generous spacing. Buttons at least 44 × 44 CSS px. Original SVG mascot and consistent original SVG card artwork are acceptable; provide every asset locally with no missing external image dependencies. Do not copy branded tarot artwork or competitor mascots.

One primary action per screen. During the call, keep mute and end controls within thumb reach. Mute means no microphone transmission; the reader may still speak. Provide a separate `말 멈추기` control for stopping output while retaining the session. Status text distinguishes connecting, listening, thinking, speaking, muted, reconnecting, and ended. Animation must correspond to real events or audio level; mock mode is visibly marked. Respect reduced motion. Provide semantic buttons, keyboard access, visible focus, card alt text, and status announcements that do not repeatedly interrupt screen readers.

## 5. Conversation behavior

Use a versioned Korean system prompt. Start from:

> 너는 타로 캐릭터 모모야. 따뜻한 존댓말로 짧고 자연스럽게 대화해. 한 번에 질문 하나만 해. 사용자의 실제 질문과 수정한 내용을 기억해. 타로는 재미와 생각 정리를 위한 상징으로 설명하고 미래가 확정되었다고 말하지 마. 카드를 뽑기 전에는 해석하지 말고, offer_draw와 choose_card의 결과에 나온 카드만 사용해. 상대방의 속마음이나 사실을 안다고 주장하지 마. 답을 길게 독백하지 말고 사용자가 끼어들 수 있게 해. 사용자가 그만하자고 하면 종료 의도를 앱에 알려. 숫자와 시간은 한국어로 듣기 편하게 읽어. 사용자가 모욕이나 위협을 받았다는 상황에서는 가볍게 조롱하지 마. 의료, 법률, 투자 판단을 타로 결과로 결정하도록 권하지 마.

Handle a distressed user with a brief supportive response and appropriate real-world help rather than escalating a supernatural claim. Do not invent emergency numbers. Keep the character clearly identified as AI. Do not diagnose emotions from voice. The product is entertainment, not a therapeutic service.

Synthetic rehearsal script: user says `내일 면접이 있는데 너무 긴장돼요.` Reader asks what part worries them. User says explaining prior work. Offer draw; user picks middle. Interpret the actual card in that context. User interrupts with `합격 여부 말고 제가 준비할 수 있는 걸 말해줘요.` Reader changes focus to a manageable preparation action and a reflection question. Close. This script must work with any selected card; deterministic card selection is restricted to test/mock mode and visibly disclosed in recorded demonstrations that use it.

## 6. Architecture and ownership boundaries

Prefer TypeScript, Next.js App Router with Node runtime, React, ordinary CSS or CSS modules, Zod, Vitest, and Playwright. Use a current stable compatible release and lock exact resolved dependencies in the lockfile. Use Node 22 LTS if supported by the chosen framework; otherwise document the supported LTS choice. Do not introduce multiple frameworks, microservices, or a database for this bounded demo.

Use the official OpenAI Realtime browser SDK when it covers the requirements. Check the installed SDK and current official API docs before writing event mappings; do not mix GPT-Live events with Realtime events. The documented Realtime browser flow uses short-lived client credentials and WebRTC. A permanent OpenAI API key stays on the server. Do not route every audio packet through your application merely to implement a provider abstraction.

Suggested structure:

```text
src/app/                    routes and screen composition
src/components/             reusable UI and original visuals
src/features/session/       session state and conversation flow
src/features/tarot/         deck, draw types, recap schema
src/lib/voice/               provider interface and OpenAI adapter
src/server/                 access, session registry, limits, provider credentials
src/config/brand.ts         name, character, visual configuration
src/prompts/                versioned prompt
public/cards/               original local artwork
tests/                      meaningful behavior tests
.github/workflows/ci.yml    credential-free checks
docs/                       architecture, setup, demo, decisions, verification
```

Define a small `VoiceSession` boundary: connect, mute/unmute, interrupt output, send application/tool result, end, and subscribe to normalized status/transcript/tool/error events. Keep provider events inside the adapter. Build only the OpenAI adapter plus a deterministic test adapter. ElevenLabs is a future alternative, not a drop-in voice setting and not required for v1. Shared frontend code must not import raw provider event types.

Use a single-process server-side session registry with short TTL for the protected demo. Sessions expire after 10 minutes including setup, allow only one active voice call per browser access session, and end after five connected minutes in the normal client. Server restarts expire sessions with a clear user-facing recovery message. Do not deploy this in multiple replicas or serverless instances while relying on in-memory session consistency. Document that shared durable state is required before scaling.

## 7. Application contracts

These are our application contracts, not provider API field names. Validate all inputs on the server; bind every session operation to the signed access cookie. Reject sessions belonging to another access session. Do not accept arbitrary provider model names or arbitrary tool execution from the browser.

| Route | Input | Result |
|---|---|---|
| `POST /api/access` | `{code}` | Signed access cookie; generic failure otherwise |
| `POST /api/sessions` | `{clientRequestId}` | `{sessionId, expiresAt, maxDurationSeconds:300, voiceConfig, ephemeralCredential}`; idempotent start for duplicate request ID |
| `POST /api/sessions/:id/draw` | `{position:0\|1\|2, requestId}` | `{drawId, cardId, titleKo, imagePath, keywords, meaningKo, position}` |
| `POST /api/sessions/:id/end` | `{reason}` | Idempotent acknowledgement; mark session ended |
| `GET /api/health` | None | Generic readiness status without secrets |

Use an allowlisted `TarotCard` dataset with IDs 0–21, English and Korean names, original image paths, a few keywords, and concise original symbolic meanings. Use the standard Major Arcana sequence: Fool, Magician, High Priestess, Empress, Emperor, Hierophant, Lovers, Chariot, Strength, Hermit, Wheel of Fortune, Justice, Hanged Man, Death, Temperance, Devil, Tower, Star, Moon, Sun, Judgement, World. Meanings are entertainment content, not verified predictive knowledge. Treat difficult cards as themes for reflection, never impending death or disaster.

At session creation, use server-side secure randomness to shuffle the deck and store three hidden card IDs. First valid selection atomically locks the draw. Subsequent selections or retries return the same locked draw, even if the request ID changes. Never expose the hidden mapping before selection. No reroll through reconnect or double tap. Reject a draw after ending or expiry. Isolate test-only seeding from production.

Model tools:

- `offer_draw()`: updates the UI to selection-ready. May repeat safely.
- `choose_card({position})`: calls the server draw operation; returns the authoritative card. Concurrent tap and tool requests use the same locking rule.
- `save_recap({question,message,reflectionQuestion})`: validates lengths and stores the latest recap only in client memory; fixed card identity remains outside model control.
- `request_end()`: signals the application to close the call.

The agent asks permission to draw; it must not silently call `choose_card` before the user chooses. Validate that the selection phase has begun. Model tool arguments cannot change session identity or access rights. Store no raw transcript in application logs.

## 8. Failure, privacy, and cost behavior

Implement these paths explicitly:

- Microphone denied or unavailable: explanation and retry after permission changes; never pretend to listen.
- Connection timeout after 15 seconds: cancel safely, release microphone, show retry.
- Audio autoplay blocked: show a tap-to-enable-audio action.
- Network/provider failure: cancel old connection and late events; offer a deliberate reconnect to the same unexpired application session. Keep its locked card. Restore only the minimum in-memory context; disclose when context cannot be restored. Never allow overlapping old and new audio.
- Page reload: no invisible recording or automatic reconnection. Return to a safe start state; unsaved conversation can be lost, as explained in the UI.
- Background/locked phone: do not promise incoming calls or guaranteed background continuation. If the connection drops, show retry on return.
- No key or invalid provider configuration: real mode shows a clear configuration error; an explicitly selected, labeled mock mode can still exercise the UI.
- End, navigation, unmount, timeout, and failed setup all run the same idempotent cleanup. Late responses must not restart audio or mutate an ended session.
- Summary missing: show selected card and a fixed reflection prompt, labeled as a general prompt, rather than inventing a personalized conversation summary.

Use `Cache-Control: no-store` for credential and session routes. Apply same-origin checks as an additional measure, not as authentication. Rate-limit access attempts and session creation on the server. Initial demo limits: five access attempts per minute per IP; three new sessions per hour per signed browser session; at most seven concurrent application sessions per server. Return a readable 429 state. These are demo controls, not claims of abuse-proof billing enforcement.

Client timers and in-memory limits do not guarantee a hard provider spending cap, especially with direct WebRTC. Document provider usage monitoring and the operator procedure to disable new sessions/revoke credentials. Do not claim dashboard budgets are hard limits without verification. Never commit keys. Do not add production secrets to PR checks. Track only session duration, errors, timing, model/prompt version, and usage fields actually returned; label estimates and do not calculate prices from a single test.

## 9. Testing and completion criteria

Provide `npm ci`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, and `npm start`. All named scripts must really exist. CI must run without paid provider requests. Use mocks only in explicitly selected test mode.

Meaningful automated checks:

- Draw locks once under duplicate and concurrent requests; cannot access another user's session.
- Session expiry and repeated end requests are safe.
- Permission denial, connection failure, retry, and late events leave no active microphone/playback state.
- Tap and spoken card selection produce the same card in UI and tool result.
- Complete welcome → connect → question → draw → follow-up → recap path using a deterministic provider adapter.
- End during connecting and speaking, keyboard navigation, reduced motion, and narrow viewport layout.
- Client output contains no server secret.

Manual live verification: run a real Korean conversation on iOS Safari and Android Chrome, or explicitly report the device(s) unavailable. Verify microphone permission, playback, interruption, card correctness, context correction, ending, and reconnect behavior. Record observed delay and usage, not guessed scores. Desktop simulation does not establish mobile audio compatibility. When real credentials are unavailable, finish code and mock verification but report live voice verification as pending.

Acceptance: a teammate can open the HTTPS deployment on a target phone, enter the team code, complete a short interactive reading, interrupt the reader, and end cleanly. The result must identify the same card that was selected. There are no dead buttons, missing art, unsupported success claims, or silently simulated live conversations.

## 10. One-shot execution and handoff

1. Inspect existing files, instructions, branch state, and dependencies. Preserve user edits. Create a feature branch for the implementation.
2. Write a short implementation plan and any real external blockers; continue without waiting on cosmetic choices.
3. Build the complete journey with mock adapter, original assets, application contracts, and real adapter.
4. Run the checks, inspect mobile layouts, and repair failures. Verify live audio if credentials and devices are available.
5. Create `.env.example` containing names only: `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `DEMO_ACCESS_CODE`, `SESSION_SIGNING_SECRET`, `APP_ORIGIN`, `VOICE_PROVIDER`, and `ALLOW_MOCK_MODE`. Server-only values must not use `NEXT_PUBLIC_`.
6. Supply a standalone Node deployment configuration and HTTPS instructions. If deployment access is missing, deliver a locally runnable build and precise remaining steps. Do not purchase hosting or expose an ungated spending endpoint.
7. Include the supplied agent/team guides. Reconcile their expected commands with the actual project, document the file map, and add the CI workflow after scripts work. Do not change repository security settings or grant permissions silently.
8. Deliver code and docs in a reviewable PR with screenshots, test results, live verification status, setup steps, and limitations. No autonomous merge or production release.

Required final docs: README, architecture, actual environment/setup, demo script, manual device test record, deployment/rollback, and decisions. Preserve a clear distinction between mocked checks and live results. A passing build alone is not completed voice verification.

## 11. Details the team can refine without blocking the first build

| Detail needing more explanation | Default used now | Responsible role |
|---|---|---|
| Brand and distinctive character | Working title and original rabbit above | Product + design |
| Narrow initial user and use occasion | Adult with one everyday question in private | Product |
| Persona and Korean voice preference | Warm, concise respectful speech | Product + frontend |
| Reading rules and card count | One upright Major Arcana card | Product |
| Provider quality and cost tradeoff | One OpenAI adapter; measure a standard script | Backend + leader |
| Sharing and retention expectations | User-previewed text share; memory only | Product |
| Who reviews/merges | Leader initially integrates; peer review required by team convention | Leader |
| Hosting account, credentials, real devices | Must be supplied or explicitly reported missing | Leader |

Do not present these defaults as meeting consensus. A team change should update this document before a conflicting feature is implemented. Final naming, monetization, scheduling, advanced characters, and public launch are later product decisions.

## Sources checked October 25, 2026

- Team-provided Meetup #3 transcript; implementation defaults are authored recommendations.
- [OpenAI Realtime guide](https://developers.openai.com/api/docs/guides/realtime): browser SDK, speech-to-speech, and current model example.
- [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations): conversation and tool event behavior. Recheck exact SDK schema during implementation.
- [GitHub Actions deployment controls](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments): environment and deployment configuration.
