---
id: "aoe2war.app-prodn.r25-deployment-census"
title: "R25 Product and Workspace Deployment Census"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","vpssentry","aoe2-watcher","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "source-route-deployment-evidence-not-production-authorization"
reviewed_at: "2026-10-31"
review_interval_days: 7
sensitivity: "internal"
---

# R25 Product and Workspace Deployment Census


**Truth standard:** route/source presence, staged Next build, live deployment and authenticated browser proof are different. [Full machine-readable 433-route matrix](r25-deployment-routes.v1.json) includes complete immutable Git blob SHAs, classifications, main/integration status, exact source file, dependency, owner and next action per page/API. Browser proof of new #1061: **zero routes**.

## Source comparison / current deployment
| Source class | Frozen #1061 | Post-W1 integration | Missing or drifted |
|---|---:|---:|---|
| Next App Router pages | 148 | 151 | 3 new Central Command private pages |
| API handler route templates | 278 | 282 | 4 new handler paths |
| Same-URL page source version drift | — | 3 | `/admin`, `/admin/aoe2war-os`, `/admin/storage-os` |
| Same-URL API source version drift | — | 5 | `/api/admin/replay-auto-recovery`, `/api/bets`, `/api/challenges/reconcile`, `/api/header-summary`, `/api/live-games` |
| Kingdom Index source public card registry | 88 | 88 at frozen snapshot | Not the count of all site pages |
| #1061 LIVE_VERIFIED routes | 0 | 0 | Public serves older Tournament Lobby; no exact build ID/public G AFTER |

