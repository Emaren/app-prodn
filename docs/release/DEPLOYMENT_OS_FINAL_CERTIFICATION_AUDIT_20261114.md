---
id: "aoe2war.app-prodn.deployment-os-final-certification-audit-20261114"
title: "Deployment OS final certification source audit"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "auditors"]
source_of_truth: "git"
authority: "product-source-audit-not-production-acceptance"
reviewed_at: "2026-11-14"
review_interval_days: 30
sensitivity: "internal"
---

# Deployment OS final certification source audit

Observed 2026-11-14 UTC against canonical main `6f413a39864c7f54f3e3574150ca396819702416`. This is a source audit, not a physical release certificate. Final physical evidence belongs in App issue #1280 and the subsequent sealed receipt.

Audit matrix for the current release family. The controller, manifest preparer and Steam inspector retain their existing source pins; PRODUCT source edits remain UID650-only.

| # | Stage / authority | Input → output | Failure and retry | Timeout / metrics |
|---|---|---|---|---|
| 1 | Engineering clock / owner | Declared or observed start → T0 | Missing timestamp stays UNKNOWN; never backdate | UTC, clock source, precision and uncertainty |
| 2 | Source edit / UID650 | Qualified branch → exact commit | Wrong identity, branch or admitted bytes HOLD | T1 currently uninstrumented; remains UNKNOWN |
| 3 | PR qualification / B coordinator | Approved PR/SHA + current main → source receipt, T2 | Wrong repository/head or stale main HOLD; already sealed reconciliation is separate | GitHub calls bounded at 50s; PR creation timestamp retained |
| 4 | CI/security / hosted checks | Complete raw check census → T3 receipt | Missing, incomplete, failed or unexpected skipped checks HOLD | Exact check IDs and conclusions; T3 records qualification observation |
| 5 | Linux build / hosted builder | Exact SHA, frozen lock, Linux x86_64 Node22 → archive | Source/main drift or build failure HOLD; rerun exact source explicitly | 35-minute job bound; GitHub job timings |
| 6 | Independent verification / separate runner | Same-run artifact → every-member acceptance, T4 | SHA, source, BUILD_ID or member mismatch HOLD | 25-minute job bound; source/run/artifact and proof digests |
| 7 | GitHub acquisition / B Mac | Approved artifact ID/size/SHA → digest cache | Interrupted prefix resumes only with matching Range; ignored Range restarts safely | 45s header, 90s body stall, two retries; bytes, throughput, elapsed, SHA and state |
| 8 | Local member selection / B Mac | Verified ZIPs → runtime and independent proof | Duplicate/unsafe member, receipt collision or partial extraction HOLD | Bounded member sizes/count; exact SHA; existing matching files reused |
| 9 | Capacity and HEL1 delivery / B owner | Verified runtime + root budget → T5 | Insufficient incoming/extraction headroom, wrong inode/owner/SHA HOLD | rsync 1,800s; visible progress, resume directory, remote SHA, disk free/required bytes |
| 10 | Manifest / existing root preparer | Exact staged proof + current previous runtime → root manifest | Existing mismatched manifest or identity drift HOLD; matching manifest reused | SSH operation bounded at 180s; manifest digest and source/build binding |
| 11 | Candidate stage / existing V3 | Manifest/archive → root journal `prepared`, T6 | Partial extraction/unknown journal phase HOLD; **prepared restart now resumes without staging twice** | Unchanged 6-GiB guard; exact archive/member/source/build checks |
| 12 | Activation and HTTPS proof / V3 + B observer | Prepared candidate → active candidate, T7 | Health or public identity mismatch HOLD; V3 retains exact automatic rollback | Existing service/HTTP bounds; public source/build headers, body digest, finance HTTP503 |
| 13 | Rollback/reactivation / existing V3 | Saved original unit → previous T8 → candidate T9 | Wrong previous identity or switching state HOLD; never blind-retry an ambiguous transition | Phase durations; source-distinct witnesses; protected PID checks |
| 14 | Postflight and durable seal / root + B | T10, ledger, summary and witnesses → eight immutable root receipts | Partial publication resumes exact bytes; collision, authority or digest mismatch HOLD | Atomic exclusive publication, file/directory fsync, full readback SHA; verify-only accepted-source resume |

Four demonstrated gaps are repaired in the candidate source:

- Persisted `prepared` journals are recognized correctly.
- Root receipt publication is atomic, durable and checked by readback.
- Transport-only local T10 shortcuts require matching root receipts.
- New releases require current canonical-main ancestry; sealed reconciliation does not trigger a new release.

The three optional skipped check names remain an exact allowlist. A required check can never use that exception. No root-controller replacement, financial permission, runtime or scheduler was added.

Residual limits to document accurately:

- T1 remains UNKNOWN. T3 measures the coordinator’s successful qualification observation, not the exact CI completion instant.
- The v1 T10 timestamp precedes root receipt publication. Final CLI acceptance now waits for durable readback, but `finalAcceptedMs` can exclude that final publication delay. Preserve historical receipts and label the metric’s scope.
- Root calls use an SSH deadline; a timed-out controller may have progressed remotely. Inspect its journal before resuming. `extracting`, `switching_*` and other ambiguous phases remain HOLD.
- Complete SHA-corrupt downloads and insufficiently classified extraction remnants are preserved for review rather than silently discarded.
- No physical deployment or destructive failure injection was performed by this audit worker. Parent-reported focused tests passed; final exact-head CI and source admission remain the parent’s responsibility.

Existing Factory publication: root-owned sanitized publisher SHA `efa24cff078059ce977ffa0b6da3cec89163cf280ad85e93bf7d2df2ccc38981` runs under the existing two-minute cron. Missing/expired source evidence remains UNKNOWN/STALE. Fresh disk evidence does not freshen historical release evidence or authorize deployment. No new service or timer is introduced.

Host preflight: one classified historical PRODUCT archive was retained reversibly on the separate data volume. Actual root df recovery 616,538,112 bytes; free after 8,335,015,936 bytes at 10:09:03Z. Retention receipt SHA `e22c147d923374dca542eb6ec43975450c147b640ba05c19b283b6a94e9b168c`; plan SHA `2b2013cd64f3934db0e1dcdf21c4039db46cfff16c8c755717df3a4ea2cdb86c`. Active968540 and previous2ced970 remained pinned, all protected PIDs unchanged, no runtime mutation. These are dated observations; preflight must remeasure.

Local validation: restricted UID650 offline Next production build completed in132.33s with tracked source state unchanged. Focused Factory15, coordinator/recovery21, transport9, ledger10, source-boundary15 tests passed. Changed-file ESLint, TypeScript and tracked secret scan passed. Required exact-head GitHub CI and the fresh physical release remain separate acceptance predicates.

GitHub main's legacy branch-protection endpoint reported Branch not protected at10:19Z. Do not claim server-side mandatory merge protection from this observation; the coordinator still requires an explicit complete successful check census before release. No policy was weakened or changed.

Browser account discovery at10:17–10:19Z: Tony exposes existing Emaren admin; Em/Tiz have no active App session; pit exposes an unnamed authenticated non-admin, insufficient to identify aoe2warscribe. The named ordinary-account check remains HOLD. No session was exported or changed. App evidence never closes financialC03.
