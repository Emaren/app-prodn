---
id: "aoe2war.app-prodn.architecture"
title: "app-prodn Architecture"
type: "explanation"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "architecture-explanation"
reviewed_at: "2026-08-21"
review_interval_days: 60
sensitivity: "internal"
---

# app-prodn Architecture

## Watcher and betting final-proof lifecycle

Replay receipt truth comes from watcher-backed `game_stats` and `replay_parse_attempts`; `watcher_client_events` is client acknowledgement only. `/admin/watcher-funnel` reports connection, monitor, folder, current replay, last server replay, parse/finality, stream, and version independently.

The complete cross-surface cadence, cache, recovery, presence, and truth-stage rules are maintained in `docs/REALTIME_TRUTH_CONTRACT.md`.

Direct watcher/API commits enqueue the exact durable replay receipt to the web-owned post-ingest coordinator with bounded retry; web-proxy uploads mark themselves as coordinator owner to prevent a duplicate callback. Requested automatic, tournament, and market stages must all succeed before the callback returns HTTP success; a market failure also queues the lightweight ensure fallback, while HTTP 503 keeps the API bridge retryable. Financial reconciliation crosses an after-commit barrier: it first drains any pre-existing single-flight pass, then requires a pass that began after the replay commit. The recurring replay recovery timer has two bounded execution lanes: exact current-hash parser dispatch for rows without a contract run, and idempotent result/identity reconciliation for recent exact-run finals whose accepted output is missing or stale. Both lanes select from and rotate through the complete configured lookback instead of truncating the candidate horizon, so a permanently unusable newest replay cannot starve older work. Identity gaps receive the larger 3:1 share of the output lane, while only the small configured batches perform parser/writer work. The output lane never reruns the parser. If accepted result/source truth changes after an unresolved public projection, recovery appends a superseding projection with fresh player W/L snapshots instead of mutating history. API `/api/game_stats` cache invalidation advances a process generation, so an older in-flight DB read cannot refill the cache after new final truth commits.

Watcher-linked books use `open`/`live` → `awaiting_final_proof` → `settled`, `voided`, or `under_review`. Session disappearance is driven by replay activity freshness. It locks the book and sets one `WATCHER_FINAL_PROOF_GRACE_MINUTES` deadline (default 20 minutes); `updated_at` is not the proof clock. Expiry without trusted winner proof creates `voided`/`final_replay_not_received`. Explicit disconnect/desync evidence may use the corresponding evidence-backed reason.

A watcher row being visible is not enough to keep a book wagerable. Only a winner-market seed that passes canonical roster/result validation and is reconciled may protect the same session key from the detached/finality pass. If a later active or completed row becomes structurally ineligible, the existing book enters closing, final-proof, or integrity review immediately even when it already has active wagers; watcher `closing` and proof/review states reject new stakes.

Every transition into `awaiting_final_proof`, including a market created directly from an unresolved final seed, persists its deadline with the state change. A live/open market's first transition anchors the full grace to the observation that caused the transition, never to the older market/game creation time; repeat reconciliation preserves the persisted proof clock. Legacy or anomalous rows that already sit in `awaiting_final_proof` without a persisted deadline receive one fresh bounded migration grace at repair time, which is then immutable; a desync child inherits an already-persisted parent deadline. Reconciliation repairs that invariant before parent expiry, then advances desync children from the parent and runs the existing exact-refund settlement rail.

Voids have no winner or fee. Active wagers become `void`, payout equals original stake, founder/winner bonuses are rescinded, and the normal idempotent settlement rail records `queued`, `refunded`, or `failed`. Late finals attach to `late_final_game_stats_id` and never reopen betting or reverse refunds automatically.

Team membership is an end-to-end replay contract. `api-prodn` preserves canonical player/team fields; `lib/liveSessionSnapshot.ts` merges iterations without discarding complete team evidence; and `lib/teamResolution.ts` is the single resolver for live display, market creation, proposition hashing, final validation, and audits. A metadata-only HD recovery row remains usable until a substantive replay iteration exists, then leaves the roster merge so its partial assignments cannot poison current coherent truth. Team games require two complete equal teams from explicit replay team IDs. Array order and aliases cannot assign sides.

`/bets` polls current board truth every two seconds while visible and refreshes on focus/visibility resume; superseded requests are aborted. `/live-games` polls every five seconds and has the same foreground refresh contract. The shared live snapshot may serve an unexpired four-second cache entry, but an expired hit joins one coalesced fresh DB load instead of returning stale-while-revalidate data. A last-good snapshot is used only when that refresh fails and remains expired so the next request retries.

Every bettable team book stores immutable left/right roster snapshots and a proposition hash. The first accepted stake locks those fields. A later roster mismatch creates an integrity incident and closes the book instead of mutating it. Final settlement re-resolves the full final roster and requires the same identities, teams, hash, coherent winner/loser flags, and betting eligibility. `/admin/market-integrity` is the operator cockpit; the full contract and repair lifecycle are in `docs/MARKET_TEAM_INTEGRITY.md`.

## Purpose

`app-prodn` is the public product shell for AoE2HDBets.

