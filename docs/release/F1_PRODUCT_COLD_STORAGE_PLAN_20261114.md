---
id: "aoe2war.app-prodn.f1-product-cold-storage-plan-20261114"
title: "Bounded PRODUCT cold-storage transfer plan"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "auditors"]
source_of_truth: "git"
authority: "product-transfer-proposal-not-retirement-permission"
reviewed_at: "2026-11-14"
review_interval_days: 30
sensitivity: "internal"
---

# Bounded PRODUCT cold-storage transfer plan

The full older87-file,16,620,686,823-byte PRODUCT collection remains on the HEL1
data volume. Intel has an index/proof, not all artifact bytes. The earlier bulk
attempt measured0.27MiB/s HEL1→M1 and stopped safely; incomplete destination bytes
were removed while the source remained. These are dated observations from
[App1280 storage/clock audit](https://github.com/Emaren/app-prodn/issues/1280#issuecomment-6879749967).
Do not present GitHub artifact-download performance as this route's speed.

This proposal reuses B-owned SSH delivery and digest-bound retention receipts.
It adds no serving dependency, worker, timer, root API or financial authority.
No deletion is authorized by this document. Intel may be off; website serving
and a separately capacity-qualified PRODUCT release continue normally.

## Proposed copy-only workflow

1. Read the existing immutable PRODUCT collection manifest and restore pointer.
Requalify each exact file/source/build/digest and its recovery references. Exclude
all FINANCIAL backups, unknown files, active/immediate rollback, unique recovery
material and credentials. Manifest identity is the transfer identity, not latest.
2. Preflight M1 and encrypted Intel availability and free bytes. Preserve receiver
FileVault state. Never send private credentials or signed download URLs to HEL1.
3. Start with a bounded copy-only pilot: one stream versus at most four concurrent
ranges of the SAME classified artifact. Measure actual received bytes, monotonic
duration, throughput, retries and CPU/memory. No speed gain is assumed.
4. For an approved bulk copy, use fixed bounded ranges, per-range exact offset,
length and SHA256, an immutable manifest digest, and receiver0600 temporary files.
Persist only fully received/fsynced/rehash-verified ranges; preallocation is not
progress. Resume rehashes existing chunks, rejects mismatch, and requests only
missing bytes. Bind every remote read to the exact approved file and range.
5. Assemble each destination file without overwriting an existing different
object. Fsync it and its directory; independently verify whole-file size/SHA256
and source metadata. Validate collection completeness, not merely an index.
6. Prove isolated restoration of the identical bytes with safe metadata/symlink
handling. Seal a receiver receipt, source acknowledgement and exact restore
pointer. Only then can a separately reviewed retention operation consider a
genuinely redundant source copy. A failed/offline transfer never reaches this step.

## Resource and failure bounds

Use low-priority bounded I/O, no production model inference or repeated full-tree
scans. Cap concurrency and chunk size; impose per-range stall/deadline and total
budget. The first pilot must determine useful values before any bulk promise.
Record partial/verified bytes separately. HOLD on file/source drift, inode or
ownership changes, unavailable receiver, corrupt chunks, wrong manifest, expired
authority, insufficient space, or data-volume92% threshold for storage-heavy work.

Root below30GB warns; the existing6GiB source staging guard is unchanged.
Data availability uses f_bavail. Its accepted1% reserved-block policy is not a
physical-reclamation metric; no further reserve or financial storage changes are
part of this plan. Preserve every existing retirement and reserve receipt.

## Bounded route pilot, not a collection backup

A real16MiB HEL1→M1 copy-only comparison completed at2026-11-14T16:11:27Z.
One SSH stream took47.844s (350,665bytes/s); four concurrent4MiB ranges took
32.237s (520,434bytes/s), a1.48x observed aggregate gain for this small sample.
The fixed historical PRODUCT archive was independently SHA256-verified first;
each received range matched its expected digest and destination readback.
The source remained untouched. Both comparisons read the same warmed16MiB prefix;
no CPU/memory measurements were instrumented, and the limiting cause is unproven.

[Sanitized benchmark](receipts/F1_HEL1_M1_TRANSFER_BENCHMARK_20261114.json)
records exact boundaries and limitations. This does not measure Intel reception,
bulk throughput, resumable collection export, or restore readiness. The full
16.62GB remains on HEL1; a0.50MB/s small-sample result is no bulk-speed promise.

## Acceptance status

The pilot passed; the bulk resumable Intel workflow remains DESIGN ONLY.
No full16.62GB off-host migration, automatic retirement, or off-host restore
readiness is claimed. A complete independently verified receiver copy and
isolated restore proof are required before any separate retirement decision.
