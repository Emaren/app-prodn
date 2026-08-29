---
id: "aoe2war.app-prodn.docs-wolo-mainnet-settlement-runbook"
title: "WOLO Mainnet Settlement App Runbook"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-08-28"
review_interval_days: 30
sensitivity: "restricted"
---

# WOLO Mainnet Settlement App Runbook

This is the AoE2HDBets-side runbook only. WoloChain owns the chain service,
keys, signer funding, and settlement truth.

Review note (2026-08-28): the app-side signer-role separation, health gate,
financial containment, and settlement call paths were re-reviewed against the
current implementation and financial regression suite. Commit identities,
binary hashes, balances, and inventory counts below are preserved as dated
2026-07-26/29 evidence only. Before any operation, read current truth with
`aoe2war status`, `aoe2war audit`, and `aoe2war doctor`; never make the running
node binary equal the checkout without a separately proven chain-upgrade plan.

## Mainnet service shape and dated evidence

### Verified source and binary split — 2026-07-26

- active checkout: `/var/www/WoloChain-wolo-1`, branch `wolo-1-mainnet-prep`, clean at `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`;
- mainnet node service: `wolochaind-mainnet.service`;
- node executable: `/usr/local/bin/wolochaind-mainnet-node-prewartrophy`, commit `d3bd62414a047a492a3814b7d3baa2717d64db2e`, SHA-256 `4b77f622191db7550cb87cafb8f1886a0aadebee3eb6565f9f90036f809e61d3`;
- Bet settlement service: `wolochain-mainnet-settlement.service`, loopback port `8092`;
- Founder Rewards settlement service: `wolochain-founder-rewards-settlement.service`, loopback port `8093`;
- settlement executable: `/usr/local/bin/wolochaind-mainnet`, commit `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`, SHA-256 `f0e199b8988ced2cbbd6e899406f550280b6da548cf2be340456ea8d818b01b0`.

The consensus node is deliberately pinned to the pre-War-Trophy binary while settlement uses the newer isolated-market binary. Treat this as an intentional compatibility boundary. Never replace the node executable merely to make its commit equal the source checkout.

At inspection, `wolo-1` was synchronized (`catching_up=false`). Bet settlement reported approximately 499,955.25 WOLO payout balance and 522,045.75 WOLO escrow balance against 250,000 and 100 WOLO minimums. Founder Rewards settlement reported approximately 364,837.24 WOLO payout balance against a 1,000 WOLO minimum. Both services were loopback-only with auth tokens configured.

The 2026-07-29 reliability check again found all three Wolo services active,
`wolo-1` synchronized, and both settlement health endpoints green. The Bet
service reported 499,948.75 WOLO payout balance and 522,508 WOLO escrow
balance; Founder Rewards reported 364,651.991424 WOLO. This app release
therefore does not authorize or require a consensus upgrade. Preserve the
intentional node/settlement binary split unless a separate coordinated
chain-upgrade plan proves otherwise.


- Settlement URL: `http://127.0.0.1:8092`
- Chain ID: `wolo-1`
- Bet Payout signer: `wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu`
- Bet Escrow signer: `wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p`
- Community Treasury: `wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2`

`127.0.0.1:8091` is wolo-testnet. Do not use it for mainnet payout, staking
reward, Treasury, escrow, or admin retry paths.

## Cutover gate

Keep these unset in `/etc/aoe2hdbets/aoe2hdbets-web.env` until WoloChain
settlement health is green:

```bash
WOLO_SETTLEMENT_URL=http://127.0.0.1:8092
WOLO_SETTLEMENT_AUTH_TOKEN=<copy from root-only WoloChain env>
WOLO_BET_PAYOUT_ADDRESS=wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu
WOLO_BET_ESCROW_ADDRESS=wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p
WOLO_COMMUNITY_TREASURY_ADDRESS=wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2
```

Health must report `ok=true` and `chain_id=wolo-1`:

```bash
curl -sS http://127.0.0.1:8092/settlement/v1/health
```

If health reports `PAYOUT_FEE_HEADROOM_TOO_LOW`, `ESCROW_BALANCE_TOO_LOW`, or
any non-ok status, AoE2HDBets should show a blocker and must not execute live
payouts.

AoE2HDBets health/capability surfaces must probe `GET /settlement/v1/health`.
Do not use an empty grouped-run validation request as a capability probe; a
zero-payout `runs/validate` call creates fake `INVALID_RUN` settlement noise.
Real payout dry-runs still use `validateWoloSettlementRun` with actual payout
items before execution.

The app keeps health diagnostics split by audience:

- Public `/bets`, `/war-chest`, and `/staking` copy should stay calm: `Settlement
  rail online`, `Settlement rail waiting for operator top-up`, or `Settlement
  status unavailable`.
- Admin/operator surfaces may show exact `chain_id`, `runtime_chain_id`, payout
  signer address/balance/minimum, escrow address/balance, `failure_code`, and
  raw detail.