It owns:
- community lobby and homepage presentation
- leaderboard, players, rivalries, live-games, clans, tournaments, requests, `$WOLO`, profile, inbox, and admin pages
- same-origin browser API routes for auth/session-gated actions
- Prisma-backed user, inbox, badge, gift, request, and appearance state
- server-side proxying to `api-prodn` where game/replay data still lives there
- premium shell behavior, theme selection, and lobby-level presentation logic
- the Living Kingdom ambient roaming projection, privacy policy, and public
  avatar choreography

It does not own:
- replay parsing truth
- `game_stats` ingestion
- watcher uploads
- chain infrastructure
- cross-project analytics ownership
- final authority over replay-derived match records

## Runtime shape

### Production database identity

`app-prodn` / AoE2WAR HD production database truth is explicitly
`aoe2hd_db`.

`aoe2de_db` is the sister AoE2DE database and is never a substitute HD truth
source merely because both databases contain similar tables.

The local writable `aoe2hdbets_shadow` database and any other shadow/test
database are development evidence only. Production investigations must name the
owning database explicitly; do not auto-select the first database matching a
schema.

For direct operator inspection on the VPS, prefer explicit read-only
transactions against `aoe2hd_db` rather than bare `psql` or an inherited shell
default. Private profile War Archive metadata/bytes verification is defined in
`docs/PLAYER_WAR_ARCHIVE_OPERATIONS.md`.

### Verified production authority split — 2026-07-26

The live architecture is intentionally split across independently versioned authorities:

- **Web/application authority:** `/var/www/AoE2HDBets/app-prodn` at `22232a0bcc038a567acd052f432883e70482a3f9`; deployed build `20260726054351-9b5a6fcd0b`; systemd service `aoe2hdbets-web.service`; loopback bind `127.0.0.1:3030`.
- **Replay parse/finality authority:** `/var/www/AoE2HDBets/api-prodn` at `d2d68646b1aff3ffb9e647ee0fe4deaa143b2c6e`; systemd service `aoe2hdbets-api.service`; loopback bind `127.0.0.1:3330`.
- **WoloChain source authority:** `/var/www/WoloChain-wolo-1` on `wolo-1-mainnet-prep` at `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`.
- **Consensus binary:** `/usr/local/bin/wolochaind-mainnet-node-prewartrophy`, commit `d3bd62414a047a492a3814b7d3baa2717d64db2e`. This preserved pre-War-Trophy binary is the deliberate mainnet node runtime and must not be replaced merely because the checkout advanced.
- **Settlement binary:** `/usr/local/bin/wolochaind-mainnet`, commit `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`, used by Bet settlement on `8092` and Founder Rewards settlement on `8093`.

The node/settlement binary difference is an explicit compatibility boundary, not drift. Consensus truth comes from the running node binary and `wolo-1` state; settlement behavior comes from the current settlement binary and its loopback-only authenticated services.


- framework: Next.js App Router
- local dev entrypoint: `npm run dev`
- production start command: `npm run start`
- production bind: `127.0.0.1:3030`
- production service: `aoe2hdbets-web.service`
- server repo path on VPS: `/var/www/AoE2HDBets/app-prodn`

## Major layers

### Page routes

Primary pages live under `app/`.

Important public surfaces include:
- `app/page.tsx`
- `app/lobby/page.tsx`
- `app/bets/page.tsx`
- `app/live-games/page.tsx`
- `app/leaderboard/page.tsx`
- `app/leaderboard/og/page.tsx`
- `app/game-stats/live/[sessionKey]/page.tsx`
- `app/players/page.tsx`
- `app/players/[uid]/page.tsx`
- `app/players/by-name/[name]/page.tsx`
- `app/rivalries/page.tsx`
- `app/clans/page.tsx`
- `app/clans/[slug]/page.tsx`
- `app/academy/page.tsx`
- `app/zodiac/page.tsx`
- `app/contact-emaren/page.tsx`
- `app/requests/page.tsx`
- `app/war-chest/page.tsx`
- `app/tournaments/[slug]/page.tsx`
- `app/admin/user-list/page.tsx`
- `app/wolo/page.tsx`

The current public spine is no longer just a homepage plus a few leaf pages. The real first-impression product path is now the lobby/community shell and its linked destinations.

Live replay detail presentation is currently owned by `components/game-stats/LiveReplayDetail.tsx`. The Battle Matrix defaults to a two-column versus layout, with a header layout toggle that can switch to one full-width player lane per row. Inside each lane, keep the activity rail stacked above the pulse strip and metric labels wrap-safe so EAPM/history chips stay readable instead of squeezing into fixed-width micro-columns or overlapping their values.

Live-board presentation is owned by `components/live/LiveGamesBoard.tsx`, with snapshot assembly and stream selection in `lib/liveGames.ts`. `/live-games` has its own persisted Basic / Advanced / Extreme preference under the `live_games` tile key. Extreme is the default and expands the app shell to `96rem`; Advanced uses `75rem`; Basic preserves the focused `65rem` board. The just-finished spotlight is capped at three outcomes so upload batches move into Recently Played instead of filling the live rail. An external stream may be the primary card feed when it is explicitly primary on a live session or its player label matches a participant. Completed cards require participant attribution for external footage; an unlabeled Twitch/YouTube row must never fall through as another player's saved match video.

