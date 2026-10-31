---
id: "aoe2war.app-prodn.docs-scheduled-match-settlements"
title: "Scheduled Match Escrow Settlements"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-31"
review_interval_days: 30
sensitivity: "restricted"
---

# Scheduled Match Escrow Settlements

Independent financial implementation re-review: 2026-10-31, Session B, exact F/D integration source b13a4a91d37a93ac2300dab7927544f374469101. This is source evidence, not live HEL1/8092 escrow or balance attestation.

New `championship_v2` Challenges follow the
[Belt Constitution](./CHAMPIONSHIP_BELT_CONSTITUTION.md). Team funding uses
stable paired ScheduledMatch financial legs beneath one parent title defense,
with each participant signing their own original left/right CID/SID contract.
Each winning roster seat receives its paired two-warrior wager purse **only when both escrow deposits are independently proven matched at or before the Watcher-confirmed game start**. Later deposits cannot retroactively fund a winner payout; unmatched funding remains a refund liability. A title
default is not a played result and uses refunds, not fabricated winner payouts.
For championship_v2, allowed wagers are exactly **0 or 100 WOLO per warrior** with **0 WOLO Match Guarantee**; zero-wager play requires no deposit. Positive-guarantee no-show rules below are legacy scheduled-match rules, NOT V2 charges.
Every leg stays on this existing proof/settlement ledger; public cards show one
aggregate Challenge and never call payments/refunds complete before tx proof.

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
- `no_show_left`: refund both wagers, return the right/challenged guarantee, and award the left/challenger missed guarantee to the right/challenged player who checked in.
- `no_show_right`: refund both wagers, return the left/challenger guarantee, and award the right/challenged missed guarantee to the left/challenger player who checked in.
- `completed`: if both deposits were matched, return funded guarantees and award the two wagers to the verified winner. For championship_v2 both deposits must be genuine before the Watcher start; missing, unmatched or late deposits receive **full refunds for each actually funded side**, not a winner payout. Zero-wager V2 creates no transfer.

Title custody is separate from WOLO settlement. In the legacy protocol only an explicitly selected title
is attached to a scheduled challenge. Verified watcher/replay proof records the
winner and proposes a title disposition, but custody and dethrone bounty state do
not move until the commissioner settles or vetoes the review. Chain-backed title
custody remains a chain intent. Artifacts attach to the proof rail but stop
at `commissioner_review` until their configured metric is verified; match winner
alone is not artifact proof.

This is Challenge escrow settlement, not staking.

## Desync safety gate

A current human-confirmed desync blocks the `completed` winner-transfer branch.
It also blocks ordinary winner-market payouts and title/belt/artifact custody at
their own server call sites. The commissioner must append either a rematch or a
void/refund disposition; a rematch requires a distinct later `GameStats` record.
The void/refund action may enter the canceled refund branch, but is described as
paid only after the existing ledger and WoloChain proof record successful
execution. See [Human-Confirmed Desync Protocol](./DESYNC_INCIDENT_PROTOCOL.md).

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

Dry-run the historical named backfill cohort when verifying legacy settlement state:

```bash
GET /api/admin/wolochain/scheduled-settlements?dryRun=1&ids=17,18,19,12
```

Execute one match after reviewing the plan:

```bash
POST /api/admin/wolochain/scheduled-settlements/:id/execute
```

Execution is admin-only, records `refund_sent`, `guarantee_awarded`, `guarantee_forfeited_to_treasury`, `wager_awarded`, `scheduled_settlement_completed`, and `scheduled_settlement_failed` activity rows, and refuses execution when funding, recipients, settlement config, or Bet Escrow signer verification are missing.

## Historical named backfill cohort

- `#17`: canceled; refund Emaren `65 WOLO`.
- `#18`: canceled; refund Emaren `1,030 WOLO`.
- `#19`: double no-show; refund Emaren `15 WOLO`, refund Jim `15 WOLO`, send `20 WOLO` total guarantees to Community Treasury.
- `#12`: historical recorded example — no-show left; refund Julio Alvarez `1,000 WOLO`, refund Emaren `1,010 WOLO`, route Julio Alvarez's `10 WOLO` guarantee to Community Treasury. **REVIEW REQUIRED:** the historical treasury instruction conflicts with the CURRENT `buildRawTransfers` no_show_left branch, which awards the missed-side funded guarantee to the funded right-side participant and returns that side's own guarantee. Do NOT execute this example or assume it already paid. Inspect immutable source-version, funding, recipient and actual transaction proof before any backfill.

This list is preserved as the original named backfill cohort, not as a live claim that
those liabilities are still outstanding. Current settlement truth must come from the
admin dry-run, persisted settlement rows, and WoloChain transaction proof.

Migrations do not execute WOLO transfers. Any still-unsettled row requires an
operator-reviewed dry-run before execution.

## October 31, 2026 independent review evidence

This review inspected actual source at F/D integration
`b13a4a91d37a93ac2300dab7927544f374469101`, not a live escrow state.
`lib/scheduledMatchSettlements.ts` includes `championshipWagerMatchedAtStart`,
`buildRawTransfers`, source-allocations and transfer identity accounting.
`lib/championshipChallenges.ts` creates paired V2 legs with
`guaranteeAmountWolo: 0`; `docs/CHAMPIONSHIP_BELT_CONSTITUTION.md`
fixes V2 financial terms. `lib/woloBetSettlement.ts` gates 8092
escrow execution by signer and health, not by an accepted response alone.
Current settlement/UNKNOWN, fees, source custody and historical #12 bank truth
require actual signed native evidence. **Never run an execution POST or
funded transfer merely to satisfy documentation review.**
