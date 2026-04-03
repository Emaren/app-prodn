# AoE2HDBets

This directory currently uses **3 active repos**.

Together, they power the AoE2HDBets public product, replay ingest pipeline, and watcher upload client.

## Read these first

- [app-prodn/ARCHITECTURE.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/ARCHITECTURE.md)
- [app-prodn/DEPLOY.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/DEPLOY.md)
- [app-prodn/PRODUCT_STATE.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/PRODUCT_STATE.md)
- [api-prodn/TESTING.md](/Users/tonyblum/projects/AoE2HDBets/api-prodn/TESTING.md)

## Repos and responsibilities

### 1. `app-prodn`

- Next.js web app at `aoe2hdbets.com`
- Public product shell for lobby, leaderboard, players, rivalries, live-games, requests, inbox/admin, and `$WOLO`
- Prisma-backed user/profile/community APIs and auth session cookie handling
- Same-origin browser API routes that proxy or reshape selected `api-prodn` data
- Lazy client-loader shells for wallet-heavy routes so `/wolo`, `/wallet`, and `/connect-wallet` avoid pulling Keplr/Cosmos bundles into the initial server page

### 2. `api-prodn`

- FastAPI backend at `api-prodn.aoe2hdbets.com`
- Replay upload + parsing + storage in Postgres (`game_stats`)
- Live/non-final replay handling for watcher uploads
- Admin and diagnostics APIs

### 3. `aoe2-watcher`

- Electron helper app installed on client machines
- Watches AoE2HD SaveGame folder and uploads replay files directly to backend
- Supports one-click pairing from `/profile?watcher_pair=1` through `aoe2hd-watcher://pair?...`
- Emits live replay iterations during a match and a final replay when the file settles

## Current product reality

AoE2HDBets is no longer just a replay parser plus a few pages.

The main public spine now includes:

- a real `/lobby` community surface
- shipped leaderboard presentation
- tournament panel / queue / bracket-preview product UI
- players, rivalries, and live-games as real first-class destinations
- replay-driven visible match outcomes feeding back into the product

## Repo count guidance

- Keep this directory at **3 repos** unless you intentionally split a new bounded service
- Do not add a separate `aoe2hd-frontend` repo unless it owns a distinct deployed surface
- Parsing logic and ingest API belong in `api-prodn`
- Watcher client belongs in `aoe2-watcher`
- Browser-facing product hierarchy belongs in `app-prodn`

## Branch / deploy workflow

Single-branch model (`main`) used across repos:

1. Develop locally on MBP in each repo
2. Commit and push `main` to origin
3. On VPS, connect with `ssh hel1` and pull `main` for each repo as `tony`
4. Run migrations (`api-prodn`) before restart when schema changes exist
5. Build/restart services (`systemd` + nginx)

Important:
- a local code change is not a production fix until the VPS pull/build/restart is complete
- if deploys fail with `Permission denied`, inspect ownership drift before changing code

## Required production routing model

- `aoe2hdbets.com/*` -> `app-prodn` (Next.js)
- `api-prodn.aoe2hdbets.com/*` -> `api-prodn` (FastAPI)
- Browser should use same-origin `/api/*` via `app-prodn`
- Watcher should upload directly to `api-prodn.aoe2hdbets.com/api/replay/upload`

## Secrets and env baseline

### `app-prodn`

- `DATABASE_URL`
- `SESSION_SECRET`
- `AOE2_BACKEND_UPSTREAM=http://127.0.0.1:3330`
- `ADMIN_TOKEN`
- optional `INTERNAL_API_KEY`
- optional `DIRECT_MESSAGE_ATTACHMENT_DIR` (default `storage/direct-message-attachments/`)

### `api-prodn`

- `DATABASE_URL`
- `ADMIN_TOKEN`
- optional `INTERNAL_API_KEY`
- optional `AUTO_CREATE_TABLES=true` for local dev only
- optional `ENABLE_TRACE_LOGS=true` while building / debugging replay behavior

### `aoe2-watcher`

- optional `AOE2_API_BASE_URL` (default points to `api-prodn`)
- optional `WATCHER_USER_UID`
- optional `AOE2_UPLOAD_API_KEY` (manual fallback; one-click pairing usually saves this locally)

## Admin tooling

Use backend helper for admin flag control:

```bash
python /var/www/AoE2HDBets/api-prodn/scripts/set_admin.py --list
python /var/www/AoE2HDBets/api-prodn/scripts/set_admin.py --email you@example.com
```

## Runtime truth

- web repo path on VPS: `/var/www/AoE2HDBets/app-prodn`
- api repo path on VPS: `/var/www/AoE2HDBets/api-prodn`
- web binds to `127.0.0.1:3030`
- api binds to `127.0.0.1:3330`
- production uses systemd, not PM2
- preferred VPS SSH alias from MBP: `hel1`
- current service names:
  - `aoe2hdbets-web.service`
  - `aoe2hdbets-api.service`

## Current known rough edges

- player pages still trail lobby/directory polish
- exact postgame achievement-table extraction is still not solved
- watcher behavior is materially healthier, but still a little noisy while iterating
- docs should stay aligned with the shipped lobby/leaderboard reality as the product evolves
- VPS ownership drift can block deploys or `.next` image-cache writes
- inbox attachment debugging requires a valid participant session because the binary route is protected
- old inbox attachments may still be legacy `data:` rows, but new uploads are written to disk-backed `file:v1:` refs