### Same-origin API routes

Key browser-facing routes include:
- `app/api/lobby/route.ts`
- `app/api/clans/[slug]/route.ts`
- `app/api/academy/zodiac/lesson/route.ts`
- `app/api/lobby/stream/route.ts`
- `app/api/bets/route.ts`
- `app/api/bets/wager/route.ts`
- `app/api/contact-emaren/route.ts`
- `app/api/contact-emaren/attachments/[messageId]/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/user/appearance/route.ts`
- `app/api/replay/upload/route.ts`

These routes enforce session/admin behavior and often proxy, merge, or reshape backend data for the browser.

### Living Kingdom presence plane

Living Kingdom is a small, ephemeral presence plane inside the existing Next.js
web authority. It answers “which opted-in warriors are roaming an allowlisted
public part of the kingdom now?” It does not establish durable user activity,
analytics attribution, replay truth, wallet truth, or exact continuous cursor
or scroll truth.

```text
publisher                                           public viewer
signed-in session                                   anonymous or signed in
      |                                                      |
      | POST /api/kingdom-presence/state                     | EventSource
      v                                                      v
identity + realm policy -> rate limit -> process-local hub -> bounded SSE event
                                                   |
                                                   v
                                      local transform interpolation
```

The owning server modules are:

- `lib/livingKingdom/protocol.ts` for the bounded wire contract;
- `lib/livingKingdom/realms.ts` for the allowlisted public route/door registry;
- `lib/livingKingdom/hub.ts` for latest-only actor state, TTL eviction, bounded
  stream fanout, snapshots, deltas, and aggregate counters;
- `lib/livingKingdom/identity.ts` for the fail-closed feature mode,
  server-authoritative identity, preference eligibility, and cached avatar
  resolution;
- `lib/livingKingdom/avatarRegistry.ts` for the bounded process-local mapping
  from an opaque public actor handle to the internal managed-avatar target;
- `lib/livingKingdom/rateLimit.ts` for process-local publish admission;
- `app/api/kingdom-presence/state/route.ts` for authenticated publisher input;
- `app/api/kingdom-presence/events/route.ts` for the public receive-only SSE
  stream;
- `app/api/user/presence-preference/route.ts` for the explicit durable account
  visibility preference.

The browser composition lives under `components/presence/`. `AppShell.tsx`
mounts one deferred `LivingKingdomClient` for the current document.
`LivingKingdomOverlay.tsx` owns markers, clusters, door flights, the People Here
panel, and sharing controls; `livingKingdomTypes.ts` mirrors the public wire
types; `presenceLayout.ts` calculates bounded rails, collision spacing, and
viewport capacity; and `LivingKingdom.module.css` owns transform animation.
Known navigation elements expose canonical `data-presence-door` values in the
app shell, mobile navigation, and footer. The living leaderboard exposes
`data-presence-scroll-root` for its real internal scroller. CSS transforms
interpolate low-frequency server samples without layout writes on scroll.

Movement is never stored in Postgres, sent through `/api/user/ping`, written to
`UserActivityEvent`, or bridged to Traffic. The preference route is the only
durable feature write. Raw paths, queries, fragments, arbitrary anchors, and
client-authored identity/avatar fields never enter the public protocol. A door
click is intent; only a subsequent accepted route-entry sample changes the
actor's realm truth.

Public actor IDs and avatar URLs contain only a process-local HMAC handle. The
managed-media route resolves that handle in memory and serves bytes directly;
it never redirects a presence image request to an underlying target or file
path that can contain a durable account UID. Opt-out and avatar changes clear
the binding immediately, bindings expire after five minutes, and the presence
image response is cached for at most five minutes.

The first topology intentionally assumes the one production Next.js process.
A release restart clears roaming state and EventSource clients reconnect to a
fresh snapshot. Do not add Postgres `LISTEN/NOTIFY`, Redis on the shared VPS, or
a second daemon for this phase. Multiple web replicas require an explicitly
designed external broker or dedicated presence service before activation; a
process-local hub must never pretend to provide cross-replica truth.

The initial operating controls are intentionally narrow:

- `LIVING_KINGDOM_MODE=off|staff|canary|public`; a missing or unknown value is
  `off`;
- `LIVING_KINGDOM_STAFF_UID_ALLOWLIST` and
  `LIVING_KINGDOM_CANARY_UID_ALLOWLIST` bound pre-public publisher cohorts;
- `LIVING_KINGDOM_MAX_SUBSCRIBERS` defaults to 250 and is clamped to the
  absolute application ceiling of 1,000;
- `LIVING_KINGDOM_MAX_SUBSCRIBERS_PER_IP` defaults to 20 and is clamped to
  250; signed-in viewers are additionally capped at four streams per UID;
- actor state is capped at 500, at most three tabs contribute to one actor,
  stale state expires after 30 seconds, and SSE keepalive is 15 seconds;
- state bodies are capped at 2 KiB, normal publication is change-driven with a
  500 ms hard client throttle, and the actor limiter sustains 2 Hz with burst
  four.

Authenticated operators may read aggregate mode, capacity, actor/tab/realm,
subscriber, accepted, rate-limited, invalid, expired, and dropped counters from
`GET /api/admin/kingdom-presence`. That route does not expose identities or
movement rows and does not mutate the hub.

