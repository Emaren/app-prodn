---
id: "aoe2war.app-prodn.docs-realtime-truth-contract"
title: "AoE2WAR Realtime Truth Contract"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher"]
audience: ["developers","operators","auditors","ai-agents"]
source_of_truth: "git"
authority: "architecture-contract"
reviewed_at: "2026-08-21"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Realtime Truth Contract

## Outcome

Meaningful replay, market, player, and presence changes must reach an already-open AoE2WAR page without a manual reload. Each public surface may use the lightest suitable transport, but it must consume the same domain truth and stay inside a documented stale bound.

The August 8 audit found that parser execution was not the main latency source. Recent production parses completed in roughly 0.7 seconds and replay uploads in roughly 3 seconds. The material delays came from an early metadata-only replay fragment remaining in the live-session merge for twelve minutes, request-delayed market discovery, an uninvalidated 90-second replay-list cache, sticky client merges, independent presence definitions, and direct FastAPI uploads bypassing the web-owned identity-projection coordinator.

## Canonical truth pipeline

```text
watcher file observation
  -> immutable live/final upload snapshot
  -> FastAPI GameStats commit
  -> public-list cache invalidation
  -> idempotent web post-ingest coordinator
       -> automatic result policy
       -> identity/stat projections
       -> tournament proof reconciliation
       -> market discovery/reconciliation
  -> no-store public APIs
  -> visible-page refresh/focus refresh
  -> rendered truth
```

The FastAPI upload commit is replay-storage truth. The web coordinator owns app projections and betting-domain reactions. Direct watcher uploads and same-origin proxy uploads must converge on that coordinator; neither ingress path may silently skip identity projection.

The direct-API callback is a bounded background retry. The recurring replay recovery route also scans a small recent-final lane for accepted results or public identity projections that are still missing, even when the exact parser run already exists. The repair is append-only and idempotent.

## Truth stages

Do not collapse these states into one boolean:

| Stage | Meaning | May be displayed? | May settle a wager? |
| --- | --- | ---: | ---: |
| Live/provisional | A growing replay/session is known. Rosters or result may still change. | Yes, clearly labeled | No |
| Parser-supported | Structured replay evidence supports teams, players, or a candidate result. | Yes, with provenance | No by itself |
| Authoritative result | Accepted app policy/adjudication establishes the public result. | Yes | Only if the authority explicitly affects bets |
| Settlement-safe | Frozen proposition/roster and financial-authority proof satisfy the market contract. | Yes | Yes |

A fast provisional display must never be mislabeled as settlement authority. Conversely, settlement caution must not hide useful replay progress from public surfaces.

## Surface contracts

| Surface | Canonical source | Visible cadence | Resume behavior | Healthy-path stale bound after server truth |
| --- | --- | ---: | --- | ---: |
| Homepage Active Players and Online Players | One `users.last_seen` presence snapshot from `/api/user/online_users` | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| `/players` presence | Same presence snapshot as homepage | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| `/players` replay totals, records, and membership | Lightweight public replay/projection generation token followed by a fresh server-component refresh | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus refresh time |
| Player profile match feed | Authoritative leading match window plus profile generation | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| Homepage Recent Parsed Games | `/api/lobby/recent-matches`, which merges canonical replay rows, current completed-session truth, and adjudication evidence | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| `/live-games` | `/api/live-games` over the live-session snapshot | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| `/bets` | `/api/bets` plus event-driven post-ingest market reconciliation | 2 seconds | Immediate focus/visibility refresh | About 2 seconds after market truth; fallback ensure is bounded at 5 seconds |
| Living Kingdom roaming-now overlay | Authenticated, server-sanitized projections accepted by `/api/kingdom-presence/state`, then fanned out from the process-local hub through `/api/kingdom-presence/events` | Event-driven on depth-band or direction change, normally at or below 1 Hz; a 500 ms client hard throttle permits responsive fast transitions, Save-Data uses at least 1 second, and the server admits at most 2 Hz with burst four | EventSource reconnect receives a fresh bounded snapshot; hidden publishers stop sampling and stale actors expire | About 2 seconds while active; no actor remains public beyond the bounded presence TTL after its last accepted sample |

