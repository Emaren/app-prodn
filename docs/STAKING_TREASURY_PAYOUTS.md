---
id: "aoe2war.app-prodn.docs-staking-treasury-payouts"
title: "Staking Treasury Payouts"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-22"
review_interval_days: 30
sensitivity: "restricted"
---

# Staking Treasury Payouts

The staking Treasury share is accounting-only until an operator executes a payout.
`staking_reward_distributions.treasury_pool_wolo` records the amount owed to the
Community Treasury for each finalized distribution.

## Source and recipient

- Source signer: configured Staking Distribution Reserve role (`WOLO_BET_PAYOUT_ADDRESS`); verify the actual independently approved runtime identity before execution.
- Recipient: Community Treasury (`WOLO_COMMUNITY_TREASURY_ADDRESS`)
- Settlement helper: `validateWoloSettlementRun` / `executeWoloSettlementRun`

This rail is intentionally separate from scheduled-match escrow settlement and
from player claim payout bookkeeping.

Mainnet execution is gated on the WoloChain settlement service at
`http://127.0.0.1:8092` reporting `ok=true` and `chain_id=wolo-1` from
`/settlement/v1/health`. If health reports `PAYOUT_FEE_HEADROOM_TOO_LOW`,
`ESCROW_BALANCE_TOO_LOW`, or any non-ok state, AoE2HDBets must keep this as a
blocked dry-run and must not retry against `127.0.0.1:8091`.

Green service health and a successful dry-run are technical preconditions only.
They do not close WoloChain issue #5, establish global solvency, or authorize
financial execution while its release HOLD remains active.

## Bookkeeping

Each `staking_reward_distributions` row tracks:

- `treasury_payout_status`
- `treasury_payout_request_id`
- `treasury_payout_tx_hash`
- `treasury_payout_attempted_at`
- `treasury_payout_executed_at`
- `treasury_payout_error`

The request id is deterministic:

```text
aoe2-staking-treasury-YYYY-MM-DD:community
```

## Operator flow

Dry-run:

```bash
GET /api/admin/wolochain/staking-treasury-payouts?dryRun=1
```

Execute one distribution:

```bash
POST /api/admin/wolochain/staking-treasury-payouts/:id/execute
```

Execution is idempotent at the app ledger and settlement request-id layers. A
distribution with a recorded Treasury tx hash is refused on retry. Failed rows
must not be retried merely because their status is `FAILED`. The current legacy
exception path can record `FAILED` without conclusive chain outcome; stale
`PROCESSING` and absent hashes are also uncertain. Independently reconcile the
original deterministic request and chain outcome, then obtain explicit operator
review before any separately authorized recovery. Never infer an unpaid
obligation or create a fresh request identity from missing evidence.

The execute route always performs grouped dry-run validation first. A failed or
unavailable dry-run stops execution before any live payout request is sent.

Migrations do not execute WOLO transfers. Existing finalized distributions with
Treasury pools backfill as `UNPAID`.
