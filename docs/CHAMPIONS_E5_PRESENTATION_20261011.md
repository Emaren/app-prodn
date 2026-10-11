---
id: "aoe2war.app-prodn.champions-e5-presentation"
title: "Championship Hall E5 — presentation and release contract"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-presentation-contract"
reviewed_at: "2026-10-11"
review_interval_days: 90
sensitivity: "internal"
---

# Championship Hall E5 — presentation and release contract

Date: 2026-10-11. Scope: application UI and navigation only. No title custody, eligibility, wagering, or championship ledger changes.

## Entry and persistence
- `/champions` is the canonical E5 presentation for browsers with no explicit choice.
- The E5 rollout starts every viewer on E5 once by using the new `aoe2war:champions:preferred-layout:v2` preference key; earlier v1 preferences are deliberately not migrated. Subsequent explicit B/A/E1–E5 choices persist locally under v2, and revisiting `/champions` navigates to that choice.
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

## Championship inventory and hypothetical economics (Oct 11)
- E5's four summary tiles show **Active**, **Vacant**, **Potential daily**, and **Bounty growth**. Counts and amounts are recomputed from the current public title-economy read model on every server-rendered request; they are not fixed presentation constants.
- The inventory counts solo crowns, RM/DM ELO lanes, exact-roster team titles, and special designation/artifact titles once each. The obsolete generic tag-team placeholder is excluded. Canada, USA, Mexico are the starting national-title set; other national titles join as current held custody is established. Dormant roadmap countries are not counted as vacant titles. The base inventory is **36 titles** (including **12 artifact designations**, which are not physical championship belts); an additional claimed country can increase the denominator. This is a definition, not a claim that exactly 36 titles are held/available in live production at this instant.
- A title is active only with public **held** status and a nonempty holder roster; everything else in the included inventory is vacant. Active + Vacant = included total, so title transfer updates the display without a code change.
- Potential daily is the sum of configured daily WOLO amounts on currently held titles, including designation rewards where configured. Bounty growth is the separately configured sum of `bountyGrowthWolo` on those held titles; missing rates are zero, **never guessed** from the tribute rate. Both amounts are labeled **If enabled · not paid**; no bounty accrual, daily tribute execution, on-chain receipt, or actual transfer is asserted or authorized here.
- These figures may differ from an operator's handwritten 12/24/73 tally until live title classification/custody and trophy economics are reconciled. The public screen must not substitute target numbers for the authoritative ledger.
- Source: `lib/champions/championshipSummary.ts`, projected by `loadChampionsV2State()`. Monetary execution remains fenced by `lib/champions/championshipPolicy.ts` and the existing payout/settlement contracts.

## Verification
- `node --experimental-strip-types --test tests/champions-v2.test.mts`
- `npx tsc --noEmit`
- `npm run build` only in a configured CI/build environment.
- Visually inspect the first fold at desktop and narrow widths: E5 menu not clipped, three podium haze variants, ten Chaos/Women slots, E5 team Both default and persistent changes, 2v2 portrait alignment, 3v3 V, 4v4 two-by-two, vacant Challenge links, restored explicit E1–E4 / B / A.
- Production activation must use the repository's protected release controller and a clean release receipt; do not treat a PR merge as a deployed runtime.
