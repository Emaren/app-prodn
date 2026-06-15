# app-prodn

Production Next.js frontend for AoE2HDBets.

This is the public product shell users actually feel.

It currently owns the premium lobby/community surface, leaderboard presentation, players/rivalries/live-games routes, requests/inbox/admin flows, `$WOLO` product UI, and same-origin browser API routes that enforce session/admin behavior before proxying selected calls to `api-prodn`.

## Canonical docs

- [ARCHITECTURE.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/ARCHITECTURE.md)
- [DEPLOY.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/DEPLOY.md)
- [PRODUCT_STATE.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/PRODUCT_STATE.md)
- [WORKSPACE.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/WORKSPACE.md)
- [docs/CHAMPIONS_TITLE_ECONOMY.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/docs/CHAMPIONS_TITLE_ECONOMY.md)
- [docs/SCHEDULED_MATCH_SETTLEMENTS.md](/Users/tonyblum/projects/AoE2HDBets/app-prodn/docs/SCHEDULED_MATCH_SETTLEMENTS.md)

## Stack

- Next.js App Router
- Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`) for user/profile/community APIs
- Same-origin browser API routes for replay upload, lobby snapshot, inbox/admin actions, and appearance state
- Premium lobby presentation layer with theme circles and lobby-specific shell behavior
- Advanced `/lobby` arena stack with the moving live ticker, Watch & Chat hero/comments rail, compact hero bet slip, compact WOLO swap tile, and the preserved Basic/Advanced/Extreme community lobby toggle. Extreme owns the widened lobby frame, oversized Featured Warriors stage, and side-by-side leaderboard contender hero.
- Claimed player profiles default to the Advanced command center; unclaimed replay-built profiles default to the classic Basic claim page, and both can toggle Basic/Advanced
- Advanced player profiles include lazy match archive, watcher proof, form/rivalry diagnostics, resource emblems, AI Scribe/Grimer readout, stream signal, and premium `$WOLO`/staking stats
- The public Kingdom spine includes `/kingdom`, `/champions`, `/national-champions`, and `/forum`, with the legacy `/belts`, `/nations`, and `/realm` paths redirecting into the new route names
- `/champions` owns the app-side championship title economy: podium belts, tag titles, national titles, ELO titles, special designations, challenge links, and detail pages
- Lazy client islands for wallet-heavy `/wolo`, `/wallet`, and `/connect-wallet` routes so the server shell paints with a small first-load bundle

## Shipped public surfaces

Current notable product routes include:

- `/`
- `/lobby`
- `/bets`
- `/kingdom`
- `/champions`
- `/national-champions`
- `/forum`
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

## Championship title economy

- `/champions` and `/champions/[...slug]` render the app-side title economy from `lib/champions/titles.ts` and `lib/champions/titleState.ts`.
- Belts, tag titles, national titles, and ELO titles use `Reward Tribute`; special designation artifacts use `Artifact Bonus`.
- Championship art assets under `public/champions` should keep real alpha transparency; holder/silhouette backplates live in `public/champions/players`.
- `/profile` stores title eligibility settings through `represented_country` and `gender_division`.
- `/admin` includes a disabled title-operator scaffold for future assignment, vacation, top-10, and record rails.
- This surface is presentation and app workflow only. It does not redefine WoloChain denom truth, signed movement, escrow, custody, or settlement truth.

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
- `WOLO_OSMOSIS_POOL_ID=3461` / `WOLO_OSMOSIS_POOL_URL=https://app.osmosis.zone/pool/3461` / `WOLO_OSMOSIS_LCD_URL=https://lcd.osmosis.zone` / `WOLO_MARKET_LABEL=WOLO Market`; the Advanced lobby market tile and ticker derive `1 WOLO` price from the Osmosis pool unless `WOLO_USD_PRICE` is explicitly set.

WOLO betting / settlement:

- `NEXT_PUBLIC_WOLO_RPC_URL=https://rpc-mainnet.aoe2war.com`
- `WOLO_RPC_URL=https://rpc-mainnet.aoe2war.com`
- `NEXT_PUBLIC_WOLO_REST_URL=https://rest-mainnet.aoe2war.com`
- `WOLO_REST_URL=https://rest-mainnet.aoe2war.com`
- `NEXT_PUBLIC_WOLO_CHAIN_ID=wolo-1` for mainnet
- `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS`
- `WOLO_BET_ESCROW_ADDRESS`
- `WOLO_MAINNET_DISPLAY_START_AT=2026-05-25T00:00:00.000Z` (optional; mainnet-facing WOLO/bet rails hide pre-cutoff testnet-era rows)
- `WOLO_SETTLEMENT_URL=http://127.0.0.1:8092` only after the mainnet settlement service health route reports `ok=true` and `chain_id=wolo-1`; never use `127.0.0.1:8091` for mainnet because that is `wolo-testnet`
- `WOLO_SETTLEMENT_AUTH_TOKEN` from the root-only WoloChain mainnet settlement env once 8092 is payout-ready
- `WOLO_LEGACY_TESTNET_REST_URL=http://127.0.0.1:1317` may be set for admin duplicate-tx diagnostics that classify old testnet rows separately from mainnet; never count those rows as mainnet accounting
- `WOLO_BET_PAYOUT_ADDRESS=wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu` for the fresh mainnet Bet Payout signer after cutover
- `WOLO_BET_ESCROW_ADDRESS=wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p` for the fresh mainnet Bet Escrow signer after cutover
- `WOLO_COMMUNITY_TREASURY_ADDRESS=wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2`
- `WOLO_FAUCET_CLI=/usr/local/bin/wolochaind-mainnet`, `WOLO_FAUCET_HOME=/var/lib/aoe2hdbets-wolo-mainnet`, `WOLO_FAUCET_FROM`, `WOLO_FAUCET_CHAIN_ID=wolo-1`, and `WOLO_FAUCET_NODE_RPC=http://127.0.0.1:27657` for mainnet faucet claims from the app signer; do not point faucet claims at local testnet RPC or 8091
- `WOLO_BET_PAYOUT_MNEMONIC` only when using the local fallback signer instead of the settlement service; do not enable local fallback on mainnet unless explicitly approved
- `WOLO_STAKING_WALLET_ADDRESS` / `NEXT_PUBLIC_WOLO_STAKING_WALLET_ADDRESS` for the `/staking` custody rail
- `WOLO_STAKING_WALLET_MNEMONIC` for unstake execution from the staking custody wallet
- `WOLO_STAKING_ALLOW_PAYOUT_MNEMONIC_FALLBACK=1` only if the payout mnemonic is intentionally the same wallet as the staking wallet; the app still verifies the derived signer address before broadcasting
- `WOLO_STAKING_UNSTAKE_FEE` (optional; default `auto`) to override the local staking-wallet unstake gas setting
- `WOLO_STAKING_UNSTAKE_HEADROOM_UWOLO` if the staking wallet should display/enforce a staking-specific operator-funded reserve; otherwise it defaults to the settlement service's `10 WOLO` fee headroom
- `STAKING_REWARD_RUN_TOKEN` for the protected daily staking-reward runner
- `STAKING_REWARD_RUN_URL=http://127.0.0.1:3030` for the local runner script used by the VPS timer

On `wolo-1`, public staking totals, personal stake, and leaderboards are derived
from tx-backed staking movement on or after `WOLO_MAINNET_DISPLAY_START_AT`:
indexed WoloChain bank sends to/from the configured staking wallet plus
confirmed app `staking_events` that carry verified mainnet tx hashes. Legacy
`staking_positions` rows are kept for migration/operator history, but they must
not drive mainnet-facing staking totals. Mainnet direct-transfer indexing is
exposed read-only at
`GET /api/wolo/mainnet-transfers`; operators can refresh the index with
`POST /api/admin/wolo-transfers/backfill` or
`node scripts/backfill-wolo-mainnet-transfers.mjs`. The index stores one row per
successful `MsgSend` inside a tx, so a multi-send transaction is not collapsed
into the first recipient.

