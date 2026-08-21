---
id: "aoe2war.app-prodn.docs-ai-council-and-command-center"
title: "AI Council and Command Center"
type: "explanation"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "architecture-explanation"
reviewed_at: "2026-08-21"
review_interval_days: 90
sensitivity: "internal"
---

# AI Council and Command Center

## Ownership

AoE2HDBets owns the house voices, AoE2 grounding, public Council UX, lobby cast behavior, operator configuration, request telemetry, and the OpenAI execution boundary for OpenAI-backed voices. OpenAI-backed agents call the Responses API directly from the server using the canonical service credential. The historical Llama chat gateway is retained only as an optional adapter for local/Ollama-backed models. Provider credentials stay in service configuration and never enter the database or admin payloads.

## Surfaces

- `/ai` is the signed-in public Council. A user may ask one enabled public voice or convene two voices for one bounded round.
- `/admin/ai` is the operator command center for enabled/public state, runtime persona template, model label, role, specialty, introduction, prompt layers, knowledge scopes, context cap, timeout, and recent latency/failure telemetry. It shows the saved effective site-side system prompt plus a redacted context manifest for each surface. Provider prompt identity/version/link metadata is read-only and provider credentials never enter the payload.
- The lobby remains a public room. The Scribe and Grimer are cast members, not private assistant lanes or a model-picker UI.

## Prompt composition

OpenAI-backed house voices use two explicit instruction layers plus bounded dynamic input:

1. the versioned OpenAI saved prompt referenced by `prompt.id` and `prompt.version`;
2. the AoE2WAR site-side system prompt sent as Responses `instructions`;
3. bounded dynamic context and the current member message sent as Responses `input`.

The direct OpenAI request sets `store: false`, so AoE2WAR does not ask the Responses API to retain application state for house-voice calls. Normal OpenAI API abuse-monitoring/data-control policy remains a separate provider concern.

`lib/aiConcierge.ts` builds the AoE2WAR prompt in layers:

1. immutable product and safety truth;
2. built-in runtime persona behavior (`scribe`, `grimer`, or `guy`);
3. operator-approved role, specialty, personality, and AoE2 expertise fields from `AiAgent`;
4. current app context and optional page-specific grounding;
5. the user question and bounded recent conversation.

Unknown facts must remain unknown. Bounty state, payout state, replay outcomes, and chain facts may not be invented. Operator configuration contains no API keys, credentials, hidden provider settings, or raw request/response bodies.

## Latency and reliability

Every attempted model call writes an `AiRequestTrace` with the source, requested model label, success/failure/timeout state, context/model/total timing, character counts, and a bounded error code. Prompt and response text are deliberately excluded.

House voices currently return one completed provider response, not token SSE. `firstTokenMs` therefore records the completed model-response duration as an honest first-visible-text proxy; it must not be described as streamed token latency. `totalMs` remains the end-to-end request measure including context assembly. OpenAI HTTP/provider failures are recorded with bounded `openai_*` error codes; optional local-model gateway failures retain `gateway_*` codes.

Context sources are assembled in parallel. Recent-match grounding is cached for 15 seconds, while wallet/economy, staking, and people-directory context are loaded only when the question asks for those domains. This keeps general AoE2 questions out of unrelated database paths without weakening grounding for finance or identity questions.

Replay/stat questions may receive the aggregate parser-readiness snapshot used
by the Observatory. That context describes extraction coverage and effective
recent-match truth only. Raw candidate objects, private storage keys, and
checkpoint winners are never supplied to a house voice.

The admin view calculates rolling 30-day request count, success rate, median latency, p95 latency, and recent failures. Council traffic is rate-limited per signed-in user, accepts at most two voices, and runs sequentially to keep provider pressure controlled. An agent-level timeout aborts a stalled gateway request.

The pre-deploy Campaign III audit found zero `AiRequestTrace` rows. By the final
seal, two successful public-lobby traces had arrived: one Scribe request at
9,359 ms and one Grimer request at 1,608 ms. The telemetry rail is active, but
that sample is too small to identify a production latency bottleneck.

