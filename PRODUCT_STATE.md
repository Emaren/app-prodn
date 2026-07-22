# app-prodn Product State

## July 2026 watcher reliability release

Watcher v1.5.3 separates app connection from monitor attachment, validates/scans HD folders (including OneDrive), recovers mid-game files, reports rich privacy-safe heartbeat state, and uses bounded watchdog reattachment. `/bets` now removes detached books from active liquidity, shows them under Awaiting Final Proof without controls, voids after grace when proof never arrives, and preserves honest refund state/history. Required on-chain staking pauses when settlement health cannot be verified.

The watcher-to-betting rail now preserves explicit replay team IDs through API storage and live-session projection. Team markets open only for two complete high-confidence teams, persist immutable roster/proposition snapshots, lock on first stake, and settle only against a matching full final roster. Unresolved games stay visible as a neutral roster without stake controls. `/admin/market-integrity` exposes conflicts, blocked settlements, alias review, incident evidence, exact corrective payments, and honest overpayments. Historical team books are covered by read-only JSON/CSV/Markdown audits and evidence-locked repair commands; no chain transfer is rewritten or silently clawed back.

## Snapshot

This file captures the current shipped state of the public product surface so a new chat can resume without re-auditing everything.

The app is no longer just a replay/stat shell. It now has a real public product spine:

- `/lobby` is a first-class community surface
- leaderboard is shipped and visible
- next tournament panel is shipped and usable
- players, rivalries, requests, `$WOLO`, and live-game surfaces are all real navigation destinations
- `/bets`, `/war-chest`, and tournament detail pages are now real public destinations too
- `/kingdom`, `/champions`, `/national-champions`, `/clans`, and the fully interactive `/forum` War Room are public AoE2WAR-style league/community destinations, with `/belts`, `/nations`, and `/realm` redirecting into them
- live replay ingestion can feed visible match outcomes back into the product without the old obviously-broken feel

## Strongest shipped modules

### Community Lobby / homepage spine

Current strengths:
- premium dark/gold/blue theme system, with appearance controls kept on `/profile` instead of crowding the global navbar
- AOE2WAR wordmark is now the global home link
- every major route has a page-specific header title for orientation
- desktop navigation is a compact premium command bar with active-route treatment
- mobile navigation uses a single-row horizontal command rail plus a polished bottom quick-command bar
- the global header now reads loose language signal → wireframe globe → NavChat → player control; Auto spells in and crossfades a randomized language sequence, German fills the final Core slot, choices persist across reloads, and the selector is navy/steel blue everywhere except the Academy’s ceremonial crimson variant
- `/kingdom` is included in the castle menu alongside Champions, Nations, Clans, and Forum
- the castle menu opens by hover/focus on desktop and as an unclipped touch sheet on mobile
- the account menu renders as an unclipped, viewport-bounded command deck on desktop and mobile
- `/lobby` now feels like a real destination, not filler
- `/lobby` now defaults to Extreme view for the full-width power-user layout; Advanced keeps the richer arena composition at a controlled medium width, while Basic restores the original focused/skinny body
- the mode width contract is Basic `65rem`, Advanced `75rem`, and Extreme `96rem`
- Extreme leaderboard and War Chest lists scroll inside their own frames; the desktop War Chest previews roughly nine rows and the mobile tile stays viewport-bounded
- Basic view remains available behind the lobby toggle and keeps the simpler leaderboard/tournament/war-chest-first layout intact
- the lobby has one primary upper video/event stage; the redundant mid-page broadcast theater was removed so the leaderboard/War Chest section flows directly into chat and online players
- the upper public stage on `/` and `/lobby` is now the published Hero Main Stage: an ordered carousel of typed Featured Event, Wolo Chronicle, Warrior Quote, and media-takeover screens
- AoE2 Shorts now sits immediately below that Hero stage on `/` and `/lobby`, defaulting to a portrait replay rail with an optional wide presentation, real gameplay clips, mobile full-screen swipe navigation, uploader/profile links, local like/pass state, comments handoff, and native-or-copy sharing
- `/admin/hero-studio` owns reusable screens, order, enabled state, schedules, per-screen duration/link overrides, global transition controls, exact preview, atomic publish revisions, and rollback
- `/admin/events` remains the specialized event editor for identity, timing, badges, CTA, linked users/trophy, warriors, Commissioner, belt/artifact art, backgrounds, and theme values
- EventTile remains a real event-domain model referenced by the `featured_event` Hero type; it is not widened into a generic page-builder row
- Chronicle covers bind explicitly to real ForumThread rows and use the dispatch publication date; Hero publication is the editorial approval boundary
- Warrior Quote supports house-authored text, attribution, subline, built-in embers/ink/still motion, optional managed background/video, and safe link control
- the shipped Wolomania composition remains the permanent code fallback, so a missing Hero migration, unavailable database, empty schedule, or invalid publication cannot remove the production stage
- admin-created text ticker messages are managed from `/admin` and combine with system ticker items from tournament, replay, lobby, and WOLO market state
- the Advanced Watch & Chat hero prefers real live-game/session data, then recent completed sessions, then the latest verified replay or next tournament state; its embedded bet slip reads `/api/bets` and hands wager locking to `/bets`
- leaderboard is shipped into the lobby surface
- leaderboard count now matches rendered entries
- leaderboard cards feel premium and readable
- claimed zero-match profiles can appear as `Pending`
- live updates connected badge is present
- next tournament panel is integrated into the same first-view experience
- tournament queue / entrants / bracket preview sections exist
- nav now makes the product feel broader and more alive
- requests count is visible in primary navigation

