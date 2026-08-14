---
id: "aoe2war.app-prodn.docs-performance-audit-2026-08-13"
title: "AoE2WAR Production Performance Audit — 2026-08-13"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators","auditors","ai-agents"]
source_of_truth: "historical-evidence"
authority: "release-evidence"
reviewed_at: "2026-08-13"
review_interval_days: 0
sensitivity: "internal"
---

# AoE2WAR Production Performance Audit — 2026-08-13

## Technical summary

This pass measured every meaningful public route family before changing production, then applied shared-shell, query, streaming, list, cache, and lossless-media improvements without lowering image or avatar fidelity. The pre-change production baseline covered 66 URLs and 198 repeated HTTP samples. It found a 1.980 s median cold-cache LCP, 2.848 s p75 LCP, 613 ms median repeated TTFB, and two severe layout-shift routes. The post-release production comparison will be sealed below from the same harness after the certified deployment.

The implementation removes repeated full-corpus work across profile, Academy, Zodiac, Rivalries, Matchups, and game-detail surfaces; trims global browser startup; loads long rails 1,600–3,600 px ahead; makes off-screen video poster-first; server-seeds Requests; and displays the War Chest total as `N earners`. Avatar URLs and their established card-quality derivatives remain unchanged.

## Baseline: the median was healthy, but route tails and media payloads were not

| Metric | Pre-change production |
| --- | ---: |
| Public URLs measured | 66 |
| HTTP samples | 198 (66 routes × 3 rounds) |
| HTTP 200 / valid FCP / valid LCP | 66 / 66 / 66 |
| Median repeated HTTP TTFB | 613 ms |
| Median repeated HTTP total | 798 ms |
| Median cold-cache FCP | 1.892 s |
| Median cold-cache LCP | 1.980 s |
| p75 cold-cache LCP | 2.848 s |
| Routes at or below 2.5 s LCP | 43 / 66 |
| Routes at or below 0.1 CLS | 64 / 66 |
| Maximum approximate blocking time | 34 ms |

The slowest repeatable server medians were player detail (2.15–3.12 s TTFB), Champions/Academy/Zodiac (1.62–1.72 s), and Players/Rivalries/Leaderboard/Battle Archive (1.28–1.40 s). The largest cold transfers were National Champions (12.40 MB), Home (5.48 MB), Academy (3.63 MB), game statistics (3.29 MB), Download (3.00 MB), Wolomania (2.72 MB), and Staking (2.22 MB). Requests measured 0.317 CLS and replay-result review measured 0.411 CLS.

## The changes attack shared work before route-local polish

### Shared browser shell

- Split inbox contents, footers, mobile navigation, installation UI, toasts, and noncritical telemetry out of the initial global client graph.
- Replaced three immediate header requests with one coalesced `/api/header-summary` load scheduled after load/idle and paused while hidden.
- Removed 500 ms query-string polling from non-player pages, moved React Query to only the wallet/WOLO/bets subtrees that need it, and deferred deployment/PWA housekeeping.
- Added a route-segment loading shell and removed the client-only `/lobby` gate so navigation can stream useful content immediately.
- Corrected static cache matching so only explicit media-file extensions retain long-lived caching while `/lobby`, `/champions/world`, `/bets/[marketId]`, and `/watch/[sessionKey]` HTML no longer inherit a 24-hour asset policy.

### Server projections and data waterfalls

- One replay-generation-keyed 8,000-row profile projection now serves same-generation Academy, Zodiac, claimed/replay profile, and match-feed requests per worker. `N` requests perform one corpus scan instead of `N`: 66.7% fewer scans for three callers and 90% fewer for ten.
- Rivalries, Matchups, and game detail now share one complete-corpus matchup projection per replay generation. The complete-history invariant remains unchanged; a generation change invalidates immediately and concurrent loads coalesce.
- `/watch` selects only the 15 consumed fields from its 160-row replay query and overlaps replay, media-registry, and broadcast-preview work.
- Requests now begins with a server snapshot, avoiding its redundant viewer bootstrap and loading-state replacement.

### Ahead-of-scroll and media behavior

- Leaderboard, recent matches, live archives, profile money history, and Watch archives activate roughly 1,600–2,400 px before the viewport; War Chest retains up to 3,600 px of lookahead.
- Long boards use `content-visibility`; off-screen Watch videos remain exact posters until near the viewport or user intent and release their video source after leaving the activation band.
- Home below-fold Shorts, Watch, and WOLO tiles mount about 2,800 px ahead. The opposite leaderboard lane waits for idle and skips constrained connections.
- Featured avatars reveal independently and only the visible opening pair receive priority. Existing managed-avatar URLs and quality-95 card derivatives were not reduced.

## Lossless delivery kept decoded pixels identical

All replacement WebP files were encoded losslessly with exact-alpha preservation. Each source/replacement pair was decoded to RGBA and SHA-256 hashed; every pair matched byte-for-byte at the decoded-pixel level.

