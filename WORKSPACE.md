---
id: "aoe2war.app-prodn.workspace"
title: "AoE2HDBets"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "workspace-reference"
reviewed_at: "2026-08-20"
review_interval_days: 60
sensitivity: "internal"
---

# AoE2HDBets

This workspace has **3 active product repos**. It also contains explicitly
classified legacy material and a detached Git worktree; those are not additional
production systems.

Together, they power the AoE2HDBets public product, replay ingest pipeline, and watcher upload client.

## Read these first

- [AoE2WAR Operator Start Here](docs/OPERATOR_START_HERE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DEPLOY.md](DEPLOY.md)
- [AoE2WAR Release Engineering](docs/RELEASE_ENGINEERING.md)
- [PRODUCT_STATE.md](PRODUCT_STATE.md)
- [Replay Corpus and Public Metric Contract](docs/REPLAY_CORPUS_METRICS.md)
- [Player Identity Wave 2](docs/PLAYER_IDENTITY_DISCOVERY_WAVE2.md)
- [api-prodn/TESTING.md](../api-prodn/TESTING.md)

## Repos and responsibilities

### 1. `app-prodn`

- Next.js web app at `aoe2war.com`
- Public product shell for lobby, leaderboard, players, rivalries, live-games, requests, inbox/admin, and `$WOLO`
- Advanced lobby arena stack: moving live ticker, Watch & Chat hero/comments rail, compact hero bet slip, compact WOLO swap tile, and preserved Basic lobby toggle
- `wolo-1` betting is strict mainnet mode: Keplr-signed stake tx required, app-only wagers rejected/hidden, and testnet-era rows filtered from mainnet-facing WOLO/bet rails
- `wolo-1` staking display is strict mainnet mode too: derive public stake totals and leaderboards from indexed mainnet `MsgSend` rows plus confirmed app staking events with verified tx hashes, not from legacy app-only `staking_positions`
- App-side payout claims require distinct mainnet `MsgSend` proof before the app marks them claimed; duplicate tx hashes are blocked unless the tx contains enough distinct matching sends.
- `/admin/wolochain` owns app-side duplicate tx diagnostics, indexed-transfer gap visibility, settlement service messaging, and watcher diagnostics rails; WoloChain still owns chain truth.
- `/profile` WOLO ledger is a mainnet-facing user surface: confirmed chain transfers, app-side pending/retry rows, and duplicate/suspicious claim flags must stay visibly separate.
- WOLO market display should read Osmosis pool 3461 for live WOLO/USDC price unless an explicit `WOLO_USD_PRICE` override is set; avoid hardcoded public price fallbacks.
- Prisma-backed user/profile/community APIs and auth session cookie handling
- Same-origin browser API routes that proxy or reshape selected `api-prodn` data
- Lazy client-loader shells for wallet-heavy routes so `/wolo`, `/wallet`, and `/connect-wallet` avoid pulling Keplr/Cosmos bundles into the initial server page

### 2. `api-prodn`

- FastAPI backend at `api-prodn.aoe2war.com`
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
- Advanced `/lobby` as the default public first impression, with Basic view preserved for the simpler community layout and a low-glare outline toggle
- Claimed player profiles default to Advanced command-center view; unclaimed replay-built profiles default to the classic Basic claim view, with Basic/Advanced toggles on both surfaces
- shipped leaderboard presentation
- tournament panel / queue / bracket-preview product UI
- players, rivalries, and live-games as real first-class destinations
- replay-driven visible match outcomes feeding back into the product

## Workspace inventory and edit boundaries

| Path | Classification | Rule |
| --- | --- | --- |
| `app-prodn/` | active source repository | Owns the deployed Next.js product and app-side schema. |
| `api-prodn/` | active source repository | Owns replay ingest, archive, parser execution, and parser evidence. |
| `aoe2-watcher/` | active source repository | Owns the Electron watcher. Its active release line is not necessarily `main`. |
| `aoe2hd-frontend-legacy/` | legacy repository | Historical frontend source. Do not implement current product work here. |
| `app-prodn-leaderboard-og/` | detached `app-prodn` worktree | Temporary historical/isolated worktree at a detached commit. Do not treat it as an independent repository or deployment source. |
| `_backup/` | backup material | Evidence only; never a current implementation target. |
| root `components/` and `bin/` | unowned workspace remnants | Inspect provenance before use; active product code belongs in an owning repo. |