### Live match / replay loop

Current strengths:
- live uploads are working end-to-end in real usage
- recent good test replay parsed cleanly and displayed correctly
- live board can show just-finished matches in a believable way
- `/live-games` now has persisted Basic, Advanced, and Extreme views, with Extreme as the default full-width battlefield surface; Basic preserves the original two-column board and Advanced keeps that structure with richer replay cards
- the Extreme board makes Playing Now, On Deck, the latest three finals, and Recently Played separate first-class rails, with direct Schedule and Upload Replay calls to action instead of leaving a giant dead live column
- just-finished outcomes are capped at three in the snapshot and page composition, so a batch of old uploads rolls into the archive instead of making the green results rail dominate for days
- finished-game cards use graphic battle thumbnails rather than tiny embedded players, keep metadata chips wrap-safe, and only expose a video action when the selected stream is truly attributable
- unlabeled, non-primary external streams no longer fall through as the default match feed; AoE2WAR-native footage, explicitly primary feeds, and participant-labeled feeds remain eligible
- Recent Match Feed now uses one canonical `played_at` ordering/display path, so old saved-game reparses do not jump above newer actual matches
- final replay storage no longer has the old obviously broken feel on a normal valid game
- recent match surfaces feel more connected to the actual product state
- live replay Battle Matrix defaults to a two-column versus layout with one activity lane per player, and a header layout icon can switch into a one-column full-width lane view; inside each lane the activity rail stays stacked above the pulse strip, current-EAPM is boxed, and pulse/metric labels wrap safely to avoid overlap

### Challenge / Bets runway

Current strengths:
- `/challenge` can schedule, accept, decline, cancel, and reschedule player matches
- challenge state now appears inside inbox threads and on `/live-games`
- `/bets` now promotes active challenge-runway pairings into first-class markets when they exist
- completed and forfeited challenge outcomes are persisted back onto `scheduled_matches`, including linked session/map/winner metadata when replay proof exists
- settled bet slips now persist `won` / `lost` / `void` plus app-side `payout_wolo` on `bet_wagers`
- challenge-linked settled market cards now use the market side labels, winner side, and pooled WOLO total instead of only the old hash-style replay fallback