Payout claim rows are only marked `claimed` after the app verifies that the
returned WoloChain tx contains a distinct matching `MsgSend` for that claim's
recipient wallet and amount. A reused payout tx hash is blocked unless the tx
contains enough distinct matching sends for every claimed row using it.
`/admin/wolochain` shows duplicate-tx diagnostics, legacy-testnet
classification, and direct-REST/index-gap warnings. `/profile` keeps the WOLO
ledger newest-first while visibly separating confirmed mainnet transfers from
app-side pending/retry claim rows.

The `/staking` economy surface also renders public custody balances for staking
wallet, community treasury, bet escrow, payout signer, and DEX liquidity
addresses. Those cards display real WoloChain bank balances; if the configured
address has `0 uwolo`, the card should show `0.00 WOLO`.

The `/staking` Recent Activity rail intentionally mixes two honest states:
tx-backed WoloChain activity and grouped pending settlement claims. Rows like
BigJobs94/VNS with verified stake txs display the tx-backed wager transfer;
older app-only markets such as Coco de Hae can still appear as settlement queue
debt when they have pending claim rows but no payout tx hash yet. Do not label
those settlement queue rows as chain txs until `payout_tx_hash` exists.

Public WOLO betting surfaces should translate settlement-service blockers into
player-safe copy. For example, a payout signer reserve-floor failure should read
as the settlement rail waiting for operator top-up on `/bets` or `/war-chest`;
raw health codes, signer balance math, and distinct-send diagnostics belong in
`/admin/wolochain` and `/admin/user-list`. Capability checks should read
`GET /settlement/v1/health`; do not send empty zero-payout validation probes.

Optional migration compatibility:

- `ALLOW_LEGACY_UID_HEADERS=true` to temporarily allow `x-user-uid` / body uid fallback for user routes

## Browser/API contract highlights

Important same-origin browser routes include:

- `/api/lobby`
- `/api/lobby/stream`
- `/api/streams/start`
- `/api/streams/[streamId]/chunks`
- `/api/streams/[streamId]/manifest`
- `/api/streams/[streamId]/heartbeat`
- `/api/streams/[streamId]/end`
- `/api/streams/active`
- `/api/replay/upload`
- `/api/contact-emaren`
- `/api/admin/live-ticker`
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
- Browser streaming is AoE2WAR-first: `/profile` and `/watch/[sessionKey]` can start a browser `getDisplayMedia` stream, upload short WebM chunks to the app, and expose that feed through `/`, `/watch`, `/bets`, `/live-games`, and the lobby Watch & Chat hero.
- Watcher-native streaming is available in watcher `1.5.0`: the desktop app lists Electron capture sources, prefers likely AoE2HD/CrossOver/Steam/Wine windows, defaults macOS toward Display capture for CrossOver full-screen play, previews locally, starts a watcher-key stream session, uploads one-second WebM chunks, and keeps the browser studio as fallback.
- Watcher stream handoff route: `/profile?watcher_stream=1&stream_session=<sessionKey>&stream_title=<matchup>` preserves the detected-match context through Steam login and opens the browser streamer studio already bound to that watcher session when native capture is not enough.
- Desktop watcher `1.5.0` hardens native streamer controls, per-user stream telemetry, compact readouts for capture/upload errors, upload backpressure, rolling WebM playback, stale-live cleanup, and faster final-candidate replay timing. Public download metadata should only flip after the staged `1.5.0` artifacts are present in `public/downloads`.
- Watcher `1.5.0` treats macOS updates as manual download-and-replace while Developer ID signing/notarization is skipped. Windows builds are signed and can use in-place update when idle.
- AoE2WAR-managed stream chunks default to `storage/live-streams/`; set `AOE2_STREAM_STORAGE_DIR` if production should place chunks on a mounted volume.
- Browser stream cleanup is throttled through `/api/streams/active`: silent streams are ended after a few minutes, and old ended chunks are pruned after `AOE2_STREAM_CHUNK_RETENTION_MS` or the default six-hour window.
- Twitch/YouTube/custom watch feeds remain external fallbacks through `game_watch_streams`, but they are not required for AoE2WAR browser streaming.
- Recent Match Feed sorts and displays the backend `played_at` contract so bulk reparses of old saved games do not outrank newer actual matches
- Watcher final uploads can store header-only fallback rows when MGZ full-summary decoding fails; fallback rows are explicit parser breadcrumbs and do not fabricate a winner or postgame resource table
- Watcher packages: generated in `aoe2-watcher/dist`, then synced into `public/downloads` with `npm run watcher:sync`
- Watcher latest-version metadata: `/api/watcher/release` feeds the desktop app's Update / Latest Version indicator
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