All listed client requests use `no-store`. Relevant routes are force-dynamic or return explicit private/no-store headers. Polls pause while the page is hidden, skip or supersede overlapping requests, and refresh immediately when the page becomes visible again.

Presence intentionally has a two-minute membership window because a browser heartbeat is periodic. A disconnected user can therefore remain “online” for up to roughly two minutes plus the next five-second sample. That is liveness policy, not a cache defect. The displayed count and roster must always come from the same sample.

## Living Kingdom roaming-now truth

Living Kingdom is an ambient public projection of where eligible AoE2WAR
members are roaming now. It is not browser surveillance, a durable activity
ledger, an analytics feed, or proof that a person is still looking at an exact
pixel. Each avatar represents only the latest bounded, quantized projection
accepted by the web process and expires when its lease becomes stale.

The truth path is deliberately separate from legacy online membership:

```text
signed-in browser with an eligible avatar and presence preference
  -> authenticated, rate-limited POST /api/kingdom-presence/state
  -> server resolves identity and normalizes an allowlisted public realm
  -> bounded process-memory hub replaces that actor's latest projection
  -> bounded SSE snapshot/delta on /api/kingdom-presence/events
  -> anonymous or signed-in public viewer interpolates locally
```

The browser may submit an allowlisted realm ID, quantized depth band, coarse
motion/visibility state, and a navigation intent to another allowlisted realm.
It may not author its UID, display name, avatar URL, raw URL, query string,
fragment, anchor, or arbitrary destination. A navigation intent may animate an
avatar toward a known public door, but the destination becomes roaming truth
only after a confirmed route-entry update.

The following boundaries are mandatory:

- Missing, malformed, or unrecognized feature mode is `off`. Server-side mode
  enforcement controls both publishing and the public stream; hiding the
  overlay in CSS is not a kill switch.
- Only routes represented by the canonical public realm registry may be
  published. Admin, authentication, inbox/direct-message, wallet/security, and
  other private paths fail closed and expose no raw path material.
- Movement and route samples are ephemeral. They never write through Prisma,
  `UserActivityEvent`, `/api/user/ping`, or the Traffic bridge. The user's
  explicit visibility preference is durable account state and is the sole
  allowed database write in this feature path.
- Actor identity and avatar metadata are resolved server-side. Accounts without
  an eligible public display/avatar, opted-out or feature-gated accounts, and
  disallowed routes cannot publish.
- Public actor IDs and presence-avatar URLs expose only a process-local opaque
  handle, never a durable account UID or UID-bearing managed-media path. The
  server resolves that handle through a bounded, expiring memory map and must
  serve the image directly rather than redirecting to its internal asset path.
- The process map, actor count, stream count, publish rate, payload size, event
  cadence, and TTL are bounded. Clients send only depth-band or direction
  changes, normally at or below once per second; their hard throttle is 500 ms
  for a fast transition and at least one second under Save-Data. The server's
  actor limiter sustains at most two requests per second with burst four for
  door/arrival pairs. A restart intentionally forgets all movement.
- Public viewers are receive-only. Hidden tabs disconnect or suspend work;
  reduced-motion and data-saving clients receive a quieter presentation.
- The SSE endpoint is `no-store`, sends keepalives inside the proxy read timeout,
  and is never buffered or cached by Nginx. Network cadence remains low; smooth
  motion comes from client interpolation rather than high-frequency messages.

The initial limits are 500 actors, three contributing tabs per actor, 250 SSE
subscribers by default, a 30-second actor TTL, a 15-second keepalive, and a
2-KiB mutation body. `LIVING_KINGDOM_MAX_SUBSCRIBERS` may tune the stream cap
but is clamped to an absolute 1,000; raising it requires measured file-descriptor,
memory, event-loop, and outbound-bandwidth proof. `LIVING_KINGDOM_MODE` owns the
`off`, `staff`, `canary`, and `public` rollout lanes. Staff and canary UID
allowlists govern publishers; malformed configuration remains off.

Active streams are also capped at 20 per proxy-owned client IP by default and
four per authenticated UID. `LIVING_KINGDOM_MAX_SUBSCRIBERS_PER_IP` may raise
the IP cap only as high as 250 for an explicit local load test or reviewed
production topology; the global subscriber ceiling still wins.

