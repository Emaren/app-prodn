# WOLO Mainnet Settlement App Runbook

This is the AoE2HDBets-side runbook only. WoloChain owns the chain service,
keys, signer funding, and settlement truth.

## Current mainnet service shape

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
status-room totals. Operational reserve funding remains visible in the public
ledger as `RESERVE` / `Admin operational funding`, but it is excluded from
those calculations.

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
confirmed liability = memo-filtered mainnet staking positions
actual reserve headroom = staking wallet chain balance - confirmed liability
required balance = confirmed liability + reserve target
healthy = chain balance >= required balance
```

Verify the live calculation without an admin session:

```bash
curl -sS https://aoe2war.com/api/staking/config | jq '.operatorFunding'
```

Repeated transfer-index scans are safe: the transaction hash/index remains
the unique storage key, and the memo classifier is reapplied on every liability
derivation. Existing reserve transfers therefore reclassify without deleting
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
