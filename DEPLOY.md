---
id: "aoe2war.app-prodn.deploy"
title: "app-prodn Deploy"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-07-29"
review_interval_days: 30
sensitivity: "internal"
---

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
git push origin main
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

### 2026-07-29 bet and replay reliability release

- web implementation commit:
  `32be8b7b34d8ff60f8f0873c9f5762506a550228`;
- replay API implementation commit:
  `e4d1960eb26540c40193787aa8894db5e7d2d326`;
- deployed build ID: `IE_S62e0zvc7NoYqIn-z0`;
- public build version: `20260729210111-0f1bb6c20a`;
- Prisma: 72 source migrations applied, zero pending;
- backup:
  `/mnt/HC_Volume_105319120/aoe2-parser-engine/backups/aoe2-bet-reliability-20260729T200754Z/database.dump`,
  249,548,506 bytes, SHA-256
  `de2237d7ac2463ca682b2754af36c7208c4e7215bf378476059c55e185e15b34`;
- Jim's six formerly active wagers are terminal: two replay-proven losses and
  four exact chain-proven refunds;
- production wager backlog: zero active wagers, zero
  `awaiting_final_proof`, zero `under_review`, and zero pending core
  payout/refund/corrective-refund claims;
- `/bets` separates Settlement Proof, real bettor Settlement Queue, and
  Resolution Queue. Optional Founder/winner rewards no longer contaminate bet
  settlement state, and routine fast-board capability deferral is not
  presented as an outage;
- the app/API accepts a trusted structured duel winner when the raw scalar is
  only an `Unknown` placeholder, while named/team contradictions remain
  fail-closed;
- replay upload authentication commits before CPU parsing, preventing the
  parser worker from holding an API connection throughout binary parsing;
- `/matchups` and `/game-stats/[id]` share the complete-corpus rivalry builder;
  the verified Emaren–Sechma result is 13 meetings, 9–0 decided, four
  unresolved;
- 538 false-resolved public projections received append-only unresolved
  successors with zero aggregate rebuild, duplicate currents, coverage
  regressions, or invalid lineage;
- browser-local time is primary across the released user surfaces, with UTC as
  deterministic fallback and secondary inspection truth;
- `/api/wolo/network?format=table` reports 35 known addresses and reconciles
  canonical supply and known bank balances at 100,000,000.000000 WOLO;
- web/API/Wolo services were active after deploy. Wolo consensus and settlement
  binaries remain intentionally split; no chain upgrade is required.

Full evidence and invariants are recorded in
`docs/BET_AND_REPLAY_RELIABILITY_2026-07-29.md`.

### 2026-07-28 HD Leaderboard Advanced-default refinement

- implementation baseline: `c8b11c0373f6b276b34870d535bda35d656a2ccf`;
- Advanced is now the default for visitors without a saved leaderboard
  preference;
- previously saved B/A/E choices remain respected;
- the B/A/E selector is positioned in the leaderboard surface’s upper-right
  corner;
- public scope labels are `Warriors` and `Kingdom`;
- claimed-count subtitles are removed;
- `Open Game Stats` is removed from the leaderboard;
- the Watcher reconstruction paragraph is removed;
- RM/DM lane behavior, scope behavior, search, pagination, rankings, identities,
  and replay-derived movement are unchanged;
- no Prisma migration is introduced;
- production release commit: `795bc0e5ef92816439bea4dd4d87d6c2f77af7b4`;
- deployed build ID: `tveJ4q5OsZK0Dz90Igw9B`;
- public build version: `20260729020743-adcde508ec`;
- deployed at: `2026-07-29T02:10:09Z`;
- prior build rollback: `/mnt/HC_Volume_105319120/aoe2war/rollbacks/.next-rollback-20260729T020716Z`;
- restricted VPS receipt: `/root/ops-backups/aoe2war-leaderboard-advanced-default-20260729T020716Z`;
- post-deploy root availability: `6.13 GiB`;
- internal and public leaderboard routes, the leaderboard snapshot API, and the
  deployment-version endpoint returned HTTP 200.


### 2026-07-28 HD Leaderboard B/A/E presentation release

- implementation baseline: `6447fd3cad63adb8886b8e982dca3550fba61c1e`;
- Basic preserves the previously shipped `72rem` presentation and remains the
  default;
