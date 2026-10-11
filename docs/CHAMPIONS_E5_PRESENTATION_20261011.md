# Championship Hall E5 — presentation and release contract

Date: 2026-10-11. Scope: application UI and navigation only. No title custody, eligibility, wagering, or championship ledger changes.

## Entry and persistence
- `/champions` is the canonical E5 presentation for browsers with no explicit choice.
- An explicit layout choice is stored locally under `aoe2war:champions:preferred-layout:v1`; revisiting `/champions` navigates to that saved choice.
- B and A retain their `/champions/legacy` routes. E1 remains the legacy extreme; E2, E3, E4, and E5 have separate direct routes.
- The compact top-right view control is keyboard-focusable, mouse-hoverable, and clickable/tappable. The existing legacy rail remains available on older views.

## E5-only visual controls
- Top-right palette button offers **Gold (default)**, **None**, or **Blue** backgrounds for the three podium cards, persisted under `aoe2war:champions:e5:podium-haze`.
- E4's original golden podium is unchanged.
- Chaos and Women's podium contender rails display ten positions. Only evidence-backed contenders receive names; remaining positions are marked unclaimed, never fabricated.
- Chaos roster authority remains the existing `buildChaosActivityContenders`: claimed identities without the incumbent holder, watcher-linked activity first, submitted battle counts and archived match totals as tie-breakers, then deterministic name order. The UI does not create new leaderboard evidence.
- RM/DM/Both team filter defaults to **Both** on E5 and persists in its own key, without overwriting E4's RM-first preference.
- Two-member crowns are horizontally aligned; three-member crowns use two portraits above a centered third; four-member crowns use two rows of two, maintaining card width across lanes.
- Each podium, individual, team, national/regional, and ELO belt has a Challenge navigation link even when vacant. A vacant title carries no fabricated opponent.
- Challenges navigate to the existing `/challenge?title=...#schedule-game` workflow; link visibility never constitutes custody, eligibility, or settlement authority.

## Verification
- `node --experimental-strip-types --test tests/champions-v2.test.mts`
- `npx tsc --noEmit`
- `npm run build` only in a configured CI/build environment.
- Visually inspect the first fold at desktop and narrow widths: E5 menu not clipped, three podium haze variants, ten Chaos/Women slots, E5 team Both default and persistent changes, 2v2 portrait alignment, 3v3 V, 4v4 two-by-two, vacant Challenge links, restored explicit E1–E4 / B / A.
- Production activation must use the repository's protected release controller and a clean release receipt; do not treat a PR merge as a deployed runtime.