Frozen [#1061](https://github.com/Emaren/app-prodn/pull/1061) `0cee3c836c4b0760478280c145e02e81e470ce0e` had independent C physical BUILD_STAGED (87,038 files, tree SHA256 `5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d`, Next BUILD_ID `-dJl5VyecHu5BKNvfErJe`). E recovery READY already accepted. B installed 3031 and F Nginx cutover not proven in [Central #934 latest dispatch](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6549517459). **No rebuild, no P0 gate from this matrix.**

## Evidence and route-status semantics
**LIVE_VERIFIED** exact public/auth browser+BUILD_ID/static witness (none for new candidate); **PUBLIC_UNVERIFIED** old lobby responds but not new candidate; **AUTH_ONLY** source route protected by `app/admin/layout.tsx` and/or handler, without current auth browser proof; **BUILD_STAGED** source file included in sealed build tree, per-route HTTP untested; **SOURCE_ONLY** merged post-W1 but absent #1061; **DRAFT** no Next page yet; **HELD** separate Wolo/financial authority; **RETIRED** only after a positive retirement receipt (no such claim). Source `app/admin/layout.tsx` requires `requireServerAdmin`; do not confuse expected anonymous denial with missing site.

## Every page template (151 rows)
| Route | Status | Frozen source? | Main merged? | Post-W1 drift? | Feature owner | Exact source file | Batch |
|---|---|---|---|---|---|---|---|
| `/about` | BUILD_STAGED | YES | YES | — | Public product | `app/about/page.tsx` | B1 |
| `/academy` | BUILD_STAGED | YES | YES | — | Public product | `app/academy/page.tsx` | B1 |
| `/admin/ai` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/ai/page.tsx` | B1 |
| `/admin/aoe2war-os` | AUTH_ONLY | YES | YES | YES | Admin products | `app/admin/aoe2war-os/page.tsx` | B2 |
| `/admin/auto-bets` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/auto-bets/page.tsx` | B1 |
| `/admin/bounties` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/bounties/page.tsx` | B1 |
| `/admin/central-command/job-board` | SOURCE_ONLY | NO | NO | — | Central Command | `app/admin/central-command/job-board/page.tsx` | B2 |
| `/admin/central-command/lanes` | SOURCE_ONLY | NO | NO | — | Central Command | `app/admin/central-command/lanes/page.tsx` | B2 |
| `/admin/central-command` | AUTH_ONLY | YES | YES | — | Central Command | `app/admin/central-command/page.tsx` | B1 |
| `/admin/central-command/work-board` | SOURCE_ONLY | NO | NO | — | Central Command | `app/admin/central-command/work-board/page.tsx` | B2 |
| `/admin/clans` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/clans/page.tsx` | B1 |
| `/admin/events` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/events/page.tsx` | B1 |
| `/admin/forum-editor` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/forum-editor/page.tsx` | B1 |
| `/admin/hero-studio` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/hero-studio/page.tsx` | B1 |
| `/admin/kingdom-bettors` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/kingdom-bettors/page.tsx` | B1 |
| `/admin/living-kingdom/[uid]` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/living-kingdom/[uid]/page.tsx` | B1 |
| `/admin/living-kingdom` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/living-kingdom/page.tsx` | B1 |
| `/admin/market-integrity` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/market-integrity/page.tsx` | B1 |
| `/admin/marketplace` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/marketplace/page.tsx` | B1 |
| `/admin/media-assets` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/media-assets/page.tsx` | B1 |
| `/admin/oracle` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/oracle/page.tsx` | B1 |
| `/admin/page-heroes` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/page-heroes/page.tsx` | B1 |
| `/admin` | AUTH_ONLY | YES | YES | YES | Admin products | `app/admin/page.tsx` | B2 |
| `/admin/parser-lab` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/parser-lab/page.tsx` | B1 |
| `/admin/radio` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/radio/page.tsx` | B1 |
| `/admin/replay-review` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/replay-review/page.tsx` | B1 |
| `/admin/storage-os` | AUTH_ONLY | YES | YES | YES | Storage OS | `app/admin/storage-os/page.tsx` | B2 |
| `/admin/traffic` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/traffic/page.tsx` | B1 |
| `/admin/translations` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/translations/page.tsx` | B1 |
| `/admin/trophies` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/trophies/page.tsx` | B1 |
| `/admin/user-list` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/user-list/page.tsx` | B1 |
| `/admin/watcher-funnel` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/watcher-funnel/page.tsx` | B1 |
| `/admin/wolo-transactions` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/wolo-transactions/page.tsx` | B1 |
| `/admin/wolochain` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/wolochain/page.tsx` | B1 |
| `/admin/workshop` | AUTH_ONLY | YES | YES | — | Admin products | `app/admin/workshop/page.tsx` | B1 |
| `/ai` | BUILD_STAGED | YES | YES | — | Public product | `app/ai/page.tsx` | B1 |
| `/aoe2war-os` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/aoe2war-os/page.tsx` | B1 |
| `/app` | BUILD_STAGED | YES | YES | — | Public product | `app/app/page.tsx` | B1 |
| `/battle-archive` | BUILD_STAGED | YES | YES | — | Public product | `app/battle-archive/page.tsx` | B1 |
| `/belts` | BUILD_STAGED | YES | YES | — | Public product | `app/belts/page.tsx` | B1 |
| `/bets/[marketId]` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/bets/[marketId]/page.tsx` | B1 |
| `/bets` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/bets/page.tsx` | B1 |
| `/betting-mechanics` | BUILD_STAGED | YES | YES | — | Public product | `app/betting-mechanics/page.tsx` | B1 |
| `/bounties` | BUILD_STAGED | YES | YES | — | Public product | `app/bounties/page.tsx` | B1 |
| `/challenge/[id]` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/challenge/[id]/page.tsx` | B1 |
| `/challenge` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/challenge/page.tsx` | B1 |
| `/champions/[...slug]` | BUILD_STAGED | YES | YES | — | HD competitive | `app/champions/[...slug]/page.tsx` | B1 |
| `/champions/e2` | BUILD_STAGED | YES | YES | — | HD competitive | `app/champions/e2/page.tsx` | B1 |
| `/champions/e3` | BUILD_STAGED | YES | YES | — | HD competitive | `app/champions/e3/page.tsx` | B1 |
| `/champions/e4` | BUILD_STAGED | YES | YES | — | HD competitive | `app/champions/e4/page.tsx` | B1 |
| `/champions/e5` | BUILD_STAGED | YES | YES | — | HD competitive | `app/champions/e5/page.tsx` | B1 |
| `/champions/legacy` | BUILD_STAGED | YES | YES | — | HD competitive | `app/champions/legacy/page.tsx` | B1 |
| `/champions` | BUILD_STAGED | YES | YES | — | HD competitive | `app/champions/page.tsx` | B1 |
| `/chaosium` | BUILD_STAGED | YES | YES | — | Public product | `app/chaosium/page.tsx` | B1 |
| `/clans/[slug]` | BUILD_STAGED | YES | YES | — | Public product | `app/clans/[slug]/page.tsx` | B1 |
| `/clans` | BUILD_STAGED | YES | YES | — | Public product | `app/clans/page.tsx` | B1 |
| `/connect-wallet` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/connect-wallet/page.tsx` | B1 |
| `/contact-emaren` | BUILD_STAGED | YES | YES | — | Public product | `app/contact-emaren/page.tsx` | B1 |
| `/download` | BUILD_STAGED | YES | YES | — | Public product | `app/download/page.tsx` | B1 |
| `/forum` | BUILD_STAGED | YES | YES | — | Public product | `app/forum/page.tsx` | B1 |
| `/forum/thread/[slug]` | BUILD_STAGED | YES | YES | — | Public product | `app/forum/thread/[slug]/page.tsx` | B1 |
| `/game-stats/[id]` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/game-stats/[id]/page.tsx` | B1 |
| `/game-stats/[id]/review` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/game-stats/[id]/review/page.tsx` | B1 |
| `/game-stats/live/[sessionKey]` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/game-stats/live/[sessionKey]/page.tsx` | B1 |
| `/game-stats` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/game-stats/page.tsx` | B1 |
| `/general-inspections` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/general-inspections/page.tsx` | B1 |
| `/hd-replay-engine` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/hd-replay-engine/page.tsx` | B1 |
| `/kingdom-agents` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-agents/page.tsx` | B1 |
| `/kingdom-bettors` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-bettors/page.tsx` | B1 |
| `/kingdom-brain` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-brain/page.tsx` | B1 |
| `/kingdom-forge` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-forge/page.tsx` | B1 |
| `/kingdom-index` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-index/page.tsx` | B1 |
| `/kingdom-intelligence` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-intelligence/page.tsx` | B1 |
| `/kingdom-progress` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-progress/page.tsx` | B1 |
| `/kingdom-recovery` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-recovery/page.tsx` | B1 |
| `/kingdom-sensors` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-sensors/page.tsx` | B1 |
| `/kingdom-systems` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-systems/page.tsx` | B1 |
| `/kingdom-tests` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-tests/page.tsx` | B1 |
| `/kingdom-treasury` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom-treasury/page.tsx` | B1 |
| `/kingdom` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/kingdom/page.tsx` | B1 |
| `/leaderboard/og` | BUILD_STAGED | YES | YES | — | HD competitive | `app/leaderboard/og/page.tsx` | B1 |
| `/leaderboard` | BUILD_STAGED | YES | YES | — | HD competitive | `app/leaderboard/page.tsx` | B1 |
| `/leagues/[slug]` | BUILD_STAGED | YES | YES | — | HD competitive | `app/leagues/[slug]/page.tsx` | B1 |
| `/leagues` | BUILD_STAGED | YES | YES | — | HD competitive | `app/leagues/page.tsx` | B1 |
| `/library` | BUILD_STAGED | YES | YES | — | Public product | `app/library/page.tsx` | B1 |
| `/live-games` | BUILD_STAGED | YES | YES | — | Public product | `app/live-games/page.tsx` | B1 |
| `/lobby` | BUILD_STAGED | YES | YES | — | Public product | `app/lobby/page.tsx` | B1 |
| `/market/invoices/[publicId]` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/market/invoices/[publicId]/page.tsx` | B1 |
| `/market/kingdom/[slug]` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/market/kingdom/[slug]/page.tsx` | B1 |
| `/market` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/market/page.tsx` | B1 |
| `/market/shops/[slug]` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/market/shops/[slug]/page.tsx` | B1 |
| `/matchups/[left]/[right]` | BUILD_STAGED | YES | YES | — | Public product | `app/matchups/[left]/[right]/page.tsx` | B1 |
| `/matchups/team/[left]/[right]` | BUILD_STAGED | YES | YES | — | Public product | `app/matchups/team/[left]/[right]/page.tsx` | B1 |
| `/national-champions` | BUILD_STAGED | YES | YES | — | HD competitive | `app/national-champions/page.tsx` | B1 |
| `/nations` | BUILD_STAGED | YES | YES | — | Public product | `app/nations/page.tsx` | B1 |
| `/offline` | BUILD_STAGED | YES | YES | — | Public product | `app/offline/page.tsx` | B1 |
| `/olympia` | BUILD_STAGED | YES | YES | — | Public product | `app/olympia/page.tsx` | B1 |
| `/oracle/[slug]` | BUILD_STAGED | YES | YES | — | Public product | `app/oracle/[slug]/page.tsx` | B1 |
| `/oracle` | BUILD_STAGED | YES | YES | — | Public product | `app/oracle/page.tsx` | B1 |
| `/` | PUBLIC_UNVERIFIED | YES | YES | — | Public product | `app/page.tsx` | B1 |
| `/past-earnings` | BUILD_STAGED | YES | YES | — | Public product | `app/past-earnings/page.tsx` | B1 |
| `/pending-bets` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/pending-bets/page.tsx` | B1 |
| `/players/[uid]` | BUILD_STAGED | YES | YES | — | HD competitive | `app/players/[uid]/page.tsx` | B1 |
| `/players/by-name/[name]` | BUILD_STAGED | YES | YES | — | HD competitive | `app/players/by-name/[name]/page.tsx` | B1 |
| `/players` | BUILD_STAGED | YES | YES | — | HD competitive | `app/players/page.tsx` | B1 |
| `/profile` | BUILD_STAGED | YES | YES | — | Public product | `app/profile/page.tsx` | B1 |
| `/radio` | BUILD_STAGED | YES | YES | — | Public product | `app/radio/page.tsx` | B1 |
| `/realm` | BUILD_STAGED | YES | YES | — | Public product | `app/realm/page.tsx` | B1 |
| `/renaissance/arbiter` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/arbiter/page.tsx` | B1 |
| `/renaissance/architect` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/architect/page.tsx` | B1 |
| `/renaissance/atlas` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/atlas/page.tsx` | B1 |
| `/renaissance/chronicles` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/chronicles/page.tsx` | B1 |
| `/renaissance/circuit` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/circuit/page.tsx` | B1 |
| `/renaissance/doctor` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/doctor/page.tsx` | B1 |
| `/renaissance/forge` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/forge/page.tsx` | B1 |
| `/renaissance/marshal` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/marshal/page.tsx` | B1 |
| `/renaissance` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/page.tsx` | B1 |
| `/renaissance/sentinel` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/sentinel/page.tsx` | B1 |
| `/renaissance/train` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/train/page.tsx` | B1 |
| `/renaissance/vault` | BUILD_STAGED | YES | YES | — | Renaissance | `app/renaissance/vault/page.tsx` | B1 |
| `/replay-laboratory` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/replay-laboratory/page.tsx` | B1 |
| `/replay-parser` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/replay-parser/page.tsx` | B1 |
| `/requests` | BUILD_STAGED | YES | YES | — | Public product | `app/requests/page.tsx` | B1 |
| `/rivalries` | BUILD_STAGED | YES | YES | — | HD competitive | `app/rivalries/page.tsx` | B1 |
| `/roadmap` | BUILD_STAGED | YES | YES | — | Public product | `app/roadmap/page.tsx` | B1 |
| `/round-chamber` | BUILD_STAGED | YES | YES | — | Public product | `app/round-chamber/page.tsx` | B1 |
| `/settings` | BUILD_STAGED | YES | YES | — | Public product | `app/settings/page.tsx` | B1 |
| `/speed` | BUILD_STAGED | YES | YES | — | Kingdom / OS | `app/speed/page.tsx` | B1 |
| `/staking` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/staking/page.tsx` | B1 |
| `/staking/stakers/[slug]` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/staking/stakers/[slug]/page.tsx` | B1 |
| `/statistics` | BUILD_STAGED | YES | YES | — | Public product | `app/statistics/page.tsx` | B1 |
| `/submit` | BUILD_STAGED | YES | YES | — | Public product | `app/submit/page.tsx` | B1 |
| `/television-wolo` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/television-wolo/page.tsx` | B1 |
| `/tournaments/[slug]` | BUILD_STAGED | YES | YES | — | HD competitive | `app/tournaments/[slug]/page.tsx` | B1 |
| `/tournaments` | BUILD_STAGED | YES | YES | — | HD competitive | `app/tournaments/page.tsx` | B1 |
| `/traffic` | BUILD_STAGED | YES | YES | — | Public product | `app/traffic/page.tsx` | B1 |
| `/upload` | BUILD_STAGED | YES | YES | — | Public product | `app/upload/page.tsx` | B1 |
| `/users` | BUILD_STAGED | YES | YES | — | Public product | `app/users/page.tsx` | B1 |
| `/wallet` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/wallet/page.tsx` | B1 |
| `/war-chest` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/war-chest/page.tsx` | B1 |
| `/war-engine` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/war-engine/page.tsx` | B1 |
| `/wargraph` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/wargraph/page.tsx` | B1 |
| `/watch/[sessionKey]` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/watch/[sessionKey]/page.tsx` | B1 |
| `/watch` | BUILD_STAGED | YES | YES | — | Watcher / replay | `app/watch/page.tsx` | B1 |
| `/wolo-1` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/wolo-1/page.tsx` | B1 |
| `/wolo-machine` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/wolo-machine/page.tsx` | B1 |
| `/wolo` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/wolo/page.tsx` | B1 |
| `/wolochain` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/wolochain/page.tsx` | B1 |
| `/wolomania` | BUILD_STAGED | YES | YES | — | Betting / financial UI | `app/wolomania/page.tsx` | B1 |
| `/workshop` | BUILD_STAGED | YES | YES | — | Public product | `app/workshop/page.tsx` | B1 |
| `/zodiac` | BUILD_STAGED | YES | YES | — | Public product | `app/zodiac/page.tsx` | B1 |

## Every API handler template (282 rows)
The API ledger is source/provenance only: **never issue POST, settlement or custody calls to verify route availability**.
| Route | Status | Frozen source? | Post-W1 drift? | Owner | Exact source file | Batch |
|---|---|---|---|---|---|---|
| `/api/academy/hero-preference` | BUILD_STAGED | YES | — | Public product | `app/api/academy/hero-preference/route.ts` | B1 |
| `/api/academy/zodiac/lesson` | BUILD_STAGED | YES | — | Public product | `app/api/academy/zodiac/lesson/route.ts` | B1 |
| `/api/admin/ai-agents` | AUTH_ONLY | YES | — | Public product | `app/api/admin/ai-agents/route.ts` | B1 |
| `/api/admin/ai-knowledge` | AUTH_ONLY | YES | — | Public product | `app/api/admin/ai-knowledge/route.ts` | B1 |
| `/api/admin/ai-knowledge/topology` | AUTH_ONLY | YES | — | Public product | `app/api/admin/ai-knowledge/topology/route.ts` | B1 |
| `/api/admin/aoe2war-os` | AUTH_ONLY | YES | — | Public product | `app/api/admin/aoe2war-os/route.ts` | B1 |
| `/api/admin/auto-bets` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/auto-bets/route.ts` | B1 |
| `/api/admin/bets/broadcast-previews` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/bets/broadcast-previews/route.ts` | B1 |
| `/api/admin/bets/markets/[marketId]/founders` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/bets/markets/[marketId]/founders/route.ts` | B1 |
| `/api/admin/betting-bots` | AUTH_ONLY | YES | — | Public product | `app/api/admin/betting-bots/route.ts` | B1 |
| `/api/admin/bounties` | AUTH_ONLY | YES | — | Public product | `app/api/admin/bounties/route.ts` | B1 |
| `/api/admin/central-command/events` | SOURCE_ONLY | NO | — | Public product | `app/api/admin/central-command/events/route.ts` | B2 |
| `/api/admin/central-command` | AUTH_ONLY | YES | — | Public product | `app/api/admin/central-command/route.ts` | B1 |
| `/api/admin/central-command/work-ledger` | SOURCE_ONLY | NO | — | Public product | `app/api/admin/central-command/work-ledger/route.ts` | B2 |
| `/api/admin/championship-challenges` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/championship-challenges/route.ts` | B1 |
| `/api/admin/championship-transfers` | AUTH_ONLY | YES | — | HD competitive | `app/api/admin/championship-transfers/route.ts` | B1 |
| `/api/admin/clans/crests` | AUTH_ONLY | YES | — | Public product | `app/api/admin/clans/crests/route.ts` | B1 |
| `/api/admin/clans` | AUTH_ONLY | YES | — | Public product | `app/api/admin/clans/route.ts` | B1 |
| `/api/admin/delete_user/[uid]` | AUTH_ONLY | YES | — | Public product | `app/api/admin/delete_user/[uid]/route.ts` | B1 |
| `/api/admin/events` | AUTH_ONLY | YES | — | Public product | `app/api/admin/events/route.ts` | B1 |
| `/api/admin/hero-stage-takeover` | AUTH_ONLY | YES | — | Public product | `app/api/admin/hero-stage-takeover/route.ts` | B1 |
| `/api/admin/hero-studio` | AUTH_ONLY | YES | — | Public product | `app/api/admin/hero-studio/route.ts` | B1 |
| `/api/admin/kingdom-bettors/nominations` | AUTH_ONLY | YES | — | Public product | `app/api/admin/kingdom-bettors/nominations/route.ts` | B1 |
| `/api/admin/kingdom-bettors/personas` | AUTH_ONLY | YES | — | Public product | `app/api/admin/kingdom-bettors/personas/route.ts` | B1 |
| `/api/admin/kingdom-presence` | AUTH_ONLY | YES | — | Public product | `app/api/admin/kingdom-presence/route.ts` | B1 |
| `/api/admin/live-ticker` | AUTH_ONLY | YES | — | Public product | `app/api/admin/live-ticker/route.ts` | B1 |
| `/api/admin/living-kingdom/[uid]` | AUTH_ONLY | YES | — | Public product | `app/api/admin/living-kingdom/[uid]/route.ts` | B1 |
| `/api/admin/living-kingdom` | AUTH_ONLY | YES | — | Public product | `app/api/admin/living-kingdom/route.ts` | B1 |
| `/api/admin/media-assets/[assetId]` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/[assetId]/route.ts` | B1 |
| `/api/admin/media-assets/assign-user-assets` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/assign-user-assets/route.ts` | B1 |
| `/api/admin/media-assets/assign-user-avatar` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/assign-user-avatar/route.ts` | B1 |
| `/api/admin/media-assets/batch` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/batch/route.ts` | B1 |
| `/api/admin/media-assets/ensure-user` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/ensure-user/route.ts` | B1 |
| `/api/admin/media-assets` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/route.ts` | B1 |
| `/api/admin/media-assets/set-user-featured-avatar` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/set-user-featured-avatar/route.ts` | B1 |
| `/api/admin/media-assets/system-message-test` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/system-message-test/route.ts` | B1 |
| `/api/admin/media-assets/user-profile` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/user-profile/route.ts` | B1 |
| `/api/admin/media-assets/users` | AUTH_ONLY | YES | — | Public product | `app/api/admin/media-assets/users/route.ts` | B1 |
| `/api/admin/oracle` | AUTH_ONLY | YES | — | Public product | `app/api/admin/oracle/route.ts` | B1 |
| `/api/admin/page-heroes` | AUTH_ONLY | YES | — | Public product | `app/api/admin/page-heroes/route.ts` | B1 |
| `/api/admin/radio-submissions/[id]/[asset]` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio-submissions/[id]/[asset]/route.ts` | B1 |
| `/api/admin/radio-submissions` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio-submissions/route.ts` | B1 |
| `/api/admin/radio/assets/[id]/audio` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/assets/[id]/audio/route.ts` | B1 |
| `/api/admin/radio/assets/[id]` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/assets/[id]/route.ts` | B1 |
| `/api/admin/radio/assets` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/assets/route.ts` | B1 |
| `/api/admin/radio/listeners` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/listeners/route.ts` | B1 |
| `/api/admin/radio/programs/[id]/items` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/programs/[id]/items/route.ts` | B1 |
| `/api/admin/radio/programs/[id]` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/programs/[id]/route.ts` | B1 |
| `/api/admin/radio/programs` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/programs/route.ts` | B1 |
| `/api/admin/radio/station` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/station/route.ts` | B1 |
| `/api/admin/radio/station/start` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/station/start/route.ts` | B1 |
| `/api/admin/radio/station/stop` | AUTH_ONLY | YES | — | Public product | `app/api/admin/radio/station/stop/route.ts` | B1 |
| `/api/admin/replay-auto-recovery` | AUTH_ONLY | YES | YES | Watcher / replay | `app/api/admin/replay-auto-recovery/route.ts` | B2 |
| `/api/admin/replay-operations/candidate-plan` | AUTH_ONLY | YES | — | Watcher / replay | `app/api/admin/replay-operations/candidate-plan/route.ts` | B1 |
| `/api/admin/replay-operations/inventory` | AUTH_ONLY | YES | — | Watcher / replay | `app/api/admin/replay-operations/inventory/route.ts` | B1 |
| `/api/admin/replay-operations/job-receipts` | AUTH_ONLY | YES | — | Watcher / replay | `app/api/admin/replay-operations/job-receipts/route.ts` | B1 |
| `/api/admin/replay-operations/player-recovery` | AUTH_ONLY | YES | — | Watcher / replay | `app/api/admin/replay-operations/player-recovery/route.ts` | B1 |
| `/api/admin/replay-operations/review-queue` | AUTH_ONLY | YES | — | Watcher / replay | `app/api/admin/replay-operations/review-queue/route.ts` | B1 |
| `/api/admin/replay-operations/run-candidates` | AUTH_ONLY | YES | — | Watcher / replay | `app/api/admin/replay-operations/run-candidates/route.ts` | B1 |
| `/api/admin/replay-results/[id]/financial-authority` | AUTH_ONLY | YES | — | Watcher / replay | `app/api/admin/replay-results/[id]/financial-authority/route.ts` | B1 |
| `/api/admin/replay-roster-recovery` | AUTH_ONLY | YES | — | Watcher / replay | `app/api/admin/replay-roster-recovery/route.ts` | B1 |
| `/api/admin/site-theme-campaign` | AUTH_ONLY | YES | — | Public product | `app/api/admin/site-theme-campaign/route.ts` | B1 |
| `/api/admin/storage-os/freshness` | SOURCE_ONLY | NO | — | Public product | `app/api/admin/storage-os/freshness/route.ts` | B2 |
| `/api/admin/storage-os/reviews` | AUTH_ONLY | YES | — | Public product | `app/api/admin/storage-os/reviews/route.ts` | B1 |
| `/api/admin/storage-os` | AUTH_ONLY | YES | — | Public product | `app/api/admin/storage-os/route.ts` | B1 |
| `/api/admin/streams/retained-demo` | AUTH_ONLY | YES | — | Public product | `app/api/admin/streams/retained-demo/route.ts` | B1 |
| `/api/admin/tournament/matches` | AUTH_ONLY | YES | — | Public product | `app/api/admin/tournament/matches/route.ts` | B1 |
| `/api/admin/tournament` | AUTH_ONLY | YES | — | Public product | `app/api/admin/tournament/route.ts` | B1 |
| `/api/admin/translations` | AUTH_ONLY | YES | — | Public product | `app/api/admin/translations/route.ts` | B1 |
| `/api/admin/trophies` | AUTH_ONLY | YES | — | Public product | `app/api/admin/trophies/route.ts` | B1 |
| `/api/admin/users/[uid]/activity` | AUTH_ONLY | YES | — | Public product | `app/api/admin/users/[uid]/activity/route.ts` | B1 |
| `/api/admin/users/[uid]/community` | AUTH_ONLY | YES | — | Public product | `app/api/admin/users/[uid]/community/route.ts` | B1 |
| `/api/admin/users/live` | AUTH_ONLY | YES | — | Public product | `app/api/admin/users/live/route.ts` | B1 |
| `/api/admin/users/rails` | AUTH_ONLY | YES | — | Public product | `app/api/admin/users/rails/route.ts` | B1 |
| `/api/admin/users` | AUTH_ONLY | YES | — | Public product | `app/api/admin/users/route.ts` | B1 |
| `/api/admin/wolo-claims/[claimId]` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolo-claims/[claimId]/route.ts` | B1 |
| `/api/admin/wolo-claims` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolo-claims/route.ts` | B1 |
| `/api/admin/wolo-transfers/backfill` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolo-transfers/backfill/route.ts` | B1 |
| `/api/admin/wolochain/activity` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolochain/activity/route.ts` | B1 |
| `/api/admin/wolochain` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolochain/route.ts` | B1 |
| `/api/admin/wolochain/scheduled-settlements/[id]/execute` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolochain/scheduled-settlements/[id]/execute/route.ts` | B1 |
| `/api/admin/wolochain/scheduled-settlements` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolochain/scheduled-settlements/route.ts` | B1 |
| `/api/admin/wolochain/staking-treasury-payouts/[id]/execute` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolochain/staking-treasury-payouts/[id]/execute/route.ts` | B1 |
| `/api/admin/wolochain/staking-treasury-payouts` | AUTH_ONLY | YES | — | Betting / financial UI | `app/api/admin/wolochain/staking-treasury-payouts/route.ts` | B1 |
| `/api/admin/workshop` | AUTH_ONLY | YES | — | Public product | `app/api/admin/workshop/route.ts` | B1 |
| `/api/ai/council` | BUILD_STAGED | YES | — | Public product | `app/api/ai/council/route.ts` | B1 |
| `/api/aoe2war-os` | BUILD_STAGED | YES | — | Public product | `app/api/aoe2war-os/route.ts` | B1 |
| `/api/auth/session` | BUILD_STAGED | YES | — | Public product | `app/api/auth/session/route.ts` | B1 |
| `/api/auth/steam` | BUILD_STAGED | YES | — | Public product | `app/api/auth/steam/route.ts` | B1 |
| `/api/bets` | BUILD_STAGED | YES | YES | Betting / financial UI | `app/api/bets/route.ts` | B2 |
| `/api/bets/stake-intents/[intentId]` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/bets/stake-intents/[intentId]/route.ts` | B1 |
| `/api/bets/stake-intents` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/bets/stake-intents/route.ts` | B1 |
| `/api/bets/stake-reconciliation` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/bets/stake-reconciliation/route.ts` | B1 |
| `/api/bets/tickets/[ticketId]/commit` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/bets/tickets/[ticketId]/commit/route.ts` | B1 |
| `/api/bets/tickets/[ticketId]/recover` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/bets/tickets/[ticketId]/recover/route.ts` | B1 |
| `/api/bets/tickets` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/bets/tickets/route.ts` | B1 |
| `/api/bets/wager` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/bets/wager/route.ts` | B1 |
| `/api/bets/wallet-errors` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/bets/wallet-errors/route.ts` | B1 |
| `/api/bounties/advisor` | BUILD_STAGED | YES | — | Public product | `app/api/bounties/advisor/route.ts` | B1 |
| `/api/chain-id` | BUILD_STAGED | YES | — | Public product | `app/api/chain-id/route.ts` | B1 |
| `/api/challenges/[id]/preference` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/challenges/[id]/preference/route.ts` | B1 |
| `/api/challenges/[id]` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/challenges/[id]/route.ts` | B1 |
| `/api/challenges/history` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/challenges/history/route.ts` | B1 |
| `/api/challenges/reconcile` | BUILD_STAGED | YES | YES | Betting / financial UI | `app/api/challenges/reconcile/route.ts` | B2 |
| `/api/challenges` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/challenges/route.ts` | B1 |
| `/api/championships/held` | BUILD_STAGED | YES | — | HD competitive | `app/api/championships/held/route.ts` | B1 |
| `/api/clans/[slug]/attachments/[attachmentId]` | BUILD_STAGED | YES | — | Public product | `app/api/clans/[slug]/attachments/[attachmentId]/route.ts` | B1 |
| `/api/clans/[slug]/events` | BUILD_STAGED | YES | — | Public product | `app/api/clans/[slug]/events/route.ts` | B1 |
| `/api/clans/[slug]/invite-search` | BUILD_STAGED | YES | — | Public product | `app/api/clans/[slug]/invite-search/route.ts` | B1 |
| `/api/clans/[slug]/invites` | BUILD_STAGED | YES | — | Public product | `app/api/clans/[slug]/invites/route.ts` | B1 |
| `/api/clans/[slug]/messages/[messageId]/translate` | BUILD_STAGED | YES | — | Public product | `app/api/clans/[slug]/messages/[messageId]/translate/route.ts` | B1 |
| `/api/clans/[slug]/presence` | BUILD_STAGED | YES | — | Public product | `app/api/clans/[slug]/presence/route.ts` | B1 |
| `/api/clans/[slug]` | BUILD_STAGED | YES | — | Public product | `app/api/clans/[slug]/route.ts` | B1 |
| `/api/clans/purchase` | BUILD_STAGED | YES | — | Public product | `app/api/clans/purchase/route.ts` | B1 |
| `/api/contact-emaren/attachments/[messageId]` | BUILD_STAGED | YES | — | Public product | `app/api/contact-emaren/attachments/[messageId]/route.ts` | B1 |
| `/api/contact-emaren/events` | BUILD_STAGED | YES | — | Public product | `app/api/contact-emaren/events/route.ts` | B1 |
| `/api/contact-emaren/messages/[messageId]/transcribe` | BUILD_STAGED | YES | — | Public product | `app/api/contact-emaren/messages/[messageId]/transcribe/route.ts` | B1 |
| `/api/contact-emaren/messages/[messageId]/translate` | BUILD_STAGED | YES | — | Public product | `app/api/contact-emaren/messages/[messageId]/translate/route.ts` | B1 |
| `/api/contact-emaren` | BUILD_STAGED | YES | — | Public product | `app/api/contact-emaren/route.ts` | B1 |
| `/api/contact-emaren/search` | BUILD_STAGED | YES | — | Public product | `app/api/contact-emaren/search/route.ts` | B1 |
| `/api/deployment-version` | BUILD_STAGED | YES | — | Public product | `app/api/deployment-version/route.ts` | B1 |
| `/api/forum` | BUILD_STAGED | YES | — | Public product | `app/api/forum/route.ts` | B1 |
| `/api/game-stats/live` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/game-stats/live/route.ts` | B1 |
| `/api/game_stats` | BUILD_STAGED | YES | — | Public product | `app/api/game_stats/route.ts` | B1 |
| `/api/general-inspections` | BUILD_STAGED | YES | — | Public product | `app/api/general-inspections/route.ts` | B1 |
| `/api/hd-replay-engine` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/hd-replay-engine/route.ts` | B1 |
| `/api/header-summary` | BUILD_STAGED | YES | YES | Public product | `app/api/header-summary/route.ts` | B2 |
| `/api/hero-stage-takeover/image/[file]` | BUILD_STAGED | YES | — | Public product | `app/api/hero-stage-takeover/image/[file]/route.ts` | B1 |
| `/api/hero-stage-takeover` | BUILD_STAGED | YES | — | Public product | `app/api/hero-stage-takeover/route.ts` | B1 |
| `/api/internal/aoe2war-os/bridge` | BUILD_STAGED | YES | — | Public product | `app/api/internal/aoe2war-os/bridge/route.ts` | B1 |
| `/api/internal/aoe2war-os/native-replay/artifact` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/internal/aoe2war-os/native-replay/artifact/route.ts` | B1 |
| `/api/kingdom-agents` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-agents/route.ts` | B1 |
| `/api/kingdom-bettors/nominations` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-bettors/nominations/route.ts` | B1 |
| `/api/kingdom-bettors` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-bettors/route.ts` | B1 |
| `/api/kingdom-forge` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-forge/route.ts` | B1 |
| `/api/kingdom-index` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-index/route.ts` | B1 |
| `/api/kingdom-intelligence/live-recovery` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-intelligence/live-recovery/route.ts` | B1 |
| `/api/kingdom-intelligence` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-intelligence/route.ts` | B1 |
| `/api/kingdom-patrol` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-patrol/route.ts` | B1 |
| `/api/kingdom-presence/anonymous-state` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-presence/anonymous-state/route.ts` | B1 |
| `/api/kingdom-presence/events` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-presence/events/route.ts` | B1 |
| `/api/kingdom-presence/state` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-presence/state/route.ts` | B1 |
| `/api/kingdom-progress` | SOURCE_ONLY | NO | — | Public product | `app/api/kingdom-progress/route.ts` | B2 |
| `/api/kingdom-route-census` | BUILD_STAGED | YES | — | Public product | `app/api/kingdom-route-census/route.ts` | B1 |
| `/api/leaderboard/og` | BUILD_STAGED | YES | — | HD competitive | `app/api/leaderboard/og/route.ts` | B1 |
| `/api/leagues/quote` | BUILD_STAGED | YES | — | HD competitive | `app/api/leagues/quote/route.ts` | B1 |
| `/api/leagues` | BUILD_STAGED | YES | — | HD competitive | `app/api/leagues/route.ts` | B1 |
| `/api/library/activity` | BUILD_STAGED | YES | — | Public product | `app/api/library/activity/route.ts` | B1 |
| `/api/library/census` | BUILD_STAGED | YES | — | Public product | `app/api/library/census/route.ts` | B1 |
| `/api/library/games` | BUILD_STAGED | YES | — | Public product | `app/api/library/games/route.ts` | B1 |
| `/api/live-games` | BUILD_STAGED | YES | YES | Public product | `app/api/live-games/route.ts` | B2 |
| `/api/lobby/chat/reaction` | BUILD_STAGED | YES | — | Public product | `app/api/lobby/chat/reaction/route.ts` | B1 |
| `/api/lobby/chat` | BUILD_STAGED | YES | — | Public product | `app/api/lobby/chat/route.ts` | B1 |
| `/api/lobby/join` | BUILD_STAGED | YES | — | Public product | `app/api/lobby/join/route.ts` | B1 |
| `/api/lobby/leaderboard/locate` | BUILD_STAGED | YES | — | HD competitive | `app/api/lobby/leaderboard/locate/route.ts` | B1 |
| `/api/lobby/leaderboard` | BUILD_STAGED | YES | — | HD competitive | `app/api/lobby/leaderboard/route.ts` | B1 |
| `/api/lobby/recent-matches` | BUILD_STAGED | YES | — | Public product | `app/api/lobby/recent-matches/route.ts` | B1 |
| `/api/lobby` | BUILD_STAGED | YES | — | Public product | `app/api/lobby/route.ts` | B1 |
| `/api/lobby/stream` | BUILD_STAGED | YES | — | Public product | `app/api/lobby/stream/route.ts` | B1 |
| `/api/lobby/wolo-earners` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/lobby/wolo-earners/route.ts` | B1 |
| `/api/market/admin/image` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/admin/image/route.ts` | B1 |
| `/api/market/admin` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/admin/route.ts` | B1 |
| `/api/market/admin/sponsor` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/admin/sponsor/route.ts` | B1 |
| `/api/market/business/develop` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/business/develop/route.ts` | B1 |
| `/api/market/business/image` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/business/image/route.ts` | B1 |
| `/api/market/business/invoices` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/business/invoices/route.ts` | B1 |
| `/api/market/business` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/business/route.ts` | B1 |
| `/api/market/business/tax` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/business/tax/route.ts` | B1 |
| `/api/market/invoices/[publicId]` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/invoices/[publicId]/route.ts` | B1 |
| `/api/market/requests` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/requests/route.ts` | B1 |
| `/api/market/shops/[slug]/inquiries` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/market/shops/[slug]/inquiries/route.ts` | B1 |
| `/api/media-assets/[kind]/[target]` | BUILD_STAGED | YES | — | Public product | `app/api/media-assets/[kind]/[target]/route.ts` | B1 |
| `/api/oracle/markets/[slug]` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/oracle/markets/[slug]/route.ts` | B1 |
| `/api/oracle` | BUILD_STAGED | YES | — | Public product | `app/api/oracle/route.ts` | B1 |
| `/api/page-change-notices/content` | BUILD_STAGED | YES | — | Public product | `app/api/page-change-notices/content/route.ts` | B1 |
| `/api/page-change-notices` | BUILD_STAGED | YES | — | Public product | `app/api/page-change-notices/route.ts` | B1 |
| `/api/parsed_replays` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/parsed_replays/route.js` | B1 |
| `/api/player-ai/development-target` | BUILD_STAGED | YES | — | Public product | `app/api/player-ai/development-target/route.ts` | B1 |
| `/api/player-profile/matches` | BUILD_STAGED | YES | — | Public product | `app/api/player-profile/matches/route.ts` | B1 |
| `/api/players/generation` | BUILD_STAGED | YES | — | HD competitive | `app/api/players/generation/route.ts` | B1 |
| `/api/profile-documents/[id]` | BUILD_STAGED | YES | — | Public product | `app/api/profile-documents/[id]/route.ts` | B1 |
| `/api/profile-documents` | BUILD_STAGED | YES | — | Public product | `app/api/profile-documents/route.ts` | B1 |
| `/api/radio/feedback` | BUILD_STAGED | YES | — | Public product | `app/api/radio/feedback/route.ts` | B1 |
| `/api/radio/station/audio/[publicId]` | BUILD_STAGED | YES | — | Public product | `app/api/radio/station/audio/[publicId]/route.ts` | B1 |
| `/api/radio/station` | BUILD_STAGED | YES | — | Public product | `app/api/radio/station/route.ts` | B1 |
| `/api/radio/submissions` | BUILD_STAGED | YES | — | Public product | `app/api/radio/submissions/route.ts` | B1 |
| `/api/radio/tracks/[publicId]/artwork` | BUILD_STAGED | YES | — | Public product | `app/api/radio/tracks/[publicId]/artwork/route.ts` | B1 |
| `/api/radio/tracks/[publicId]/audio` | BUILD_STAGED | YES | — | Public product | `app/api/radio/tracks/[publicId]/audio/route.ts` | B1 |
| `/api/replay-results/[id]/adjudications` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay-results/[id]/adjudications/route.ts` | B1 |
| `/api/replay-results/[id]/desync-incidents` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay-results/[id]/desync-incidents/route.ts` | B1 |
| `/api/replay-results/[id]/evidence/[artifactId]` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay-results/[id]/evidence/[artifactId]/route.ts` | B1 |
| `/api/replay-results/[id]/evidence/analyze` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay-results/[id]/evidence/analyze/route.ts` | B1 |
| `/api/replay-results/[id]/evidence` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay-results/[id]/evidence/route.ts` | B1 |
| `/api/replay-results/[id]/parser-trail` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay-results/[id]/parser-trail/route.ts` | B1 |
| `/api/replay-results/[id]/recovery-proposal` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay-results/[id]/recovery-proposal/route.ts` | B1 |
| `/api/replay-results/[id]/reparse` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay-results/[id]/reparse/route.ts` | B1 |
| `/api/replay/post-ingest` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay/post-ingest/route.ts` | B1 |
| `/api/replay/upload-package` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay/upload-package/route.ts` | B1 |
| `/api/replay/upload` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/replay/upload/route.ts` | B1 |
| `/api/requests` | BUILD_STAGED | YES | — | Public product | `app/api/requests/route.ts` | B1 |
| `/api/round-chamber` | BUILD_STAGED | YES | — | Public product | `app/api/round-chamber/route.ts` | B1 |
| `/api/site-theme-campaign` | BUILD_STAGED | YES | — | Public product | `app/api/site-theme-campaign/route.ts` | B1 |
| `/api/speed/check` | BUILD_STAGED | YES | — | Public product | `app/api/speed/check/route.ts` | B1 |
| `/api/speed/report` | BUILD_STAGED | YES | — | Public product | `app/api/speed/report/route.ts` | B1 |
| `/api/speed/sample` | BUILD_STAGED | YES | — | Public product | `app/api/speed/sample/route.ts` | B1 |
| `/api/staking/activity` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/activity/route.ts` | B1 |
| `/api/staking/auto-compound` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/auto-compound/route.ts` | B1 |
| `/api/staking/claim` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/claim/route.ts` | B1 |
| `/api/staking/config` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/config/route.ts` | B1 |
| `/api/staking/leaderboard` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/leaderboard/route.ts` | B1 |
| `/api/staking/me` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/me/route.ts` | B1 |
| `/api/staking/rewards/run` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/rewards/run/route.ts` | B1 |
| `/api/staking/stake` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/stake/route.ts` | B1 |
| `/api/staking/stakers/[slug]/ledger` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/stakers/[slug]/ledger/route.ts` | B1 |
| `/api/staking/summary` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/summary/route.ts` | B1 |
| `/api/staking/unstake` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/staking/unstake/route.ts` | B1 |
| `/api/statistics` | BUILD_STAGED | YES | — | Public product | `app/api/statistics/route.ts` | B1 |
| `/api/streams/[streamId]/chunks/[sequence]` | BUILD_STAGED | YES | — | Public product | `app/api/streams/[streamId]/chunks/[sequence]/route.ts` | B1 |
| `/api/streams/[streamId]/chunks` | BUILD_STAGED | YES | — | Public product | `app/api/streams/[streamId]/chunks/route.ts` | B1 |
| `/api/streams/[streamId]/end` | BUILD_STAGED | YES | — | Public product | `app/api/streams/[streamId]/end/route.ts` | B1 |
| `/api/streams/[streamId]/heartbeat` | BUILD_STAGED | YES | — | Public product | `app/api/streams/[streamId]/heartbeat/route.ts` | B1 |
| `/api/streams/[streamId]/manifest` | BUILD_STAGED | YES | — | Public product | `app/api/streams/[streamId]/manifest/route.ts` | B1 |
| `/api/streams/[streamId]/rolling-webm` | BUILD_STAGED | YES | — | Public product | `app/api/streams/[streamId]/rolling-webm/route.ts` | B1 |
| `/api/streams/active` | BUILD_STAGED | YES | — | Public product | `app/api/streams/active/route.ts` | B1 |
| `/api/streams/client-event` | BUILD_STAGED | YES | — | Public product | `app/api/streams/client-event/route.ts` | B1 |
| `/api/streams/retained-demo` | BUILD_STAGED | YES | — | Public product | `app/api/streams/retained-demo/route.ts` | B1 |
| `/api/streams/start` | BUILD_STAGED | YES | — | Public product | `app/api/streams/start/route.ts` | B1 |
| `/api/tournaments/roster` | BUILD_STAGED | YES | — | HD competitive | `app/api/tournaments/roster/route.ts` | B1 |
| `/api/traffic/public` | BUILD_STAGED | YES | — | Public product | `app/api/traffic/public/route.ts` | B1 |
| `/api/traffic` | BUILD_STAGED | YES | — | Public product | `app/api/traffic/route.ts` | B1 |
| `/api/trophies/[trophyId]/metadata` | BUILD_STAGED | YES | — | Public product | `app/api/trophies/[trophyId]/metadata/route.ts` | B1 |
| `/api/trophies` | BUILD_STAGED | YES | — | Public product | `app/api/trophies/route.ts` | B1 |
| `/api/trophies/tributes/queue` | BUILD_STAGED | YES | — | Public product | `app/api/trophies/tributes/queue/route.ts` | B1 |
| `/api/user/activity` | BUILD_STAGED | YES | — | Public product | `app/api/user/activity/route.ts` | B1 |
| `/api/user/appearance` | BUILD_STAGED | YES | — | Public product | `app/api/user/appearance/route.ts` | B1 |
| `/api/user/avatar` | BUILD_STAGED | YES | — | Public product | `app/api/user/avatar/route.ts` | B1 |
| `/api/user/bet-automation/executions` | BUILD_STAGED | YES | — | Public product | `app/api/user/bet-automation/executions/route.ts` | B1 |
| `/api/user/bet-automation` | BUILD_STAGED | YES | — | Public product | `app/api/user/bet-automation/route.ts` | B1 |
| `/api/user/clan-crests` | BUILD_STAGED | YES | — | Public product | `app/api/user/clan-crests/route.ts` | B1 |
| `/api/user/exists` | BUILD_STAGED | YES | — | Public product | `app/api/user/exists/route.ts` | B1 |
| `/api/user/experience` | BUILD_STAGED | YES | — | Public product | `app/api/user/experience/route.ts` | B1 |
| `/api/user/hero-language-visibility` | BUILD_STAGED | YES | — | Public product | `app/api/user/hero-language-visibility/route.ts` | B1 |
| `/api/user/kingdom-chronicle-preferences` | BUILD_STAGED | YES | — | Public product | `app/api/user/kingdom-chronicle-preferences/route.ts` | B1 |
| `/api/user/language` | BUILD_STAGED | YES | — | Public product | `app/api/user/language/route.ts` | B1 |
| `/api/user/leaderboard-preferences` | BUILD_STAGED | YES | — | HD competitive | `app/api/user/leaderboard-preferences/route.ts` | B1 |
| `/api/user/me` | BUILD_STAGED | YES | — | Public product | `app/api/user/me/route.ts` | B1 |
| `/api/user/online_users` | BUILD_STAGED | YES | — | Public product | `app/api/user/online_users/route.ts` | B1 |
| `/api/user/ping` | BUILD_STAGED | YES | — | Public product | `app/api/user/ping/route.ts` | B1 |
| `/api/user/presence-preference` | BUILD_STAGED | YES | — | Public product | `app/api/user/presence-preference/route.ts` | B1 |
| `/api/user/register` | BUILD_STAGED | YES | — | Public product | `app/api/user/register/route.ts` | B1 |
| `/api/user/theme-campaign-override` | BUILD_STAGED | YES | — | Public product | `app/api/user/theme-campaign-override/route.ts` | B1 |
| `/api/user/update_name` | BUILD_STAGED | YES | — | Public product | `app/api/user/update_name/route.ts` | B1 |
| `/api/user/war-satchel/deposit-evidence` | BUILD_STAGED | YES | — | Public product | `app/api/user/war-satchel/deposit-evidence/route.ts` | B1 |
| `/api/user/war-satchel/funding-intents` | BUILD_STAGED | YES | — | Public product | `app/api/user/war-satchel/funding-intents/route.ts` | B1 |
| `/api/user/war-satchel/wallet-proof` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/user/war-satchel/wallet-proof/route.ts` | B1 |
| `/api/user/watcher-key` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/user/watcher-key/route.ts` | B1 |
| `/api/user/wolo-claims/claim` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/user/wolo-claims/claim/route.ts` | B1 |
| `/api/user/wolo-transactions` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/user/wolo-transactions/route.ts` | B1 |
| `/api/wargraph/advance` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/wargraph/advance/route.ts` | B1 |
| `/api/wargraph/presence` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/wargraph/presence/route.ts` | B1 |
| `/api/wargraph` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/wargraph/route.ts` | B1 |
| `/api/watch-streams` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/watch-streams/route.ts` | B1 |
| `/api/watcher/events` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/watcher/events/route.ts` | B1 |
| `/api/watcher/release` | BUILD_STAGED | YES | — | Watcher / replay | `app/api/watcher/release/route.ts` | B1 |
| `/api/wolo/balance/[address]` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/balance/[address]/route.ts` | B1 |
| `/api/wolo/daemon-log` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/daemon-log/route.ts` | B1 |
| `/api/wolo/faucet/claim` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/faucet/claim/route.ts` | B1 |
| `/api/wolo/holders` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/holders/route.ts` | B1 |
| `/api/wolo/mainnet-transfers` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/mainnet-transfers/route.ts` | B1 |
| `/api/wolo/moved24h` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/moved24h/route.ts` | B1 |
| `/api/wolo/network` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/network/route.ts` | B1 |
| `/api/wolo/osmosis-pulse` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/osmosis-pulse/route.ts` | B1 |
| `/api/wolo/status` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/status/route.ts` | B1 |
| `/api/wolo/tx/[txHash]` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/tx/[txHash]/route.ts` | B1 |
| `/api/wolo/wallet-dashboard` | BUILD_STAGED | YES | — | Betting / financial UI | `app/api/wolo/wallet-dashboard/route.ts` | B1 |
| `/api/workshop/ask` | BUILD_STAGED | YES | — | Public product | `app/api/workshop/ask/route.ts` | B1 |
| `/api/workshop/chronicle` | BUILD_STAGED | YES | — | Public product | `app/api/workshop/chronicle/route.ts` | B1 |
| `/api/workshop` | BUILD_STAGED | YES | — | Public product | `app/api/workshop/route.ts` | B1 |
| `/api/workshop/sponsor` | BUILD_STAGED | YES | — | Public product | `app/api/workshop/sponsor/route.ts` | B1 |
| `/bets/broadcast-previews/[fileName]` | BUILD_STAGED | YES | — | Betting / financial UI | `app/bets/broadcast-previews/[fileName]/route.ts` | B1 |
| `/download/watcher/[artifact]` | BUILD_STAGED | YES | — | Watcher / replay | `app/download/watcher/[artifact]/route.ts` | B1 |
| `/uploads/managed-assets/[kind]/[file]` | BUILD_STAGED | YES | — | Public product | `app/uploads/managed-assets/[kind]/[file]/route.ts` | B1 |

## Missing interfaces and not-yet-authored route identities
| Feature | Proposed exact path, where declared | Status | Why not currently a deployed page | Owner |
|---|---|---|---|---|
| Backup OS | NO SOURCE ROUTE | SOURCE_ONLY | No standalone Next page; VPSSentry/E backup and storage receipts; private Storage OS is existing home | E |
| Documents OS | NO SOURCE ROUTE | SOURCE_ONLY | DocsV2 source contract exists; no distinct Next page | D |
| Code Health OS | NO SOURCE ROUTE | SOURCE_ONLY | Executable source scanner exists, no distinct website route | D |
| Kingdom Construction | `/kingdom-construction` | DRAFT | #1025 proposes route; no page.tsx | D/G |
| Deployment OS Run-Up | `/aoe2war-os/deployment` | DRAFT | #1093 read model and #1088 policy only, no route | G/D |
| System Composer | NO SOURCE ROUTE | DRAFT | #1090/#1025 proposed Orchestra role, not OS or page | D/G |
| Swarm / Engineering Army | NO SOURCE ROUTE | DRAFT | #1025 source visual design, not autonomous workers or page | D/G |
| Neural graph / loops / hierarchy | NO SOURCE ROUTE | DRAFT | No source route; seven visual IDs not seven running services | D/G |
| Storage Transfer room | NO SOURCE ROUTE | DRAFT | #1016 draft separate from frozen website; source panel version not in #1061 | E/G |
| Wolo funded settlement | NO SOURCE ROUTE | HELD | Separate chain/HD original financial admission, not a page deployment | B / Wolo |

## External estate — not Next route count
VPSSentry/HEL1, Traffic SQLite+WAL, Watcher desktop and AoE2WAR-docs are separate operational source/host/restore estates. WoloChain custody/settlement remains its **own held financial plane**. The website route count does not certify their health or deployment. The user-facing Backup/Docs/Code Health labels do not mean independent daemon/OS worker identities.
