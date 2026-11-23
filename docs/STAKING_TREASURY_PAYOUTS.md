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
reviewed_at: "2026-11-23"
review_interval_days: 30
sensitivity: "restricted"
---

# Staking Treasury Payouts

**2026-10-23 source review (bounded, FINANCIAL HOLD):** Rechecked the tracked `lib/stakingTreasuryPayouts.ts`, `lib/woloBetSettlement.ts`, and the admin treasury payout route in app `main` `8f2f3b45`. This is a description of the existing gated runbook, **not** operator approval, reconciled bank finality, proof of sufficient reserves, or authority to invoke a payout. WoloChain issue #5 remains under a separate financial-release hold; do not execute or retry unresolved transfers from this documentation review.

The staking Treasury share is accounting-only until an operator executes a payout.
`staking_reward_distributions.treasury_pool_wolo` records the amount owed to the
Community Treasury for each finalized distribution.

## Source and recipient

- Source signer: fresh mainnet Bet Payout signer (`WOLO_BET_PAYOUT_ADDRESS=wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu`) after 8092 health is green
- Recipient: Community Treasury (`WOLO_COMMUNITY_TREASURY_ADDRESS`)
- Settlement helper: `validateWoloSettlementRun` / `executeWoloSettlementRun`

This rail is intentionally separate from scheduled-match escrow settlement and
from player claim payout bookkeeping.

Mainnet execution is gated on the WoloChain settlement service at
`http://127.0.0.1:8092` reporting `ok=true` and `chain_id=wolo-1` from
`/settlement/v1/health`. If health reports `PAYOUT_FEE_HEADROOM_TOO_LOW`,
`ESCROW_BALANCE_TOO_LOW`, or any non-ok state, AoE2HDBets must keep this as a
blocked dry-run and must not retry against `127.0.0.1:8091`.

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
remain eligible for separate financial-authority adjudication after operator review; they are NOT approved for retry while the financial gates remain HOLD.

The execute route always performs grouped dry-run validation first. A failed or
unavailable dry-run stops execution before any live payout request is sent.

Migrations do not execute WOLO transfers. Existing finalized distributions with
Treasury pools backfill as `UNPAID`.

## 2026-11-23 substantive finance-HOLD and payout-source review

The complete operator flow, signer source, health endpoint, deterministic request ID, idempotent settlement, ledger fields and dry-run gate were re-read against unchanged PR #1486 blobs `lib/stakingTreasuryPayouts.ts` **`1884aee985e77b0593f531290d53c36d5a5bc4a1`** and `lib/woloBetSettlement.ts` **`29792712b99ab87bd28cc6119655699334b87fee`**, plus the tracked admin treasury route. The source still performs `validateWoloSettlementRun` and requires verified signer and an approved dry-run before `executeWoloSettlementRun`; application idempotency and no recorded transaction hash do **not** certify reserve coverage, bank/chain finality or make an unsuccessful payout safe to retry unattended.

**Current operational override: FINANCIAL HARD HOLD.** Fresh HEL1 listener proof at **2026-11-23 17:14:56 UTC** confirms ports **8092, 8093, 8094 and 8095 all CLOSED**. The earlier runbook's executable GET/POST and “after 8092 health is green” steps are **interface documentation only**, expressly **NOT executable operator instructions under today's release state**. C04/C08 governance closures do not override the open C01/C02/C03/C05/C06/C07/C09 financial gates or establish signer custody, payout reserves, signed reviewer/canary authority or a production settlement writer. Do not start 8092, unmask financial services, grant SELECT/WRITE, issue WOLO, create/retry payout requests or invoke the POST from this document renewal. Old economic rows and payout bookkeeping remain unverified until separately authorized financial admission; this DocsV2 review is not a human financial signature.