Setting the mode to `off` is the server-side kill switch. The state route
returns no feature surface and the events route returns HTTP 204, which tells
EventSource clients not to reconnect. A mode change takes effect in the web
process environment and therefore follows the normal reviewed service/release
operation; client-side hiding is not authority.

Nginx owns only transport hygiene for the exact events endpoint: HTTP/1.1 to the
loopback web service, buffering/cache/compression disabled, `Connection` cleared,
and a read timeout longer than the SSE keepalive. EventSource is not a WebSocket.
The deploy example documents the exact location; any live host change remains a
separate reviewed operations action with `nginx -t`, reload, and rollback proof.

### Product/domain libraries

Important ownership files include:
- `lib/lobby.ts`
- `lib/lobbySnapshot.ts`
- `lib/lobbyLeaderboard.ts`
- `lib/publicPlayerDirectory.ts`
- `lib/contactInbox.ts`
- `lib/contactInboxConfig.ts`
- `lib/challengeConfig.ts`
- `lib/communityHonors.ts`
- `lib/userExperience.ts`
- `lib/bets.ts`
- `lib/woloBetSettlement.ts`
- `lib/woloChain.ts`
- `lib/adminWoloClaims.ts`

These files form the app-level product contract for the lobby, leaderboard, player directory, inbox/honors flow, and related user-facing aggregation.

`lib/bets.ts` is now a bridge layer between scheduled Challenge runway matches, watcher-live sessions, and the public `/bets` book. Challenge-derived markets use `challenge-runway-{scheduledMatchId}` slugs, can become featured books before a watcher session appears, and are then settled/retired as replay proof lands. Fallback leaderboard/tournament books still exist as synthetic fill when no Challenge slate is active.

Challenge and bet settlement now have a real happy path:
- `scheduled_matches` stores `result_at`, `linked_session_key`, `linked_map_name`, `linked_winner`, and `linked_duration_seconds`
- `bet_markets.scheduled_match_id` links challenge-derived books to their source match row
- `bet_wagers` now persists `execution_mode`, `stake_tx_hash`, `stake_wallet_address`, `stake_escrowed_at`, `payout_wolo`, and settled status
- `pending_wolo_claims` now carries `payout_tx_hash`, `payout_attempted_at`, and `error_state` for operator truth
- `/bets` records an `onchain_escrow` wager only after the signed stake tx verifies against WOLO REST
- winning payouts can execute through `WOLO_SETTLEMENT_URL` only after grouped dry-run validation succeeds and the mainnet settlement health route reports `ok=true` on `wolo-1`, or through an explicitly approved fallback signer in non-mainnet/operator-only contexts

The `/staking` page is an app-side WOLO staking ledger, not native Cosmos validator staking. Stake actions are user-signed Keplr transfers into the configured staking wallet. Unstake actions are WoloChain settlement payouts back to the user wallet. User principal stays separate from the staking wallet's operator-funded reserve: max unstake follows confirmed stake, while the API checks that post-unstake wallet balance can still cover remaining confirmed stake plus reserve.

`lib/aiConcierge.ts` feeds The AI Scribe and Grimer the same live app-side staking context used by `/staking`: 24h/7d fee summaries, staker and earner boards, viewer position/reward state, and recent staking activity. AI replies must treat this as AoE2HDBets custody/reward UX, not validator staking, and must not invent APY, reward rates, or WoloChain facts that are not supplied by context.

This repo still does not own chain truth. AoE2HDBets owns market seeding, user-facing lock/settle UX, and claim fallback rails. WoloChain still owns transfer semantics, chain identity, and final settlement execution truth.

### Presentation system

Lobby and premium shell behavior currently flow through:
- `components/lobby/lobbyPresentation.ts`
- `components/lobby/LobbyAppearanceContext.tsx`
- `app/AppShell.tsx`
- `components/HeaderMenu.tsx`
- `components/pwa/MobileFloatingNav.tsx`

Appearance preferences still affect the overall shell, header, and major lobby surfaces, but the theme controls themselves live on `/profile` rather than consuming global navigation space.

The global header is the shared route-orientation layer:
- the AOE2WAR logo always returns to `/`
- each major route resolves to a page-specific header title
- primary destinations stay in the compact command row
- the castle menu owns `/kingdom`, `/champions`, `/national-champions`, `/clans`, and `/forum`
- desktop castle navigation opens on hover/focus without requiring a locking click
- mobile castle and account menus render through document-level sheets so header blur/stacking contexts cannot clip them
- the account menu is scrollable and viewport-bounded on both desktop and mobile

The shipped product now depends much more heavily on lobby-specific presentation consistency than before. Visual hierarchy in the lobby matters because it now carries leaderboard, tournament, and live-product credibility in one place.

The Community Lobby’s Basic, Advanced, and Extreme modes also own the lobby canvas width:
- Basic: `65rem` maximum for the original focused/skinny body
- Advanced: `75rem` maximum for the richer arena composition
- Extreme: `96rem` maximum for the near-full-width power-user layout

These widths are resolved in `app/AppShell.tsx` from the `community_lobby` tile preference. Do not apply Extreme’s width globally to all three modes.