### Players directory

Current strengths:
- clearer hierarchy
- live pulse / live status messaging
- all claimed profiles visible
- replay-built challengers separated clearly
- less clutter than earlier versions
- directory now fits the broader lobby/leaderboard product better

### Individual player pages

Current strengths:
- `/players/[uid]` and `/players/by-name/[name]` now share one command-center profile renderer
- claimed player pages default to the Advanced command-center surface, while unclaimed replay-built player pages default to the classic Basic claim surface; both account types can toggle Basic/Advanced without changing their natural default URL
- the Advanced profile has a compact hero, live ticker, command deck, deeper red/green form/status treatment, resource emblems, civ/map breakdowns, best-game rail, rivalry rail, watcher proof, AI Scribe/Grimer readout, stream signal, and premium `$WOLO` logo/flex/staking rail
- Match Feed is now a scrollable replay archive backed by `/api/player-profile/matches`, with lazy loading so older manual uploads can be reached instead of being trapped outside the initial page
- economy/resource display is honest: total food/wood/gold/stone and best resource games show when stored replay achievement/economy values exist, and otherwise render as gated/fog instead of invented numbers
- optional WOLO/community profile rails degrade to zero/empty when a migration-era table is unavailable, so a public player page should not white-screen because one side rail is missing
- live-game session cards now aggregate watcher uploaders per session and show single, dual, or stacked watcher coverage instead of awkwardly competing uploader chips

### Rivalries / broader public shell

Current strengths:
- rivalries are a real top-level destination
- public navigation now has enough surface area to feel like an ecosystem
- the Kingdom dropdown gives the top nav a broader world layer: The Kingdom, Champions, Nations, and Forum
- `/kingdom` tells the app-side chronicle/wealth story without pretending to own WoloChain truth
- `/champions` is the championship-belt surface for world, chaos, tag, women, ELO, and designation titles
- `/national-champions` is the national-beacon surface with claimed and vacant country titles
- `/forum` is a real War Room led by twelve hand-written AoE2 field dispatches and Wolo Chronicles; every thread opens into a direct-link reader with replies, reactions, read state, and bookmarks instead of dead `#` links
- Forum Basic preserves the original focused composition, Advanced is the persistent default with the Chronicle lead, room signals, excerpts, and field manual at `75rem`, and Extreme currently widens the Advanced kit to `96rem` pending its dedicated product pass
- Signed-in citizens can publish threads, reply, react, and persist bookmarks through `forum_threads`, `forum_posts`, `forum_thread_reactions`, and `forum_thread_bookmarks`; guests retain local read/bookmark state
- If the forum migration is absent, `/api/forum` returns the complete editorial archive with `ledgerAvailable=false`, while write surfaces explain that the shared ledger is unavailable rather than fabricating success
- `/clans` is the public clan directory, launching with an equal-weight Mystikal crest and Add Your Clan invitation; Basic preserves the original card treatment while Advanced is the premium default and Extreme widens the warhouse presentation
- `/clans/mystikal` opens with clan chat, a founding roster, public/signed-in/clan-only post audiences, and a clan-admin hall-wide audience ceiling that also hides older broader posts
- Clan-hall authors can edit or delete their posts, clan/site admins can moderate, and authenticated users can place premium reactions whose named participants appear on hover
- `/admin/user-list` uses the former Designations slot as Clan Command: operators can assign/remove clan leaders through `ClanMember.role`, including themselves; appointments are delivered in a direct conversation with Emaren
- Clan reactions are persisted in `clan_message_reactions`; production deploys must apply `20260701110000_add_clan_message_reactions`
- `/academy` is the cinematic front gate for serious strategy study, with Zodiac as the founding advisor, an open seat for future doctrines, and header/menu stacking that remains above the Academy hero
- `/zodiac` now leads with “Train Under Zodiac” and offers a real 100 WOLO first-lesson checkout: Keplr signs the direct advisor payment, the app verifies the `wolo-1` transfer, records a receipt, and opens the private Zodiac line
- `/market` is the cinematic AoE2WAR Agora: three aligned, tailored awnings lead into The Visage Forge’s dark wood-and-bronze commission lobby; signed-in 100 WOLO avatar requests and shop proposals open a private Emaren conversation, while finished identities still arrive through the existing profile avatar vault
- the site answers “what else can I do here?” better than before
- overall product identity is stronger than the earlier explainer-heavy versions

