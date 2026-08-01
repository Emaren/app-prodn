---
id: "aoe2war.app-prodn.docs-bet-stake-tickets"
title: "Manual Bet Stake Tickets"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "financial-domain-contract"
reviewed_at: "2026-08-01"
review_interval_days: 30
sensitivity: "internal"
---

# Manual Bet Stake Tickets

## Contract

A manual ticket represents one verified WoloChain transfer funding:

- exactly one competitive winner proposition; and
- optionally, the explicitly attached Desync `NO`/`YES` proposition for the
  same battle.

The two legs remain separate markets and settle independently. They share only
the custody proof. A ticket transaction hash lives on `BetStakeTicket`; each
`BetWager` points through `BetStakeLeg` and intentionally leaves its legacy
`stake_tx_hash` null. Public pools, settlement, proof links, and activity count
the leg only after the whole ticket reaches `recorded`.

User transaction history, player profiles, War Chest, lobby earners, staking
volume/reward accounting, market detail, replay financial-authority snapshots,
and `/admin/user-list` all resolve that effective proof through the ticket.
`/admin/wolo-transactions` renders one aggregate ticket row, including stuck,
suspect, or orphaned tickets, instead of duplicating one transfer per leg.

The exact transfer memo is:

```text
AoE2HDBets bet ticket v1 · ticket <ticket-id>
```

WoloChain verification must prove successful final execution, the connected
sender, configured Bet Escrow recipient, exact combined amount, `uwolo` denom,
and exact memo. One transfer cannot be claimed by both the legacy stake-intent
rail and the ticket rail. Both writers take the same transaction-scoped
PostgreSQL advisory lock and re-check the other rail before binding a hash.

## API

Prepare an immutable ticket:

```text
POST /api/bets/tickets
```

The request carries `version=1`, a per-attempt `clientRequestId`, connected
wallet metadata, the exact combined total, and one or two market/side/amount
legs. Reusing the request ID with identical immutable input is a no-op; reusing
it with different input is a conflict.

After Keplr signs one transfer, record it with:

```text
POST /api/bets/tickets/<ticket-id>/commit
```

Recovery uses the same domain operation:

```text
POST /api/bets/tickets/<ticket-id>/recover
```

Both accept `stakeTxHash` and the ticket wallet. The server persists broadcast
identity before remote proof verification, freezes every proposition hash,
locks markets in stable ID order, and creates every wager plus the recorded
ticket in one database transaction. Partial leg creation is never valid.

Preparation also locks every selected market row before the final preflight and
immutable-leg insert. That prevents cleanup, challenge-shadow merging, or a
second browser tab from invalidating the ticket after the user is invited to
sign. A fresh unsigned opposite-side ticket for the same wallet is treated as a
real pending commitment for 15 minutes.

Commit takes the ticket advisory lock and reloads its immutable leg snapshot
after chain verification. If a challenge merge moved either leg while the
remote transaction was being verified, commit fails closed before creating any
wager. Recovery then reloads the canonical markets and safely retries against
the same chain transfer. Public browser requests are always recorded as
`source=manual`; `auto` and `ai` attribution is reserved for future internal
workers. The preserved single-market stake-intent endpoint takes the same
market row lock and recognizes fresh unsigned tickets, while ticket preparation
recognizes fresh unsigned legacy intents. Switching among B, A, and E therefore
cannot invite two opposite-side wallet signatures for the same wallet/market.

Legacy broadcast binding is immutable too. The server locks the stake-intent
identity before the candidate transfer, refuses to replace an existing hash,
and checks tickets, wagers, and other intents under the shared transfer lock.
An idempotent retry may reuse the same hash for the same intent, but it cannot
rewrite recorded wallet metadata or regress a verified/recorded lifecycle.

The board exposes unresolved tickets to their owner. For 24 hours the server
also scans escrow deposits for the exact wallet, amount, and ticket memo, so a
transaction that landed while the browser lost its response can be recovered.
Unverified, suspect, or orphaned tickets never enter pools or settlement.

Set `BET_STAKE_TICKETS_ENABLED=false` to fail the additive ticket endpoints
closed. Legacy one-market stake-intent and wager endpoints remain available.

## Desync parent lifecycle

Every Desync market has an explicit nullable `parent_market_id` pointing to its
winner market. Runtime reconciliation backfills deterministic legacy links,
and the migration repairs an open child whose parent was voided or historically
settled without a winner. Public board queries hide a Desync proposition unless
its explicit parent is coherent for the requested lifecycle.

A no-stake winner market now expires as `voided`, not `settled` with a null
winner. This prevents a live orphan Desync book from surviving a terminal
competitive proposition.

## Founder request safety

Founder Bonus/Win creation accepts `requestId` or the `Idempotency-Key` header.
The creator/request pair is unique. Identical retries return the original row
and safely resume settlement; a conflicting payload returns `409`. A new
request ID intentionally creates another stackable reward.

## Deployment

Apply Prisma migrations before restarting the web service. The ticket migration
must precede the auto-bet migration because `BetAutoExecution.ticket_id`
references `bet_stake_tickets`.

No WoloChain consensus upgrade is required for manual tickets. The existing
escrow verification rail already verifies arbitrary exact memo and amount
pairs. Do not rebuild or replace the deliberately pinned `wolo-1` consensus
binary for this app migration.