Lobby media composition has one primary Hero Main Stage in the upper showcase flow. `HeroPlaylist`, `HeroScreen`, and `HeroPlaylistItem` own the private draft composition; immutable `HeroPlaylistPublication` snapshots own the live order/settings and rollback history. Typed screen renderers hydrate domain sources without stealing ownership from those models. Featured Event is resolved dynamically from the single published + active `EventTile`, so Event Foundry owns event content and CTA while Hero Studio owns only the Featured Event screen's presence, position, schedule, and dwell time. Chronicle and media sources remain explicit Hero selections. The public falls back to the permanent Featured Event composition if Hero persistence is missing. The old secondary `LiveBroadcastSpotlight` theater between the leaderboard/War Chest section and chat was removed; stream/player ownership remains with `/watch`, live-game surfaces, and the upper Watch & Chat hero.

AoE2 Shorts is a separate editorial replay surface directly below the Hero Main Stage and above Watch & Chat. `components/home/Aoe2ShortsTile.tsx` owns the vertical/wide presentations, bundled founding clip manifest, mobile full-screen reel, swipe/keyboard navigation, local reactions, profile links, war-room comment handoff, and sharing. It does not currently claim an upload API or durable reaction/comment model.

In Extreme mode, the leaderboard and War Chest are bounded internal scroll regions. The desktop War Chest rail is deliberately tall enough to preview roughly nine rows, while mobile constrains it to the viewport and scrolls its entries inside the tile.

## Current product data model

### Lobby snapshot

The lobby is an aggregate product surface, not a single raw backend table.

Its snapshot contract is responsible for bringing together:
- leaderboard state
- tournament panel state
- live/recent match visibility
- online/readiness summary where available
- UI-facing counts and labels used by the lobby shell

`app/api/lobby/route.ts` is the browser-facing snapshot entrypoint. `lib/lobby.ts` and `lib/lobbySnapshot.ts` are the key app-level composition files.

### Homepage / lobby leaderboard

The lobby leaderboard is not just “ranked players.”

It now includes:
- replay-backed players with stored match history
- claimed profiles with zero matches as `Pending`

Important semantics:
- `trackedPlayers` is the complete result count in the active scope and search,
  not the length of the current page
- `entries.length` is the current strict page or enriched lobby slice
- `rankedPlayers` means players at or above the ranking threshold in the active
  scope
- `identityRows` is the complete public candidate census after reserved system
  accounts are removed; it does not shrink when the page switches scope
- `claimedIdentityRows` is the complete public claimed-profile census after
  the same system exclusion
- a claimed zero-match profile can appear with:
  - `primaryRatingLabel: Pending`
  - `primaryRatingSourceLabel: Profile`

The leaderboard is now part of the product spine, not decorative filler. Changes here affect first impression, credibility, and navigation quality.

The full leaderboard system has two distinct public projections of the same HD competitive world:

- `/leaderboard` is the DE-familiar ranked player table. It reuses the lobby
  leaderboard loader and RM/DM lane rules, adds server-side alias search
  through the backward-compatible `q` parameter on
  `/api/lobby/leaderboard`, and paginates instead of preloading the full
  directory. `scope=all` is the default complete public board;
  `scope=claimed` is the public AoE2WAR profile board.
- `/leaderboard/og` is the archival chronological battle board. `lib/ogBoard.ts` sanitizes canonical final replay rows, resolves public player links, and sends a narrow projection through `/api/leaderboard/og`; partial replays never synthesize missing scores or achievements.

The homepage board chrome and Kingdom menu open the modern route. The two dedicated pages cross-link and emit authenticated activity events through the existing user-experience telemetry rail. See `docs/LEADERBOARDS.md` for data and interaction rules.

Scope selection is an identity projection boundary, not a cosmetic client
filter. `lib/leaderboardScope.ts` normalizes unknown values to `all`;
`lib/lobbyLeaderboard.ts` applies scope before search, sorting, rank assignment,
24-hour comparison, and pagination. Consequently, default ranks are contiguous
on the full board and claimed-board ranks are contiguous within the claimed
board. A search or alternate column sort changes row order but preserves the
canonical rank in that active lane and scope.

`/api/lobby/leaderboard` is a strict pagination surface: a request for `N` rows
returns at most `N`, and `nextOffset` advances by the number actually returned.
The dedicated page explicitly disables both pending-profile and featured
profile append behavior. `lib/lobbySnapshot.ts` is the intentional exception:
the homepage/lobby snapshot opts into `includeFeaturedClaimed: true` so its
small contender module may enrich the base slice. That opt-in must never leak
into the paginated route.

Both the server leaderboard cache key and
`lib/leaderboardLaneClientCache.ts` include `lane + scope`. A response for RM
claimed profiles cannot satisfy RM all-profiles, DM claimed, or DM all-profile
requests. Client response validation also verifies the returned scope before
seeding the cache.

Competitive boards exclude reserved internal systems through exact UIDs owned
by `lib/internalSystemAccounts.ts`:

- `aoe2hd_ai_concierge` (`The AI Scribe`);
- `aoe2hd_ai_grimer` (`Grimer`);
- `aoe2hd_ai_guy` (`Guy of Moxica`);
- `challenge-protocol` (`Challenge Protocol`).

