---
id: "aoe2war.app-prodn.docs-bounty-board"
title: "AoE2WAR Bounty Board"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-09-01"
review_interval_days: 90
sensitivity: "internal"
---

# AoE2WAR Bounty Board

## Product contract

`/bounties` answers two separate questions:

1. What exact deed and WOLO reward has the Kingdom published next?
2. Which identified warriors have actually received transaction-proven bounty payouts?

A bounty is a published WOLO offer for a defined deed with an eligibility rule,
a proof requirement, and an identifiable warrior or open claimant pool.

An opportunity is not a payment promise. `available` and `in_progress` describe
the public workflow. `locked` is derived from a canonical claim whose reward has
been frozen but whose payout does not yet carry transaction proof. Public paid
history is derived only from an indexed WoloChain transfer sent by an official
Kingdom bounty issuer whose immutable memo explicitly contains `Bounty #<number>`
and whose transaction hash and positive WOLO amount are present.

## Public surfaces

- `/bounties`: dynamic Hall roster, one real unclaimed warrior silhouette,
  current personal bounty, open contracts, verified bounty totals, AI advisor,
  and canonical bounty history.
- `/admin/bounties`: warrior next-bounty editor, open-contract editor, canonical
  claims, payout queue, and read-only legacy audit.
- `POST /api/bounties/advisor`: signed-in Scribe answer grounded only in the
  canonical public snapshot.

## Canonical evidence model

- `BountyOpportunity` owns the current published deed and may be assigned to one
  warrior.
- `BountyValuation` is append-only economic history. Changing WOLO closes the
  old valuation and creates a new valuation.
- `BountyClaim` freezes the warrior, recipient, evidence, and promised WOLO.
- `BountyPayout` owns settlement state. A public paid row requires payout
  status `paid` and a non-empty `tx_hash`.
- `BountyEvent` remains append-only operator chronology but does not manufacture
  public paid history.

## Canonical numbered history

The public historical ledger is the numbered sequence of explicit WoloChain
bounty transfers. Admission requires all of the following:

- the sender is one of the two audited Kingdom bounty issuer addresses;
- the immutable memo matches `Bounty #<positive integer>`;
- the transfer has a transaction hash;
- the transfer amount is positive;
- duplicate chain transfer identities are removed by transaction hash and
  transfer index.

Historical numbered bounties through public Bounty #50 retain the established
canonical chronology that closed early written-number gaps caused by non-bounty
automatic rewards. That published history is frozen.

Beginning with written Bounty #51, the explicit number in an admitted official
on-chain memo is authoritative. A later transfer for Bounty #51 remains #51 even
when Bounty #52 was transferred earlier, and Bounty #52 must never be shifted to
#53 merely because transfer chronology differs from bounty sequence.

Bounty-specific views order the explicit-number era by canonical bounty number,
while raw wallet/chain ledgers remain free to show literal transfer chronology.
The next public bounty number is one greater than the highest canonical admitted
number, not one greater than the number of admitted rows.

The following are bonuses, not bounties, and remain excluded from public bounty
counts, history, numbering, and warrior bounty earnings:

- `winner_bounty`;
- `founders_bonus`;
- `founders_win`;
- championship tribute and ordinary trophy payouts;
- generic transfers whose memo merely contains the word `bounty`;
- pending or accepted profile gifts;
- betting, staking, refund, Marketplace, and automatic settlement bonuses.

The admin audit preserves the original database and chain records without
rewriting them.

## Hall roster

Every claimed public-player entry with an active featured avatar enters the Hall
automatically. The public request also selects exactly one real unclaimed replay
identity with battle history and presents it as `Unclaimed Warrior`.

A fresh dynamic page request chooses the initial spotlight. The client rotates
one warrior at a restrained interval, pauses for hover/focus/touch/manual input
or hidden tabs, respects reduced motion, and renders only the five positional
warriors surrounding the active card.

## Operator rules

- Administrators may set opportunity state to `available`, `in_progress`, or
  `historical`.
- Administrators cannot type `paid` or `locked` into existence.
- A published WOLO amount requires an operator reason whenever it is created, changed, or withdrawn.
- Existing claim reward snapshots never change when a later valuation changes.
- Use new append-only evidence to correct history; do not rewrite old economic
  truth.
- WoloChain remains settlement and denomination authority.
