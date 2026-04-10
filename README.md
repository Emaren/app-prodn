# app-prodn

Production Next.js frontend for AoE2HDBets.

This is the public product shell users actually feel.

It currently owns the premium lobby/community surface, leaderboard presentation, players/rivalries/live-games routes, requests/inbox/admin flows, `$WOLO` product UI, and same-origin browser API routes that enforce session/admin behavior before proxying selected calls to `api-prodn`.

## Canonical docs

- [ARCHITECTURE.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/ARCHITECTURE.md)
- [DEPLOY.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/DEPLOY.md)
- [PRODUCT_STATE.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/PRODUCT_STATE.md)
- [WORKSPACE.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/WORKSPACE.md)

## Stack

- Next.js App Router
- Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`) for user/profile/community APIs
- Same-origin browser API routes for replay upload, lobby snapshot, inbox/admin actions, and appearance state
- Premium lobby presentation layer with theme circles and lobby-specific shell behavior
- Lazy client islands for wallet-heavy `/wolo`, `/wallet`, and `/connect-wallet` routes so the server shell paints with a small first-load bundle

## Shipped public surfaces

Current notable product routes include:

- `/`
- `/lobby`
- `/bets`
- `/live-games`
- `/players`
- `/rivalries`
- `/requests`
- `/contact-emaren`
- `/war-chest`
- `/tournaments/[slug]`
- `/wolo`
- `/replay-parser`
- admin/profile/inbox-related routes

The current first-impression path is no longer just the homepage. The real product spine is now the lobby/community shell and its linked destinations.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run start
```

`prebuild` runs `prisma generate`.

## Environment

Start from `.env.production.example` and create your local `.env.production`.

Required for Prisma API routes:

- `DATABASE_URL` (Postgres connection string)
- `SESSION_SECRET` (long random string for signing auth session cookies)
- `STEAM_API_KEY` (optional but recommended; used to fetch Steam persona names after sign-in)

Common:

- `NEXT_PUBLIC_API_BASE_URL` (keep this as `"."` / same-origin)
- `AOE2_BACKEND_UPSTREAM` (server-side upstream for rewrites, default `http://127.0.0.1:3330`)
- `ADMIN_TOKEN` (required for admin proxy routes)
- `INTERNAL_API_KEY` (optional; forwarded on replay upload when backend enforces API keys)
- `ALLOW_GUEST_SESSIONS=false` (recommended; keep guest sessions off so replay evidence ties to signed identities)
- `DIRECT_MESSAGE_ATTACHMENT_DIR` (optional; default `storage/direct-message-attachments/`; new inbox uploads store file refs there instead of base64 rows)

WOLO betting / settlement:

- `NEXT_PUBLIC_WOLO_RPC_URL`
- `NEXT_PUBLIC_WOLO_REST_URL`
- `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS`
- `WOLO_BET_ESCROW_ADDRESS`
- `WOLO_SETTLEMENT_URL`
- `WOLO_SETTLEMENT_AUTH_TOKEN` (optional if the settlement service is protected)
- `WOLO_BET_PAYOUT_MNEMONIC` / `WOLO_BET_PAYOUT_ADDRESS` only when using the local fallback signer instead of the settlement service

Optional migration compatibility:

- `ALLOW_LEGACY_UID_HEADERS=true` to temporarily allow `x-user-uid` / body uid fallback for user routes

## Browser/API contract highlights

Important same-origin browser routes include:

- `/api/lobby`
- `/api/lobby/stream`
- `/api/replay/upload`
- `/api/contact-emaren`
- `/api/admin/users`
- `/api/user/appearance`

These routes are important because they often do more than simple pass-through work:

- enforce session/admin checks
- reshape backend data for browser use
- aggregate app-owned product state
- keep browser calls same-origin

## Replay and lobby flow

