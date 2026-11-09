---
id: "aoe2war.app-prodn.session-b-c03-public-live-direct-20261109"
title: "C03 explicit approved public-live endpoint without financial authority"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "App-only public read projection; finance execution denied"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "public"
---

# C03 explicit approved public-live endpoint without financial authority

The previous #1274 implementation placed public live-market summary inside the existing /api/bets/public-history payload. The requested external direct endpoint /api/bets/public-live was not provided. This additional route exposes the already-approved source as a *separate* bounded GET endpoint while retaining the old public-history result unchanged. Physical HEL1 review of aoe2war_public_v9.published_markets confirmed restricted web SELECT allowed, raw bet_markets SELECT/DML denied; the view is not intrinsically filtered to settled markets. At the checked instant there were 0 eligible open/live/closing/awaiting markets among 3462 historical rows.

This new endpoint selects only 9 published identifiers, labels, statuses and close time fields from the security-barrier view, publicIntegrityEligible true, active statuses, 48-row maximum and no-store. Zero eligible rows is a truthful 200 with an explicit NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS reason. Missing permission, view or SQL error returns explicit 503 HOLD_APPROVED_PUBLIC_MARKET_VIEW_UNAVAILABLE, never synthetic 200 empty. The source exposes no user, stake, funding, transfer, private claim or payout data and never credits anything.

This intentionally expands the API handler count by exactly one (283 to 284), while retaining the public 88-page navigation census. It changes no other route, systemd unit, ledger, financial SQL grant or wallet. App #1276 cross-realm Prisma 42501 known protected-table denial is a separate change: /api/bets should return 503 with a restricted financial HOLD on a recognized denial, never be conflated with this functional public-only 200. Exact-head CI, physical promotion and actual role/betting tests remain required before claiming C03_APP_HANDOFF=YES. No live financial listener or C02 funded authority is permitted.