- `aoe2war.com/*` should proxy to `app-prodn` (Next.js on `127.0.0.1:3030`)
- Keep browser calls same-origin (`/api/...`) so Next local API handlers enforce session/admin checks
- Next rewrites selected API paths to backend using `AOE2_BACKEND_UPSTREAM`
- `api-prodn.aoe2war.com/*` should proxy directly to `api-prodn` (`127.0.0.1:3330`) for watcher/automation uploads and backend APIs

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
- When watcher upload defaults, update UI, or desktop release metadata change, bump the watcher version, rebuild Mac/Windows/Linux artifacts, rerun `npm run watcher:sync`, and deploy the refreshed `public/downloads` files; source changes alone do not update existing installers.
- For watcher `1.5.0+`, sign/stage the Windows artifacts and stage the Mac/Linux artifacts before publishing the new version in `lib/watcherRelease.ts`. Mac Developer ID signing/notarization is intentionally skipped until the project needs it.
- If deploys fail with `Permission denied` or Next logs `EACCES` writing `.next/cache/images`, check ownership drift in `/var/www/AoE2HDBets/app-prodn` before assuming the app code is broken. `npm run build` and `npm run start` now both prepare `.next/cache/images` up front and will fail early with a direct `chown` hint if the cache tree is not writable.
- Direct-message attachments are served through a session-protected binary route: `/api/contact-emaren/attachments/[messageId]`.
- New direct-message uploads are stored as disk-backed `file:v1:` refs under `DIRECT_MESSAGE_ATTACHMENT_DIR`; older `data:` rows are still readable as a fallback.
- Attachment preview failures should be debugged with the attachment route response and `journalctl`, not from the chat UI alone.

## Current notes

