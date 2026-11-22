---
id: "aoe2war.app-prodn.scan-organization-os"
title: "Scan OS Learning, Organization OS and Measured Maturity"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2war","vpssentry"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "source-only-read-only-operations"
reviewed_at: "2026-11-22"
review_interval_days: 30
sensitivity: "internal"
---

# Scan OS Learning, Organization OS and Measured Maturity

**This extends existing merged Scan OS #1455. No second scheduler, host
daemon, private API, privileged reader, original scanner or deletion right.**
The original eight bounded definitions and their six deduplicated producer
groups in `config/scan-os-catalog.v1.json` remain authoritative. Source-owned
policy remains separate from verified host receipts and from permissions.

## Three increasingly expensive observation modes

| Mode | This v2 source implementation | Denied inference |
|---|---|---|
| HOT | Instant local `statvfs` ordinary-free and a previously saved local snapshot, with no registered file traversal | A cache reference is not fresh content proof, signed-source capacity, a real recovery permit, or an entire-device scan |
| INCREMENTAL | Re-stat only two catalog-approved SOURCE_CI producer files, compare owner/dev/inode/size/mtime/ctime to the local checkpoint, rehash changed sources and reuse matching unexpired local hashes | Directory mtimes are not used to certify grandchildren; other host files and hardlinks are out of scope |
| DEEP | Rehash all **two** approved local SOURCE_CI sources after explicit bounded reason; unchanged files are not excused | A typed reason is not cryptographic owner consent or authorization for a whole-drive walk |

These are **real local measurement profiles only for the SOURCE_CI release
producer pair**: `scripts/docs_v2_check.py` and
`scripts/scan_tracked_secrets.py` from the original catalog. They do not
execute the registered external scanner source. HEL1 ROOT/DATA, M1 storage
and Intel original authoritative producers remain separate; invoking the
local v2 scanner for `storage_hel1` fails closed instead of pretending to
scan a remote production filesystem.

The local file set is bounded to exactly two original paths, each at most
4 MiB. Regular owner files only. No symlinks, directory escapes, cross-host
trust, execution of unknown scripts or unbounded recursion. Output checkpoints
and per-run receipts are stored in one **owner-UID501 mode0700 private
directory** specified by the operator, outside tracked source. Receipt
files are exclusively created, mode0600, fsynced and individually readable.
The local checkpoint is deliberately mutable so the next run can reuse
knowledge, but cannot be used as a signed owner capability. Exit/HOLD on
invalid source metadata, unexpected cache scope, stale or unsafe state,
wrong owner/mode, a malformed receipt or the original 120-second budget.

### Existing original CLI

```console
python3 scripts/scan_os.py catalog
python3 scripts/scan_os.py plan --goal storage_hel1
python3 scripts/scan_os.py lessons
```

### New local observer CLI

Run from the **reviewed exact source checkout**, not from an arbitrary
directory, and point the state directory to an existing private 0700
operator-owned folder. An example for the legitimate owner M1 checkout:

```console
python3 scripts/scan_os.py measure --goal release --profile HOT --source-root "$HOME/projects/AoE2HDBets/app-prodn" --state-dir "$HOME/.aoe2war-scan-os-source-v2"
python3 scripts/scan_os.py measure --goal release --profile INCREMENTAL --source-root "$HOME/projects/AoE2HDBets/app-prodn" --state-dir "$HOME/.aoe2war-scan-os-source-v2"
python3 scripts/scan_os.py measure --goal release --profile DEEP --reason "Explicit bounded investigation of two CI source files" --source-root "$HOME/projects/AoE2HDBets/app-prodn" --state-dir "$HOME/.aoe2war-scan-os-source-v2"
python3 scripts/scan_os.py benchmark --state-dir "$HOME/.aoe2war-scan-os-source-v2"
```

**Do not create the example directory through a privileged service.**
Only the owner creates it `mkdir -m 700` if desired. No automatic
background monitoring or unqualified credential inheritance. There is no
secret token in this mode, and local observations are not original host
attestations.

Metrics per run: `wall_ns` (from observer entry through source work,
excluding Python process startup and final receipt seal), `cpu_ns`,
peak process RSS, OS rusage block-operation counters, exact source
content bytes explicitly read, registered metadata visits, files rehashed,
unchanged digest reuse, HOT-only **unverified** cache reference count,
partial/missing sources, local source coverage, recorded decision
routing, unknown false positives, original purpose/scope, local free
bytes and immutable receipt SHA. Physical disk I/O *bytes*, independently
reviewed false-positive rate and verified receiver coverage are NULL
until a separately trusted instrument supplies them. Cached source
claims are explicitly **UNSIGNED_LOCAL**; no scan grants deletion.

Learning summary records p50/p95 and sample counts, refuses to mix
different roots/producers, and marks fewer than five runs as low-sample.
Do not promote sub-millisecond scoped Python scan work into end-to-end
process startup time, server performance or multi-gigabyte performance.

## Organization OS: one sparse source graph, eight derived views

