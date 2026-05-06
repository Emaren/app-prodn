# Scheduled Match Escrow Settlements

AoE2HDBets owns the app-side Challenge escrow settlement decision. WoloChain remains the chain rail for sending WOLO and proving tx hashes.

## What Is Settled Here

The scheduled-match executor only handles funded Challenge escrow rows from `scheduled_matches`.

- `canceled`: refund each funded participant their `wagerAmountWolo + guaranteeAmountWolo`.
- `double_no_show`: refund each funded participant their wager; route funded guarantees to Community Treasury.
- `no_show_left`: refund the left/challenger wager, refund the right/challenged wager plus guarantee, and route the left/challenger guarantee to Community Treasury.
- `no_show_right`: refund the right/challenged wager, refund the left/challenger wager plus guarantee, and route the right/challenged guarantee to Community Treasury.
- `completed`: review-only until winner payout logic is explicitly wired for scheduled matches.

This is Challenge escrow settlement, not staking.

## Ledger

Durable transfer state lives in `scheduled_match_settlements`.

Each row records:

- `scheduled_match_id`
- `status`
- `action`
- `recipient_address`
- `amount_wolo`
- `request_id`
- `source_wallet_address`
- `tx_hash`
- `error_detail`
- `created_at`, `updated_at`, `executed_at`

The database enforces one row per scheduled match/action/recipient/amount, plus a unique settlement `request_id`, so repeated clicks cannot create duplicate ledger rows. The WoloChain grouped settlement run also uses deterministic request ids for chain-side idempotency.

## Operator Flow

Dry-run all current scheduled-match liabilities:

```bash
GET /api/admin/wolochain/scheduled-settlements?dryRun=1
```

Dry-run the known live backfill rows:

```bash
GET /api/admin/wolochain/scheduled-settlements?dryRun=1&ids=17,18,19,12
```

Execute one match after reviewing the plan:

```bash
POST /api/admin/wolochain/scheduled-settlements/:id/execute
```

Execution is admin-only, records `refund_sent`, `guarantee_forfeited_to_treasury`, `scheduled_settlement_completed`, and `scheduled_settlement_failed` activity rows, and refuses execution when funding, recipients, or settlement config are missing.

## Current Backfill Targets

- `#17`: canceled; refund Emaren `65 WOLO`.
- `#18`: canceled; refund Emaren `1,030 WOLO`.
- `#19`: double no-show; refund Emaren `15 WOLO`, refund Jim `15 WOLO`, send `20 WOLO` total guarantees to Community Treasury.
- `#12`: no-show left; refund Julio Alvarez `1,000 WOLO`, refund Emaren `1,010 WOLO`, send Julio Alvarez's `10 WOLO` guarantee to Community Treasury.

Migration does not execute these. An operator must review the dry-run and click/POST execute per match.
