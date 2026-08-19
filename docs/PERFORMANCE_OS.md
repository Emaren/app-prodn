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
