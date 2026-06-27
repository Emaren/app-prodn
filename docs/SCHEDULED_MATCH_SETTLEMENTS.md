# Scheduled Match Escrow Settlements

Last updated: 2026-06-27

AoE2HDBets owns the app-side Challenge escrow settlement decision. WoloChain remains the chain rail for sending WOLO and proving tx hashes.

Scheduled-match settlement runs must use the WoloChain grouped settlement rail with `signer_role=escrow`. The source signer is the fresh mainnet Bet Escrow signer (`WOLO_BET_ESCROW_ADDRESS=wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p`), not the normal payout signer.

## Signed Funding Flow

The public `/challenge` composer has Basic, Advanced, and Extreme views. Extreme
is the default and is the smart-default presentation; these views do not change
the underlying funding contract.

Every funded participant signs one real WoloChain bank transfer to the canonical
Bet Escrow address. The memo uses the WoloChain challenge contract:

```text
wolo.challenge.funding.v1:app=aoe2hdbets&sid=aoe2hdbets:challenge-<id>:v1&cid=<id>&side=<left|right>&w=<uwolo>&g=<uwolo>&t=<uwolo>
```

The app records funding only after the WoloChain challenge verification endpoint
confirms the tx hash, sender, escrow recipient, total, wager bucket, guarantee
bucket, participant side, challenge id, and settlement run id. A funding tx hash
already attached to another scheduled match is rejected.

The browser receives the escrow address from the server-rendered challenge
snapshot. Production no longer depends on a public env value being present at
Next.js build time. When `WOLO_BET_ESCROW_ADDRESS` is configured it is canonical
for both betting and challenge deposits; an older separate challenge address
must not override the signer-backed escrow rail.

WoloChain proof routes used by the app:

- `GET /settlement/v1/challenges/funding/txs/:txHash`
- `GET /settlement/v1/challenges/funding/deposits`
- direct WOLO REST verification is allowed only as the fallback when no
  settlement service is configured

On mainnet, grouped settlement can execute only through `http://127.0.0.1:8092`
after `/settlement/v1/health` reports `ok=true` and `chain_id=wolo-1`. If health
reports `PAYOUT_FEE_HEADROOM_TOO_LOW`, `ESCROW_BALANCE_TOO_LOW`, or any other
non-ok state, the app should surface a blocked dry-run and must not retry
against `127.0.0.1:8091`.

## What Is Settled Here

The scheduled-match executor only handles funded Challenge escrow rows from `scheduled_matches`.

- `canceled`: refund each funded participant their `wagerAmountWolo + guaranteeAmountWolo`.
- `double_no_show`: refund each funded participant their wager; route funded guarantees to Community Treasury.
- `no_show_left`: refund the left/challenger wager, refund the right/challenged wager plus guarantee, and route the left/challenger guarantee to Community Treasury.
- `no_show_right`: refund the right/challenged wager, refund the left/challenger wager plus guarantee, and route the right/challenged guarantee to Community Treasury.
- `completed`: review-only until winner payout logic is explicitly wired for scheduled matches.

Title custody is separate from WOLO settlement. Eligible app-side belts held by
either participant are attached automatically when the match is scheduled. A
verified watcher/replay result transfers an `app_only` belt in the app custody
ledger and creates any dethrone bounty as a pending operator payout. Chain-backed
title custody remains a chain intent. Artifacts attach to the proof rail but stop
at `artifact_proof_review` until their configured metric is verified; match winner
alone is not artifact proof.

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

The database enforces one row per scheduled match/action/recipient/amount, plus a unique settlement `request_id`, so repeated clicks cannot create duplicate ledger rows. The WoloChain grouped settlement run also uses deterministic request ids for chain-side idempotency and records the signer role so escrow-signed runs cannot be confused with payout-signed runs.

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

Execution is admin-only, records `refund_sent`, `guarantee_forfeited_to_treasury`, `scheduled_settlement_completed`, and `scheduled_settlement_failed` activity rows, and refuses execution when funding, recipients, settlement config, or Bet Escrow signer verification are missing.

## Current Backfill Targets

- `#17`: canceled; refund Emaren `65 WOLO`.
- `#18`: canceled; refund Emaren `1,030 WOLO`.
- `#19`: double no-show; refund Emaren `15 WOLO`, refund Jim `15 WOLO`, send `20 WOLO` total guarantees to Community Treasury.
- `#12`: no-show left; refund Julio Alvarez `1,000 WOLO`, refund Emaren `1,010 WOLO`, send Julio Alvarez's `10 WOLO` guarantee to Community Treasury.

Migration does not execute these. An operator must review the dry-run and click/POST execute per match.