Only the first, second, and fourth UIDs currently have live profile rows. Guy
is reserved proactively so creating that configured house persona cannot alter
the public board later.

Display names are deliberately not an exclusion key. A real public account may
use the same visible name without being removed. In this contract, `claimed`
means a public directory identity attached to an AoE2WAR SiteAccount under the
existing app/profile rules; it is not an active Player Identity Wave 2
`WarriorClaim`.

### Players directory

`/players` is the broader network view.

Expected conceptual buckets:
- claimed entries
- active/live claimed subset
- replay-built public identities

The directory should remain broader than the leaderboard. The leaderboard answers who is on top; the directory answers who is in the ecosystem.

### Contact / honors / admin

The private inbox and community honors loop are owned here.

Current behavior includes:
- users can message Emaren directly
- existing peer direct threads can also exist for challenge-related inbox flow
- the header popover and `/contact-emaren` render through the shared `ContactInboxPanel`, including the persisted V1/V2/V3 view contract
- V1 is the upgraded asymmetric bubble UI, V2 is the compact line feed, and V3 is the obsidian-glass premium UI; the mode preference is stored under `aoe2war:direct-chat-view`
- direct-message actions open on click/long-press through the shared compact quick-reaction/action picker rather than automatic bubble hover
- full-page startup fetches the complete thread once; the nav surface maintains a warm thread cache and silently reconciles it
- admins can award badges and gifts
- gifts/badges can appear in chat threads
- users can accept privately, accept publicly, or decline
- appearance choices and user activity are recorded for admin insight

Important runtime note:
- attachment rendering depends on `app/api/contact-emaren/attachments/[messageId]/route.ts`
- that route is session-protected and returns raw binary responses
- attachment failures may come from route/header generation, not the chat component

Composer UX and text-length rules are part of this contract:
- use `components/ui/AutoGrowTextarea.tsx` for multiline chat/challenge composers that should start at one line and grow naturally up to a capped height
- do not hardcode message limits in components when a shared config constant exists
- direct-thread text is capped by `DIRECT_MESSAGE_MAX_CHARS` in `lib/contactInboxConfig.ts`
- lobby chat text is capped by `LOBBY_MESSAGE_MAX_CHARS` in `lib/lobby.ts`
- challenge notes are capped by `CHALLENGE_NOTE_MAX_CHARS` in `lib/challengeConfig.ts`
- UI inputs should enforce the same caps and show live remaining/used count so users do not lose text to backend truncation

### Clan halls

Clan identity and chat are app-owned community behavior. `/clans` is the public
directory and `/clans/[slug]` is the clan hall. The first seeded hall is
Mystikal.

`Clan`, `ClanMember`, and `ClanMessage` store the hall, active roster, roles,
and posts. Each message uses one of three audiences: public, signed-in AoE2WAR
users, or active clan members. `chat_audience_policy` is the clan-admin ceiling;
tightening it hides previously stored broader posts without rewriting them.
Site admins may manage the founding hall. Do not move this visibility policy
into lobby chat, which remains a public-room product.

### Academy / advisor payments

`/academy` is the public strategy and advisor directory. Zodiac is the first
advisor and `/zodiac` remains his replay-backed detail page.

The first lesson is priced at 100 WOLO. The browser signs a direct `wolo-1`
`MsgSend` from the student to the advisor’s linked `User.walletAddress`.
`POST /api/academy/zodiac/lesson` verifies the exact sender, recipient, and
amount through WoloChain REST, plus the structured
`AoE2WAR Academy · Zodiac · first lesson` memo, before writing an
`academy_lesson_payment` receipt to `UserActivityEvent`. Do not label a
reservation paid until that verification succeeds.

### Marketplace / player-built commerce

`/market` is the app-owned Agora for player services and ecosystem businesses.
The founding shop is The Visage Forge; its craft is named Visagewright and its
custom profile-avatar commission is displayed as 100 WOLO.

The open-shop desk posts the proposal into the private Emaren conversation and
then hands the user directly into that conversation; it is not a disconnected
lead form.

`POST /api/market/requests` accepts authenticated avatar commissions and shop
proposals. It validates and bounds the submitted scroll, opens the existing
private Emaren conversation, stores the full request as a `DirectMessage`, and
writes either `market_avatar_commission` or `market_shop_proposal` to
`UserActivityEvent`. The route does not collect or imply payment; payment state
remains `not_collected` until the operator confirms scope and handles it
separately.

Finished avatars use the existing managed-media operator rail and are assigned
to `user-<uid>-pool`. The user then selects the delivered identity from the
profile avatar vault. Keep delivery in this existing app-owned media path
instead of inventing a second avatar store.

### Appearance / theme state

Appearance is app-owned state.

Current responsibilities include:
- storing user appearance preference
- exposing that preference to the app shell
- applying premium theme-circle presentation across lobby-oriented surfaces

This is product state, not just decoration, because the current lobby identity depends heavily on shell cohesion.

## Production services and dependencies

