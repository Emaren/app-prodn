# AoE2WAR Bounty Board

## Product contract

`/bounties` answers what a warrior can do next. It combines operator-defined opportunities with the existing app claim, championship payout, and indexed WoloChain transfer rails.

An opportunity is not a payment promise. `available` and `in_progress` describe app workflow. `locked` describes an app-side amount awaiting payout. Only a verified payout transaction or indexed WoloChain transfer proves that WOLO moved.

## Surfaces

- `/bounties`: featured opportunity rail, full opportunity grid, current totals, AI advisor, and recent authoritative memo ledger.
- `/admin/bounties`: operator editor for status, reward display, eligibility, verification, action, priority, featured state, and an optional lifecycle memo.
- `POST /api/bounties/advisor`: signed-in Scribe answer grounded only in the current board and ledger.

## Evidence model

- `BountyOpportunity` is the current app-owned definition.
- `BountyEvent` is append-only. Database triggers block update, delete, and
  truncate; corrections are new superseding events.
- Existing `PendingWoloClaim` rows contribute pending, paid, rescinded, and failure state for known bounty claim kinds.
- Existing `TrophyPayout` rows contribute championship reward state.
- Existing `WoloIndexedTransfer` rows with reward/bounty/trophy/artifact/belt memos contribute real indexed chain proof.

Ledger rows with the same tx/amount/memo identity are deduplicated for presentation. Missing tx proof is displayed explicitly. The board never calls app-side wager recording on-chain escrow.

## Initial opportunities

The migration seeds eighteen action definitions spanning replay recovery, Watcher installation, eligible wallet-backed wagers, Academy, forum/Chronicle contributions, belt and artifact challenges, Nations, clans, and Marketplace creation. Reward amounts default to unpublished so the product does not invent economics.

## Operator rules

- Never mark a row paid merely because a reward is expected.
- Preserve the complete event memo, failure breadcrumb, and tx hash when present.
- Use a new event to correct history; do not mutate the event ledger.
- WoloChain remains settlement and denom truth.