The separate `AoE2WAR-docs` repository is the cross-system documentation
control plane. Repository-local implementation contracts remain authoritative.
Its private Git remote is
`https://github.com/Emaren/AoE2WAR-docs`; `main` is the remotely durable portal
and governance line. Synchronizing its copied registries never transfers
implementation authority away from the three source repositories.

## Repo count guidance

- Keep this directory at **3 repos** unless you intentionally split a new bounded service
- Do not add a separate `aoe2hd-frontend` repo unless it owns a distinct deployed surface
- Parsing logic and ingest API belong in `api-prodn`
- Watcher client belongs in `aoe2-watcher`
- Browser-facing product hierarchy belongs in `app-prodn`

## Branch / deploy workflow

Branches remain repository-specific:

| Repository | Normal branch |
| --- | --- |
| `app-prodn` | `main` |
| `api-prodn` | `main` |
| `aoe2-watcher` | current versioned `release/watcher-*` branch unless its release procedure says otherwise |

### `app-prodn`

Develop and review locally, then close ordinary work with:

```bash
aoe2war context
aoe2war status
aoe2war finish
```

Use `aoe2war deploy` directly only for a deliberately scoped lower-level web
release where the implementation is already committed and the worktree is
clean.

The release engine owns the ordinary web release sequence: documentation
baseline handling, risk gates, exact GitHub publication, manifest sealing,
stage-beside-live, activation preflight, restart/proof, bounded health soak,
certification, durable/fast rollback evidence, bounded verified retention, and
final provenance proof.

Do not manually `pull`/build/restart the web app for routine releases merely
because that was the historical procedure. `DEPLOY.md` retains the manual flow
for emergency/recovery and explicit database-migration work.

The automated lane fails closed on Prisma migration paths. A schema release must
use an explicitly reviewed backup/migration/compatibility/rollback procedure.

Use:

```bash
aoe2war rollback --dry-run
aoe2war rollback
```

for the one-step certified recovery lane.

### `api-prodn`

`api-prodn` keeps its own release/testing authority. Do not assume the
`app-prodn` `aoe2war deploy` command deploys or restarts the replay API.

### `aoe2-watcher`

Watcher artifacts are released from the owning versioned Watcher release branch
and its artifact/signing workflow. Current production manifests advertise
Watcher `1.5.7`.

Important:

- a local code change is not a production fix until its owning repository's
  release procedure is complete;
- Git ownership/transport drift is release-blocking evidence, not a reason to
  bypass the release engine as root;
- `app-prodn` ordinary deploys observe Wolo settlement ports `8092`/`8093` but
  never mutate them.

## Required production routing model

- `aoe2war.com/*` -> `app-prodn` (Next.js)
- `api-prodn.aoe2war.com/*` -> `api-prodn` (FastAPI)
- Browser should use same-origin `/api/*` via `app-prodn`
- Watcher should upload directly to `api-prodn.aoe2war.com/api/replay/upload`

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

- AoE2WAR HD production PostgreSQL database: `aoe2hd_db`
- sister AoE2DE PostgreSQL database: `aoe2de_db` — never HD production truth
- local writable development shadow: `aoe2hdbets_shadow` — never production evidence
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

- player profiles are now premium command-center surfaces; exact resource/economy completeness still depends on captured postgame achievement data
- watcher final replay uploads that trip MGZ full-summary decoding can be preserved as explicit header-only fallback rows; they are proof/identity breadcrumbs, not invented outcome or economy truth
- exact postgame achievement-table extraction is still not solved
- watcher behavior is materially healthier, but still a little noisy while iterating
- docs should stay aligned with the shipped lobby/leaderboard reality as the product evolves
- old testnet WOLO rows may remain in historical app tables; do not count them in mainnet-facing profile, staking, betting, or admin accounting unless explicitly labeled as legacy/testnet
- VPS ownership drift can block deploys or `.next` image-cache writes
- inbox attachment debugging requires a valid participant session because the binary route is protected
- old inbox attachments may still be legacy `data:` rows, but new uploads are written to disk-backed `file:v1:` refs
