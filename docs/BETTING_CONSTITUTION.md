---
id: "aoe2war.app-prodn.betting-constitution"
title: "AoE2WAR Betting Constitution"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "betting-constitution-ratification-candidate"
reviewed_at: "2026-09-22"
review_interval_days: 14
sensitivity: "internal"
---
# AoE2WAR Betting Constitution

## Status and authority

This document records two layers that must not be confused:

1. the **current implemented settlement law** enforced by `#JimsRule`; and
2. broader Betting Constitution V1 ideas that remain ratification candidates.

Where a candidate section conflicts with the implemented settlement planner,
`lib/betWagerSettlement.ts` controls production behavior. This document does
not independently authorize a production financial migration.

AoE2HDBets owns bettor entitlement and market rules. WoloChain remains the
authority for signed custody, transfers, balances, and final payout truth.

## Constitutional principles

1. **No invented winnings.** Bettor profit must be backed by real accepted
   opposing WOLO or another explicitly funded liquidity object.
2. **One-for-one match ceiling.** One winning WOLO may earn at most one WOLO
   of opposing funded bettor liquidity.
3. **Only funded opposite-side stake matches.** Display/seed liquidity is never
   settlement backing. House or AI liquidity must enter as a real funded wager
   before it can consume user principal.
4. **Unmatched principal is protected.** Unmatched WOLO on either side is
   returned exactly, including on the losing side.
5. **Fees follow matched exposure only.** The 2% betting fee applies only to
   matched two-sided volume. Unmatched principal and void refunds are fee-free.
6. **Void means exact refund.** A void returns original stake with zero fee.
7. **No cross-phase subsidy.** Pre-Game, Opening Minute, and Late Book money
   never share one economic pool when those phase books are active.
8. **No silent clawback.** Historical overpayments remain historical unless a
   separately authorized correction or voluntary-return process exists.
9. **Chain proof wins.** App rows describe entitlement; WoloChain proves money
   movement.

## Phase books

The existing accepted Betting Phase Books V2 design remains authoritative:

- **Pre-Game:** accepted before the authoritative battle-start fence.
- **Opening Minute:** accepted from authoritative start through the first 60 seconds.
- **Late Book:** accepted at or after start + 60 seconds while battle truth remains active.

Each phase has independent wager identity, left/right queues, matching state,
fee accounting, admission fences, settlement history, and audit proof.
A later phase can never dilute, reprice, or subsidize an earlier phase.

The server owns all timing fences. Browser clocks and stale UI state never
create financial admission authority.

## Current #JimsRule matching authority

For each market, current settlement first computes:

```text
matched per side = min(total funded left stake, total funded right stake)
matched volume   = matched per side * 2
unmatched volume = total funded user stake - matched volume
```

The matched amount on each side is allocated proportionally across that side's
wagers, with deterministic whole-WOLO rounding by fractional remainder, then
stake size, then wager ID. This is the implemented production rule today; FIFO
is not the current matching algorithm.

For every ticket:

- matched WOLO is never negative and never exceeds that ticket's stake;
- unmatched WOLO is returned exactly regardless of whether the proposition won
  or lost;
- only the matched portion can win opposing stake or lose principal;
- seed/display liquidity contributes zero matched exposure.

A future constitution may ratify a different within-side ordering rule such as
FIFO, but it must be implemented and migrated deliberately rather than inferred
from this document.

### Founder / house liquidity

Founder counter-liquidity must eventually be a real funded wager or an
explicitly proven reserved-liquidity object with the same FIFO semantics.
Display-only seed numbers must never mint bettor profit.

## Current betting fee law

The current code constant is a 2% betting fee. Under `#JimsRule`, the fee is
computed from **matched two-sided volume only**:

```text
fee pool = round(matched volume * 2%)
```

That fee pool is allocated across winning wagers according to their matched
exposure. Unmatched principal never contributes to the fee basis.

Worked examples:

- 100 WOLO wins with 0 opposing -> matched volume 0, fee 0, payout 100.
- 100 WOLO wins against 50 -> matched volume 100, fee 2, payout 148.
- 100 WOLO wins against 100 -> matched volume 200, fee 4, payout 196.

Exact void refunds are fee-free. Unmatched principal is also fee-free.

### Fee split