- Staking reserve warnings are about the staking custody wallet and unstake
  rail, not the Bet Payout signer. Public copy should say `Staking wallet
  reserve top-up needed.` Admin copy can include the staking wallet address,
  current balance, confirmed liability, required balance, actual reserve
  headroom, reserve target, gap, and last checked time.

## Staking custody liability versus operating reserve

The staking wallet chain balance contains two different kinds of funds:

- confirmed user stake, including deposits made through the site Stake button;
- operator funding held only to keep unstake execution liquid.

Only confirmed user stake contributes to staking principal, staking weight,
auto-compound principal, withdrawable liability, leaderboard order, or staker
status-room totals. Current values come from the canonical app position; daily
reward weight and strict reconciliation replay the complete confirmed staking
event ledger across retired and current custody wallets. Raw indexed transfers
remain audit input and cannot independently create liability. Operational
reserve funding remains visible in the indexed audit trail as `RESERVE` /
`Admin operational funding`, but it is
excluded from those calculations and from the default public staking feed.
Admins can inspect it explicitly through the `Reserve/Admin` activity filter.

Unstake checks and confirmed-event finalization must use that same combined
mainnet liability. Finalization consumes direct principal before compounded
principal, records the combined balance before/after on the event, and marks a
position inactive only when both buckets are zero.

Use one of these canonical memos for a direct operational top-up:

```text
staking-wallet-reserve-top-up:<amount>wolo:<YYYYMMDD>
staking-wallet-operating-reserve-top-up:<amount>wolo:<YYYYMMDD>
```

The memo must come from a known operator/network account. A normal user cannot
escape staking liability by copying a reserve memo.

Do not use the site Stake button to repair the operating reserve. The Stake
button intentionally writes `AoE2HDBets staking deposit`; that is real stake
and remains a user liability even if an operator wallet signed it.

The production operating reserve target is:

```text
max(10,000 WOLO, configured unstake/settlement fee headroom)
```

The app derives the operator figures as:

```text
confirmed liability = canonical current staking positions
actual reserve headroom = staking wallet chain balance - confirmed liability
required balance = confirmed liability + reserve target
healthy = chain balance >= required balance
```

Verify the live calculation without an admin session:

```bash
curl -sS https://aoe2war.com/api/staking/config | jq '.operatorFunding'
```

Repeated transfer-index scans are safe: the transaction hash/index remains
the unique storage key, and indexed rows remain an audit source rather than the
current-liability authority. Existing reserve transfers therefore reclassify without deleting
or hiding their indexed ledger rows.

## App payout behavior

- Staker reward payouts use grouped `validateWoloSettlementRun` first, then
  execute only when the dry-run is ok.
- Community Treasury payout uses grouped `validateWoloSettlementRun` first, then
  execute only when the dry-run is ok and signer role/address are verified.
- Scheduled-match escrow settlement uses `signer_role=escrow` and refuses local
  payout-signer fallback.
- Pending claim retries should distinguish unresolved wallet identity from
  settlement service or signer unavailability.
- Team-market settlement must pass the immutable proposition/final-roster gate before any payout plan, betting fee, winner bounty, or founder bonus is created.
- Integrity corrections send only the exact unpaid void entitlement from the Bet Escrow signer that received the stake, never from the winner-payout reserve. The unique incident/wager memo and escrow sender are recovered from WoloChain before retry and must pass distinct-send validation before local rows become paid.
- A prior payout above the void entitlement is recorded as an incident overpayment. The app never auto-debits it; any return is a separate user-signed transaction.

## Deploy and backfill

After deploying code and running Prisma migrations, refresh the direct-transfer
index from mainnet start:

```bash
node scripts/backfill-wolo-mainnet-transfers.mjs --block-limit=5000000 --address-limit=400 --per-address-limit=5000 --global-limit=100000
```

Then verify:

```bash
curl -sS http://127.0.0.1:3030/api/wolo/mainnet-transfers?limit=50
curl -sS http://127.0.0.1:3030/api/wolo/holders?format=table
```

For `/profile`, sign in as the relevant user and confirm the Money in / money
out rail includes direct outgoing mainnet sends to Jim and Sniper after the
backfill completes.

The public network inventory uses chain supply as the canonical total and the
sum of named bank balances as a reconciliation subtotal:

```bash
curl -sS https://aoe2war.com/api/wolo/network | \
  jq '{totalSource,totalWolo,knownAddressTotalWolo,untrackedWolo,count}'
curl -sS 'https://aoe2war.com/api/wolo/network?format=table'
```

Never hard-code a fixed-supply display to conceal a missing address. The
2026-07-29 reconciliation identified
`wolo1m943tq5tuqf7ejucmac9knpls04jtmh3apzlrg` as the Workshop sponsorship
recipient, funded by two confirmed 100 WOLO transfers. It is separate from the
already-listed Emaren #2 player wallet, which independently holds 200 WOLO.