### Contact Emaren

Current strengths:
- direct-line experience exists and is usable
- Nav Chat and Full Chat expose the same persisted V1/V2/V3 preference: upgraded classic bubbles, compact line chat, and obsidian glass
- initial full-chat load uses one complete thread request, Nav Chat keeps a warm per-thread cache, and the timeline anchors to the latest message without delayed multi-jump scrolling
- reactions use a deliberate click/long-press quick bar with six AoE2-relevant choices and a compact expansion rail instead of an automatic hover takeover
- the typing-display control sits in the lower-left composer/footer area rather than over message content
- message receipts are quieter and more premium
- gifts and badges flow through chat
- unread counts and read state exist

### Admin command surface

Current strengths:
- can inspect users
- `/admin/hero-studio` owns the lobby/home Hero composition and uses the exact public carousel and typed renderer for desktop and mobile previews
- `/admin/events` uses the exact Featured Event renderer and is the single live-event switch: **Make live** publishes + activates one EventTile, while every Featured Event Hero screen resolves that active EventTile and CTA automatically; Hero Studio controls placement/order, not event selection
- `/admin/user-list` has top-level operator navigation for Admin Home, Media Assets, WoloChain, and the User List / Command Tower
- can award badges/gifts, with the badge panel now presented as Honors
- Honors Phase 3A can grant/remove Badges, Belts, Artifacts, and Designations from `/admin/user-list`
- Honors Phase 3A reuses the existing `user_badges` table with typed labels such as `Belt: ...`, `Artifact: ...`, and `Designation: ...`; no new migration was added
- public Honors display is intentionally limited to the existing profile/community badge-pill rail when an honor is public, accepted, and displayable; richer belt/artifact profile layout is Phase 3B
- can see inbox/unread/honor state
- can see appearance preferences, including exact Community Lobby mode labels for Basic, Advanced, and Extreme
- can see a compact app-local Journey Summary per user, inspired by Traffic session ideas but built from AoE2WAR `UserActivityEvent` rows
- can triage Journey Intelligence with client-side engagement filters, search, sort controls, summary counts, and an expandable per-user Journey Details panel without loading full histories upfront
- recent actions stay in a fixed-height pane and lazy-load older rows through an IntersectionObserver sentinel instead of a manual Next 50 button
- operator control surface is real, not fake scaffolding

## Still unfinished

### Rankings depth

Current state:
- leaderboard is shipped and valuable
- first impression is materially better than before
- deeper ranking UX is still available for improvement

Still wanted:
- fuller rankings page depth
- stronger sorting/filtering clarity
- cleaner distinction between tracked, active, claimable, and pending profiles
- better consistency between leaderboard and player detail surfaces

### Tournament depth

Current state:
- tournament card/panel is real and useful
- join state, entrants, and bracket preview exist
- product now has credible tournament energy

Still wanted:
- more “event gravity”
- better bracket storytelling
- more live match/tournament linkage
- stronger tournament history and results visibility

### `$WOLO`