`app-prodn` depends on:
- Postgres through Prisma
- `api-prodn` through `AOE2_BACKEND_UPSTREAM`
- nginx for public routing
- `aoe2hdbets-web.service` for runtime
- `https://rpc-mainnet.aoe2war.com` / `https://rest-mainnet.aoe2war.com` for `wolo-1` browser wallet reads and stake verification
- WoloChain settlement execution through `WOLO_SETTLEMENT_URL` only when the mainnet settlement service is deliberately deployed on `127.0.0.1:8092`, reports `ok=true` and `chain_id=wolo-1`, and the fresh Bet Payout / Bet Escrow signers are funded; `127.0.0.1:8091` is wolo-testnet and must never be used for mainnet

Canonical VPS truth:
- web env file: `/etc/aoe2hdbets/aoe2hdbets-web.env`
- web build output must exist at `.next/BUILD_ID`

## Current ownership boundaries

`app-prodn` should own:
- page hierarchy
- lobby composition
- leaderboard presentation
- player directory presentation
- inbox/admin/community UX
- session-gated browser actions
- theme and shell behavior

`app-prodn` should not become the owner of:
- replay parse rules
- raw replay ingest lifecycle
- backend `game_stats` truth
- chain settlement logic
- cross-project attribution truth

When something looks wrong in the browser, identify whether the problem starts in:
1. app composition / snapshot shaping
2. backend response shape
3. replay parse truth
4. auth/session behavior
5. presentation hierarchy

Do not assume every visible issue is a page bug.

## Known architecture debt

- `next-env.d.ts` still drifts on the VPS during builds/deploys
- VPS file ownership drift can block `git pull`, break rebuilds, or stop `.next/cache/images` writes
- individual player pages are behind the lobby and directory in polish
- leaderboard/ranking semantics are stronger than before but still deserve tighter long-term consistency
- tournament depth is improving, but still not the full “event gravity” version
- exact postgame achievement-table capture is still not part of the replay pipeline
- `$WOLO` is still an app-level product rail, not full settlement infrastructure
- signed-bet happy path is real now, but signed-but-unrecorded stake recovery is not yet reconciled automatically
- Ledger and older-browser signer behavior is improved but still needs tighter client telemetry and user guidance
- Challenge -> Bets scheduled/live bridging is healthier now, but very fast finishes and duplicate-looking settled history still deserve another pass
- watcher behavior now looks healthier end-to-end, but the app should still document the live/final replay contract truthfully as it evolves

- Replay upload surface keeps the existing manual single-file flow and adds `/api/replay/upload-package` for browser ZIP packs. ZIP entries are unpacked server-side, filtered to supported AoE2 replay extensions, and forwarded through the canonical backend replay upload contract.

<!-- AOE2WAR:REPLAY_RIVALRY_ARCHITECTURE:START -->
## Replay history and rivalry graph

### Ownership

- `lib/replaySides.ts` reconstructs safe 1v1 and balanced team sides.
- `lib/publicMatchups.ts` builds player-pair and exact-team rivalry
  aggregates.
- `lib/unresolvedWatcherResult.ts` governs whether recovered outcomes
  are statistically and financially eligible.
- `app/battle-archive/page.tsx` renders the chronological War Vault.
- `app/game-stats/[id]/page.tsx` renders one replay and resolves its
  canonical rivalry destination.
- `app/matchups/[left]/[right]/page.tsx` renders comprehensive
  player-pair history.
- `app/matchups/team/[left]/[right]/page.tsx` renders exact-team
  history and the cross-side player matrix.
- `app/rivalries/page.tsx` composes the directory.
- `components/rivalries/RivalriesViews.tsx` owns Advanced and Extreme.
- `components/rivalries/BasicRivalriesView.tsx` owns Basic and its
  internal three-state presentation cycle.

### Canonical identity

Player rivalry routes use canonical public-player tokens.

Team routes encode each canonical roster as a base64url JSON array.
Both rosters and both sides are normalized before URL construction.
Equivalent rosters therefore resolve to one route.

### Data flow

    stored replay row
        -> replay-side reconstruction
            -> winner truth
                -> one archive entry
                -> player-pair aggregate
                -> exact-team aggregate
                -> game-stats and rivalry cross-navigation

A replay may contribute to several legitimate analytical views, but
it remains one historical battle and one recent-activity entry.

### Click-target contract

Cards use a whole-card link with higher-z-index nested profile links
where two destinations are required:

- match-feed card -> game stats;
- player name -> player profile;
- matrix card -> player rivalry;
- matrix player name -> player profile.

This removes redundant visible calls to action while retaining
keyboard focus treatment and accessible labels.

See `docs/RIVALRIES_AND_WAR_VAULT.md`.
<!-- AOE2WAR:REPLAY_RIVALRY_ARCHITECTURE:END -->

<!-- AOE2WAR:REPLAY_EVIDENCE_ARCHITECTURE_20260722:START -->
## Replay Evidence and Public Parser Observatory — 2026-07-22

### Independent truth layers

AoE2WAR keeps three deliberately separate replay-result evidence layers:

1. **Replay parser evidence**
   - immutable `ReplayParseRun` and `ReplayObservation` records
   - replay-only confidence
   - candidate-only by default

2. **Screenshot evidence**
   - immutable content-addressed `ReplayEvidenceArtifact` bytes
   - append-only `ReplayEvidenceLink` provenance
   - separate `aoe2war.screenshot_vision` Evidence Pass
   - never represented as replay-only confidence

