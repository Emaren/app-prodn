---
id: "aoe2war.app-prodn.r25-b3-operator-evidence"
title: "R25 B3 — Authenticated Operational Evidence Interfaces"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "post-r25-reviewed-read-only-product-source"
reviewed_at: "2026-10-31"
review_interval_days: 7
sensitivity: "internal"
---

# R25 B3 — Authenticated Operational Evidence Interfaces

**Source implementation SHA:** `ada188822cba767234bb3499a145f9e74fae1704`. Frozen website source `0cee3c836c4b0760478280c145e02e81e470ce0e` remains untouched; this feature is a separate post-R25 draft.

## Four actual protected pages

- `/admin/backup-os` — read existing `/api/admin/storage-os` signed/observed capacity planes, explicitly UNKNOWN if no independently certified restore receipt.
- `/admin/documents-os` — display the real build-time DocsV2 document-registry path/title/status/review/authority; never invent a live external docs-synchronization process.
- `/admin/code-health` — view existing `/api/admin/aoe2war-os` source snapshot and bounded inspection event rows, but code-scanner certification remains UNKNOWN without its own signed receipt.
- `/admin/storage-transfer` — review existing signed Storage OS capacity and provenance only; no transfer/send/decrypt/reclaim execution.

## Required acceptance

- All four inherit `app/admin/layout.tsx` and `requireServerAdmin`; no independent bypass or standalone public access. Verify negative 401/403 or signed redirect and successful real admin login.
- Existing API reads use `method: GET`, `credentials: same-origin`, `cache: no-store`. No POST/SSH/host writes from the new UI; bound reads and fail-closed UNKNOWN on invalid schema, errors and missing receipts.
- Full exact-head CI, DocsV2 and source inventories, 375/768/1440 authenticated Chrome/a11y, source/BUILD_ID/static parity, independent G browser witness and signed F post-R25 deployment/rollback required.
- Wolo separate. 15 subordinate OS names are planning identities and not independently active workers; UI must not count them as live processes.

## HOLD conditions

Until exact CI, route/browser auth and independent owner release approval: **SOURCE_ONLY / NOT LIVE_VERIFIED**. E prior actual restore or live signed Code Health measurements may only be displayed after authenticated data source/integrity is verified; no cosmetic 100% or synthetic timestamps.