Current code constants split betting-fee economics 50% to the Staker pool and
50% to the Community Treasury. Preserve that split unless a separately versioned
constitutional amendment changes it prospectively.
## Unmatched principal and Winner Bounty boundary

Unmatched user principal is not surplus available to the house, winner, or
Winner Bounty system. It is returned to its bettor exactly.

A Winner Bounty may exist only from a separately authorized and explicitly
funded source. Current settlement code deliberately prevents unmatched user
principal from becoming Winner Bounty funding.

Future house or AI counter-liquidity must become a real funded opposite-side
wager before it can increase matched exposure.

## Refunds and integrity corrections

A void returns exact original stake, charges zero betting fee, pays zero matched
profit, and creates no Winner Bounty from that voided book.

Integrity corrections never erase chain history. Original transfers remain
visible; corrective entitlement is additive and idempotent.

A late final result never silently reopens a book already terminally voided or
refunding.
## Historical settlement rule

Markets settled before Betting Constitution V1 activation are grandfathered.
They are not recomputed under FIFO and are not clawed back merely because the
new constitution would have produced a different distribution.

This gives every future wager a knowable rule at acceptance time and prevents
retroactive economic rewriting.

## September 9, 2026 Jim precedent

A read-only production audit used canonical database aoe2hd_db and a repeatable
snapshot in the canonical May 25, 2026-forward mainnet scope.

Frozen audit timestamp: **2026-09-09 12:58:06.889185 UTC**.

At that frozen snapshot, Jim's scoped ledger contained:

- 128 on-chain-escrow wagers;
- 64 wins, 11 losses, and 53 voids;
- 4,227,467 WOLO total stake;
- 5,649,677 WOLO total payout/refund cashflow;
- +1,422,210 WOLO net across all scoped wagers;
- 2,679,611 WOLO stake on winning wagers;
- 4,118,681 WOLO winning payouts;
- 84,054 WOLO of current-contract fees allocated to winning tickets;
- 1,439,070 WOLO net above returned winning principal.

Current-contract recomputation found:

- payout-math mismatches: 0;
- mismatch WOLO: 0.

WoloChain-indexed settlement proof found:

- 21 distinct winning payout transactions;
- 4,118,681 WOLO expected winning receipts;
- 4,118,681 WOLO indexed receipts to Jim's exact wallet;
- 0 missing indexed payout transactions;
- 0 recipient/amount mismatches.

All opposing bettor liquidity in Jim's winning mainnet markets came from Emaren:
49 opposing wagers totaling 1,855,432 WOLO.

The only other bettor sharing Jim's winning side was Scavanger_Ab:
7 wagers totaling 310,000 WOLO.

Therefore the audit found no missing current-mainnet Jim winning payout and
authorized no corrective payment.

A read-only strict one-for-one FIFO counterfactual on those already-settled
markets produced:

- existing pooled engine gross opposing allocation to Jim: 1,523,124 WOLO;
- strict 1:1 FIFO gross matched allocation to Jim: 1,280,543 WOLO;
- pooled-rule advantage to Jim: 242,581 WOLO.

That difference is evidence for grandfathering, not a clawback claim.

Two April 25 legacy winning rows predate the canonical May 25 mainnet accounting
window. Applying today's fee formula to those old rows would reduce their combined
payout by 1,002 WOLO. They remain historical and grandfathered.

## Current implementation invariants

The settlement planner must keep matched and unmatched exposure explicit,
deterministic, and conservation-safe. Settlement retries remain idempotent;
terminal voids refund exact stake; and proposition truth remains separate from
money-at-risk truth.

The targeted `#JimsRule` correction tooling uses its own explicit effective
timestamp and idempotent claim/request identities. Historical chain transfers
are never erased; corrections are additive and separately evidenced.

## Open ratification items

The following remain product-design questions rather than current settlement
law:

- whether future phase books should replace today's proportional within-side
  allocation with strict FIFO;
- the exact funded design for house/AI counter-liquidity;
- any Winner Bounty program funded from a source other than user unmatched
  principal;
- exact public wording for matched profit, unmatched principal, and fee previews;
- whether any future phase may use a different fee rate.

The following are **not** open under current `#JimsRule`: unmatched principal
returns whole, unmatched principal pays no betting fee, only real opposite-side
funded stake creates matched exposure, and unmatched user principal cannot fund
a Winner Bounty.
