# app-prodn Deploy

## Production truth

- VPS repo path: `/var/www/AoE2HDBets/app-prodn`
- service: `aoe2hdbets-web.service`
- public domain: `https://aoe2war.com`
- bind: `127.0.0.1:3030`
- service user: `tony`
- preferred SSH alias from MBP: `hel1`

## Current systemd behavior

Base unit:

- `/etc/systemd/system/aoe2hdbets-web.service`

Restart tuning drop-in:

- `/etc/systemd/system/aoe2hdbets-web.service.d/restart-tuning.conf`

Current restart tuning:

- `KillSignal=SIGKILL`
- `KillMode=process`
- `TimeoutStopSec=2`
- `SuccessExitStatus=9 SIGKILL`

This exists because normal Next shutdowns were hanging and making deploys flaky.

## Standard deploy flow

From MBP:

```bash
git -C /Users/tonyblum/projects/AoE2HDBets/app-prodn push origin main
```

On VPS:

```bash
ssh hel1
cd /var/www/AoE2HDBets/app-prodn
git status --short
git pull --ff-only origin main
npx prisma migrate deploy
npm run build
```

Then restart as root:

```bash
sudo systemctl restart aoe2hdbets-web.service
systemctl is-active aoe2hdbets-web.service
journalctl -u aoe2hdbets-web.service -n 40 --no-pager
```

## Recent deployment notes

### 2026-06-19 lobby view-width and mobile rail pass

- Restored mode-owned lobby widths: Basic `65rem`, Advanced `75rem`, and default Extreme `96rem`.
- Kept Extreme as the full-width power-user composition while making its leaderboard and War Chest internally scrollable.
- Increased the Extreme desktop War Chest rail to preview roughly nine earners and constrained the mobile War Chest to a viewport-sized scroll frame.
- Rebuilt the Wolomania lobby promo for narrow screens and hardened mobile wrapping on the installed app WOLO ledger and profile holding cards.
- Removed the redundant mid-page lobby broadcast theater and its dead component; `/watch` and shared stream/player components remain unchanged.
- No database migration is required for this release.

### 2026-06-18 premium AOE2WAR navigation shell

- Replaced the global theme-circle row with the AOE2WAR wordmark; the logo links to `/`, while theme and tile appearance controls remain on `/profile`.
- Added route-aware page headings across the shared shell.
- Added `/kingdom` to the castle dropdown and made the desktop menu hover/focus traversable without requiring a click to hold it open.
- Moved mobile castle and account surfaces into document-level sheets so blurred header stacking contexts cannot clip them.
- Refined the mobile top command rail and bottom quick-command navigation.
- No database migration is required for this release.

### 2026-05-30 Advanced lobby arena and live ticker

- Added `live_ticker_messages` for admin-managed text ticker messages.
- `/lobby` defaults to Advanced view with a moving header ticker, Watch & Chat hero/comments rail, compact hero bet slip, compact WOLO swap tile, then the existing Community Lobby content.
- Basic view remains available and should preserve the simpler lobby-first layout.
- Deployment requires `npx prisma migrate deploy` before restarting `aoe2hdbets-web.service`.
- Optional market display env: `WOLO_OSMOSIS_POOL_ID=3461`, `WOLO_OSMOSIS_POOL_URL=https://app.osmosis.zone/pool/3461`, `WOLO_OSMOSIS_LCD_URL=https://lcd.osmosis.zone`, `WOLO_MARKET_LABEL=WOLO Market`. Leave `WOLO_USD_PRICE` unset to derive the Advanced lobby market price from pool 3461; set it only as a manual override.
- `wolo-1` is strict mainnet mode: `/bets` requires a Keplr-signed stake tx, and mainnet-facing WOLO/bet rails hide pre-mainnet testnet-era rows. Optional display cutoff: `WOLO_MAINNET_DISPLAY_START_AT=2026-05-25T00:00:00.000Z`.

### 2026-05-05 watcher telemetry and funnel truth