| Surface | Source bytes | Lossless WebP bytes | Reduction | Visual result |
| --- | ---: | ---: | ---: | --- |
| Academy hero + title | 2,759,406 | 1,981,038 | 28.2% | decoded RGBA identical |
| Four live National belt assets | 11,680,918 | 7,336,368 | 37.2% | decoded RGBA identical |
| Watcher desktop/mobile/logo | 5,699,983 | 4,193,944 | 26.4% | decoded RGBA identical |

No avatar source, avatar derivative quality, or showcase-image quality setting was lowered. Further media savings must continue to come from format, responsive sizing, request priority, caching, and visibility—not degraded art.

## War Chest and realtime behavior remain live

The board now renders only the canonical live total, for example `302 earners`. The previously visible loaded-page numerator (`64 / 302 earners`) was presentation noise; removing it does not change pagination or automatic growth. Lobby data still receives a server seed and live stream, but avoids an immediate duplicate snapshot request. Header totals remain live through the coalesced visible/focus refresh.

## Scope, definitions, and reproducible method

The source inventory contained 95 real Next.js page templates: 58 public static, 16 public dynamic, and 21 authenticated admin templates. Measurement covered 35 sitemap URLs, 15 additional public static surfaces, and one current record for every one of the 16 public dynamic templates. Eight pure aliases were excluded because they redirect to measured destinations. Admin templates were inventoried but not measured without an authenticated operator session.

Cold-cache Chrome runs used a 1365 × 900 desktop viewport, cache and origin storage cleared between routes, one foreground isolated target, native Mac CPU/network, and a 2.5-second observation window after `load`. `tbtApproxMs` is observed long-task time above 50 ms, not Lighthouse simulated TBT. Repeated HTTP measurements are three sequential requests per route; their route medians reduce single-request network noise.

Authoritative pre-change evidence was captured under `/tmp/aoe2war-perf-baseline-20260813` with these immutable hashes:

- `browser-baseline-final.json`: `94834fc67511eee3e09307326faee6617e35c5c9af5cdc787f1d58cbc11be183`
- `browser-baseline-final.csv`: `778ed52ba56bfeb4e63f35ccef96cc95055014ea5fa1592543e675367b6aa0c1`
- `http-baseline-raw.tsv`: `4536644df8343883e95fba5758a5805c18a22407d6b236fca3c0a93a1ee04903`
- `baseline-summary.csv`: `1d609497c184965dced52306e8ab213fb1968e30af19c26c5243b67a88d0a114`
- Chrome harness: `33299a2611d03e1fa611d9b38f1084a403c4a235331ba41e43908c692da4ba5b`
- HTTP harness: `315b5e7c9fd6dc6db895ebc5a5a7a13496f51703f60a0226dc3cb73ac0152ec2`

## Production before → after comparison

This table is intentionally held open until the certified release is live and the same 66-route harness has completed against production. Local build timing is not substituted for the requested public-page result.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Median repeated HTTP TTFB | 613 ms | pending | pending |
| Median repeated HTTP total | 798 ms | pending | pending |
| Median cold-cache FCP | 1.892 s | pending | pending |
| Median cold-cache LCP | 1.980 s | pending | pending |
| p75 cold-cache LCP | 2.848 s | pending | pending |
| Routes ≤2.5 s LCP | 43 / 66 | pending | pending |
| Routes ≤0.1 CLS | 64 / 66 | pending | pending |

## Verification, limitations, and robustness

- The complete replay and rivalry corpora remain complete; these changes cache projections by the existing replay-generation watermark rather than cap history.
- Cache loaders coalesce concurrent calls, discard rejected promises, prevent older in-flight generations from overwriting newer truth, and fall back to uncached full loading if the watermark lookup fails.
- Cold Chrome results are one controlled lab sample per route; repeated HTTP medians and route-level comparisons are retained alongside aggregate paint metrics.
- Live market/session identifiers can expire. Stable static routes and durable record URLs are the exact comparison cohort; any substituted live-session record must be called out separately.
- The authenticated 21-route admin estate remains outside the anonymous browser benchmark. Its templates still passed the production build/type gate.
- A chart was omitted because this is an audit of exact route-level and aggregate before/after values; tabular values preserve the denominators and avoid implying a time series from two release points.

Local gates completed or required before certification:

- `npx prisma generate`
- `npx tsc --noEmit --pretty false`
- targeted generation/matchup/realtime performance tests
- `npm run lint`
- `npm run build`
- browser verification of Home, War Chest, Rivalries modes, Requests, Watch, and cache headers
- production 66-route Chrome pass plus 198-request HTTP pass

## Release identity and follow-up

The release SHA, BUILD_ID, build version, receipt, production comparison, and post-release health state will be sealed here after canonical `aoe2war finish` certification. Remaining opportunities should be prioritized from the post-release tail rather than assumed from the pre-change profile. The mounted evidence volume also needs capacity expansion; release evidence and rollback retention must not be traded away for short-lived headroom.