- Advanced expands to `90rem`, adds a compact branded Watcher card, uses the
  premium player-scope control, and removes the public census row;
- Extreme expands to `118rem`, uses the full branded Watcher card, removes the
  public census row, and pulls the table directly beneath the command controls;
- view choice persists under the repository-standard `leaderboard` tile-view
  preference;
- RM/DM lane, player scope, search, pagination, rank semantics, and identity
  semantics are unchanged;
- no Prisma migration is introduced;
- production release commit: `96f82670da29d70b0d1687e00c847caa2c9f48a4`;
- deployed build ID: `0xVDmZHtbuC9y0c9sw2kJ`;
- public build version: `20260728232251-8b6d5eb991`;
- deployed at: `2026-07-28T23:25:10Z`;
- prior build rollback: `/mnt/HC_Volume_105319120/aoe2war/rollbacks/.next-rollback-20260728T232229Z`;
- restricted VPS receipt: `/root/ops-backups/aoe2war-leaderboard-bae-20260728T232229Z`;
- post-deploy root availability: `6.14 GiB`;
- `/leaderboard`, the leaderboard snapshot API, the deployment-version
  endpoint, and the public leaderboard route returned HTTP 200;
- the production checkout was subsequently advanced only through the
  documentation receipt commit without rebuilding.


### 2026-07-28 leaderboard scope and pagination hardening

Implementation is complete in the release candidate, but do not treat this
subsection as a production receipt until the commit, build ID, service restart,
and browser/API checks are appended after deployment.

- `/leaderboard` defaults to `scope=all` and offers `scope=claimed` for public
  AoE2WAR profiles;
- default and claimed ranks are contiguous inside the active scope, and
  reconstructed 24-hour comparison ranks use that same scope;
- the paginated API is strict: it never appends off-page featured profiles, and
  `nextOffset` advances only by the returned row count;
- homepage/lobby contender enrichment remains available only through the
  explicit `includeFeaturedClaimed: true` snapshot option;
- client and server caches isolate RM/DM lane plus scope;
- exact reserved UIDs `aoe2hd_ai_concierge`, `aoe2hd_ai_grimer`,
  `aoe2hd_ai_guy`, and `challenge-protocol` never enter competitive boards;
  the first, second, and fourth are the three current live system rows;
- the post-exclusion projection is 2,345 public rows: 2,216 replay-backed
  exact-Steam rows, 124 public name-only rows, and five profile-only rows;
- the claimed scope is 16 public profiles: 11 replay-backed plus five
  profile-only, representing 15 exact-Steam identities and one site-only
  identity.

### 2026-07-28 identity leaderboard and corpus-census release

- clean production checkout: `main`, equal to `origin/main`; the live
  verification observed `43b1b9b0bd23f8634e88147faff6fb368e1977ea`
  before this documentation-only correction, so later documentation
  descendants may advance the checkout without changing the running
  implementation;
- running implementation build: `20260728153116-44f5f4143c`, built from
  `746251bc60d46fd52d8d23318e5d568218eb726b`; the later commits through the
  current checkout are documentation-only;
- Prisma: 72 migration directories; live ledger 74 rows, 72 applied, two
  historical rolled-back attempts, zero incomplete, and no pending migration;
- Player Identity Wave 2 applied once from the exact bounded plan at
  `2026-07-28T15:22:04.182Z`;
- populated identity foundation: 2,220 PlatformAccounts, 13,839 name
  observations, 126 provisional name-only buckets, 2,216 provisional Warriors,
  2,216 proposed links, 11 proposed claims, and zero active/publication rows;
- live leaderboard: 2,348 additive rows with exact-Steam alias folding,
  expandable per-name statistics, and reconstructed 24-hour rank movement;
- live Parser Observatory: 7,990 physical objects, 2,093 indexed/decoded
  artifacts, 5,897 unindexed/unclassified objects, and explicit
  final/public/deduplicated battle denominators;
- `/leaderboard`, `/game-stats`, and `/battle-archive` passed server and
  browser interaction/visual checks; web and replay API services were active.

