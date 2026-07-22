# app-prodn Architecture

## Watcher and betting final-proof lifecycle

Replay receipt truth comes from watcher-backed `game_stats` and `replay_parse_attempts`; `watcher_client_events` is client acknowledgement only. `/admin/watcher-funnel` reports connection, monitor, folder, current replay, last server replay, parse/finality, stream, and version independently.

Watcher-linked books use `open`/`live` → `awaiting_final_proof` → `settled`, `voided`, or `under_review`. Session disappearance is driven by replay activity freshness. It locks the book and sets one `WATCHER_FINAL_PROOF_GRACE_MINUTES` deadline (default 20 minutes); `updated_at` is not the proof clock. Expiry without trusted winner proof creates `voided`/`final_replay_not_received`. Explicit disconnect/desync evidence may use the corresponding evidence-backed reason.

Voids have no winner or fee. Active wagers become `void`, payout equals original stake, founder/winner bonuses are rescinded, and the normal idempotent settlement rail records `queued`, `refunded`, or `failed`. Late finals attach to `late_final_game_stats_id` and never reopen betting or reverse refunds automatically.

Team membership is an end-to-end replay contract. `api-prodn` preserves canonical player/team fields; `lib/liveSessionSnapshot.ts` merges iterations without discarding complete team evidence; and `lib/teamResolution.ts` is the single resolver for live display, market creation, proposition hashing, final validation, and audits. Team games require two complete equal teams from explicit replay team IDs. Array order and aliases cannot assign sides.

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

It does not own:
- replay parsing truth
- `game_stats` ingestion
- watcher uploads
- chain infrastructure
- cross-project analytics ownership
- final authority over replay-derived match records

## Runtime shape

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
- `trackedPlayers` should match rendered entry count
- `rankedPlayers` means players at or above the ranking threshold
- a claimed zero-match profile can appear with:
  - `primaryRatingLabel: Pending`
  - `primaryRatingSourceLabel: Profile`

The leaderboard is now part of the product spine, not decorative filler. Changes here affect first impression, credibility, and navigation quality.

The full leaderboard system has two distinct public projections of the same HD competitive world:

- `/leaderboard` is the DE-familiar ranked player table. It reuses the lobby leaderboard loader and RM/DM lane rules, adds server-side alias search through the backward-compatible `q` parameter on `/api/lobby/leaderboard`, and paginates instead of preloading the full directory.
- `/leaderboard/og` is the archival chronological battle board. `lib/ogBoard.ts` sanitizes canonical final replay rows, resolves public player links, and sends a narrow projection through `/api/leaderboard/og`; partial replays never synthesize missing scores or achievements.

The homepage board chrome and Kingdom menu open the modern route. The two dedicated pages cross-link and emit authenticated activity events through the existing user-experience telemetry rail. See `docs/LEADERBOARDS.md` for data and interaction rules.

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

The mounted Hetzner volume was expanded to approximately 100 GB and ext4 was grown online.

At the 2026-07-22 seal:

- root filesystem: approximately 7.1 GB free
- mounted volume: approximately 27 GB free

A runaway API debug trace was disabled and rotated before the expansion.
<!-- AOE2WAR:REPLAY_EVIDENCE_ARCHITECTURE_20260722:END -->
