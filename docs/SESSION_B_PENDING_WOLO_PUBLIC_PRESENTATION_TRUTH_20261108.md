---
id: "aoe2war.app.session-b-pending-wolo-public-presentation-truth"
title: "Session B Pending WOLO Public Presentation — Source-only Nonfinancial Release"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-ui-truth-no-custody-or-payment-finality"
reviewed_at: "2026-11-24"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B Pending WOLO Public Presentation — Source-only Nonfinancial Release

Session B exclusively owns public profile, matchup and rivalry presentation.
Session A exclusively owns C03–C09, financial finality, owner roles, database
writers, historical claims, bounty gift classification and financial permits.
This repair changes zero stored amounts, lifecycle states, financial routes,
ledger joins, claim handlers, Wolo services or signer rights.

## Reproduced mislabeled data semantics

lib/playerProfile.ts **adds pendingGiftWolo into pendingClaimWolo**.
lib/publicPlayerDirectory.ts independently adds pending gift count and amount
to each player's pending claim fields. Therefore these fields mean
**pending records of both kinds**, not exclusively actionable claims or
confirmed on-chain money.

The predecessor R25 source rendered exactly this mixed amount as
**Claimable WOLO** in two hero tiles, **WOLO unclaimed** in basic
profiles, rivalries, individual/team matchups and admin player cards.
Its WOLO rail also labeled the combined amount **Pending Claims**.
These assertions are misleading while gift/claim identity and payout
finality remain unresolved; HTTP200 does not establish spendable funds.

Session A's read-only evidence includes a pending nominal 100,000-WOLO
bounty-linked gift whose opportunity is unassigned, unpublished and
unvalued. That is pending source data, **not proven earned or paid WOLO**.
This presentation audit does not export recipient identity or wallet.

## Exact nonfinancial change

- Public profile and matchup/rivalry tags now say WOLO pending review.
- Both advanced/extreme hero tiles now say Pending WOLO (unverified).
- The aggregate rail now says Pending Claims + Gifts.
- Replay-built profile states the amount is not a verified payout or
  available wallet balance.
- The admin player card uses the same pending-review label.

Unclaimed **player identities** remain unclaimed: that is a distinct
Steam/account state and was deliberately not modified.

No grant, escrow, gifting, refund, staking, marketplace, claim, custody,
transaction or database semantics changed. This is **display truth only**.
Focused source tests at tests/player-pending-wolo-public-truth.test.mts
verify the two read-model sums, UI copy and honor status distinction.

## Release acceptance and immutable source

This PR is based on frozen R25 source
3bc9c3be73210552f1b344c188b1665407b83fee. It must NOT modify the
already-checked and inert 3bc9 artifact on HEL1. Its code changes need
fresh GitHub CI, a rebuilt versioned runtime artifact with new source SHA,
fresh exact source/build admission, genuine browser acceptance and
verified rollback before public R25 integration.

No source-level label test can certify C03 writer containment or C04/C05
liability/payment finality. Financial C01–C09 stay HARD HOLD.

**Current state:** source-only nonfinancial repair, no public deployment
and no WOLO transfer authority.

## 2026-11-16 — B source-backed historical re-review

Review basis: the retained original document and the current canonical App main `d36e9f98e44b0a4de438c5cc623706873c333ca5`, compared to source anchors: `lib/playerProfile.ts` Git blob `b41ed6b30b274ffcd5deca02ce04226fd13e6aef`; `lib/publicPlayerDirectory.ts` Git blob `725896cc7b1b1264a9a7ee762049a007fdd14e31`.

The profile/directory retained source distinguishes displayed pending gift aggregates from actual paid WOLO. B validates nonfinancial display semantics only. C01 custody, C03 writer privilege, C05 reserves, payout hashes and all funded settlement claims remain the separate WE1-authority review.

Disposition: **B-owned nonfinancial/source-history review only.** Original dated release and CI evidence remains historic; this review is not a new physical acceptance, privileged B release permit, protected Steam/FINANCIAL admission, or authorization for the pending Ember Reign campaign singleton. Preserve the source/receipt distinction.

## 2026-11-24 -- WE2 source review in Atlas production era

Actual evidence comparison: historical dated document versus exact canonical main `f14bf4625ed124beafe80dc34188dcb7da16daa0`; physically accepted Atlas is distinct source `ed4b0ac878725eeb62c86b79ae416511da903e7d`. This is a source review, NOT an owner-native signer, new browser login, financial release, database migration, renewed permit or new site deployment.

- `lib/playerProfile.ts`: current canonical-main blob `b41ed6b30b274ffcd5deca02ce04226fd13e6aef`
- `lib/publicPlayerDirectory.ts`: current canonical-main blob `725896cc7b1b1264a9a7ee762049a007fdd14e31`

**Current finding:** Source presentation semantics remain unchanged. Pending gifts are NOT funded WOLO or permitted payouts.

**Scope restriction:** Original historic evidence retained. A code blob change requires new exact source qualification; prior release receipts and physical T10 evidence are immutable. No inference of a newly admitted ninth Factory invocation.