- Added `watcher_client_events` for Electron watcher runtime telemetry.
- Admin watcher rail now treats `/download/watcher/*` rows as noisy package pulls, not confirmed users.
- Confirmed watcher users come from linked watcher client events plus the historical `game_stats.parse_source in ('watcher_live', 'watcher_final')` fallback.
- Deployment requires `npx prisma migrate deploy` before restarting `aoe2hdbets-web.service`.
- Watcher package artifacts should be rebuilt/synced before claiming the new telemetry client is in downloadable packages.

## WOLO betting env that must stay aligned

When `/bets` is expected to open real Keplr stake locks, these envs must agree in the live web env:

- `NEXT_PUBLIC_WOLO_CHAIN_ID=wolo-1`
- `NEXT_PUBLIC_WOLO_RPC_URL=https://rpc-mainnet.aoe2war.com`
- `WOLO_RPC_URL=https://rpc-mainnet.aoe2war.com`
- `NEXT_PUBLIC_WOLO_REST_URL=https://rest-mainnet.aoe2war.com`
- `WOLO_REST_URL=https://rest-mainnet.aoe2war.com`
- `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS`
- `WOLO_BET_ESCROW_ADDRESS`
- `WOLO_SETTLEMENT_URL` must remain empty unless the mainnet settlement service is deliberately deployed on `127.0.0.1:8092`, `/settlement/v1/health` reports `ok=true` and `chain_id=wolo-1`, and the fresh payout/escrow signers are funded. It must not point at the old local testnet settlement target `127.0.0.1:8091`.
- `WOLO_SETTLEMENT_AUTH_TOKEN` must come from the root-only WoloChain mainnet settlement env after the 8092 health gate is green.
- `WOLO_BET_PAYOUT_ADDRESS=wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu`
- `WOLO_BET_ESCROW_ADDRESS=wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p`
- `WOLO_COMMUNITY_TREASURY_ADDRESS=wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2`
- `WOLO_FAUCET_CLI=/usr/local/bin/wolochaind-mainnet`
- `WOLO_FAUCET_HOME=/var/lib/aoe2hdbets-wolo-mainnet`
- `WOLO_FAUCET_FROM` set to the wolo-1 app signer key name
- `WOLO_FAUCET_CHAIN_ID=wolo-1`
- `WOLO_FAUCET_NODE_RPC=http://127.0.0.1:27657`
- `WOLO_STAKING_WALLET_ADDRESS` / `NEXT_PUBLIC_WOLO_STAKING_WALLET_ADDRESS`
- `WOLO_STAKING_WALLET_MNEMONIC`
- `WOLO_STAKING_HOME=/var/lib/aoe2hdbets-wolo-mainnet`
- `WOLO_STAKING_UNSTAKE_FEE` (optional; defaults to `auto`)

If `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS` or `WOLO_BET_ESCROW_ADDRESS` are missing on `wolo-1`, `/bets` must block with an escrow config error. It should not record an app-only mainnet wager.

For `/staking`, fund the staking wallet with total confirmed user stake plus the operator reserve/headroom used for WoloChain unstake sends. AoE2HDBets defaults to a `10 WOLO` reserve unless `WOLO_STAKING_UNSTAKE_HEADROOM_UWOLO` is set. User max-unstake should not be reduced by this reserve; underfunding should show the operator top-up warning instead.

Mainnet public staking display derives from tx-backed rows only: indexed
WoloChain `MsgSend` rows to/from the staking wallet plus confirmed app
`staking_events` with verified `wolo-1` tx hashes. Legacy `staking_positions`
rows may exist for operator/history workflows, but must not drive public
mainnet totals, operator funding requirements, or unstake limits. After deploy,
run `scripts/backfill-wolo-mainnet-transfers.mjs` or the admin backfill route
to refresh `/api/wolo/mainnet-transfers`. After the June 2026 transfer-index
composition migration, run the backfill with explicit wide limits so older direct
bank sends, including Jim/Sniper transfers, are indexed:

```bash
node scripts/backfill-wolo-mainnet-transfers.mjs --block-limit=5000000 --address-limit=400 --per-address-limit=5000 --global-limit=100000
```

The `/staking` public economy rail displays bank balances for the configured
staking wallet, community treasury, bet escrow, payout signer, and DEX liquidity
addresses. Empty custody wallets should show `0.00 WOLO`; do not replace that
with modeled or app-ledger values.