Current state:
- has a real page and UI surface
- gifts exist in app logic
- token rail is visible in product language and navigation
- wallet snapshot is the right-rail anchor on `/wolo`, with the tight `WOLO Market` tile living directly below it and the starter faucet claim strip tucked underneath
- `/lobby` now presents the WOLO / USDC Osmosis 3461 market tile in Advanced view as a logo/price/swap surface, deriving `1 WOLO` price from the live pool unless `WOLO_USD_PRICE` explicitly overrides it
- `/wolo` now has a real app-side starter faucet claim route that sends `2 WOLO`, enforces a 24-hour cooldown, and updates the wallet snapshot from the returned balance
- default `/wolo` hero keeps the simpler legacy action row, while premium mode uses the two-lane action dock with borderless utility pills so `Open Ping.pub` stays grouped without a harsh white outline treatment
- default WOLO runtime/daemon consoles stay in the raw matrix style without per-line separators, but the stat-card labels/values use the normal slate/white treatment again; premium runtime/daemon consoles keep the darker structured shell
- Keplr wallet state now persists across route changes instead of acting page-local
- `/bets` now requires the real signed WOLO stake path on `wolo-1`; wagers are only accepted after the stake tx verifies against WoloChain REST
- mainnet-facing WOLO/bet rails hide pre-mainnet testnet-era rows and app-only wagers, so profile ledgers, staking fee stats, war-chest totals, `/bets`, and admin WoloChain rails only count Keplr-verified mainnet stakes
- `/staking` mainnet display is tx-backed: public totals, personal stake, leaderboards, and reward weights are derived from indexed WoloChain `MsgSend` rows to/from the configured staking wallet plus confirmed app staking events with verified `wolo-1` tx hashes on/after the mainnet display start. Legacy `staking_positions` rows are not public mainnet truth.
- `/staking` personal rewards now read unpaid mainnet reward allocations first, then show the modeled unpaid fee-share estimate from settled signed wagers until the daily distribution runner creates allocation rows.
- `/staking` also exposes public custody balance cards for staking wallet, community treasury, bet escrow, payout signer, and DEX liquidity; these render real WoloChain bank balances and should show `0.00 WOLO` when the configured wallet is empty.
- mainnet direct transfers are indexed in `wolo_indexed_transfers`, surfaced at `/api/wolo/mainnet-transfers`, and refreshed through the admin backfill route or `scripts/backfill-wolo-mainnet-transfers.mjs`.
- `/bets` now records pre-intent Keplr/Ledger wallet failures as `bet_wallet_error` activity events, so operator/debug history includes failures that happen before a stake intent can exist
- `/bets` now keeps recent no-proof stake intents visible in Your Book and gives the server 24 hours to discover matching WoloChain escrow deposits for tx-landed/browser-lost recovery
- AoE2WAR browser streaming now exists as the first-party path: signed-in users can pick a window/display from `/profile` or a watcher-bound `/watch/[sessionKey]`, the app records `aoe2war` browser stream sessions in `game_watch_streams`, stores short WebM chunks under runtime stream storage, and surfaces rolling live thumbnails/playback on `/`, `/watch`, `/bets`, `/live-games`, and the lobby Watch & Chat hero. The streamer studio now recovers an active stream after reload, shows compact binding/signal/uptime/chunk stats, exposes Sharp/Stable/Display capture modes, records stream capture/recorder/heartbeat failures into watcher telemetry, keeps watcher-linked theatre/copy actions visible, and accepts watcher handoff params through `/profile?watcher_stream=1&stream_session=...&stream_title=...`. Desktop watcher `1.5.0` adds native watcher streaming, display-first macOS/CrossOver full-screen guidance, rolling playback support, compact control-room UI, and safer update handling: signed Windows builds can install in place when idle, while unsigned macOS builds use download-and-replace until notarized. Twitch/YouTube stay as external fallback feeds, not the primary product path.
- challenge-linked `/bets` markets now merge safe duplicate `watcher-live-*` shadows for the same live/completed session into the canonical challenge book, including wagers, stake intents, wallet locks, founder bonuses, and claim breadcrumbs
- the recent settled-results rail dedupes by linked session and prefers the challenge-linked market over watcher shadows
- `/admin/wolochain` now shows a wallet-friction rail for recent Keplr/Ledger stake failures, and `/admin/user-list` surfaces the last-24h count in the WoloChain entry tile
- winning payouts can now auto-settle on-chain for trusted wallet-linked winners, with tx hashes visible in the admin settlement rail
- payout claims now have a distinct-send guard: before a claim row is marked `claimed`, the returned tx must contain a matching WoloChain `MsgSend` for that recipient and amount, and a reused tx hash must have enough distinct matching sends for every claimed row using it
- public betting and war-chest rails now translate payout reserve-floor/config blockers into player-safe operator top-up language; raw settlement health codes and signer-balance math stay in admin/operator surfaces
- `/admin/wolochain` now includes duplicate-tx diagnostics and indexed-transfer gap diagnostics, separating verified mainnet multi-payouts from suspicious mainnet duplicates, legacy testnet single-send duplicates, and REST-not-found rows
- `/profile` now presents WOLO ledger rows newest-first, labels confirmed mainnet transfers separately from app-side pending/retry claim rows, filters old testnet claim rows out of mainnet accounting, and flags duplicate/suspicious claim tx groups
- pending settlement activity is claim-level instead of market-collapsed, so individual child claims remain visible to operators
- `/admin/wolochain` also includes an Admin Watcher Diagnostics rail with per-user app version, platform, artifact, last heartbeat, replay files/hashes, parsed/unparsed finals, upload failures, parse failures, and replay-file rollups
- unmatched or failed payouts still fall back into the pending-claim/admin rescue rail instead of vanishing

