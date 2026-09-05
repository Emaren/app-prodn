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
reviewed_at: "2026-09-05"
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
aoe2war speed campaign start
aoe2war speed campaign analyze
aoe2war speed campaign status
aoe2war speed campaign verify
```

`benchmark` defaults to a small critical public cohort. New `--full`
benchmarks use the versioned 68-route V2 public cohort in
`docs/audits/performance-route-cohort-v2.txt`: current static public surfaces
plus stable representatives of dynamic route families. The frozen August 13
66-route cohort remains historical comparison evidence only; it is not silently
mixed with the V2 cohort.


## Performance campaign V2

A serious optimization pass uses a durable before/analyze/after campaign rather
than an isolated stopwatch run.

```bash
aoe2war speed campaign start
aoe2war speed campaign analyze
# apply evidence-supported performance changes through ordinary reviewed code
aoe2war speed campaign verify
```

`campaign start` defaults to the full current route cohort and three rounds.
It captures an immutable baseline benchmark before performance code is changed,
binds that baseline to the exact certified production source/build, and writes a
campaign receipt under `.aoe2war-release/performance-campaigns/`.

The analyzer ranks route-level opportunities from TTFB, total response time,
download bytes, post-TTFB transfer tail, explicit Ready coverage, origin/public
seam evidence, and prior like-for-like benchmark history. It identifies material
historical regressions before generic tuning and emits a machine-readable plan
that an operator or coding agent can use. Recommendations never mutate or deploy
production.

The learning rail consumes prior verified campaigns. It records which routes
repeatedly improved or regressed and carries that evidence into later campaign
analysis. This is statistical operational memory, not a claim that Performance
OS can infer causation from a timing delta alone.

`campaign verify` reruns the exact baseline cohort after the reviewed changes.
Every route receives an improvement/regression/neutral verdict. A route is a
material TTFB regression only when it is both at least 100 ms and 20% slower;
total-response regression uses at least 150 ms and 20%. Verification preserves
the before and after release/build identities and refuses mismatched cohorts.

The Speed OS source commit and production release are deliberately separate
identities. Benchmark receipts bind `release_sha` to the certified production
source, while `operator_source_sha` records the local tool revision. This
prevents a newer Mac/GitHub control-plane checkout from being mislabeled as the
runtime that was actually measured.

## Capacity and hardware advisor

Every full campaign also captures a read-only production capacity snapshot from
the certified VPS: online CPU count and load, available RAM, swap, root and
durable-volume headroom, and the live web process RSS/thread count.

The analyzer turns that evidence into plain-language purchase advice:

- CPU is recommended only when elevated origin/route latency coincides with
  meaningful CPU load. A faster or larger-vCPU VPS is not prescribed merely
  because a page is slow.
- More RAM is recommended only when available memory is genuinely low or
  sustained swap pressure is material during the same performance window.
- More storage is a reliability/headroom decision unless separate I/O evidence
  proves disk contention. Free-space pressure must not be mislabeled as a page
  latency fix.
- GPU is explicitly not a normal AoE2WAR page-speed purchase. Next.js SSR,
  PostgreSQL/API work, TLS/proxying, and browser delivery are CPU/network/data
  workloads.
- If the public /api/speed/check path is many times slower than the local
  origin, proxy/CDN/network delivery is prioritized ahead of server hardware.

Missing capacity evidence is surfaced as unknown. Speed OS does not guess a
hardware purchase from an unavailable probe.

## Recent production incident learning

A campaign captures bounded counts from the last hour of the AoE2WAR web
journal. The probe records performance-shaped incident classes rather than raw
journal payloads: physical replay-archive scan budget failures, Speed/Traffic
telemetry relay timeouts, generic upstream timeouts, database/pool failures,
and memory-pressure/OOM patterns.

The analyzer converts those counts into root-cause actions. In particular,
recursive replay-archive inventory work in a public request path is treated as
a design defect to move behind a precomputed snapshot, and a slow Traffic
telemetry relay is treated as observability debt rather than proof that the
user-facing page itself is slow.

These incident counts are supporting evidence. They do not override route
timings, and the absence of a log pattern is not proof that a subsystem is
fast.

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

The August 19, 2026 Baseline Zero remains the historical 66-route reference and
established:

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
6. Start a full Performance Campaign before major speed work and verify the
   exact same cohort after the reviewed changes.
7. Keep the cheap release pulse on every ordinary deployment; use the full
   campaign when optimizing the estate.

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

## Rejected persistent build-cache experiment — V1.3/V1.3.1

The V1.3/V1.3.1 persistent Yarn + Next build-cache experiment was certified
safely and then rejected on measured production economics.

Measured warm-path evidence:

- exact Yarn cache hit: yes;
- exact Next cache hit: yes;
- network dependency fetch skipped: yes;
- dependency contract unchanged: yes;
- `yarn.lock` unchanged: yes;
- Yarn cache seed: 109.563 seconds;
- avoided network dependency fetch: about 79.7 seconds;
- offline build: 172.342 seconds versus 173.774 seconds in the V1.2 reference;
- warm stage: 5:17.8 versus 4:56.8 in V1.2;
- warm finish: 18:03.0 versus 15:47.2 in V1.2;
- persistent cache footprint: about 3.4 GiB.

The cache therefore spent more time copying the multi-gigabyte Yarn cache than
the network fetch it replaced, while the Next cache produced no material build
reduction. The experiment also consumed material mounted-volume capacity.

Decision: the release stage uses the certified V1.2 cold dependency-fetch path.
Do not reintroduce a copied persistent dependency/build cache without new
evidence that changes the storage and copy-time economics. Cache may accelerate
computation, but cache is never release truth.

## Automatic critical-route release pulse

Every successful `aoe2war finish` now runs one cheap persisted public HTTP pulse
after release certification. The pulse covers the small critical route set and
records HTTP status, median TTFB, median total time, release/build identity and
a like-for-like comparison with the prior pulse.

The pulse is observational. Release certification remains authoritative; a
transient public-network failure is recorded as a post-release performance
warning rather than rewriting a certified runtime as unshipped. Full 66-route
and browser readiness/Core Web Vitals campaigns remain explicit higher-cost
benchmarks.
