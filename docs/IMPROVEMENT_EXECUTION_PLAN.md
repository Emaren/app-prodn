---
id: "aoe2war.app-prodn.docs-improvement-execution-plan"
title: "AoE2HDBets Improvement Execution Plan"
type: "working"
status: "superseded"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "historical-evidence"
authority: "historical-working-record"
reviewed_at: "2026-07-26"
review_interval_days: 0
sensitivity: "internal"
---

# AoE2HDBets Improvement Execution Plan

> **Lifecycle:** Superseded working record. Preserve it for context, but use newer active documentation for current decisions and operations.


Last updated: 2026-06-15

## Highest-ROI order

1. WOLO betting trust and recovery
   - Keep signed-stake recovery reliable when the wallet broadcast succeeds but wager recording fails.
   - Capture Keplr/Ledger failures before a stake intent exists, with market, side, amount, wallet type, browser, and workflow phase.
   - Keep wording honest: verified escrow only when a real chain transfer is signed and verified.

2. Challenge-to-bet market lifecycle
   - Prevent scheduled, live, and just-finished versions of the same matchup from feeling like separate books.
   - Tighten stale-book retirement and duplicate-looking settled rows.

3. Tournament gravity
   - Improve bracket storytelling, event state, watch/bet links, and historical results.

4. Watcher/runtime tuning
   - Reduce noisy live parse passes while preserving the now-healthier final parse behavior.
   - Keep watcher telemetry honest about real users versus package pulls.

5. Rankings depth
   - Clarify tracked, active, claimable, and pending profiles.
   - Align leaderboard semantics with player detail surfaces.

6. Testing and deploy hygiene
   - Keep the practical gate green: `npx prisma generate`, `npx tsc --noEmit --pretty false`, `npm run build`.
   - Add focused API/browser checks around money-adjacent flows before broader refactors.

## Started first

The first shipped slice is WOLO betting trust:

- Added `POST /api/bets/wallet-errors` to record authenticated pre-intent wallet failures as `bet_wallet_error` activity events.
- Wired `/bets` to report failures before a stake intent exists, including `awaiting_wallet`, `stake_intent`, `confirming_chain`, and `recording_wager` phases.
- Kept signed-broadcast recovery on the existing stake-intent rail, while improving phase accuracy for failures that do have an intent.

The second shipped slice is operator visibility:

- Added a shared wallet-friction rail loader for recent `bet_wallet_error` activity.
- Added wallet-friction summary data to `/api/admin/users` and `/api/admin/users/rails`.
- Added a WoloChain admin rail showing recent Keplr/Ledger failures, phase, user, market, wallet, amount, raw error, and browser breadcrumb.
- Added the wallet-friction count into the `/admin/user-list` WoloChain entry tile so operator pressure is visible before opening the full cockpit.

The third shipped slice is stake recovery visibility:

- Extended server-side signed-stake discovery from 1 hour to 24 hours for recoverable stake intents.
- Increased the settlement-service recent-deposit scan depth so tx-landed/browser-lost cases have a wider recovery net.
- Kept recent no-proof stake intents visible in Your Book as pending chain-proof rows, while still excluding them from pools and settlement until a real WoloChain stake tx is attached.

The fourth shipped slice is challenge/watcher market lifecycle cleanup:

- Reconciled detached `watcher-live-*` shadow books into the canonical challenge runway book when both point at the same session and the left/right labels can be mapped safely.
- Moved wagers, recoverable stake intents, wallet locks, founder bonuses, and claim breadcrumbs onto the canonical challenge market before settlement runs.
- Deduped the recent settled-result rail by linked session, preferring the challenge-linked market over a watcher shadow so one match does not appear twice.

The fifth shipped slice is the premium player profile pass:

- Replaced duplicated Basic player pages with a shared profile data layer and renderer for `/players/[uid]` and `/players/by-name/[name]`.
- Made claimed profiles default to Advanced and kept Basic available through the view toggle.
- Added command-center stats: form, win rates, streaks, civ/map breakdowns, best games, rivalries, watcher proof, Twitch signal, and `$WOLO` rails.
- Added lazy loading for the Match Feed through `/api/player-profile/matches`, so older manual backfills remain reachable.
- Added honest resource/economy rails that show total food/wood/gold/stone only when stored achievement/economy values exist.
- Aggregated live watcher uploaders per session so dual/stacked watcher coverage displays as a stronger proof signal instead of clashing chips.

The sixth shipped slice is the profile first-impression and parser-resilience polish:

- Unclaimed replay-built profiles now default back to the classic Basic claim page, while still allowing Advanced via the toggle.
- Advanced profile polish adds deeper red/green command-deck treatment, cleaner form-chart spacing, resource emblems, a premium WOLO logo rail, and an AI Scribe/Grimer readout.
- API replay parsing now falls back to explicit header-only metadata when MGZ full-summary decoding fails, preserving watcher proof rows without inventing winners or postgame economy.

The seventh shipped slice is the championship title economy:

- Rebuilt `/champions` around AoE2WAR belts, tag titles, national champions, ELO titles, and special designations.
- Added title detail routes through `/champions/[...slug]` with challenge entry points, contender rails, title rules, and history placeholders.
- Added profile title-identity settings for represented country and gender division.
- Added a disabled admin scaffold for future title assignment, vacation, top-10, and record/event capture work.
- Kept the scope honest: this is app-side title presentation and workflow, not WoloChain custody, escrow, or settlement truth.

The eighth shipped slice is championship polish and menu/staking hardening:

- Converted championship belts, designation items, and new player/silhouette art to real alpha-channel PNGs.
- Layered holder portraits and the generic silhouette behind title art while keeping belts and artifacts visually primary.
- Split public title payout wording: belts use `Reward Tribute`; special designation artifacts use `Artifact Bonus`.
- Enforced the holder-plus-ten-contenders model in the title state and UI, with empty slots shown as explicit challenger openings.
- Hardened the Kingdom chip and account menu for mobile tap behavior and unclipped fixed-sheet rendering.
- Cleaned staking reward copy so compounded rewards read as canonical receipts instead of duplicate-looking events.

The staking reliability follow-through locks the surface for future expansion:

- Current public stake, execution limits, and Forge capacity now use the
  confirmed canonical app position, while closed-day rewards and strict audits
  replay the complete confirmed staking-event ledger across custody eras.
- The Emaren regression is covered explicitly: the complete history resolves
  to `101 WOLO`; omitting the legacy-custody unstake reproduces `111 WOLO` and
  the inflated daily weight.
- Recent Activity cards retain their established fixed heights and no longer
  swap 132px intrinsic placeholders into the scroll rail.
- Staking joined the shared B/A/E preference/admin telemetry system with Basic
  preserving the existing width, Advanced slightly wider, and Extreme full
  width.
- Hero, wallet, and action tiles consume one shared personal staking snapshot,
  and confirmed mutations refresh every consumer together.
- Unstake authorization and finalization now share one direct-plus-compounded
  balance contract; full withdrawal clears both buckets and a compounded-only
  remainder stays active.
- Mainnet leaderboard reward totals are aggregated without a fixed-row cap,
  while one shared load produces all leaderboard modes.

## Next concrete slice

Continue with tournament gravity, exact postgame achievement/economy depth, and the persistent title-admin rail, unless live wallet handoff telemetry shows a fresher production issue.