### Replay trust / postgame depth

Current state:
- parser now captures much more replay metadata
- official HD rating snapshots are surfaced
- normal live-to-final behavior looks materially healthier than before
- watcher final uploads that hit an MGZ full-summary decoding edge can now fall back to header-only parser metadata instead of disappearing as repeated generic parse failures; those rows keep explicit `header_only_summary_fallback` / `header_only_fallback` breadcrumbs and do not invent winners or postgame economy
- exact postgame achievement tabs still are not solved

If exact score/economy/military tables matter, likely next step is:
- screenshot ingestion / OCR
- or deeper HD-specific replay/postgame parsing

### Watcher/runtime tuning

Current state:
- watcher is functionally working
- recent valid replay ran through successfully
- behavior still looks a little brute-force/noisy

Still wanted:
- cleaner iteration cadence
- less conservative default thresholds
- fewer unnecessary live passes on ordinary valid games
- keep current success without the chatty feel

### Docs / testing / deploy hygiene

Still needed:
- API test baseline cleanup
- permanent fix for VPS `next-env.d.ts` drift
- keep runtime docs aligned as deploy flow evolves
- make lobby/leaderboard ownership files explicit in docs
- keep replay/live/final behavior documented truthfully

### Challenge/Bets settlement depth

Current state:
- Challenge scheduling and bet-market seeding are now connected at the app snapshot layer
- accepted scheduled matches now seed runway books before watcher-live detection, so betting can open before a fast match is already over
- stale challenge-derived bet books are retired when the matching runway tile disappears
- final/forfeit challenge outcomes are persisted onto the source scheduled match row
- settled challenge-market wagers persist `execution_mode`, stake tx proof, payout tx proof, `payout_wolo`, and slip outcome state in Postgres
- one-sided winner bounties and two-sided pot payouts are now being pushed through the chain-backed settlement rail on the happy path

Still wanted:
- more recovery/reconciliation coverage for edge cases where the wallet tx lands but the browser misses both the wager write and local recovery update
- tighter Ledger/browser guidance before the broadcast stage dies
- one consistent market lifecycle so scheduled, live, and just-finished versions of the same match never feel like different books
- remove or further de-emphasize fallback synthetic books when the challenge slate is rich enough

## Current known product rough edges