The lobby and Council expose honest user-facing timing: a visible thinking counter while replies are pending and `Thought for Ns` after completion. Message actions are guarded while pending so Enter and button clicks cannot create duplicate sends.

## Data model and routes

- `AiAgent`: operator-owned configuration overlay; seeded with Scribe, Grimer, and Guy. `version` is the integer optimistic-lock token for admin edits. `PATCH /api/admin/ai-agents` requires the last loaded version, increments it atomically, and returns `409` on a stale save. Do not use `updated_at` as the lock token because PostgreSQL stores microseconds that JavaScript dates cannot preserve.
- `AiRequestTrace`: request metadata and timings only.
- `GET|POST|PATCH /api/admin/ai-agents`: admin configuration and telemetry.
- `POST /api/ai/council`: signed-in, rate-limited public Council execution.

## Verification

Run `npx prisma generate`, `npx tsc --noEmit --pretty false`, `npm run test:kingdom-expansion`, and `npm run build`. After deployment, verify `/ai`, admin authorization, a real Council call, trace creation, and unchanged public-lobby behavior.


## Hall Scribe agent family

`aoe2war-hall-scribe` is a distinct agent and system identity that reuses the
`scribe` runtime family without reusing The AI Scribe's user identity. The
Command Center exposes a dedicated Stage Hall Scribe action and a `clan_hall`
effective-prompt preview.

`Agent4.1HallScribe` uses dedicated provider prompt environment configuration
when present and the proven Scribe v9 prompt as an explicit fallback. OpenAI
Hall execution uses the direct AoE2WAR Responses rail; Llama is not required.


## Kingdom Knowledge Router

All house voices consume the application-owned Kingdom Knowledge Router for
current public AoE2WAR facts. The router selects only relevant repositories per
question and loads them concurrently.

Hall Scribe receives the same public Kingdom repositories plus its own
audience-filtered Hall roster/history.

Viewer-private financial/session/direct-message context remains a separate
surface-gated rail and is never implied by public KKR access.

## 2026-08-17 release boundary - direct OpenAI and Hall Scribe

OpenAI-backed house voices use the Responses API directly. The local Llama
adapter remains optional and is not a dependency of the Hall Scribe path.

AoE2WAR Hall Scribe is the dedicated `aoe2war-hall-scribe` agent using
`Agent4.1HallScribe`, which resolves the pinned GPT-4.1 Hall provider prompt.
Clan Hall requests use Kingdom Knowledge Router evidence as their current
public-site truth plane. The Hall lane intentionally does not launch the
generic lobby leaderboard and generic recent-match snapshots beside KKR.

The production-data development launcher can optionally import the production
OpenAI credential over SSH into the local Next child process only. The value is
memory-only, is never printed or written to disk, and does not weaken the
production PostgreSQL read-only fence. `INTERNAL_API_KEY` and `ADMIN_TOKEN`
remain excluded.


## 2026-08-21 Kingdom intelligence observability

The AI Command Center now exposes the Kingdom Knowledge Router as an operator
control-plane view rather than leaving KKR visible only through a raw admin API.

The view shows:

- the full KKR repository catalog and mapped public pages;
- The AI Scribe and Grimer as `lobby_public` KKR consumers;
- every active Clan Hall Scribe as a `clan_hall` KKR consumer;
- Hall-local additive roster/history versus intentionally excluded private
  context;
- whether a Hall uses a dedicated agent configuration or inherits the proven
  AoE2WAR Hall Scribe configuration;
- stored `knowledgeScopes` alongside the effective runtime contract;
- a live read-only routing inspector using `/api/admin/ai-knowledge`.

The current panel is observability-first. It does not yet mutate KKR repository
permissions. Future granular controls can use this topology as the operator
surface without changing the underlying public-Kingdom/privacy boundary.
