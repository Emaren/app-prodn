# app-prodn Deploy

## Production truth

- VPS repo path: `/var/www/AoE2HDBets/app-prodn`
- service: `aoe2hdbets-web.service`
- public domain: `https://aoe2hdbets.com`
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
npm run build
```

Then restart as root:

```bash
sudo systemctl restart aoe2hdbets-web.service
systemctl is-active aoe2hdbets-web.service
journalctl -u aoe2hdbets-web.service -n 40 --no-pager
```

## WOLO betting env that must stay aligned

When `/bets` is expected to open real Keplr stake locks, these envs must agree in the live web env:

- `NEXT_PUBLIC_WOLO_RPC_URL`
- `NEXT_PUBLIC_WOLO_REST_URL`
- `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS`
- `WOLO_BET_ESCROW_ADDRESS`
- `WOLO_SETTLEMENT_URL`

If `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS` or `WOLO_BET_ESCROW_ADDRESS` are missing, `/bets` silently falls back toward app-only behavior and no real stake window will open.

## Verification

Minimum deploy checks:

```bash
curl -I https://aoe2hdbets.com/
curl -I https://aoe2hdbets.com/lobby
curl -I https://aoe2hdbets.com/live-games
curl -I https://aoe2hdbets.com/challenge
curl -I https://aoe2hdbets.com/players
curl -I https://aoe2hdbets.com/contact-emaren
curl -s https://aoe2hdbets.com/api/lobby | jq '.leaderboard.trackedPlayers, (.leaderboard.entries | length)'
curl -s https://aoe2hdbets.com/api/bets | jq '.wolo | { onchainEscrowEnabled, betEscrowAddress }'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

For WOLO betting deploys, also do this manual smoke pass:

```bash
# 1. Confirm the public payload still exposes live escrow truth.
curl -s https://aoe2hdbets.com/api/bets | jq '.wolo | { onchainEscrowEnabled, betEscrowAddress }'

# 2. Verify the service is healthy, then open /bets in a real browser session.
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

Expected result for the browser pass:
- `/bets` loads with a real open market
- clicking `Lock 100` opens Keplr
- after approval, the UI reaches `Escrow confirmed`
- only then does `/api/bets/wager` record the slip

If browser wallets report `Failed to fetch balance`, `network error`, or a dead Keplr handoff, check these before blaming app code:

```bash
curl -sSI -H 'Origin: https://aoe2hdbets.com' https://rpc.aoe2hdbets.com/status | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://www.aoe2hdbets.com' https://rpc.aoe2hdbets.com/status | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://aoe2hdbets.com' https://rest.aoe2hdbets.com/cosmos/base/tendermint/v1beta1/blocks/latest | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://www.aoe2hdbets.com' https://rest.aoe2hdbets.com/cosmos/base/tendermint/v1beta1/blocks/latest | rg 'Access-Control-Allow-Origin|HTTP/'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

For inbox attachment fixes, verify the actual binary route too:

```bash
# Requires a valid aoe2hdbets_session cookie from a real participant.
curl -I --cookie "aoe2hdbets_session=..." \
  https://aoe2hdbets.com/api/contact-emaren/attachments/<messageId>
```

Expected result:
- `200`
- correct binary `content-type` such as `image/webp`
- safe `content-disposition` with ASCII `filename=` and UTF-8 `filename*=`

## What matters most after deploy

The most important public product smoke tests are now:

1. `/lobby` loads cleanly
2. leaderboard renders and count matches entry length
3. `/bets` reports live escrow truth and can still open a real lock flow in-browser
4. tournament panel loads cleanly
5. `/live-games` responds
6. same-origin `/api/lobby` returns a believable snapshot shape

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
- watcher uploads should continue to target `api-prodn.aoe2hdbets.com`, not the public web host
- browser wallet reads and stake verification depend on `rpc.aoe2hdbets.com` and `rest.aoe2hdbets.com` staying CORS-clean for both `aoe2hdbets.com` and `www.aoe2hdbets.com`
- dedicated nginx request-log runbook for AoE2 Phase 1 lives at [deploy/aoe2-access-logging-phase1.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/deploy/aoe2-access-logging-phase1.md)
