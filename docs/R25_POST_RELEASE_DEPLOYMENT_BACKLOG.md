---
id: "aoe2war.app-prodn.r25-postrelease-deploy-batches"
title: "R25 Dependency-Ordered Post-Release Deployment Backlog"
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

# R25 Dependency-Ordered Post-Release Deployment Backlog


**Finite delivery plan:** deploy the already-built site first, independently prove its pages, then release only the missing post-W1 work, finish operational dashboards, and eventually design source-only visual products. [Complete 151-page + 282-API matrix](r25-deployment-routes.v1.json).

## Dependency-ordered batches
| Batch | Order and scope | Required outcome | Owner / STOP |
|---|---|---|---|
| **B0 — R25 website cutover** | **P0 existing F path**: E already RECOVERY_READY; B new-only PRESTART/3031+POSTSTART; G BEFORE; F reversible six Nginx routes; G AFTER+rollback | Independent exact BUILD_ID/static/3031/security, preserved original PID2625090 and Wolo; `LIVE_VERIFIED` only on receipt | **F B E G**; D does not add a gate. Never rebuild or recopy. |
| **B1 — actual visible product audit** | After B0: 148 frozen page templates and 278 API source handlers, prioritize public Kingdom Index/Intelligence/Inspections, Admin OS/Storage/Central, real auth role and public UX | 375/768/1440 browser screenshots, 401/403 negative auth, 404/500 detection, valid dynamic-route fixtures, source+BUILD_ID match, static assets; mark unmeasured UNKNOWN | **G/D/B**. No financial POST. |
| **B2 — post-W1 source already developed** | After B0/B1 source acceptance: `/admin/central-command/job-board`, `/lanes`, `/work-board`; newer `/admin`, `/admin/aoe2war-os`, `/admin/storage-os`; four new and five changed API handlers | Separate reviewed successor exact source/CI, DocsV2, auth/Chrome, rollback and live user-visible witness | **D/G/F/B/E**. Never change frozen #1061 or substitute source CI for host. |
| **B3 — operational dashboards** | After B2: missing standalone Backup OS / Documents OS / Code Health user visibility; optionally #1016 Storage Transfer | Prefer real read-only receipt-backed admin panels in `/admin/storage-os`, `/admin/aoe2war-os`, `/admin/central-command/work-board`. Standalone route only if explicitly designed and tested | **D/E/G**. No invented URL, live score or uncontrolled file operations. |
| **B4 — Kingdom Construction visual product** | After B2/B3: reconcile #1093 read-model stale `SOURCE_EXTRACTED` and 14-OS baseline with real C BUILD_STAGED and 15+umbrella source census. Add proposed `/kingdom-construction`, `/aoe2war-os/deployment` only when actual page files exist | Seven bounded responsive modes (graph, loop, swarm, army, hierarchy, Composer, Run-Up), public-safe/read-only provenance and admin dry-run Composer; authenticated browser a11y/performance receipts | **D/G**; no new daemon, fake active worker, signers or F P0 gate. |
| **B5 — estate/finance separate closure** | Native VPS/Traffic/Watcher/Docs inventory and restore/freshness; Wolo held separately after original financial controls | Real source/live/storage history receipts; independent Wolo finance producer exclusions, finality, custody solvency and guarded approval | **E/owner/B-finance**. No Traffic DB/WAL deletion, VACUUM, paid backup or unapproved Wolo. |

## Missing page → cause → owner action
**Not yet publicly activated:** C physically built but F six-route Nginx cutover and G AFTER absent. **Post-W1 code missing from candidate:** 3 new private Central pages and 4 new API paths. **Older implementation inside candidate:** `/admin`, `/admin/aoe2war-os`, `/admin/storage-os` + 5 API handlers have newer integration blobs. **Never authored as standalone pages:** Backup OS, Documents OS, Code Health OS, Kingdom Construction, Composer, Swarm. **Authorization vs visibility:** Admin pages require signed sessions, not anonymous public GET; funded Wolo remains independent HARD HOLD.

## Finite acceptance rule
Each exact route/source file and immutable Git blob is in the JSON matrix with frozen-build presence, merged status, access, stage, browser proof, owning lane and next action. A route may be called `LIVE_VERIFIED` only with a current, independent source/BUILD_ID and browser receipt. No inherited 100/100 scores. **This backlog is P1 planning work, never an additional P0 release prerequisite.**
