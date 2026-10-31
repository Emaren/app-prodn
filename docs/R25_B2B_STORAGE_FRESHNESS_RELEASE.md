---
id: "aoe2war.app-prodn.r25-b2b-storage-private-release"
title: "R25 B2b — Private Storage Signed Freshness Release"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "post-r25-reviewed-source-not-production-admission"
reviewed_at: "2026-10-31"
review_interval_days: 7
sensitivity: "internal"
---

# R25 B2b — Private Storage Signed Freshness Release

Implementation source commit: `8c90c593efc5c80b4913463f2290e4a9fbbc96ec` based on immutable frozen #1061 `0cee3c836c4b0760478280c145e02e81e470ce0e`. This is **source only**, not production.

## Exact routes

- `/admin/storage-os` — authenticated private UI using existing evidence readers, reviewed L2 categories and new signed freshness panel
- `/api/admin/storage-os/freshness` — `GET` only; `requireAdmin`, `Cache-Control: private,no-store`, UNKNOWN/stale on evidence absence

## Required review and browser proof

- Preserve parent `app/admin/layout.tsx` server-side session guard. Negative unauthenticated request must be 401 or redirect, never data leakage.
- Verify existing storage visual server HMAC provenance; never infer source-HMAC proof or HEL1 freshness from UI file presence.
- Real 375/768/1440 authenticated browser Chrome and exact HEAD source/Next BUILD_ID/static parity, read-side compatibility, failure fallback tests, no unexpected `/api/admin` mutations.
- CI Type/Next, focused storage tests, DocsV2, dependency security and browser workflow all PASS before adoption; any failure is HOLD.
- F sole separate post-R25 release approval only after frozen #1061 is LIVE_VERIFIED and independent G positive BEFORE/AFTER/rollback proof.

## Forbidden mutations

No SSH, HEL1 scans, owner reclaim execution, filesystem deletion, DB retention/finance transaction, original PID2625090 restart, Nginx cutover, Wolo mainnet or C-stage rebuild. Backups/Docs/Code Health standalone pages are not claimed here.