The restricted plan/apply receipt hashes are recorded in
`docs/PLAYER_IDENTITY_DISCOVERY_WAVE2.md`. The apply is proposed-only and is not
an identity projection publication. Root storage had 2.3 GiB free (94% used)
after the production builds, below the preferred 6 GiB deployment floor; treat
additional package/build work as a capacity-risk decision.

### 2026-07-26 production parity seal

The inspected production deployment is tied to exact identities:

- app source `22232a0bcc038a567acd052f432883e70482a3f9` on clean `main`, equal to `origin/main`;
- API source `d2d68646b1aff3ffb9e647ee0fe4deaa143b2c6e` on clean `main`;
- active Wolo source `d5dea8d6f1a2b0b57489a5e468dd21e34246891e` on clean `wolo-1-mainnet-prep`, equal to its remote;
- web build `20260726054351-9b5a6fcd0b` started after the build completed;
- Watcher release `1.5.6` is present in Windows installer/direct EXE, Apple Silicon DMG, Linux AppImage, direct ZIP, and update manifests;
- live database: 71 applied source migrations, zero incomplete; all six July 22–26 gates applied.

A deploy is not health-green solely because source parity passes. At this seal, `aoe2hdbets-replay-auto-recovery.timer` was enabled but `active (elapsed)` with `NextElapse=infinity`, and root storage was 94% used. Post-seal remediation changed the timer to schedule from activation and prior service completion, reclaimed 1.00 GiB of regenerable root data, completed replay candidate recovery successfully, and verified a subsequent recurring run with `Result=success`. Root then had 3.33 GiB free: above the parser's 3 GiB safety reserve but still below the preferred 6 GiB deployment floor. Do not run a large build or package operation until more root capacity is reclaimed or build caches are moved off `/`.

The Wolo mainnet node intentionally runs `/usr/local/bin/wolochaind-mainnet-node-prewartrophy` at `d3bd62414a047a492a3814b7d3baa2717d64db2e` while both settlement services run `/usr/local/bin/wolochaind-mainnet` at `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`. Never rebuild or replace the consensus binary as a routine app deploy step.


### 2026-07-18 Challenge lifecycle v2

- Challenge creation now defaults to a 72-hour open acceptance window and Play Anytime after both sides fund; exact match times are optional and use browser-local display with UTC as secondary truth.
- Added explicit `accept_by`, `fund_by`, `play_by`, `match_time`, exact-time confirmation, creation idempotency, canonical funding-proof uniqueness, bounded Challenge history, folded lifecycle records, and deterministic settlement retry metadata.
- Automatic reconciliation is restricted to Challenge V2 rows with non-null `creation_request_id`; migrated legacy rows remain operator-reviewed and are never silently swept by the timer.
- Install `deploy/aoe2hdbets-challenge-reconcile.service` and `.timer` only after the application migration/build/smoke gate passes and `CHALLENGE_RECONCILE_TOKEN` (or `CRON_SECRET`) is present in `/etc/aoe2hdbets/aoe2hdbets-web.env`. The timer runs every five minutes and may execute deterministic refunds for newly expired V2 Challenges.
- Before enabling the timer, take a restricted Postgres backup, run `npx prisma migrate deploy`, `npx prisma generate`, `npm run test:challenge`, `npx tsc --noEmit --pretty false`, the relevant lint/build gates, and deploy through the isolated `.next-release` atomic swap.
- Historical Jim vs Zodiac Challenge #24 is not an automatic-reconciliation target. Production audit identified a 1,010 WOLO funded liability (1,000 wager + 10 guarantee) with no refund/settlement row at audit time. Re-query current DB/chain truth after deploy, dry-run only #24 through the existing admin scheduled-settlement rail, and execute exactly once only if it is still outstanding.

### 2026-07-13 team-market integrity and incident correction rail