The local load harness defaults to exactly 20 viewers and refuses a viewer
count above its declared `--per-ip-cap`. Its default staged run closes the whole
viewer wave, waits for cleanup, and reconnects the same count. Proof mode
requires that count to equal the declared per-IP cap, verifies a cap-plus-one
request receives HTTP 429 during every wave, and therefore exposes incomplete
stream-lease cleanup on reconnect. Final open FDs must also recover within the
reviewed tolerance after a separate six-second default cooldown, which is long
enough for the staged Node listener's ordinary five-second HTTP keep-alive
window; this prevents reusable idle sockets from being mislabeled as leaked SSE
leases without weakening the tolerance. Every individual admitted stream must
remain open through
its hold and deliver its own snapshot bytes. `--proof` requires the actual
process that owns the selected loopback listener plus explicit RSS, open-FD,
load-generator event-loop p99, and loopback SSE first-byte p95 ceilings. Listener
ownership is checked before sampling, preventing an unrelated PID from becoming
false headroom evidence. First-byte latency is an external target-responsiveness
proxy. Proof mode also issues a bounded invalid-realm control request throughout
the hold so a mid-wave responsiveness stall is not hidden by fast startup.
Neither external latency measure claims direct instrumentation inside the Next.js
event loop.

Build and start the final optimized candidate locally with Living Kingdom
enabled; `next dev` is not release evidence. Identify the process that owns that
candidate's loopback listener, then run a reviewed-budget proof such as:

```bash
node scripts/living-kingdom-load.mjs \
  --proof \
  --target-pid 12345 \
  --viewers 20 \
  --duration-seconds 60 \
  --rss-limit-mib 2300 \
  --fd-limit 1024 \
  --event-loop-limit-ms 100 \
  --ttfb-limit-ms 1000
```

Replace the PID and ceilings with the staged listener and explicitly reviewed
host budgets. For authenticated fanout, provide local-only sessions through
`AOE2WAR_PRESENCE_TEST_COOKIES` and add `--publishers`; the harness never prints
the cookie values. Runs above 20 viewers require the same raised local app cap
and matching `--per-ip-cap`. The script refuses every non-loopback target and
must never be pointed at production.

`app-prodn` owns this projection and its UI. Traffic may receive coarse,
low-frequency product analytics such as feature-enabled or destination-clicked
counts, but never the identified roaming stream. VPSSentry observes aggregate
runtime health. `api-prodn`, replay truth, and WoloChain do not participate.

## Recent-match replacement and ordering

Recent Parsed Games is ordered by canonical game occurrence time (`public_played_at` and its documented fallbacks), not by the newest parser/adjudication mutation. A result or finality correction updates the existing card in place; it does not move an old game above a newer battle merely because its review changed later.

The latest leading page is authoritative for same-ID corrections and removals. Older pages explicitly loaded by the user may remain below that leading window. An older client row must not defeat a fresh lower-confidence correction, and an empty authoritative response must be allowed to clear the leading window.

## Live-session and market discovery rules

A metadata-only `hd_metadata_fragment_only_recovery` row may bootstrap a session when it is the only evidence. Once a substantive replay iteration exists, that fragment is excluded from roster/team merging. It must not poison a complete later roster until the historical twelve-minute retention window expires.

Market discovery reads fresh replay truth rather than a stale public display snapshot. A successful replay commit asks the web post-ingest coordinator to reconcile immediately; public GET traffic is only a fallback trigger. `/bets` responses cannot be shared by a CDN, and older overlapping responses cannot overwrite newer board state.

## Final-proof lifecycle

Every `awaiting_final_proof` parent market receives one persisted proof deadline. Normal realtime transitions anchor the clock to the proof observation that caused the transition and never restart it from mutable `updated_at`. A legacy or anomalous null-deadline parent receives one fresh bounded migration grace when repaired; once persisted, that deadline is immutable. A desync child inherits an already-persisted parent deadline.

At deadline:

1. an authorized result wins if it exists;
2. otherwise the parent enters the existing void/refund lifecycle;
3. the desync child inherits and follows the parent terminal state;
4. active wagers receive the exact original-stake refund with no fee or bonus.

A late replay never automatically reopens a voided/refunding market.

## Cache and invalidation rules