`/staking` Recent Activity should not hide mainnet-era settlement debt just
because no payout tx exists yet. Verified `wolo-1` stake/transfer rows remain
tx-backed, while pending `pending_wolo_claims` rows are grouped by market and
labeled as settlement queue state. A Coco de Hae style app-only market can show
as pending settlement debt; it must not be described as a chain tx until the
claim row has a `payout_tx_hash`.

On `wolo-1`, `/staking` public totals, personal stake, leaderboards, and reward
weights are rebuilt from indexed WoloChain mainnet `MsgSend` rows to/from the
staking wallet on or after `2026-05-25T00:00:00.000Z`. Do not use legacy
app-only `staking_positions` as public mainnet truth. Refresh the transfer
index with:

```bash
node scripts/backfill-wolo-mainnet-transfers.mjs --block-limit=100000 --global-limit=100
```

The read-only smoke endpoint is:

```bash
curl -s https://aoe2war.com/api/wolo/mainnet-transfers?limit=10 | jq '{totalRows, latestTimestamp, rows: [.rows[] | {txHash, amountLabel, senderLabel, recipientLabel, timestamp}]}'
```

Unstake execution must sign from the staking wallet itself. Do not route unstake through the generic betting payout service: that service may preserve its own settlement headroom and will block or pay from the wrong custody rail. The live web env needs `WOLO_STAKING_WALLET_MNEMONIC` for `/api/staking/unstake` to broadcast the return transfer.

Staking reward distributions are executed through the protected web route
`POST /api/staking/rewards/run`. The route finalizes the last closed UTC day,
allocates the staker side of the 1% betting fee by staking weight, pays valid
wallets through the WOLO settlement rail, and records successful payouts as
staking `CLAIM` events for the Recent Activity tile.

Required env:

- `STAKING_REWARD_RUN_TOKEN`
- `STAKING_REWARD_RUN_URL=http://127.0.0.1:3030`
- `WOLO_SETTLEMENT_URL` and related settlement auth env

Recommended VPS timer shape:

```ini
# /etc/systemd/system/aoe2hdbets-staking-rewards.service
[Service]
Type=oneshot
User=tony
WorkingDirectory=/var/www/AoE2HDBets/app-prodn
EnvironmentFile=/etc/aoe2hdbets/aoe2hdbets-web.env
ExecStart=/usr/bin/npm run staking:rewards:run

# /etc/systemd/system/aoe2hdbets-staking-rewards.timer
[Timer]
OnCalendar=*-*-* 00:10:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

## Verification

Minimum deploy checks:

```bash
curl -I https://aoe2war.com/
curl -I https://aoe2war.com/lobby
curl -I https://aoe2war.com/live-games
curl -I https://aoe2war.com/challenge
curl -I https://aoe2war.com/players
curl -I https://aoe2war.com/contact-emaren
curl -s https://aoe2war.com/api/lobby | jq '.leaderboard.trackedPlayers, (.leaderboard.entries | length)'
curl -s https://aoe2war.com/api/lobby | jq '{ticker: (.liveTicker.items | length), market: .woloMarket.poolId}'
curl -s https://aoe2war.com/api/bets | jq '.wolo | { betEscrowMode, onchainEscrowEnabled, onchainEscrowRequired, betEscrowAddress }'
curl -s https://aoe2war.com/api/staking/summary?period=24h | jq '.summary["24h"] | {betsPlaced, betVolumeWolo, activeStakers, totalStakedWolo, directTransferCount}'
curl -s https://aoe2war.com/api/staking/summary?period=all | jq '.summary.all.activity[] | select(.eventType=="SETTLEMENT") | {label, detail}'
curl -s https://aoe2war.com/api/wolo/mainnet-transfers?limit=5 | jq '{totalRows, latestTimestamp}'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

For WOLO betting deploys, also do this manual smoke pass:

```bash
# 1. Confirm the public payload still exposes live escrow truth.
curl -s https://aoe2war.com/api/bets | jq '.wolo | { betEscrowMode, onchainEscrowEnabled, onchainEscrowRequired, betEscrowAddress }'

# 2. Verify the service is healthy, then open /bets in a real browser session.
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

Expected result for the browser pass:
- `/bets` loads with a real open market
- clicking `Lock 100` opens Keplr
- after approval, the UI reaches `Escrow confirmed`
- only then does `/api/bets/wager` record the slip
- `/api/bets` reports `betEscrowMode: "required"` and `onchainEscrowRequired: true` on `wolo-1`
- if a stake intent exists but no usable tx proof is attached yet, Your Book shows a pending proof row and the server keeps scanning recent WoloChain escrow deposits for 24 hours
- challenge-linked markets should not appear beside a duplicate `watcher-live-*` market for the same session when the sides map safely

If browser wallets report `Failed to fetch balance`, `network error`, or a dead Keplr handoff, check these before blaming app code:

```bash
curl -sSI -H 'Origin: https://aoe2war.com' https://rpc-mainnet.aoe2war.com/status | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://www.aoe2war.com' https://rpc-mainnet.aoe2war.com/status | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://aoe2war.com' https://rest-mainnet.aoe2war.com/cosmos/base/tendermint/v1beta1/blocks/latest | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://www.aoe2war.com' https://rest-mainnet.aoe2war.com/cosmos/base/tendermint/v1beta1/blocks/latest | rg 'Access-Control-Allow-Origin|HTTP/'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

For inbox attachment fixes, verify the actual binary route too:

```bash
# Requires a valid aoe2hdbets_session cookie from a real participant.
curl -I --cookie "aoe2hdbets_session=..." \
  https://aoe2war.com/api/contact-emaren/attachments/<messageId>
```

Expected result:
- `200`
- correct binary `content-type` such as `image/webp`
- safe `content-disposition` with ASCII `filename=` and UTF-8 `filename*=`

## What matters most after deploy

The most important public product smoke tests are now:

1. `/lobby` loads cleanly
2. Advanced `/lobby` shows the moving live ticker, Watch & Chat hero with comments to the right, reactions and compact bet slip under the video, WOLO swap tile, and the existing Community Lobby below them
3. Basic `/lobby` view still shows the simpler leaderboard/tournament/war-chest-first layout
4. `/api/lobby` includes `liveTicker` and `woloMarket`
5. `/admin` can create/enable/disable ticker messages without exposing controls to normal users
6. leaderboard renders and count matches entry length
7. `/bets` reports live escrow truth and can still open a real lock flow in-browser
8. tournament panel loads cleanly
9. `/live-games` responds
10. same-origin `/api/lobby` returns a believable snapshot shape
11. browser stream routes exist: `/api/streams/active` returns JSON, and `game_watch_streams` has the browser-stream columns after `npx prisma migrate deploy`
12. `/profile?watcher_stream=1&stream_session=smoke&stream_title=Smoke%20Match` renders the streamer studio without losing the watcher handoff params through auth
13. a cancelled or failed Keplr/Ledger stake attempt records a `bet_wallet_error` activity event when it fails before stake-intent creation
14. `/api/admin/users/rails` includes `walletFriction`, and `/admin/wolochain` renders the wallet-friction rail
15. signed-stake recovery still requires a real tx hash, while recent no-proof stake intents remain visible as pending proof rows
16. recent settled `/bets` results show one row per linked session, preferring challenge-linked books over watcher shadows

This matters more now than older homepage-only checks because the lobby/community shell is the real public spine.

Browser stream runtime notes:

- `storage/live-streams/` is runtime media storage and must stay writable by the web service user.
- Optional production override: `AOE2_STREAM_STORAGE_DIR=/path/to/stream-storage`.
- Optional chunk retention override: `AOE2_STREAM_CHUNK_RETENTION_MS=21600000`; active-stream polling also ends stale browser streams and prunes old ended chunks.
- AoE2WAR streaming is browser/watcher WebM chunk distribution with a rolling playback route. It is intentionally not WOLO-gated and does not require Twitch or OBS.
- Watcher `1.5.0` can stream natively with watcher-key auth or open `/profile?watcher_stream=1&stream_session=...&stream_title=...` as a browser fallback. Unsigned macOS builds use manual download-and-replace updates until notarized; signed Windows builds can install in place when idle.

