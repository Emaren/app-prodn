# AI Council and Command Center

## Ownership

AoE2HDBets owns the house voices, AoE2 grounding, public Council UX, lobby cast behavior, operator configuration, and request telemetry. The local Llama chat gateway remains the model-execution boundary. Provider credentials stay in service configuration and never enter the database or admin payloads.

## Surfaces

- `/ai` is the signed-in public Council. A user may ask one enabled public voice or convene two voices for one bounded round.
- `/admin/ai` is the operator command center for enabled/public state, runtime persona template, model label, role, specialty, introduction, prompt layers, knowledge scopes, context cap, timeout, and recent latency/failure telemetry.
- The lobby remains a public room. The Scribe and Grimer are cast members, not private assistant lanes or a model-picker UI.

## Prompt composition

`lib/aiConcierge.ts` builds prompts in layers:

1. immutable product and safety truth;
2. built-in runtime persona behavior (`scribe`, `grimer`, or `guy`);
3. operator-approved role, specialty, personality, and AoE2 expertise fields from `AiAgent`;
4. current app context and optional page-specific grounding;
5. the user question and bounded recent conversation.

Unknown facts must remain unknown. Bounty state, payout state, replay outcomes, and chain facts may not be invented. Operator configuration contains no API keys, credentials, hidden provider settings, or raw request/response bodies.

## Latency and reliability

Every attempted model call writes an `AiRequestTrace` with the source, requested model label, success/failure/timeout state, context/model/total timing, character counts, and a bounded error code. Prompt and response text are deliberately excluded.

The admin view calculates rolling 30-day request count, success rate, median latency, p95 latency, and recent failures. Council traffic is rate-limited per signed-in user, accepts at most two voices, and runs sequentially to keep provider pressure controlled. An agent-level timeout aborts a stalled gateway request.

The lobby exposes honest user-facing timing: a visible live thinking counter while replies are pending and `Thought for Ns` after completion. The message action is guarded while pending so Enter and button clicks cannot create duplicate sends.

## Data model and routes

- `AiAgent`: operator-owned configuration overlay; seeded with Scribe, Grimer, and Guy.
- `AiRequestTrace`: request metadata and timings only.
- `GET|POST|PATCH /api/admin/ai-agents`: admin configuration and telemetry.
- `POST /api/ai/council`: signed-in, rate-limited public Council execution.

## Verification

Run `npx prisma generate`, `npx tsc --noEmit --pretty false`, `npm run test:kingdom-expansion`, and `npm run build`. After deployment, verify `/ai`, admin authorization, a real Council call, trace creation, and unchanged public-lobby behavior.
