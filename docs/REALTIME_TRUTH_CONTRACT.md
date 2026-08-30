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
reviewed_at: "2026-08-28"
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
| Homepage Active Players and Online Players | One process-local document-lease snapshot with durable `users.last_seen` fallback from `/api/user/online_users` | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| `/players` presence | Same presence snapshot as homepage | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| `/players` replay totals, records, and membership | Lightweight public replay/projection generation token followed by a fresh server-component refresh | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus refresh time |
| Player profile match feed | Authoritative leading match window plus profile generation | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| Homepage Recent Parsed Games | `/api/lobby/recent-matches`, which merges canonical replay rows, current completed-session truth, and adjudication evidence | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| `/live-games` | `/api/live-games` over the live-session snapshot | 5 seconds | Immediate focus/visibility refresh | About 5 seconds plus request time |
| `/bets` | `/api/bets` plus event-driven post-ingest market reconciliation | 2 seconds | Immediate focus/visibility refresh | About 2 seconds after market truth; fallback ensure is bounded at 5 seconds |
| Living Kingdom roaming-now overlay | Authenticated, server-sanitized projections from eligible signed-in human accounts accepted by `/api/kingdom-presence/state`, then fanned out to anonymous or signed-in receive-only viewers through `/api/kingdom-presence/events` | Immediate route-entry publish; event-driven on depth-band or direction change with a 500 ms hard throttle; an 8-second foreground heartbeat (10 seconds under Save-Data); server admission at most 2 Hz with burst four | Immediate focus/pageshow republish; EventSource reconnect receives a fresh bounded snapshot; hidden/minimized tabs renew the last coarse position instead of departing, while pagehide and explicit logout remove the tab/actor immediately | About 2 seconds while active; abrupt disconnect safety bound is the 90-second presence TTL |

All listed client requests use `no-store`. Relevant routes are force-dynamic or return explicit private/no-store headers. Polls pause while the page is hidden, skip or supersede overlapping requests, and refresh immediately when the page becomes visible again.

Online membership is a separate lease rail from Living Kingdom. Each signed-in
document heartbeats every 15 seconds against a 90-second fallback window, so
several delayed ticks do not falsely mark a static but connected user offline.
Mount, focus, pageshow, restored connectivity, and successful authentication
refresh immediately. Page departure uses a per-document sequenced lease and a
short 750 ms same-site navigation grace; explicit logout fences older tabs and
immediately makes live truth offline while preserving durable `users.last_seen`
as historical last-seen evidence. Pagehide-before-arrival reordering leaves a
bounded inactive sequence tombstone, so an older in-flight heartbeat cannot
resurrect a departed document. Public rosters poll every five seconds and
refresh immediately on mount/focus/pageshow. A browser that cannot deliver its
departure beacon may remain online only until the 90-second safety window plus
the next sample. The displayed count and roster always come from one snapshot.

The ping mutation boundary is same-origin and cookie-session authenticated; it
never accepts legacy UID headers or body-authored identity. It tracks at most
eight documents per UID and 2,000 UIDs/barriers process-wide, accepts an initial
eight-document heartbeat burst and then one heartbeat per second, caps streamed
JSON at 2 KiB, and coalesces durable last-seen writes to one per UID per five
seconds. Leave cleanup bypasses heartbeat rate limiting.

## Living Kingdom roaming-now truth

Living Kingdom is an ambient public projection of where eligible AoE2WAR
members are roaming now. It is not browser surveillance, a durable activity
ledger, an analytics feed, or proof that a person is still looking at an exact
pixel. Each avatar represents only the latest bounded, quantized projection
accepted by the web process and expires when its lease becomes stale.

Within a server-enabled rollout cohort, a signed-in human account with an
eligible personal avatar is automatically `public_coarse` on allowlisted public
realms. Publication is always on for that eligible account. Legacy `off`,
`public_coarse`, absent, or malformed preference rows do not gate it, and the
compatibility mutation route returns HTTP 405. Anonymous sessions observe only.
AI-controlled persona accounts are excluded from publishing.

The truth path is deliberately separate from legacy online membership:

