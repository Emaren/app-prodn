---
id: "aoe2war.app-prodn.session-b-c03-public-live-direct-20261109"
title: "C03 explicit approved public-live endpoint without financial authority"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "historical-evidence"
authority: "dated incident evidence only; no current operational authority"
reviewed_at: "2026-11-25"
review_interval_days: 0
sensitivity: "public"
---

# C03 explicit approved public-live endpoint without financial authority

> **November 25, 2026 — documentation disposition (source only).** Historical disposition: preserve the original November incident record and its subsequent source review verbatim. Prior authority label: App-only public read projection; finance execution denied. All process IDs, receipts, commands, source pins and deployment claims below refer to their original observation only. Do not execute old controllers or treat this record as current admission; use the current Factory and separate financial authority. No renewed operational approval or physical attestation.


The previous #1274 implementation placed public live-market summary inside the existing /api/bets/public-history payload. The requested external direct endpoint /api/bets/public-live was not provided. This additional route exposes the already-approved source as a *separate* bounded GET endpoint while retaining the old public-history result unchanged. Physical HEL1 review of aoe2war_public_v9.published_markets confirmed restricted web SELECT allowed, raw bet_markets SELECT/DML denied; the view is not intrinsically filtered to settled markets. At the checked instant there were 0 eligible open/live/closing/awaiting markets among 3462 historical rows.

This new endpoint selects only 9 published identifiers, labels, statuses and close time fields from the security-barrier view, publicIntegrityEligible true, active statuses, 48-row maximum and no-store. Zero eligible rows is a truthful 200 with an explicit NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS reason. Missing permission, view or SQL error returns explicit 503 HOLD_APPROVED_PUBLIC_MARKET_VIEW_UNAVAILABLE, never synthetic 200 empty. The source exposes no user, stake, funding, transfer, private claim or payout data and never credits anything.

This intentionally expands the API handler count by exactly one (283 to 284), while retaining the public 88-page navigation census. It changes no other route, systemd unit, ledger, financial SQL grant or wallet. App #1276 cross-realm Prisma 42501 known protected-table denial is a separate change: /api/bets should return 503 with a restricted financial HOLD on a recognized denial, never be conflated with this functional public-only 200. Exact-head CI, physical promotion and actual role/betting tests remain required before claiming C03_APP_HANDOFF=YES. No live financial listener or C02 funded authority is permitted.


## November 17, 2026 — WE2 historical-source re-review

This is a **dated November 9 draft/source-and-incident record**, not the current
HEL1 release procedure, current process-ID census, operational signer permit,
or proof that its proposed Steam/rollback runtime is now installed. Statements
such as “current PID,” “original runtime” and candidate BUILD_ID in the
historical sections refer to their recorded November 9 observation. The
November 16 public website had source
`09ff9eeccb93b4701d1cfd1ff329f0286cdc6e16`, with the existing
Factory V3 controller and finance sockets 8092–8095 closed; the proposed
nonfinancial follow-up PR #1394 has separate exact-source review, Factory and
authenticated browser gates. Never run a historical controller or trust an
old source-pinned permit against the newer runtime. All WoloChain custody,
writer fences, funding, C02/C03/05/06/07/09 and independent restores remain
under WE1 authority; nothing in this re-review authorizes financial SQL,
native 8094/8095, customer funds or changes to protected services.

This WE2 `aoe2war-web` source-owner review renewed the **historical-document
freshness only**. It does not re-attest the original host's transient PID,
systemd, NFT, PostgreSQL or memory measurements. New physical assertions
require a fresh, source-bound operational receipt.