The only supplementary source links live in
`config/organization-os-source-links.v1.json`. Its **eleven**
versioned objects reference existing source paths; the original Scan OS
eight scan IDs are joined by six deduplicated groups, not copied into a
second scanner catalog. The graph identifies the source repo/path, owner,
producer, consumers, dependency IDs, logical source location, any verified
runtime surface, symlink references/destinations, retention and recovery
evidence. Unsupported symlink destinations, physical allocations,
independent recovery and runtime enrollment are UNKNOWN/NULL.

Run `python3 scripts/organization_os.py --view catalog` or select
`index`, `contents`, `glossary`, `encyclopedia`, `appendix`,
`ledger`, `accounting`. All eight share the same validated nodes
and deny stale dependencies, symlink cycles, bad source paths,
duplicate references and fabricated recoverability. The ledger view
says **external signed receipts NOT IMPORTED**, not “no operations
happened”. Accounting returns NULL physical reclaim and missing
disjoint coverage, rather than summing gross directories or assigning
100% completeness to an empty dataset.

A future certified UI reads **original** Storage OS, Workspace OS,
Factory, Intel and Scan OS source adapters as references, not eight
privileged daemons or duplicated original archives. Current unresolved
Workspace live-source and Intel receiver references stay visible in
the Appendix until original source admission.

## Measured 0–100 maturity, without an imaginary 100

`config/scan-os-maturity-rubric.v1.json` defines **seven dimensions,
five 20-point gates each**: scanning, storage, housekeeping, pruning,
recovery, organization, production usability. The exact source-only
scorer is `scripts/scan_os_maturity.py`.

```console
python3 scripts/scan_os_maturity.py
python3 scripts/scan_os_maturity.py --benchmark-dir "$HOME/.aoe2war-scan-os-source-v2"
```

Only source-structural and locally measured scan gates can pass
automatically in this version. Every high-risk signed host, owner,
release, browser, recovery and retirement gate is UNKNOWN until its
original independent verifier supplies proof. Results give an
observable **lower and upper bound** out of 100 with explicitly
unresolved weight. They **never** claim certified production 100,
score an unchecked boolean or substitute Central's subjective
historical estimates for benchmark observations.

At the first actual M1 two-file benchmark on November 22, 2026, 16:05
UTC, 16 runs covered five HOT, six INCREMENTAL, five DEEP. Before the
measurement-window correction, pre-receipt internal medians were
0.169 ms HOT, 0.264 ms INCREMENTAL and 0.330 ms DEEP; initial two
sources totalled 28,324 content bytes. Five unchanged incremental
runs reread zero content. **These values were from an older candidate head and are historical,
not the final-head benchmark.**

### Final measured candidate (source-only) at 2026-11-22 16:xx UTC

The expanded measurement window includes original catalog admission,
receipt-cache loading, exact metadata and content investigation and
checkpoint writing, but excludes process startup and final immutable
receipt sealing. In one owner-owned isolated native M1 run at the code
HEAD `3205567329fdbc23eb30bc742a4f912572556bf5`, 16 actual
observations produced:

| Profile | Runs | Measured p50 wall | Measured p95 wall | Median content bytes read |
|---|---:|---:|---:|---:|
| HOT | 5 | 2.440 ms | 2.694 ms | 0 |
| INCREMENTAL | 6 | 2.324 ms | 4.450 ms | 0 |
| DEEP | 5 | 2.349 ms | 2.670 ms | 28,324 |

The first incremental run hashed both original CI files (28,324 B);
the next five reused both unchanged hashes (10 verified incremental
hash reuses in total, **no** content reread). HOT referenced ten
unverified cached entries but did not claim those as verified reuse.
DEEP performed ten deliberate file hashes across five runs. The host
M1 APFS device was `16777234`; filesystem UUID and physical I/O
bytes remain `UNKNOWN`. Independent false-positive review remains
`UNKNOWN`.

There is **no statistically meaningful wall-time speedup claim**
from this tiny, cache-warm cohort: HOT's median was slightly slower
than INCREMENTAL in this run. The real measured improvement is avoided
content reads on unchanged bounded sources. The 35-gate scorecard
reports **Scanning 80–100** and **Organization 60–100** as LOCAL
source-only evidence ranges, while signed production recovery and
owner automation remain unscored/UNKNOWN. Certified score is NULL.

## Physical recovery and production lineage boundaries

Original Factory #1462 remains DRAFT, source COPY-only not installed
or owner-authorized, and original #1464 blocks an insecure
boolean-based universal COPY/RETIRE fallback but does NOT enroll the
original V6 issuer/root nonce ledger. Local Scan OS metrics, cached
records, a graph object or a maturity score never mint a V6 grant.
The signed per-object COPY permit and DATA SHA/readback receipt
must precede separately human-approved original RETIRE with isolated
restore evidence. Historical L4 is human-only and L5 never deletes.
Original BAE current890d/HOT1 9cf/HOT2 50b, 3030/3033 and ancillary
services remain protected; financial/custody ports and materials
remain untouched.

Atlas #1453 source `2a1fe95879b8949cafb12e4107975044128763ab`
is held unchanged until genuine T10. This source-only draft does not
merge to app-prodn main, install host scanners or add server runtime
dependencies. The source owner must obtain exact protected guard
admission, DocsV2, CI and release ancestry review before any main
merge; original Factory signer/restore admission is a separate gate.
