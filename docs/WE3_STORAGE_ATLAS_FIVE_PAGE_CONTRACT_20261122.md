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

## November 22 native capacity observation rail — not category admission

The five-page source preserves the large Tetris/diamond gross category mosaic,
but additionally shows a compact native *capacity* utilization bar **outside**
the grey category field. ROOT and DATA are read at request time using only
Node's read-only statfs metadata at the existing fixed HEL1 / and
/mnt/HC_Volume_105319120 mounts. Both require separate, real directory
mount devices; absent/mismounted volumes withhold both values. No walk,
spawn, shell, SSH, file contents, signed-receipt generation or write occurs.
All four values (total, used, ordinarily available, reserved) must be safe
integers and independently sum exactly. The displayed ordinary utilization
percentage matches native df used/(used+ordinarily-available), while the
segmented block shares use used/total and retain the separately shown reserved
portion; neither denominator certifies category allocation. The source is explicitly
NATIVE_HEL1_STATFS_UNCERTIFIED, not a signed collector receipt.

M1 shows the original owner UID501's **dated** November 22, 2026
12:41:06 UTC native macOS APFS container observation (total
494384795648, used 484315406336, not allocated 10069389312 bytes).
This source-only observation is embedded as a versioned record, declared
OWNER_M1_APFS_DATED_UNCERTIFIED, and is marked DATED / NOT CURRENT after
15 minutes. It is a *whole APFS container* sample, not the ordinary Data
volume accounting or a live signed Mac source. Its bytes are never
silently refreshed by browser polling.

The source date and device identity are explicit. No Intel total or used
bytes are manufactured from the historically recorded 23 encrypted objects
or a previously recorded free-space point; the independently admitted
current Intel reader continues to own those facts. No capacity receipt
assigns category percentages or a unique reclaim figure. HEL1 and M1
utilization bars represent native capacity accounting only; the separate
grey UNKNOWN / NOT SCANNED mosaics remain unscaled until disjoint category
evidence exists. Device headroom guidance is ROOT 25 GiB, DATA 40 GiB,
M1 25 GiB, Intel 60 GiB, never a cleanup authorization.

## WE4 twenty-six ROOT generations — independently sourced cohort

Original WE4 owner-private source manifest, observed November 22, 2026 at
04:22:06 UTC, has exact SHA-256
d0bf8741c5a5852e6bf2dccc07ce774d0726017172c878fb8818c72eecb68b0f.
The original source is 9,424 bytes, with 26/26 selected ROOT generation
trees, exactly 41,255,313,408 bytes of gross selected st_blocks allocations.
It does NOT claim a whole filesystem crawl, a unique reclaim amount, current
rechecked service PIDs, or an independently verified signing key.

In source, lib/storageAtlasGenerationCohortServer.ts is the bounded,
server-only owner-private read adapter. It is CLOSED by default. Even after
a separate reviewed WE2 exact-source enrollment is legitimately installed,
the adapter will inspect only its fixed /run/private/aoe2war-storage-atlas
basename, O_NOFOLLOW, a regular non-world-readable single-link file,
strict 9,424-byte size and SHA-256 match before projectValidatedRuntimeCohort
validates all 26 selected items, ROOT mount identity, unique generation/source
prefixes, gross total, timestamp and BUILD_ID metadata. An unadmitted source
or mismatched content yields NO ROWS / NOT ADMITTED, not a simulated
generation list. There is no API to upload a snapshot, set the gate, retrieve
raw files, copy, SSH, scan, transfer or delete.

The public admin projection explicitly labels an eligible future file as
SOURCE-ONLY DIGEST-PINNED / NOT INDEPENDENTLY SIGNED. Its cards and mosaic
are a separate measured GROSS cohort, never added into certified ROOT used
or unique reclaim. It exposes only 12-character generation aliases, exact
Git source revisions, BUILD_IDs, measured gross bytes, dated modification
times, historical dependency KEEP versus otherwise REVIEW HOLD, and source
age. Three historical service-dependency generations are kept protected;
even their current PID/rollback state is not claimed by this dated receipt.
All 26 copy and deletion flags are false, unique reclaim NULL. Source files,
host paths, inode IDs, modes and original receipt bytes stay server-private.

Intel's 23 historic archive metadata rows and six historical restoration
assertions remain separate from a current receiver-content hash check and
fresh full restoration. The independently admitted Intel derived receipt
must qualify before Intel object detail is shown; otherwise the Intel surface
remains grey UNKNOWN. A previously signed *historical* object is not a
newly verified source copy, current restore, or transfer permit.

## Actual WE3 DocsV2 review scope

November 22 source/host scoped reviews of DEPLOY.md, docs/PARSER_OBSERVATORY.md
and docs/WAR_ROOM_FORUM.md were undertaken in WE3. The release runbook's
historical commands are not direct production authority; dated corpus
denominators are not new measurements; and the forum direct deploy example
was retired in favor of protected Factory and separate schema authorization.
The fourth expired document, prisma/README.md, is C-protected and requires
a distinct legitimate WE1/source-owner review. WE3 cannot self-approve it
or rewrite the DocsV2 gate. Until the protected review is source-approved,
DocsV2 baseline/registry regeneration and all new production release claims
remain HOLD.

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
