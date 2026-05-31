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

### 2026-05-30 Advanced lobby arena and live ticker

- Added `live_ticker_messages` for admin-managed text ticker messages.
- `/lobby` defaults to Advanced view with a header ticker, Watch & Chat hero, WOLO market tile, then the existing Community Lobby content.
- Basic view remains available and should preserve the simpler lobby-first layout.
- Deployment requires `npx prisma migrate deploy` before restarting `aoe2hdbets-web.service`.
- Optional market display env: `WOLO_OSMOSIS_POOL_ID=3461`, `WOLO_OSMOSIS_POOL_URL=https://app.osmosis.zone/pool/3461`, `WOLO_MARKET_LABEL=WOLO Market`.

### 2026-05-05 watcher telemetry and funnel truth

- Added `watcher_client_events` for Electron watcher runtime telemetry.
- Admin watcher rail now treats `/download/watcher/*` rows as noisy package pulls, not confirmed users.
- Confirmed watcher users come from linked watcher client events plus the historical `game_stats.parse_source in ('watcher_live', 'watcher_final')` fallback.
- Deployment requires `npx prisma migrate deploy` before restarting `aoe2hdbets-web.service`.
- Watcher package artifacts should be rebuilt/synced before claiming the new telemetry client is in downloadable packages.

## WOLO betting env that must stay aligned

When `/bets` is expected to open real Keplr stake locks, these envs must agree in the live web env:

- `NEXT_PUBLIC_WOLO_RPC_URL`
- `NEXT_PUBLIC_WOLO_REST_URL`
- `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS`
- `WOLO_BET_ESCROW_ADDRESS`
- `WOLO_SETTLEMENT_URL`
- `WOLO_STAKING_WALLET_ADDRESS` / `NEXT_PUBLIC_WOLO_STAKING_WALLET_ADDRESS`
- `WOLO_STAKING_WALLET_MNEMONIC`
- `WOLO_STAKING_UNSTAKE_FEE` (optional; defaults to `auto`)

If `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS` or `WOLO_BET_ESCROW_ADDRESS` are missing, `/bets` silently falls back toward app-only behavior and no real stake window will open.

For `/staking`, fund the staking wallet with total confirmed user stake plus the operator reserve/headroom used for WoloChain unstake sends. AoE2HDBets defaults to a `10 WOLO` reserve unless `WOLO_STAKING_UNSTAKE_HEADROOM_UWOLO` is set. User max-unstake should not be reduced by this reserve; underfunding should show the operator top-up warning instead.

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
curl -s https://aoe2war.com/api/bets | jq '.wolo | { onchainEscrowEnabled, betEscrowAddress }'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

For WOLO betting deploys, also do this manual smoke pass:

```bash
# 1. Confirm the public payload still exposes live escrow truth.
curl -s https://aoe2war.com/api/bets | jq '.wolo | { onchainEscrowEnabled, betEscrowAddress }'

# 2. Verify the service is healthy, then open /bets in a real browser session.
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

Expected result for the browser pass:
- `/bets` loads with a real open market
- clicking `Lock 100` opens Keplr
- after approval, the UI reaches `Escrow confirmed`
- only then does `/api/bets/wager` record the slip
- if a stake intent exists but no usable tx proof is attached yet, Your Book shows a pending proof row and the server keeps scanning recent WoloChain escrow deposits for 24 hours
- challenge-linked markets should not appear beside a duplicate `watcher-live-*` market for the same session when the sides map safely

If browser wallets report `Failed to fetch balance`, `network error`, or a dead Keplr handoff, check these before blaming app code:

```bash
curl -sSI -H 'Origin: https://aoe2war.com' https://aoe2war.com/rpc/status | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://www.aoe2war.com' https://aoe2war.com/rpc/status | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://aoe2war.com' https://aoe2war.com/rest/cosmos/base/tendermint/v1beta1/blocks/latest | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://www.aoe2war.com' https://aoe2war.com/rest/cosmos/base/tendermint/v1beta1/blocks/latest | rg 'Access-Control-Allow-Origin|HTTP/'
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
2. Advanced `/lobby` shows the live ticker, Watch & Chat hero, WOLO market tile, and the existing Community Lobby below them
3. Basic `/lobby` view still shows the simpler leaderboard/tournament/war-chest-first layout
4. `/api/lobby` includes `liveTicker` and `woloMarket`
5. `/admin` can create/enable/disable ticker messages without exposing controls to normal users
6. leaderboard renders and count matches entry length
7. `/bets` reports live escrow truth and can still open a real lock flow in-browser
8. tournament panel loads cleanly
9. `/live-games` responds
10. same-origin `/api/lobby` returns a believable snapshot shape
11. a cancelled or failed Keplr/Ledger stake attempt records a `bet_wallet_error` activity event when it fails before stake-intent creation
12. `/api/admin/users/rails` includes `walletFriction`, and `/admin/wolochain` renders the wallet-friction rail
13. signed-stake recovery still requires a real tx hash, while recent no-proof stake intents remain visible as pending proof rows
14. recent settled `/bets` results show one row per linked session, preferring challenge-linked books over watcher shadows

This matters more now than older homepage-only checks because the lobby/community shell is the real public spine.

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
- browser wallet reads and stake verification depend on `aoe2war.com/rpc` and `aoe2war.com/rest` staying CORS-clean for both `aoe2war.com` and `www.aoe2war.com`
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
