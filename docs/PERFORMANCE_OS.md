---
id: "aoe2war.app-prodn.performance-os"
title: "AoE2WAR Performance OS"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "performance-operating-contract"
reviewed_at: "2026-08-19"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Performance OS

## Purpose

Performance OS turns release speed and public-site speed into durable,
comparable operating evidence. It separates measurement from optimization:
measure first, preserve the receipt, compare against prior truth, diagnose the
dominant cost, then change only the layer that the evidence supports.

Performance work must not weaken release certification, recovery guarantees,
database safety, or the protected Wolo boundary merely to improve a benchmark.

## Operator surface

```bash
aoe2war speed status
aoe2war speed release-history
aoe2war speed benchmark
aoe2war speed benchmark --full
aoe2war speed compare
aoe2war speed diagnose
```

`benchmark` defaults to a small critical public cohort. `--full` reuses the
66-route public cohort established by the August 13 performance audit.

## Release timing contract

Every instrumented staged release records:

- complete stage wall time;
- worktree/bootstrap setup;
- dependency fetch;
- offline dependency materialization and Next build;
- artifact path relocation;
- application artifact hashing;
- candidate dependency-tree hashing;
- candidate publish beside live;
- disposable-worktree cleanup;
- total remote stage duration.

Activation receipts record complete activation wall time. The existing finish
receipt remains authoritative for macro phases such as deployment,
documentation/context reconciliation, audit, Doctor, and final certification.

Performance OS correlates these receipts by exact release SHA rather than by
filename age alone.

## Site benchmark contract

A benchmark receipt binds measurements to:

- release SHA;
- active BUILD_ID;
- build version;
- benchmark mode and route cohort;
- sample count;
- public TTFB and total-response percentiles;
- public-vs-origin `/api/speed/check` seam;
- explicit route-level Ready marker coverage.

Cohort percentiles are calculated across per-route medians so one noisy route or
extra request sample does not silently reweight the estate. Comparisons are always like-for-like:
the same benchmark mode and exact ordered route cohort.
Baseline Zero may seed the first `--full` comparison because it uses the same
66-route cohort and route-median aggregation contract. A quick benchmark is
never compared against the 66-route full baseline.

The global `SpeedRuntime` is telemetry infrastructure. `SpeedReadyMarker` is the
route-specific contract for application-ready timing. Global runtime presence
must not be mistaken for complete route-level Ready coverage.

## Baseline zero

The August 19, 2026 baseline established:

- 66/66 public routes passing;
- median route TTFB improved from 587.5 ms to 383.4 ms versus the August 13
  comparison corpus;
- median route total improved from 771.5 ms to 558.3 ms;
- zero material TTFB regressions under the ≥20% and ≥100 ms rule;
- 61 material TTFB improvements;
- the lightweight origin speed-check endpoint completing in only a few
  milliseconds while public TTFB remained hundreds of milliseconds;
- deployment dominating the finish wall clock.

These measurements are evidence, not permanent thresholds. Performance OS
builds a time series so future decisions use release-over-release deltas.

## Fast-rollback retention performance

Fast-rollback retention is post-certification and non-fatal, but it still
contributes to operator wall time because activation waits for it to return.

The August 19, 2026 instrumented baseline measured approximately 475 seconds
between durable certification evidence and completion of fast retention.

Retention proof discovery has canonical shallow locations:

```text
aoe2war/rollbacks/<generation>/next/BUILD_ID
aoe2war/deploy-receipts/<receipt>/current-next/BUILD_ID
```

The retention engine therefore enumerates only those fixed BUILD_ID locations.
It must not recursively traverse rollback payloads, node_modules trees, build
trees, database snapshots, or deploy-evidence payloads merely to discover
BUILD_ID proof.

The durable-proof requirement is unchanged: a fast rollback pair without a
valid paired durable runtime + node_modules proof remains keep-only.

Performance receipts also split retention cost into proof lookup, filesystem
size probes, deletion, and total retention wall time so the next optimization
targets measured cost rather than inference.

## Context overlap fast path

Context archives are durable operating evidence, but archive compression is not
a prerequisite for production activation.

During `aoe2war finish`, pre-release documentation/control-plane reconciliation
may defer exactly the context projects selected by its locked update plan.
Finish starts those captures after source and documentation authorities are
frozen, overlaps them with the protected remote deployment, and settles the
result before post-release context planning.

If the overlapped capture fails, post-release update sees the stale archive and
falls back to the ordinary synchronous capture path. No stale context finding is
silently discarded.

The update engine may also defer its own broad final estate audit only when
`aoe2war finish` owns the canonical independent final estate audit later in the
same transaction. Source documentation checkers, central docs-check, taxonomy
audit, strict MkDocs build, release gate, runtime certification, rollback proof,
Wolo proof, Operator Bridge reload, and the final finish audit remain mandatory.

## Optimization order

1. Remove dominant release-time waste revealed by timing receipts.
2. Preserve or improve release safety while reducing duplicated work.
3. Improve public-path latency where origin/public seam evidence points.
4. Extend authoritative Ready coverage across important user routes.
5. Optimize image, JS, CSS, hydration, query and API payload cost without
   degrading the site's visual quality.
6. Run the full route cohort periodically and after major performance work,
   not on every ordinary deployment.

## Fail-closed rules

- A benchmark never mutates production.
- Performance data may recommend a change; it does not bypass a release gate.
- Missing timing evidence is reported as missing evidence, not inferred.
- Performance timing is observational: missing timing evidence is surfaced as missing evidence and must not invalidate an otherwise correct release transaction.
- Public latency is not blamed on the application when the origin seam disproves
  that conclusion.
- A faster release that weakens rollback, provenance, health soak, or Wolo
  protection is a regression.
\n

## Bounded build-computation cache

Performance OS may persist two bounded computation caches beside durable deploy
receipts:

- the current Yarn package cache, keyed by the frozen dependency contract,
  `yarn.lock`, Yarn version, Node version and architecture;
- the current Next computation cache, under the same dependency/toolchain key.

Both caches are copied into the disposable detached release worktree before
sandbox execution. The systemd build/dependency units remain unchanged:
dependency retrieval still runs with lifecycle scripts disabled and the build
still runs network-private with production secrets and the mounted volume
inaccessible.

The caches are acceleration inputs only. They are never release truth.
`yarn install --frozen-lockfile`, candidate dependency hashing, Prisma engine
proof, the cache-free `.next` artifact requirement, runtime certification,
rollback proof and Wolo boundary all remain mandatory.

Only one current Yarn cache and one current Next cache are retained. A
dependency/toolchain key mismatch is a cache miss. Cache absence therefore
degrades to the existing cold path rather than weakening a release invariant.