- player profile pages are now premium, but the resource/economy rail is only as complete as captured postgame achievement data
- tournament presentation is good, but not yet “must-watch”
- Watch & Chat reactions are intentionally lightweight/local for now; the right-side hero comments reuse the public lobby messages, the hero bet slip is a `/bets` handoff, and persistent match-scoped comments need a dedicated context table or reuse plan before they become durable product state
- AoE2 Shorts is currently a founding editorial surface backed by bundled replay clips. Reactions are local to the browser and comments hand off to the public war room; uploads, durable reactions, and short-scoped comment storage remain future data rails rather than simulated persistence
- leaderboard is now real, but deeper ranking semantics still need tightening
- some surfaces still carry more explanatory copy than ideal
- token rail is now partially real, but live wallet edge cases still need hardening
- mainnet transfer indexing can still miss a directly provable tx; the admin index-gap diagnostic now flags those cases so operators can rerun/expand the mainnet transfer backfill instead of treating the app ledger as chain truth
- challenge-derived bet markets are much healthier than before, but long-tail parser/session label mismatches still need operator visibility
- exact postgame achievement extraction is still the big missing depth layer
- watcher behavior works better than before, but still feels somewhat noisy under the hood

## Current rough scorecard

- Community Lobby / homepage spine: `9.7/10`
- Leaderboard surface: `9.4/10`
- Players directory: `9.2/10`
- Individual player pages: `9.3/10`
- Rivalries / public shell: `8.9/10`
- Tournament panel / lobby integration: `8.8/10`
- Contact / inbox: `8.9/10`
- Admin dashboard: `8.8/10`
- Replay parser / metadata capture: `8.5/10`
- Live replay → visible product loop: `8.9/10`
- AoE2WAR browser streaming loop: `8.0/10`
- Exact postgame achievement capture: `4.2/10`
- Deploy reliability: `8.8/10`
- Docs / architecture truth: improving, but still worth maintaining intentionally

## Best next moves

1. Improve tournament gravity, bracket storytelling, and event visibility
2. Deepen exact postgame achievement/economy extraction so resource rails can fill every game
3. Tune watcher/runtime behavior now that final parse behavior looks healthier
4. Move streaming distribution from the first-party WebM chunk rail to a purpose-built media provider or watcher-native ingest once real audience size appears
5. Add operator visibility for skipped challenge/watcher merges when parser labels do not safely map
6. Keep hardening live wallet edge cases around Keplr/Ledger handoff and signer/browser failures
7. Clean API testing workflow and keep docs aligned with the now-real WOLO betting rails

- Replay Vault upload now extends the existing single replay upload with old-school ZIP replay packs, preserving renamed filenames while importing each replay into the existing replay proof flow.

- `/upload` keeps the replay form as the hero and seats the free-floating UPDATED Replay Vault v1.1 stamp near the bottom of the first viewport.

- `/upload` hero copy now lists replay formats on one line, then keeps the watcher/live-proof note on the next line.

- `/upload` keeps the calmer premium hero typography while restoring the clearer “Upload a replay manually” CTA heading.

<!-- AOE2WAR:RIVALRIES_WAR_VAULT:START -->
## Rivalries and War Vault — 2026-07-11

- `/battle-archive` is the War Vault: one numbered card per replay,
  a total filed count, newest-first filing, direct game-stats access,
  rivalry navigation, replay access, and linked betting markets where
  available.
- `/rivalries` is team-aware. True duels remain player rivalries,
  while balanced 2v2, 3v3, and 4v4 battles preserve both exact
  rosters.
- Player rivalry histories include true duels, opposing team
  appearances, and allied context without turning teammates into
  opponents.
- Exact-team routes use canonical base64url roster tokens, preventing
  duplicate histories caused by roster order.
- First-time visitors default to Extreme. B/A/E selection persists
  and flows into Admin preference telemetry.
- Basic preserves its original visual language and adds a local
  `Replay-Backed Battles` cycle: two-across, one-across, and original
  Basic duel composition.