```text
eligible signed-in human browser with a personal avatar
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
  other private paths fail closed. Normalized public detail patterns may carry
  their exact pathname as the bounded room ID, so clan halls, individual bets,
  matches, players, and other approved detail pages do not collapse into their
  parent index.
- `/watch` and `/live-games` are distinct public realms. Watching a selected
  stream must not make an actor appear to be browsing the live-game directory,
  and moving between those surfaces must publish an actual realm transition.
- Movement and route samples are ephemeral. They never write through Prisma,
  `UserActivityEvent`, `/api/user/ping`, or the Traffic bridge. The active
  Living Kingdom path performs no preference write; historical preference rows
  are non-authoritative.
- Actor identity and avatar metadata are resolved server-side. Accounts without
  an eligible public display/avatar, feature-gated accounts, AI-controlled
  persona accounts, and disallowed routes cannot publish. Profile, Featured
  Warrior, and avatar-pool assignments are eligible, and their admin mutation
  routes invalidate cached identity immediately.
- Public actor IDs and presence-avatar URLs expose only a process-local opaque
  handle, never a durable account UID or UID-bearing managed-media path. The
  server resolves that handle through a bounded, expiring memory map and must
  serve the image directly rather than redirecting to its internal asset path.
- The process map, actor count, stream count, publish rate, payload size, event
  cadence, and TTL are bounded. User-driven samples send only depth-band or
  direction changes, normally at or below once per second; their hard throttle
  is 500 ms for a fast transition and at least one second under Save-Data.
  Interval samples are marked lease-renewal-only: they keep an idle tab alive
  without stealing the actor's projection from the tab most recently entered,
  focused, restored, or scrolled. The server's actor limiter sustains at most
  two requests per second with burst four for door/arrival pairs. A restart
  intentionally forgets all movement.
- Anonymous and signed-in public viewers are receive-only. Hidden/minimized
  publisher tabs renew only their last already-public coarse position and do
  not report hidden motion or promote activity ordering; the hidden viewer's
  EventSource suspends until visibility returns. Pagehide and explicit logout
  remove publication. Clicking one's own faded rail avatar is a local visual
  hide only (including its own door flight); clicking that portrait in the
  speed-chip stack restores it, and neither action affects other viewers.
  Reduced-motion and data-saving clients receive a quieter presentation.
- The SSE endpoint is `no-store`, sends keepalives inside the proxy read timeout,
  and is never buffered or cached by Nginx. Network cadence remains low; smooth
  motion comes from client interpolation rather than high-frequency messages.

The browser-to-server contract contains only an allowlisted public realm, one of
21 coarse depth bands, coarse motion, a visibility lifecycle signal, and
allowlisted navigation intent. Hiding or minimizing a tab retains its last
coarse page position as idle presence; it does not create new motion or promote
that tab's activity ordering. The public projection contains no exact scroll offset, cursor
position, private-route activity, or raw URL material. This
section defines product and technical behavior only. Legal and
privacy-compliance conclusions are out of scope.

The initial limits are 500 actors, three contributing tabs per actor, 250 SSE
subscribers by default, a 90-second actor TTL, a 10-second keepalive, and a
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
remain open through its hold and deliver its own snapshot bytes. `--proof`
requires the actual
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

### Concurrent watcher identity and card stability

Every replay pulse is an observation of a battle, not a new battle and not a
request to reorder the board. The live-session contract is:

- `platform_match_id` is the canonical cross-watcher battle identity when it is
  present;
- when that platform ID arrives after early generic observations, the latest
  eligible per-watcher battle epoch is promoted to the exact platform identity.
  Multiple independent watcher epochs may converge on one exact battle, while
  competing candidate IDs remain separate rather than being guessed;
- without platform identity, a high-entropy replay alias (for example a UUID
  or timestamped replay name) may correlate independent watchers; a generic
  replay name is never global identity and is scoped by watcher-session (or
  legacy uploader) evidence plus a persisted per-battle reset epoch;
- watcher-session IDs identify a running process, not a battle. For generic
  overwrite filenames, parse iteration 1 with a new replay hash starts a new
  battle epoch anchored to that durable reset row, so sequential games from an
  uninterrupted watcher process cannot inherit one another's card or market.
  Completion evidence is explicitly excluded from reset boundaries, even when
  its compatibility row also reports parse iteration 1;
- mutable roster, map, heartbeat, and replay fingerprint fields never define
  that fallback identity, so partial metadata can join later full iterations;
- stream titles, public URLs, and playback paths such as `/manifest` are
  presentation/transport metadata and never battle aliases;
- observations with the same canonical identity merge useful roster, watcher,
  uploader, stream, duration, and parse-iteration coverage instead of deleting
  one another;
- observations with different canonical identities remain independent even
  when they arrive in the same polling interval;
- a video stream that began under a fallback epoch follows that exact proven
  alias onto the later platform card. Fresh stream telemetry may enrich the
  card, but it never replaces the canonical replay row, battle ID, betting
  eligibility, or finality state;
- the initial server render and browser reconciliation use one deterministic
  oldest-battle-first ordering rule; after that, existing browser cards retain
  their relative slots and genuinely new identities append;
- heartbeat and parse activity may refresh a card's contents but must never
  promote that card above another active battle;
- a missing observation receives only a short multi-poll network grace. A
  completed identity leaves active immediately, and an absent watcher cannot
  remain pinned for minutes on client memory alone.

The public `/api/live-games` response remains HTTP `no-store`, but its expensive
database projection uses the process-wide four-second snapshot cache and
single-flight refresh. With the five-second visible-page poll, concurrent
browsers share one projection refresh instead of multiplying full-corpus work
by viewer count. A direct fresh path remains available to trusted internal
callers that explicitly need it; the public polling route does not bypass the
coalescer.

### Financial identity promotion

Live-card convergence and bet-book convergence are one atomic identity
contract. When exact platform truth promotes one or more earlier fallback
epochs, the market pass carries only the aliases proven by the fail-closed live
session grouper. Player names, roster similarity, map, timestamps, stream URLs,
and generic filenames never authorize a financial merge by themselves.

Promotion runs before public-number allocation and before any canonical market
upsert. It takes sorted advisory locks for the canonical and every exact alias,
then row-locks all exact winner/Desync books. The winner proposition and its
Desync child move as one family. Wagers, wallet-side locks, legacy stake
intents, ticket legs and ticket hashes, founder bonuses, pending claims,
automation references, frozen proposition state, and the earliest lock times
remain attached to the surviving books.

A recoverable legacy single-market stake intent keeps its original market ID
because its escrow memo names that ID. If two different market IDs have live
memo promises, or any proposition, side, ticket, wallet, claim, automation,
terminal-state, parent/child, slug-owner, or battle-identity conflict cannot be
proved safe, the entire exact battle family enters sticky `under_review` and no
replacement canonical seed is created. Unexpected reconciliation errors abort
the ensure pass; they are never logged and ignored while a duplicate book is
opened.

The lowest previously issued public battle number survives promotion. A
platform match resolves through that promoted identity even when its historical
row retains the fallback key, so promotion never burns a second public number.
Other exact identity rows remain completed reservations and are never reused.
Transferred legacy slugs become empty terminal
`merged_into_platform_market` tombstones. Stale legacy pollers therefore cannot
reopen the old book or strand a signed transfer after promotion.

#### Operator response to a blocked promotion

`watcher_identity_promotion` incidents are intentionally fail-closed. They
appear with every affected book in `/admin/market-integrity`; the incident
evidence records the canonical session, exact aliases, and the blocking reason.
Keep the whole family `under_review` while comparing the winner parent, Desync
child, wagers, wallet locks, stake intents/tickets, claims, automation rows,
frozen proposition hashes, and battle identities. Do not delete an alias book,
edit a market slug, clear a terminal marker, or reopen liquidity to make the
warning disappear.

There is deliberately no generic automatic override. If the conflict is real,
follow the existing integrity/void/refund workflow and preserve all payment
history. If the evidence proves one safe identity but the automatic planner is
too conservative, the remedy is a separately reviewed, backup-protected repair
with an immutable receipt, followed by a normal reconciliation and verification
that exactly one winner/Desync family and one public battle number remain. Only
then may the incident be resolved; a routine watcher pulse never clears it.

### Exclusive public lifecycle lanes

A battle occupies one public lifecycle lane at a time:

```text
scheduled/on deck -> playing now -> just finished -> recently played archive
```

Active identity wins over every completed/archive representation. A completed
battle is eligible for the short `just finished` presentation window only
after it has left active; archive cards for the same battle are withheld until
that window ends. A scheduled battle resolved by replay carries the same
canonical session identity into this exclusion set even though its public
result is rendered by the scheduled-match tile. The normal result window is
fifteen minutes and contracts to
ten or five minutes under a busy/surge board so a burst of finishes cannot
crowd out live action. Presentation depth is bounded independently of the
durable replay corpus.

Archive paging is performed at the logical-battle database grain: platform ID
first, otherwise immutable final replay hash. Counts and offsets therefore
refer to visible battles rather than parser rows, and the old 5,000-row
in-memory/upstream ceiling no longer truncates `Recently played` or its paging
coordinate space.

This public-lane timing does not shorten financial evidence retention.
Challenge reconciliation, market final proof, review, settlement, and late
proof handling continue to consume the longer canonical replay/session
horizons. UI expiry is never financial expiry.

The canonical-final read is bounded by a fourteen-day proof horizon, never by a
small raw-row `take`. The non-final completion-compatibility read is narrower:
it is bounded by the fifteen-minute presentation horizon and Postgres applies a
completion-candidate predicate before returning rows. Routine rolling pulses
therefore never cross the database boundary into that lane, while a burst of
finals from hundreds of games cannot consume a global row allowance and hide
another game's proof. Standalone native stream discovery is likewise bounded
by live status and a two-minute freshness window rather than an eight-row
ceiling.

### Desync child proposition

The desync proposition is stored separately because it has its own pools,
wagers, truth gate, and settlement, but the public book nests it under the
matching winner proposition. It is never a peer/top-level match row. Explicit
`parent_market_id` is authoritative; deterministic slug linkage may repair a
legacy row, and session fallback is accepted only for an unambiguous one-parent
and one-child pair.

`YES` requires current human-confirmed desync truth. A parser disconnect,
incomplete replay, or missing winner is not sufficient. An explicit current
human correction to `desyncOccurred: false` authorizes `NO` immediately; mere
absence authorizes `NO` only after the parent has a settlement-safe winner and
the desync review grace has closed. Once either side is truth-authorized,
backers of that side receive ordinary won payouts and opposing backers lose;
the proposition is not converted into a refund merely because it is a side
bet. A factual side with no backer does not rescue opposing wagers: they remain
resolved losses and create no bettor payout liability. Exact-stake void/refund
is reserved for unprovable truth or an otherwise voided proposition. Incident
append and desync-wager terminalization take the same replay-scoped advisory
transaction lock, and settlement re-reads effective human truth while holding
that lock. A concurrent incident therefore cannot commit between the final
truth check and financial terminalization.

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
13. multi-watcher tests exercise dozens of mutable replay observations for each
    of hundreds of distinct platform sessions, and prove exact session count,
    stable card order, merged coverage, and no identity loss;
14. a missed live poll retains a card only inside the short grace, an explicit
    completed identity removes it immediately, and one match never renders in
    active, just-finished, and archive lanes simultaneously;
15. the public live polling route uses the coalesced snapshot path while trusted
    internal fresh readers remain explicit;
16. a human desync append triggers an after-commit market pass; executable payout
    tests prove confirmed `YES`, explicit human `NO`, and review-closed `NO`
    produce won/lost outcomes; append and wager terminalization share one
    replay-scoped transaction lock with an in-lock truth re-read,
    while unprovable truth remains the exact-stake void/refund path and an
    unbacked factual side produces resolved losses rather than refunds.
17. loader tests prove generic replay names from different watcher sessions or
    uploaders remain distinct, partial rosters join their later full iteration,
    one long-running process receives distinct persisted battle epochs after a
    generic replay reset, parse-one completion evidence stays in that epoch,
    multiple early watcher epochs converge after receiving one exact platform
    ID, ambiguous IDs fail closed, and strong UUID/full-timestamp replay aliases
    correlate cross-watcher observations;
18. a 200-session by 50-observation completion burst plus 200 canonical finals
    returns every logical final with no raw-row cap, while the compatibility
    query proves its database-side candidate predicate and short UI horizon;
19. stream tests prove generic titles/URLs/manifests cannot merge battles, bridge
    aliases form one true transitive union, generic attached and standalone
    stream keys remain isolated, and at least 250 fresh standalone streams
    survive discovery;
20. archive tests page beyond 5,000 logical battles while preserving exact
    visible offsets, canonical ordering, and the full filed count.
21. identity-promotion tests prove exact aliases reach market discovery,
    winner and Desync books reconcile before numbering/upsert, one legacy memo
    ID survives, malformed/opposing financial state fails closed, stale alias
    slugs remain terminal, and canonical platform lookup reuses the original
    public battle number without a sequence insert. A stateful transaction
    harness must also execute the relation moves, ticket-hash recomputation,
    tombstones, source-drain assertion, battle-identity rebind, blocked incident
    path, and an idempotent second reconciliation.

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