- `/lobby` is now a real product destination with leaderboard + tournament surface
- `/lobby` defaults to Extreme view: a moving live ticker, Watch & Chat arena hero with comments to the right, reactions and a compact bet slip under the video, a compact WOLO / USDC swap tile, then the Community Lobby surface with a widened stage, oversized Featured Warriors portraits, and the menacing side-by-side leaderboard contender hero. Basic and Advanced remain available through the toggle.
- Admins manage custom live ticker messages from `/admin`; enabled messages are text-only, ordered by priority, and mixed with system ticker items from tournament/replay/lobby/WOLO market state.
- `/bets` now requires real Keplr-signed WOLO stake locks on `wolo-1`; the wager is only recorded after the stake tx verifies against WoloChain REST, and app-only wager rows stay out of mainnet-facing bet, profile, staking, war-chest, and admin rails
- `/staking` uses real Keplr stake transfers into the staking wallet, indexed mainnet `MsgSend` rows plus confirmed app staking events for public stake display, and staking-wallet-signed WoloChain transfers for unstake. User max-unstake follows confirmed tx-backed principal; the staking wallet reserve/headroom is treated as operator-funded and surfaces as an operator top-up warning when the wallet cannot cover remaining confirmed stake plus reserve after the unstake.
- `/staking` Recent Activity shows grouped pending settlement claims for mainnet-era markets even when there is no payout tx yet; that is app claim debt, not WoloChain transfer truth.
- `/staking` reward distributions are finalized once per closed UTC day through `npm run staking:rewards:run`; valid reward wallets are paid through the WOLO settlement rail and successful payouts are recorded as staking `CLAIM` events for Recent Activity. Before a daily distribution exists, personal pending rewards can show the modeled unpaid mainnet fee share from settled signed wagers.
- The AI Scribe and Grimer receive live `/staking` context through `lib/aiConcierge.ts` for lobby and contact replies. They should explain app-side WOLO staking state, fee splits, rewards, and viewer positions from supplied context only, without calling it validator staking or inventing APY.
- trusted wallet-linked winners can now auto-settle on-chain after distinct `MsgSend` proof, while unmatched, duplicate-guarded, review-needed, or failed payouts still fall back to the pending-claim/admin rail
- accepted scheduled matches now seed pre-live runway books so betting does not have to wait for watcher-live detection
- challenge-linked books now absorb safe duplicate `watcher-live-*` shadows for the same session, preserving wagers and stake recovery rails on the canonical challenge market.
- `/bets` records pre-intent Keplr/Ledger stake failures through `/api/bets/wallet-errors` as `bet_wallet_error` activity events, with market, side, amount, wallet type, browser, and workflow phase for operator debugging.
- `/bets` now keeps recent no-proof stake intents visible in Your Book and scans WoloChain escrow deposits for 24 hours, so tx-landed/browser-lost cases have a server-side recovery path without being counted in pools before proof lands.
- `/admin/wolochain` and the `/admin/user-list` WoloChain entry tile now surface recent wallet-friction events beside settlement and market rails.
- `/players/[uid]` and `/players/by-name/[name]` now default to the Advanced command-center profile; Basic remains available with `?view=basic`, and Match Feed lazy-loads older replay/manual-backfill rows through `/api/player-profile/matches`
- the app now presents `$WOLO` as both a product rail and a partially real money-movement rail, with remaining hardening focused on live wallet edge cases and player/tournament depth
- `/wolo` now includes an app-side starter faucet claim path, a clean Wallet Snapshot connect surface, a tight `WOLO Market` tile, and a slim faucet claim row underneath
- the top-nav Roadmap link intentionally renders without the old blue count badge
- exact replay/postgame authority still belongs to `api-prodn`


### Staking unstake custody rail

Staking deposits are held by the configured staking wallet. Unstake execution should sign from the local WoloChain keyring key named `staking`, not the generic bet payout service and not a web-stored mnemonic.

Required production env:

- `WOLO_STAKING_WALLET_ADDRESS`
- `WOLO_STAKING_CLI`
- `WOLO_STAKING_HOME`
- `WOLO_STAKING_KEY_NAME`
- `WOLO_STAKING_KEYRING_BACKEND`
- `WOLO_STAKING_CHAIN_ID`
- `WOLO_STAKING_NODE_RPC`
- `WOLO_STAKING_UNSTAKE_FEE`
- `WOLO_STAKING_UNSTAKE_HEADROOM_UWOLO`

The web service user must be able to read the `staking` key from the WoloChain keyring.

### Staking reward runner

The public staking pulse shows the modeled staker share for the selected betting window. The actual daily payout path is the protected `POST /api/staking/rewards/run` route, normally called by the VPS timer through:

```bash
npm run staking:rewards:run
```

By default the runner finalizes the last closed UTC day, allocates the staker half of the 2% betting fee by staking weight, pays valid wallets through the configured WOLO settlement service, and records confirmed payouts as staking `CLAIM` events. Backfills can be run with `npm run staking:rewards:run -- --date=YYYY-MM-DD`.