- `/game-stats/[id]` links back to the correct player or exact-team
  rivalry.
- Rivalry match-feed cards link to game stats, while warrior names
  link directly to player profiles.
- The Individual Rivalry Matrix keeps whole-card rivalry navigation
  and independent player-profile links.
- Consistent incomplete watcher 1v1 outcomes are accepted only when
  the stored winner and sole reliable player winner flag agree.
- Full detail lives in `docs/RIVALRIES_AND_WAR_VAULT.md`.
<!-- AOE2WAR:RIVALRIES_WAR_VAULT:END -->

<!-- AOE2WAR:PUBLIC_PARSER_OBSERVATORY_20260722:START -->
## Public Parser Observatory and Evidence Lab — 2026-07-22

The replay-result review system is now a shipped public product surface.

### Public battle intelligence

- `/game-stats/[id]` remains the public battle record and includes the canonical collapsed `Verdict Trail`.
- `/game-stats/[id]/review` is the full public Parser Observatory.
- Anonymous visitors may inspect replay-parser passes, screenshot Evidence Passes, confidence assessments, stored screenshot evidence, and provenance history.
- Public visitors cannot assign teams, select winners, edit notes, lock or correct results, upload evidence, run screenshot analysis, or launch replay-parser passes.
- Admins receive the operational `Review Result` action.
- Public visitors receive the single `Open Verdict Trail` action.

### Public-read / admin-write contract

Public anonymous reads:

- `GET /api/replay-results/[id]/adjudications`
- `GET /api/replay-results/[id]/parser-trail`
- `GET /api/replay-results/[id]/evidence`
- `GET /api/replay-results/[id]/evidence/[artifactId]`

Admin-only mutation:

- human adjudication or correction
- screenshot evidence upload
- screenshot Evidence Pass execution
- replay parser execution

Battle `#18714` was production-proven with HTTP `200` for all public read surfaces while anonymous mutation attempts returned HTTP `401`.

Protected financial market snapshots remain admin-only.

### Screenshot Evidence Lab

The Verdict Trail accepts up to six AoE2 HD postgame screenshots.

- PNG, JPEG, or WebP
- maximum 8 MB per file
- maximum 30 MB per batch

Screenshots are immutable content-addressed `ReplayEvidenceArtifact` records linked through append-only `ReplayEvidenceLink` provenance.

The screenshot-analysis pass is:

- parser: `aoe2war.screenshot_vision`
- parser version: `1.0.0`
- pass: `postgame_evidence`
- pass version: `1`
- default model: `gpt-5.6`
- `candidateOnly = true`
- `affectsPublicAggregates = false`

Screenshot evidence never silently becomes replay-only confidence and does not directly mutate betting, payouts, chain history, or public aggregate truth.

### Production validation — battle #18714

Evidence Pass `#2391`:

- six human-supplied screenshots
- 73 material observations
- eight of eight assessment areas observed
- Team Composition: 96.5%
- Winner / Loser: 96%
- Score: 99%
- Military: 99%
- Economy: 99%
- Technology: 99%
- Society: 99%
- Timeline: 98.6%

The pass remains candidate-only and non-authoritative for settlement by itself.

### Human participation semantics

The small human marker means participation in the provenance chain, not automatically human adjudication.

- adjudication only: `Human verdict`
- human-uploaded screenshots only: `Human-supplied evidence`
- both: `Human verdict and human-supplied evidence`

Recent Parsed Games is now hydrated from direct replay-review screenshot evidence. Battle `#18714` reports `humanSuppliedEvidence = true` with six screenshots.

### Review Desk presentation

The Review Desk supports Basic, Advanced, and Extreme modes.

- Extreme is the default for a new preference state.
- Selection persists locally.
- Basic remains compact.
- Advanced expands the workspace.
- Extreme provides the widest evidence and provenance layout.
<!-- AOE2WAR:PUBLIC_PARSER_OBSERVATORY_20260722:END -->
