# app-prodn Product State

## Snapshot

This file captures the current shipped state of the public product surface so a new chat can resume without re-auditing everything.

The app is no longer just a replay/stat shell. It now has a real public product spine:

- `/lobby` is a first-class community surface
- leaderboard is shipped and visible
- next tournament panel is shipped and usable
- players, rivalries, requests, `$WOLO`, and live-game surfaces are all real navigation destinations
- `/bets`, `/war-chest`, and tournament detail pages are now real public destinations too
- live replay ingestion can feed visible match outcomes back into the product without the old obviously-broken feel

## Strongest shipped modules

### Community Lobby / homepage spine

Current strengths:
- premium dark/gold/blue theme system with 7 theme circles
- `/lobby` now feels like a real destination, not filler
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

### Rivalries / broader public shell

Current strengths:
- rivalries are a real top-level destination
- public navigation now has enough surface area to feel like an ecosystem
- the site answers “what else can I do here?” better than before
- overall product identity is stronger than the earlier explainer-heavy versions

### Contact Emaren

Current strengths:
- direct-line experience exists and is usable
- message receipts are quieter and more premium
- gifts and badges flow through chat
- unread counts and read state exist

### Admin command surface

Current strengths:
- can inspect users
- can award badges/gifts
- can see inbox/unread/honor state
- can see appearance preferences and recent actions
- operator control surface is real, not fake scaffolding

## Still unfinished

### Individual player pages

Need another pass:
- `/players/[uid]`
- `/players/by-name/[name]`

They work, but they are not yet as sharp as the community lobby, leaderboard, or directory.

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
- `/wolo` now has a real app-side starter faucet claim route that sends `2 WOLO`, enforces a 24-hour cooldown, and updates the wallet snapshot from the returned balance
- default `/wolo` hero keeps the simpler legacy action row, while premium mode uses the two-lane action dock with borderless utility pills so `Open Ping.pub` stays grouped without a harsh white outline treatment
- default WOLO runtime/daemon consoles stay in the raw matrix style without per-line separators, but the stat-card labels/values use the normal slate/white treatment again; premium runtime/daemon consoles keep the darker structured shell
- Keplr wallet state now persists across route changes instead of acting page-local
- `/bets` now opens a real signed WOLO stake path when escrow env is configured, and the wager is only accepted after the stake tx verifies against WoloChain REST
- winning payouts can now auto-settle on-chain for trusted wallet-linked winners, with tx hashes visible in the admin settlement rail
- unmatched or failed payouts still fall back into the pending-claim/admin rescue rail instead of vanishing

### Replay trust / postgame depth

Current state:
- parser now captures much more replay metadata
- official HD rating snapshots are surfaced
- normal live-to-final behavior looks materially healthier than before
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
- signed-but-unrecorded stake recovery/reconciliation if a user finishes the wallet tx but the app misses the wager write
- tighter Ledger/browser guidance and clearer surfaced errors before the broadcast stage dies
- one consistent market lifecycle so scheduled, live, and just-finished versions of the same match never feel like different books
- remove or further de-emphasize fallback synthetic books when the challenge slate is rich enough

## Current known product rough edges

- player profile pages lag behind directory and lobby polish
- tournament presentation is good, but not yet “must-watch”
- leaderboard is now real, but deeper ranking semantics still need tightening
- some surfaces still carry more explanatory copy than ideal
- token rail is now partially real, but stake recovery and pre-submit signer telemetry are still behind the rest of the UX
- challenge-derived bet markets are much healthier than before, but fast-finish lifecycle edge cases and duplicate-looking settled rows still need cleanup
- exact postgame achievement extraction is still the big missing depth layer
- watcher behavior works better than before, but still feels somewhat noisy under the hood

## Current rough scorecard

- Community Lobby / homepage spine: `9.6/10`
- Leaderboard surface: `9.4/10`
- Players directory: `9.2/10`
- Rivalries / public shell: `8.9/10`
- Tournament panel / lobby integration: `8.8/10`
- Individual player pages: `7.3/10`
- Contact / inbox: `8.9/10`
- Admin dashboard: `8.8/10`
- Replay parser / metadata capture: `8.5/10`
- Live replay → visible product loop: `8.9/10`
- Exact postgame achievement capture: `4.2/10`
- Deploy reliability: `8.8/10`
- Docs / architecture truth: improving, but still worth maintaining intentionally

## Best next moves

1. Stake recovery / escrow reconciliation for signed txs that do not finish recording cleanly
2. Capture and surface exact Keplr/Ledger failure breadcrumbs before the wager API is even hit
3. Tighten scheduled/live/settled market lifecycle so the book never disappears prematurely
4. Premium pass on individual player pages
5. Improve tournament gravity, bracket storytelling, and event visibility
6. Tune watcher/runtime behavior now that final parse behavior looks healthier
7. Clean API testing workflow and keep docs aligned with the now-real WOLO betting rails
