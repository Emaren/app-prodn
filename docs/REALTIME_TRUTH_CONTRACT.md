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
reviewed_at: "2026-08-08"
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

All listed client requests use `no-store`. Relevant routes are force-dynamic or return explicit private/no-store headers. Polls pause while the page is hidden, skip or supersede overlapping requests, and refresh immediately when the page becomes visible again.

Presence intentionally has a two-minute membership window because a browser heartbeat is periodic. A disconnected user can therefore remain “online” for up to roughly two minutes plus the next five-second sample. That is liveness policy, not a cache defect. The displayed count and roster must always come from the same sample.

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

## Observability identifiers

End-to-end latency should be correlated with replay hash, game/session/platform ID, replay iteration, market ID, watcher/session ID, and these timestamps where available:

`detected -> upload_started -> api_received -> archived -> parsed -> committed -> projected -> market_reconciled -> result_authorized -> settlement_safe -> client_observed`

Track p50/p95/p99 for each delta plus cache invalidations, stale-refill rejections, callback attempts/failures, recovery candidates/results, ensure runs/suppressions, and watcher events stored/suppressed/failed.
