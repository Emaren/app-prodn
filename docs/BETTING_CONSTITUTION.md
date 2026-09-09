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
reviewed_at: "2026-09-09"
review_interval_days: 14
sensitivity: "internal"
---
# AoE2WAR Betting Constitution

## Status and authority

This document is the ratification candidate for Betting Constitution V1.
It does not retroactively change a settled market and does not by itself
authorize a production financial migration or settlement change.

AoE2HDBets owns bettor entitlement and market rules. WoloChain remains the
authority for signed custody, transfers, balances, and final payout truth.

## Constitutional principles

1. **No invented winnings.** Bettor profit must be backed by real accepted
   opposing WOLO or another explicitly funded liquidity object.
2. **One-for-one match ceiling.** One winning WOLO may earn at most one WOLO
   of opposing bettor liquidity.
3. **First accepted, first matched.** Within one phase book and side, matching
   is FIFO by server-owned acceptance time, then immutable wager ID.
4. **Losing stake is at risk.** A valid accepted losing wager loses its stake
   when the proposition resolves against it.
5. **Void means exact refund.** A void returns original stake with zero fee.
6. **No cross-phase subsidy.** Pre-Game, Opening Minute, and Late Book money
   never share one economic pool.
7. **No silent clawback.** Historical overpayments remain historical unless a
   separately authorized voluntary-return process exists.
8. **Chain proof wins.** App rows describe entitlement; WoloChain proves money
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

## FIFO matching candidate

Each phase/side is an ordered queue:

1. server accepted-at time;
2. immutable wager ID as deterministic tie-breaker.

For a winning ticket, matched WOLO is the amount of its stake paired one-for-one
with accepted losing-side liquidity in FIFO order.

- matched WOLO is never negative;
- matched WOLO never exceeds that ticket's stake;
- gross return equals returned principal plus matched opposing WOLO.

An unmatched winning WOLO earns no opposing-profit WOLO. It returns as
principal, subject to the ordinary winning-payout fee if that fee rule is ratified.

### Founder / house liquidity

Founder counter-liquidity must eventually be a real funded wager or an
explicitly proven reserved-liquidity object with the same FIFO semantics.
Display-only seed numbers must never mint bettor profit.

## Betting fee candidate

The current code constant is a 2% betting fee. The ratification recommendation
is to preserve that rate and apply it only to the gross amount actually returned
to a winning bettor.

Recommended formula:

- gross return = stake + matched opposing WOLO;
- fee = 2% of gross return, using the implementation's deterministic rounding rule;
- payout = gross return - fee.

Worked examples:

- 100 WOLO wins with 0 opposing -> gross 100, fee 2, payout 98.
- 100 WOLO wins with 50 matched -> gross 150, fee 3, payout 147.
- 100 WOLO wins with 100 matched -> gross 200, fee 4, payout 196.

Exact void refunds are fee-free.

### Fee split

Current code constants split betting-fee economics 50% to the Staker pool and
50% to the Community Treasury. Preserve that split unless a separately versioned
constitutional amendment changes it prospectively.
## Losing-side surplus candidate

A losing bettor's accepted stake is fully at risk even when winning-bettor
demand is smaller.

Recommended disposition order:

1. satisfy winning bettor FIFO matches one-for-one;
2. any unmatched losing-side surplus becomes a Winner Bounty candidate for the
   actual winning player/team rather than extra bettor profit;
3. result and recipient truth must be independently proven;
4. if recipient truth is unavailable, the bounty remains pending;
5. no surplus may silently disappear or be multiplied.

The exact Winner Bounty fee treatment remains a ratification item rather than
an implementation assumption.

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

## Required implementation invariants

Before Constitution V1 can become live financial behavior, implementation must
persist immutable phase identity, server acceptance time, deterministic FIFO
sequence, matched WOLO, fee basis, fee amount, constitutional version, unmatched
surplus and its disposition, exact proposition/result proof, and chain stake/payout
proof. Settlement retries must be idempotent and concurrency tests must prove that
two wagers cannot consume the same opposing liquidity.

Production activation also requires a reviewed migration/backfill policy for
open books only, full owning tests, certified release, and protected Wolo
settlement continuity. Settled historical books are never rewritten into V1.

## Open ratification items

The three isolated phase books, 2% current fee rate, exact void refund,
grandfathering, and chain-proof requirements are established product direction.
The following still require explicit ratification before implementation:

- strict one-for-one FIFO as the production matching algorithm;
- Winner Bounty treatment for unmatched losing-side surplus;
- exact Winner Bounty fee treatment;
- whether founder counter-liquidity must be a signed chain wager or may use a
  separately reserved and proven custody object;
- exact public wording for matched profit, unmatched principal, and fee previews;
- whether any future phase may use a different fee rate.

No implementation should guess these remaining policy choices.
