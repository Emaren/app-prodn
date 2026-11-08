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
reviewed_at: "2026-11-08"
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

## Historical physical acceptance and current re-review (2026-11-08 UTC)

The four protected B3 pages were **physically accepted on 2026-11-06 ~06:06 UTC** under formal gate A08, with actual authenticated owner Chrome 12/12 checks across 375/768/1440 px, guest-negative HTML/RSC 8/8, anonymous API GET rejection 401, owner-signed API GET 200, 3/3 source-contract tests and immutable receipt SHA-256 `16c5195927b4feeb12e43fb43eac3ca7b8d0cef912122f555abd298669e65a0d`. See [formal release evidence](https://github.com/Emaren/app-prodn/issues/1108#issuecomment-6678337405).

That receipt is for **historical public R25 build `20261106035425-2dbadd4d3d` / PID653077**. The later protected November 7 Betting Hall v5z/R3 release uses source `1a380cdf76ff773aa1d094abd161523500b32b4a` and PID2206791 at the latest read-only checkpoint, with 3030 rollback preserved. The historical B3 pass remains evidence, **not a substitute for fresh authenticated route/asset/browser acceptance after a new runtime refresh**.

All these surfaces remain **nonexecuting read-only evidence panels**. No certified physical restore, scanner execution, transfer, independent human reviewer or funded WOLO permit is established by their presence. Treat unknown live measurements as UNKNOWN; never turn historical source records into current host attestations. Any future Session B navigation/image release requires exact-head CI and new protected Steam/source/rollback acceptance. The financial C01–C09 hold is independent.
