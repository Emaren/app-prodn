---
id: "aoe2war.app-prodn.session-b-c03-prisma-crossrealm-42501-20261109"
title: "C03 known Prisma SQLSTATE 42501 financial read denial across JS realms"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial HTTP classification only, no SQL/financial role changes"
reviewed_at: "2026-11-17"
review_interval_days: 7
sensitivity: "public"
---

# C03 known Prisma SQLSTATE 42501 financial read denial across JS realms

## Physical failure and one narrow repair

On November 9, 2026 at 19:15 UTC, the original R25 HEL1 restricted website returned HTTP **500** with a generic Bet board unavailable response on GET /api/bets. Its server journal showed an actual Prisma P2039 database engine error with SQLSTATE 42501 / permission denied for table pending_wolo_claims. The public history read model answered HTTP200 while anonymous session denied HTTP401. This is a genuine operational defect in denial classification, **not permission to read or write protected tables**. The currently running PID is still 212651.

The existing isRestrictedBetsReadDenied classifier already recognizes exact P2039/P2010, PostgreSQL 42501 and an explicit allowlist of restricted financial tables, but only reads the message when error instanceof Error. Cross-realm or mismatched prototype errors can have a real .message and Prisma .code yet fail that test. This change accepts a typed string message from any error object without converting the unknown object with String(...); it retains exact Prisma code, SQLSTATE and table checks. Unknown SQLSTATE, nonfinancial table, arbitrary error, and missing message still FAIL and remain HTTP500 rather than fabricate a finance-specific hold.

When the new source is deployed and its gate predicates pass, a *known restricted table denial* returns HTTP503 with immutable HOLD_RESTRICTED_PUBLIC_BOARD_READ payload and no-store headers. The Betting Hall already clears stale live financial state and loads the separate existing published public market preview/history endpoint. No actual wagering, escrow funding, payout or personal wager access is authorized.

## Nonacceptance

Source tests prove safe classification including genuine cross-realm VM representation. They do **not** prove the physical 500 is solely caused by this bug or that source is deployed; the live website must still be tested with exact HTTP503 and expected public preview under the restricted role. No SQL privileges, migration, newly started Next process, credentials, C01 keys or 8092/8093/8094/8095 listeners are changed. C03_APP_HANDOFF remains HOLD pending signed-in ordinary/admin/AI-Scribe browser, authenticated rollback and full writer-fence acceptance. C02_APP_TRANSPORT remains HOLD.


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