## Known deploy gotchas

### Ownership drift

If `git pull` or `npm run build` fails with `Permission denied`, inspect file ownership before doing anything else.

Common symptoms:
- `error: unable to unlink old ... Permission denied`
- `EACCES` writing `.next/cache/images`
- one or more files under the app tree owned by `root`
- `npm run build` or `npm run start` now failing early from `scripts/prepare-runtime-cache.mjs`

Fast check:

```bash
ls -l app/api/contact-emaren/attachments/[messageId]/route.ts
ls -ld .next .next/cache .next/cache/images
```

Expected:
- app tree should normally be owned by `tony:tony`

Typical fix:

```bash
sudo chown -R tony:tony /var/www/AoE2HDBets/app-prodn
```

Why this is cleaner now:
- the app prepares `.next/cache/images` during build and again before start
- ownership drift is surfaced before the service begins handling requests
- the failure path now prints the exact `chown` command instead of leaving Next to throw a murky runtime mkdir error

### Watcher download analytics truth

Watcher package buttons should keep using the tracked `/download/watcher/[artifact]` routes, but those routes are no longer allowed to count obvious prefetch or route-warmup requests.

Current guardrails:
- skip requests with headers like `next-router-prefetch`, `x-middleware-prefetch`, `purpose: prefetch`, or `sec-purpose: prefetch`
- skip likely RSC or component-prefetch requests
- keep real user-intent redirects working
- `/admin/user-list` now shows raw recorded totals alongside likely external vs internal/test splits

If watcher download totals look suspicious after a deploy:

```bash
journalctl -u aoe2hdbets-web.service -n 80 --no-pager
```

Then verify the public page is still using plain download anchors, not Next-prefetchable internal navigation.

### Interrupted pulls

If a fast-forward pull dies partway through because of ownership drift, the repo can look locally modified even though it is just half-updated deployment state.

Recover deliberately:

```bash
git status --short
git diff --stat
git stash push -m interrupted-pull
git pull --ff-only origin main
git stash drop stash@{0}
```

Do not do this blindly if the VPS has intentional local changes.

### `next-env.d.ts` drift

This file still drifts on the VPS and has caused:

- local modifications in the server repo
- file ownership issues during builds
- manual `chown tony:tony /var/www/AoE2HDBets/app-prodn/next-env.d.ts`

Until fixed properly:

- expect `git status` on the VPS to sometimes show `M next-env.d.ts`
- stash or preserve it before pulling if needed

### Inbox attachments

Direct-message attachments are session-protected, so preview failures are not always frontend rendering bugs.

Check these in order:
- authenticated route response from `/api/contact-emaren/attachments/:id`
- `journalctl -u aoe2hdbets-web.service`
- `Content-Disposition` generation in the route

Known real failure:
- `TypeError: Cannot convert argument to a ByteString ...`

That points at Unicode header generation and should send you to the attachment route first, not the chat bubble component.

## When schema changes exist

If the web change depends on new Prisma tables or columns:

- apply the web Prisma migration first
- then build
- then restart

Do not restart blindly before the schema is in place.

## Related runtime truth

- backend upstream should remain `http://127.0.0.1:3330`
- browser should stay same-origin for `/api/*`
- watcher uploads should continue to target `api-prodn.aoe2war.com`, not the public web host
- browser wallet reads and stake verification depend on `rpc-mainnet.aoe2war.com` and `rest-mainnet.aoe2war.com` staying CORS-clean for both `aoe2war.com` and `www.aoe2war.com`
- dedicated nginx request-log runbook for AoE2 Phase 1 lives at [deploy/aoe2-access-logging-phase1.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/deploy/aoe2-access-logging-phase1.md)


## Staking unstake signer

`/api/staking/unstake` must use the staking custody rail.

Preferred live setup:

- key name: `staking`
- home: `/var/lib/wolochaind-testnet`
- CLI: `/var/www/WoloChain/build/wolochaind`
- keyring backend: `test`
- fee: `5000uwolo`

Do not route staking unstake through the generic betting payout service. That path has different settlement headroom semantics and can block valid staking returns.