- Browser replay upload endpoint: `/api/replay/upload` (proxied to `api-prodn`)
- Lobby snapshot endpoint: `/api/lobby`
- Lobby stream endpoint: `/api/lobby/stream`
- Recent Match Feed sorts and displays the backend `played_at` contract so bulk reparses of old saved games do not outrank newer actual matches
- Watcher package: `public/downloads/aoe2hd-watcher-1.0.0-arm64.dmg`
- Watcher pairing route: `/profile?watcher_pair=1` (mints a key and launches `aoe2hd-watcher://pair?...`)
- Replay parser page: `/replay-parser`

The app owns the browser-facing lobby experience and presentation truth, but does not own replay parse truth itself.

## Admin bootstrap

Admin is not granted automatically to the first user/session.

Promote/demote explicitly from backend with:

```bash
python /var/www/AoE2HDBets/api-prodn/scripts/set_admin.py --list
python /var/www/AoE2HDBets/api-prodn/scripts/set_admin.py --email you@example.com
```

## Production routing

- `aoe2hdbets.com/*` should proxy to `app-prodn` (Next.js on `127.0.0.1:3030`)
- Keep browser calls same-origin (`/api/...`) so Next local API handlers enforce session/admin checks
- Next rewrites selected API paths to backend using `AOE2_BACKEND_UPSTREAM`
- `api-prodn.aoe2hdbets.com/*` should proxy directly to `api-prodn` (`127.0.0.1:3330`) for watcher/automation uploads and backend APIs

## Production runtime truth

- VPS repo path: `/var/www/AoE2HDBets/app-prodn`
- service: `aoe2hdbets-web.service`
- env file: `/etc/aoe2hdbets/aoe2hdbets-web.env`
- production bind: `127.0.0.1:3030`
- production build output must exist at `.next/BUILD_ID`
- preferred SSH alias from MBP: `hel1`
- service runs as `tony`

## Operational reminders

- A local fix is not live until `main` is pushed, the VPS checkout is pulled, the app is rebuilt, and `aoe2hdbets-web.service` is restarted.
- Watcher package downloads are tracked server-side through `/download/watcher/[artifact]` redirects. The route now skips obvious prefetch or route-warmup requests, and `/admin/user-list` separates likely external pulls from obvious internal or test traffic.
- If deploys fail with `Permission denied` or Next logs `EACCES` writing `.next/cache/images`, check ownership drift in `/var/www/AoE2HDBets/app-prodn` before assuming the app code is broken. `npm run build` and `npm run start` now both prepare `.next/cache/images` up front and will fail early with a direct `chown` hint if the cache tree is not writable.
- Direct-message attachments are served through a session-protected binary route: `/api/contact-emaren/attachments/[messageId]`.
- New direct-message uploads are stored as disk-backed `file:v1:` refs under `DIRECT_MESSAGE_ATTACHMENT_DIR`; older `data:` rows are still readable as a fallback.
- Attachment preview failures should be debugged with the attachment route response and `journalctl`, not from the chat UI alone.

## Current notes

- `/lobby` is now a real product destination with leaderboard + tournament surface
- `/bets` now supports real Keplr-signed WOLO stake locks when escrow env is configured, and the wager is only recorded after the stake tx verifies against WoloChain REST
- trusted wallet-linked winners can now auto-settle on-chain, while unmatched or failed payouts still fall back to the pending-claim/admin rail
- accepted scheduled matches now seed pre-live runway books so betting does not have to wait for watcher-live detection
- player pages still need another premium pass
- the app now presents `$WOLO` as both a product rail and a partially real money-movement rail, but stake recovery and Ledger/browser failure handling still need another hardening pass
- `/wolo` now includes an app-side starter faucet claim path, a clean Wallet Snapshot connect surface, a tight `WOLO Market` tile, and a slim faucet claim row underneath
- the top-nav Roadmap link intentionally renders without the old blue count badge
- exact replay/postgame authority still belongs to `api-prodn`
