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