- HTTP `no-store` does not invalidate a process-memory cache.
- FastAPI invalidates every `/api/game_stats` limit variant after each durable final commit.
- Cache refills carry the generation observed before their database read. If invalidation happens while that read is in flight, the old generation cannot republish stale rows.
- Public live-session caching coalesces concurrent refreshes. Healthy expired reads await fresh truth; last-good data is used only after refresh failure and remains expired so the next request retries.
- Lightweight generation endpoints may cache for about one second to coalesce identical polling, but must change when replay, projection, snapshot, adjudication, or relevant identity truth changes.

## Watcher telemetry load

Native filesystem notifications may repeat rapidly while one replay is already monitored. The desktop source coalesces remote `replay_detected_ignored` events with reason `monitoring` to one summary per replay every 30 seconds while preserving the local journal and all meaningful lifecycle events.

The server applies the same narrow coalescing rule so currently installed clients receive immediate production protection. It bounds and prunes its in-memory keys, reports stored/suppressed/failed counts, and keeps the admission window closed after a failed database write so a database outage cannot recreate one attempted write per raw filesystem notification; the failed observation is rolled into the next admitted summary. It never suppresses replay detection, upload, parse, final-candidate, final-observation, or monitor-stop transitions.

## Somniosator incident

Game `22262` contained the same exact participant names and Steam IDs in every watcher iteration. The watcher did not rename somniosator. The profile could display the raw/adjudicated game, but the public directory had no accepted replay stat/player projection because the direct FastAPI upload path had bypassed the web coordinator. The directory also rendered only its first 18 claimed rows and sorted by transient online state, so somniosator could appear while online and disappear afterward.

The contract now requires:

- every accepted direct or proxied replay receipt to reach the idempotent coordinator;
- periodic bounded recovery of recent finals missing accepted projections/results;
- stable claimed-directory membership independent of presence;
- no silent 18-row claimed-profile cut-off;
- live generation refresh for already-open directory and profile pages.

## Operational verification

For a release affecting this contract, verify all of the following:

1. focused replay/realtime/finality tests pass in app, API, and watcher repositories;
2. Prisma generation, TypeScript no-emit, and a clean Next production build pass;
3. FastAPI cache generation race and post-ingest retry tests pass;
4. the direct internal callback succeeds over loopback with matching credentials;
5. a recent missing projection can be planned, applied idempotently, and observed on `/players` and both player profiles;
6. `/api/bets`, `/api/live-games`, `/api/lobby/recent-matches`, `/api/user/online_users`, and player generation/match routes emit no-store behavior where applicable;
7. an already-open page learns a new or corrected row inside its documented cadence without reload;
8. settlement health is `ok=true` before allowing repaired proof deadlines to advance wager refunds;
9. telemetry logs show monitoring-ignore rows being coalesced while finality events remain intact.
10. Living Kingdom mode fails closed, its realm registry rejects private/raw
    routes, and movement source-contract tests prove that no Traffic, user-ping,
    activity-ledger, or Prisma movement-write path exists;
11. the exact `/api/kingdom-presence/events` proxy location has buffering and
    caching disabled, a read timeout longer than the application keepalive, and
    no WebSocket upgrade requirement;
12. the local-only presence load harness proves bounded viewers, publisher rate,
    reconnect cleanup, per-viewer response bytes, target RSS/open-FD headroom,
    load-generator event-loop headroom, and loopback target responsiveness before
    a public canary. It must never target production.

## Observability identifiers

End-to-end latency should be correlated with replay hash, game/session/platform ID, replay iteration, market ID, watcher/session ID, and these timestamps where available:

`detected -> upload_started -> api_received -> archived -> parsed -> committed -> projected -> market_reconciled -> result_authorized -> settlement_safe -> client_observed`

Track p50/p95/p99 for each delta plus cache invalidations, stale-refill rejections, callback attempts/failures, recovery candidates/results, ensure runs/suppressions, and watcher events stored/suppressed/failed.

Living Kingdom observability is aggregate only: mode, active actors, tabs,
per-realm counts, subscribers and caps, accepted/rate-limited/invalid mutations,
TTL expirations, dropped fanout, response bytes, reconnects, event-loop delay,
process memory, and file descriptors. `/api/admin/kingdom-presence` exposes the
in-process counters to authenticated operators. Do not log or export exact
actor positions, public IDs, raw paths, queries, or per-user movement history.
