---
id: "aoe2war.app-prodn.session-c-kingdom-traders-nonfinancial-frontend-seam"
title: "Session C — Kingdom Traders nonfinancial frontend seam (NOT deployed)"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","kingdom-traders"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-only-session-c-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Session C — Kingdom Traders nonfinancial frontend seam (NOT deployed)

Source ancestry is the merged R25 V18 release controller fba4d07e3ee49a2e14c652dcc6641b8af3003abb. Session B retains all production 3032, Steam V18, Nginx, 3030 rollback and website SQL authority. This branch is a separate PRODUCT-only unmerged PR, not a public release.

An unmounted static preview component for the PROPOSED route /kingdom-traders has been prepared; no public route is added. It does not fetch the independent Traders endpoint, display a broker balance, create an operator session, provide orders, or modify the existing Kingdom dropdown. The preview uses only 100 historical PAPER accounts and seven still-unpriced fictional BTC positions. It truthfully marks source HALT and does not infer a later Kraken market or a 24-hour result.

The exact contract lives at config/session-c-kingdom-traders-seam.json. Fields currently declare navigationEnabled=false, publicOrigin=null, publicCertificateTrusted=false, operatorCredentialDelegation=false, steamAuthenticationDelegation=false, financialSQLAccessAllowed=false, websiteReleaseOwnershipTransferred=false, walletFundingAllowed=false, and realOrdersAllowed=false. No server-side Next proxy, App API, financial SQL role, or old login cookie integration has been added.

Independent product operator origin may later use /api/status and /api/accounts, but those endpoints are presently protected by a separate owner-specific product Basic login; never share that secret with the public App, frontend JS, build env, middleware or database. A distinct versioned and reviewed nonfinancial consumer read model is required for any future shared public numbers.

Before enabling even a navigation link, accept all of: Session B signed-in admin/nonadmin 3032 rollback handoff, an independently publicly trusted product HTTPS/DNS origin, exact source/build SHA, appropriate app/privacy security review, and owner approval. Until then, the product link is intentionally absent from the existing global navigation. Do not update live 3032 or Nginx from this branch.

Product handoff: https://github.com/Emaren/kingdom-traders/issues/118
App two-lane boundary: https://github.com/Emaren/app-prodn/issues/1280
Seven WoloChain financial gate closure is wholly outside PRODUCT. No 8092–8095 endpoints are used.


## Authenticated server-only PAPER read-model integration (SOURCE ONLY)

This Session C integration branch descends from exact accepted R25 source
b1ef050b954be734c9f34147361e0d02d7c89b19, and preserves existing
unmounted preview 2319804a1b1524bc992c12cc52161baebe4f8c72.
It does NOT modify the active 3032 release or protected App API.

Product source proposes optional GET /api/bridge-status-v1 on the independently
owned PRODUCT loopback service. It is disabled unless a separate machine-only
SHA-verified credential is approved and provisioned. The endpoint only returns
anonymous status: historical 100 modeled PAPER account count, 7 still-unpriced
positions, unchanged source HALT, zero orders and an exact source SHA.
No bot IDs, balances, financial hashes, tokens or personal/user records.

App lib/kingdomTradersAdminStatus.ts is intentionally UNMOUNTED. It invokes
the existing App requireAdmin session guard before any product request,
requires an exact environment release admission flag, then delegates to
server-only lib/kingdomTradersPaperReadonly.mjs. The client requires a
separate machine-token file and TLS trust certificate, checks both private
file permissions and exact IP/port/path, verifies HTTPS without insecure
TLS options, uses GET only, limits responses to 4096 bytes and validates the
complete frozen nonfinancial schema. All bad auth/network/TLS/source or
forged money permissions fail to HOLD and never expose private inputs.

No Next API route, page, Steam cookie delegation, public nav link, public
hostname, Nginx rewrite, owner Basic password forwarding, database table
access or new financial writer is present. Source tests are 100 percent
offline. Session B must accept the ordinary/nonadmin authenticated release
matrix, exact App/PRODUCT SHA and separate machine identity before ANY
website route can mount this adapter. User-facing preview remains static
and responsive, with the private actual operator cockpit accessed separately
through SSH. No active 3032 frontend smoke or browser acceptance is claimed.


## Unmounted admin PAPER status panel and responsive acceptance

The reviewable server-only component
components/kingdom-traders/KingdomTradersAdminPaperPanel.tsx renders only the
strictly allowlisted admin-source STATUS. It never fetches or accepts the
operator Basic password. Missing admin approval or rejected private
source is shown as HOLD with no personal account details. On narrow viewports
the panel uses min(100%, 210px) grid min-width and flexible flex-wrap rather
than a fixed-width dashboard. It has a labeled status indicator and no
mutating controls, form actions or trading navigation. This component is
not mounted in any page or API route, and no public site deployment or
Chrome acceptance is claimed before Session B's release handoff.
