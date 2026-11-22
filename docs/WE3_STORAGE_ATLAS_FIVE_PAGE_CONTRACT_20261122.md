---
id: "aoe2war.app-prodn.docs-we3-storage-atlas-five-page-contract-20261122"
title: "WE3 Private Five-Page Storage Atlas — Source and Visual Truth"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-11-22"
review_interval_days: 30
sensitivity: "internal"
---

# WE3 Private Five-Page Storage Atlas — Source and Visual Truth

This is a **separate post-BAE product increment**, NOT a rename of the
Basic / Advanced / Extreme mode selector. The BAE release proceeds on its
own independently source-qualified branch and Factory permit. Storage Atlas
must not be deployed before BAE acceptance just to claim all five pages live.

## Routes, permissions and source

- /admin/storage-os/atlas: four surfaces / three computers overview.
- /admin/storage-os/atlas/hel1-root: /dev/sda1 (ROOT).
- /admin/storage-os/atlas/hel1-data: /dev/sdb mounted data filesystem.
- /admin/storage-os/atlas/m1: development Mac source and cache view.
- /admin/storage-os/atlas/intel: independent FileVault encrypted vault.
- All five pages call original requireServerAdmin before rendering. One
  additional **admin-only** GET /api/admin/storage-os/atlas calls
  requireAdmin before any evidence reads. A missing session gives 401;
  authenticated ordinary users receive 403; success is private no-store.
  No POST/PUT/PATCH/DELETE route or privileged browser scanner exists.

Read-side sources are the **existing** bounded OS snapshot, original Bridge
server-HMAC gross source and **independently admitted** Ed25519-derived Intel
evidence only. The endpoint does not scan, open host paths, SSH, launch jobs,
mutate sources or infer copy/deletion permission. It returns a bounded,
allowlisted path-free category projection. Source-owning M1 and HEL1
collectors remain separate from the browser.

## Spatial rendering

One StorageSpatialAtlas engine serves all five pages. The dominant canvas
uses clustered block mosaics at **1 GiB / 100 MiB / auto** scales and a
diamond variant, keyboard selection, breadcrumbs and source-bound category
alias drilldown. Bounded aggregation prevents one DOM element per inode or
uncapped 100 MiB tile count. The four surfaces use one explicitly selected
absolute category-sample scale; no silently normalized cross-device bars.

When used bytes and disjoint whole-footprint certificates are unavailable,
the grey UNATTRIBUTED / NOT SCANNED field is **deliberately UNSCALED**.
Colored source category samples are displayed in a visibly separate band;
their geometric proportions are **not** a whole-filesystem partition.
Thus 145 GiB ROOT or 287 GiB DATA from unadmitted one-off host df reads
are **not** shipped as hardcoded signed web totals. Actual verified
observations may be shown when admitted to the established source readers.

Signed C-v1 HEL1 hogs=[] and coverage=PARTIAL means **NOT SCANNED FOR
HOGS**, with gross allocated/disjoint/unique residual all UNKNOWN, never
0 B. Independent signed/free policy readings remain distinct; a free-byte
sample plus a rounded used percentage must not manufacture a total.
No shared-block/nested/hardlink/APFS clone accumulation enters unique used,
free or recoverable bytes.

Colors and legends distinguish LIVE_PROTECTED, RECOVERY_PROTECTED,
REVIEW_HOLD, TRANSFER_HOLD, MEASURED_OTHER, UNKNOWN and AVAILABLE.
Potential movement / candidate classifications never imply permission,
ACK, restore or physical reclaim. Level L4 has no software deletion; L5
is **NEVER DELETE**. Historical archive/restore is not current recovery
proof. Intel absent, unsigned, stale or unadmitted stays UNKNOWN. Bounded
opaque item aliases only; no protected absolute paths, secrets, financial
identities or source signer material in browser responses.

## Release and acceptance

Source-only draft PR; do not merge/deploy before independent DocsV2,
PRODUCT/WE1 source scope, protected host provenance and current BAE T10.
Actual production build and authenticated owner/Scribe browser acceptance
must be established independently after merge and new exact Factory permit.
No extra Next process, daemon, Scan OS execution or timer is added.

Negative tests must prove 401/403/200, private/cache, no POST, unscanned
and unsigned intervals, source staleness, independent mount identities,
shared/overlap rejection, Intel unknown, bounded block virtualization,
keyboard/375/768/1440 responsiveness and reduced motion. Synthetic
fixtures are local tests only and never emitted by a production endpoint.
