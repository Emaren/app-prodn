---
id: "aoe2war.app.session-b-restricted-replay-readmodel"
title: "R25 Restricted Public Replay Detail Scalar Read Model"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-public-read-projection-no-financial-permit"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Restricted Public Replay Detail Scalar Read Model

## Production observation
New R25 `e0586a7b` is live. At 12:50 UTC November 8, its journal recorded 182 PostgreSQL permission-denied errors across 13 protected tables. `war_engine_cases` accounted for 108; site route HTTP200 did not demonstrate that all nested public read models succeeded.

Read-only production permission inspection proved `aoe2war_web_prod` can SELECT `public.game_stats` but **cannot** SELECT `war_engine_cases`, `replay_result_adjudications`, `replay_stat_projections`, `users`, `bet_markets`, etc.

## Minimum-privilege source repair
The route `/game-stats/[id]` uses the exact isolated nonfinancial public profile check and returns `RestrictedPublicReplayDetail` **before** executing the old private relations include. `RESTRICTED_PUBLIC_REPLAY_SELECT` is an allowlisted, scalar-only `GameStats` projection with map/roster, played-at timestamp, duration, recorded parser winner and final-state flag; it excludes private identities, replay hash and financial relations. Other profiles keep the existing full detail handler.

The restricted page expressly marks advanced verdicts, War Engine case history, linked betting and settlement evidence **UNAVAILABLE**, never zero or settled. It does not claim a parsed winner is chain-verified. No DDL, grant, direct financial table access, or funding change is implemented.

## Required acceptance before production
- Valid TypeScript against generated Prisma v7.10.0 and exact-head security/DocsV2/Next.js CI.
- Native SELECT read under the restricted role for one known publicly eligible `GameStats` record; ensure all selected scalar columns exist and the route returns 200 without any forbidden relation query, no false empty/zero display.
- Test missing record 404, malformed route-id rejection, no leaking private data/finance and no mutation.
- Protected Steam login, original 3030 and validator independent; use isolated reversible admission for new runtime and public browser acceptance. Finance C01–C09 remain HARD HOLD.

## Status
**SOURCE-ONLY HOLD**. PR #1240 is not a live deployment. The existing e058 website is preserved.