- API replay players now retain canonical explicit team IDs and expose team resolution/final winner coherence.
- Watcher team markets require high-confidence explicit teams, persist immutable proposition snapshots, lock on first stake, and fail closed during final settlement.
- Added `/admin/market-integrity`, exact incident/adjustment/alias tables, read-only historical audit artifacts, and evidence-locked repair scripts.
- Before migration, make a restricted Postgres backup and exact incident export with hashes. Then run `npx prisma migrate deploy`, verify `bet_market_integrity_incidents`, `bet_market_financial_adjustments`, `player_identity_aliases`, and new `bet_markets` columns/indexes, build, and restart.
- Do not apply a financial repair until new code is live, the settlement/signing rail is verified, the dry run matches every chain/database fact, and the backup exists. Never bulk repair from audit heuristics.
- Runtime evidence paths are `runtime/market-integrity-backups` (mode `0700` directory / `0600` files) and `runtime/team-market-audits`; preserve their hashes off-checkout before cleanup or redeploy.

### 2026-07-03 Hero Studio and Main Stage carousel

- Replaced the direct single EventTile placement on `/` and `/lobby` with a
  typed Hero carousel while preserving the Wolomania composition as the hard
  runtime fallback.
- Added `/admin/hero-studio` for the reusable screen library, ordering,
  enabled state, schedules, per-screen durations and links, global transition
  presets, desktop/mobile preview, atomic publication revisions, and rollback.
- Added Featured Event, Wolo Chronicle, Warrior Quote, and generic Media
  Takeover renderers. EventTile and ForumThread remain their own source-of-truth
  models.
- Added `hero_playlists`, `hero_screens`, `hero_playlist_items`, and
  `hero_playlist_publications` in
  `20260703_193000_add_hero_studio`; the follow-up
  `20260703_200000_publish_hero_bootstrap` seals the seeded three-screen chain
  as immutable revision 1 so later draft edits are private immediately.
- Media Armory now accepts `motion` MP4/WEBM assets up to 48 MB. The managed
  upload serving route supports byte ranges for video playback.
- Reuse `/mnt/HC_Volume_105319120/aoe2-managed-assets`, keep it owned by
  `tony:tony`, and preserve `MANAGED_MEDIA_UPLOAD_DIR` in the production web env.
- Deployment requires `npx prisma migrate deploy`, explicit verification of
  the four `hero_*` tables, build, restart, and public `/` plus
  `/admin/hero-studio` smoke checks.

### 2026-07-01 War Room forum and Wolo Chronicles

- Replaced the inert `/forum` display shell with a real browsable War Room while preserving the original focused composition as Basic.
- Advanced is the persistent default at `75rem`; it adds the Wolo Chronicles lead, room signals, thread excerpts, and field-manual context. Extreme currently widens the Advanced kit to `96rem`.
- Added working search, tabs, channels, feed shelves, read state, bookmarks, direct-linked thread readers, copy links, new-thread publishing, replies, and named reactions.
- Added `forum_threads`, `forum_posts`, `forum_thread_bookmarks`, and `forum_thread_reactions` in `20260701221500_add_war_room_forum`.
- The editorial archive remains readable and clickable before migration. `/api/forum` returns HTTP 200 with `ledgerAvailable=false` and `X-AoE2WAR-Forum-Ledger: migration-required`; shared writes stay disabled.
- Deployment requires `npx prisma migrate deploy` before the production build and restart. Verify `ledgerAvailable=true` after migration.

### 2026-06-20 Lobby Event Studio App Pass A

- Added persistent `event_tiles` content and `/admin/events` operator controls for the single cinematic tile shared by `/` and `/lobby`.
- Seeded the currently shipped Wolomania Jim / Julio / Commissioner / championship-belt composition as the active published event without replacing its real warrior or artifact art.
- The public routes fall back to that same hardcoded Wolomania composition if no active published row exists or EventTile persistence is unavailable.
- Event Studio supports create, edit, duplicate, publish, activate, unpublish, archive, safe internal/HTTPS media paths, and exact desktop/mobile public-component previews.
- Featured Warriors, Commissioner Overrides, Featured Warriors stat rotation, and chain behavior are unchanged in this pass.
- Deployment requires `npx prisma migrate deploy` before the production build and restart.

### 2026-06-19 War Trophy foundation

- Added persistent Trophy, economics-version, challenge, payout, event, and
  settings tables.
- Added `/admin/trophies` with holder/Guardian custody, belt/artifact
  definitions, explicit nationality-forfeiture review, replay verification,
  dry-run settlement, payout retry, chain-intent diagnostics, and audit tabs.