3. **Human adjudication**
   - append-only `ReplayResultAdjudication` records
   - explicit human authority
   - corrections append rather than rewrite history

A human uploading screenshots is human participation in the evidence chain, but is not itself a human adjudication.

### Evidence relational model

`ReplayEvidenceLink` may target:

- `gameStatsId`
- `parseRunId`
- `observationId`
- `resultAdjudicationId`

Migration:

`20260722183000_add_replay_evidence_game_target`

The direct `gameStatsId` target allows screenshot evidence to attach to a battle before a screenshot-analysis parser run or human adjudication exists.

### Screenshot-analysis pipeline

    human selects postgame screenshots
        -> client-side staging and validation
        -> content-addressed evidence storage
        -> direct GameStats evidence links
        -> ensure base replay parser run
        -> OpenAI image analysis
        -> strict structured evidence
        -> immutable candidate-only ReplayParseRun
        -> immutable ReplayObservations
        -> evidence links to the Evidence Pass
        -> public Verdict Trail

Current screenshot pass:

- parser: `aoe2war.screenshot_vision`
- parser version: `1.0.0`
- pass: `postgame_evidence`
- pass version: `1`
- schema: `2026-07-22.1`
- default model: `gpt-5.6`

Identical evidence/base-run/model/config identity is idempotent.

### Public-read / admin-write boundary

The Parser Observatory is public to inspect.

Public reads include:

- battle detail
- Review Desk / Observatory
- sanitized adjudication history
- parser trail
- evidence catalog
- relationally linked evidence image bytes

Admin-only writes include:

- result adjudication or correction
- team assignment and winner selection
- screenshot upload
- screenshot analysis
- replay parser execution

The authority boundary is enforced server-side. Hidden UI controls are secondary defense only.

### Recent Parsed Games provenance

`lib/lobbyHumanEvidence.ts` hydrates recent matches from direct `replay_review_screenshot:*` evidence links after public replay cleaning.

It exposes:

- `humanSuppliedEvidence`
- `humanSuppliedEvidenceCount`

The lobby combines these with adjudication evidence to derive one truthful human-participation marker.

### Engine Room filesystem

Protected roots:

- `/mnt/HC_Volume_105319120/aoe2-replay-archive`
- `/mnt/HC_Volume_105319120/aoe2-parser-engine`
- `/mnt/HC_Volume_105319120/aoe2-parser-engine/evidence/review-screenshots`
- `/mnt/HC_Volume_105319120/aoe2-parser-engine/evidence/vision-analysis`

The web service retains `ProtectSystem=strict` and `ProtectHome=true`.

The parser-engine systemd drop-in grants write access only to:

- `/mnt/HC_Volume_105319120/aoe2-parser-engine/jobs`
- `/mnt/HC_Volume_105319120/aoe2-parser-engine/evidence`

### OpenAI service configuration

The OpenAI secret is not stored in Git.

Production uses:

`OPENAI_API_KEY_FILE=/etc/aoe2hdbets/openai.key`

The key file is `0640`, owned by `root:tony`.

The path is outside `/home` because `ProtectHome=true` prevents the web service from reading the historical home-directory fallback.

`AOE2WAR_SCREENSHOT_VISION_MODEL` may override the default screenshot model.

### Storage state

The Hetzner block device `/dev/sdb` is 120 GiB. On 2026-08-03, its ext4
filesystem was expanded online to approximately 118 GiB usable capacity at
`/mnt/HC_Volume_105319120`. Immediately after expansion, approximately
24.6 GiB was available. Device size and usable filesystem capacity are distinct
figures.

At the 2026-08-03 storage seal:

- root filesystem: approximately 2.5 GB free, 94% used; this remains a separate P1 capacity risk;
- mounted volume device: 120 GiB;
- mounted ext4 filesystem: approximately 118 GiB usable, with approximately 24.6 GiB available.

The latest detailed content inventory remains the 2026-07-26 seal:

- replay archive: approximately 8.0 GB / 7,925 files;
- parser-engine root: approximately 4.9 GB / 4,946 files;
- watcher downloads: approximately 2.5 GB / 69 files.

No service restart was required for the online filesystem expansion.
<!-- AOE2WAR:REPLAY_EVIDENCE_ARCHITECTURE_20260722:END -->

## Profile War Archive — private player document exchange

Player profiles expose a private War Archive for guides, build orders, notes and
other bounded document formats. The owner uploads through
`/api/profile-documents`; AoE2WAR admins may list/read documents for a claimed
player profile. Other users receive no document metadata and no document bytes.

Document bytes are not public Media Armory assets. Production defaults to
`/mnt/HC_Volume_105319120/aoe2war/profile-documents-private`, outside the public
managed-media route. Database metadata reuses `ManagedMediaAsset` with an opaque
`profile-document:v1:` storage reference; the app never publishes that reference
as a public URL. Downloads flow only through the authenticated document route
with `private, no-store` and `X-Content-Type-Options: nosniff`.

Each document is capped at 25 MB. Each player is capped at 30 active documents
and 250 MB total active document storage. Deleting a document first retires its
metadata and then removes the private file. No Prisma migration is required.
