# Staking Treasury Payouts

The staking Treasury share is accounting-only until an operator executes a payout.
`staking_reward_distributions.treasury_pool_wolo` records the amount owed to the
Community Treasury for each finalized distribution.

## Source and recipient

- Source signer: Bet Payout / generic payout rail (`WOLO_BET_PAYOUT_ADDRESS`)
- Recipient: Community Treasury (`WOLO_COMMUNITY_TREASURY_ADDRESS`)
- Settlement helper: `validateWoloSettlementRun` / `executeWoloSettlementRun`

This rail is intentionally separate from scheduled-match escrow settlement and
from player claim payout bookkeeping.

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
remain retryable after operator review.

Migrations do not execute WOLO transfers. Existing finalized distributions with
Treasury pools backfill as `UNPAID`.