- Seeded Canada/USA/Mexico/UK national belts plus the Elite Guardian-held belt.
- Public Champions and Profile surfaces now read live app-side custody and show
  projected dethrone bounties.
- Seeded-title challenge links create a linked TrophyChallenge beside the
  existing scheduled match and validate holder/Guardian targeting plus
  nationality/ELO eligibility.
- Deployment requires `npx prisma migrate deploy` before the production build
  and restart.
- Chain-backed trophy mode remains disabled. NFT operations are logged intents,
  not WoloChain ownership changes.

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
curl -I https://aoe2war.com/champions
curl -I https://aoe2war.com/players
curl -I https://aoe2war.com/contact-emaren
curl -I https://aoe2war.com/forum
curl -s https://aoe2war.com/api/forum | jq '{ledgerAvailable, threadCount: (.threads | length), firstThread: .threads[0].title}'
curl -s https://aoe2war.com/api/trophies | jq '{count: (.trophies | length), trophies: [.trophies[] | {trophyId, status, currentHolder, guardianHolder, chainStatus}]}'
curl -s https://aoe2war.com/api/trophies/canada_champion_belt/metadata | jq '{name, external_url, attributes}'
curl -s https://aoe2war.com/api/lobby | jq '.leaderboard.trackedPlayers, (.leaderboard.entries | length)'
curl -s 'https://aoe2war.com/api/lobby/leaderboard?lane=rm&scope=all&offset=0&limit=50' \
  | jq -e '.scope == "all" and (.entries | length) <= 50 and ([.entries[].rank] == [range(1; 1 + (.entries | length))])'
curl -s 'https://aoe2war.com/api/lobby/leaderboard?lane=rm&scope=all&offset=50&limit=50' \
  | jq -e '.scope == "all" and (.entries | length) <= 50 and ([.entries[].rank] == [range(51; 51 + (.entries | length))])'
curl -s 'https://aoe2war.com/api/lobby/leaderboard?lane=rm&scope=claimed&offset=0&limit=50' \
  | jq -e '.scope == "claimed" and .trackedPlayers == 16 and .claimedIdentityRows == 16 and ([.entries[].rank] == [range(1; 1 + (.entries | length))]) and (all(.entries[].uid; . != "aoe2hd_ai_concierge" and . != "aoe2hd_ai_grimer" and . != "aoe2hd_ai_guy" and . != "challenge-protocol"))'
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
6. `/leaderboard` defaults to the full board, loads sequential ranks without
   off-page insertions, and toggles to 16 public AoE2WAR profiles with
   contiguous scope ranks
7. The AI Scribe, Grimer, Guy of Moxica, and Challenge Protocol do not appear
   under either scope; a public user with the same display name remains
   eligible because exclusion is UID-based
8. `/bets` reports live escrow truth and can still open a real lock flow in-browser
9. tournament panel loads cleanly
10. `/live-games` responds
11. same-origin `/api/lobby` returns a believable snapshot shape
12. browser stream routes exist: `/api/streams/active` returns JSON, and `game_watch_streams` has the browser-stream columns after `npx prisma migrate deploy`
13. `/profile?watcher_stream=1&stream_session=smoke&stream_title=Smoke%20Match` renders the streamer studio without losing the watcher handoff params through auth
14. a cancelled or failed Keplr/Ledger stake attempt records a `bet_wallet_error` activity event when it fails before stake-intent creation
15. `/api/admin/users/rails` includes `walletFriction`, and `/admin/wolochain` renders the wallet-friction rail
16. signed-stake recovery still requires a real tx hash, while recent no-proof stake intents remain visible as pending proof rows
17. recent settled `/bets` results show one row per linked session, preferring challenge-linked books over watcher shadows

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
- dedicated nginx request-log runbook for AoE2 Phase 1 lives at [deploy/aoe2-access-logging-phase1.md](deploy/aoe2-access-logging-phase1.md)


## Staking unstake signer

`/api/staking/unstake` must use the staking custody rail.

Preferred live setup:

- key name: `staking`
- home: `/var/lib/wolochaind-testnet`
- CLI: `/var/www/WoloChain/build/wolochaind`
- keyring backend: `test`
- fee: `5000uwolo`

Do not route staking unstake through the generic betting payout service. That path has different settlement headroom semantics and can block valid staking returns.
