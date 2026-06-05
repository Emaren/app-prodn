# AoE2HDBets Improvement Execution Plan

Last updated: 2026-06-05

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
- Made Advanced the default profile view and kept Basic behind the `?view=basic` toggle.
- Added command-center stats: form, win rates, streaks, civ/map breakdowns, best games, rivalries, watcher proof, Twitch signal, and `$WOLO` rails.
- Added lazy loading for the Match Feed through `/api/player-profile/matches`, so older manual backfills remain reachable.
- Added honest resource/economy rails that show total food/wood/gold/stone only when stored achievement/economy values exist.
- Aggregated live watcher uploaders per session so dual/stacked watcher coverage displays as a stronger proof signal instead of clashing chips.

## Next concrete slice

Continue with tournament gravity and exact postgame achievement/economy depth, unless live wallet handoff telemetry shows a fresher production issue.
