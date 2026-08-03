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
reviewed_at: "2026-08-03"
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
been frozen but whose payout does not yet carry transaction proof. `paid` is
derived only from a canonical or explicitly admitted legacy bounty payout with a
transaction hash.

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

## Admitted legacy history

A legacy `PendingWoloClaim` row may appear publicly only when all of these are
true:

- `claim_kind = winner_bounty`;
- `status = claimed`;
- `claimed_by_user_id` identifies a real site account;
- `payout_tx_hash` exists;
- the row has not been rescinded.

The following remain preserved in the admin legacy audit but are excluded from
public bounty counts and earnings:

- `founders_bonus`;
- `founders_win`;
- championship `daily_tribute` and ordinary trophy payouts;
- betting, staking, refund, gift, and Marketplace transfers;
- generic indexed transfers matched only because a memo contains bounty,
  reward, trophy, belt, or artifact.

Memo text is never a substitute for stable warrior identity.

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
