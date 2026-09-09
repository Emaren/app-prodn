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
reviewed_at: "2026-09-06"
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
aoe2war speed inventory
aoe2war speed campaign start
aoe2war speed campaign analyze
aoe2war speed campaign status
aoe2war speed campaign verify
```

`benchmark` defaults to a small critical public cohort. New `--full`
benchmarks use the versioned 77-route V2 public cohort in
`docs/audits/performance-route-cohort-v2.txt`: current static public surfaces
plus stable representatives of dynamic route families. The frozen August 13
66-route cohort remains historical comparison evidence only; it is not silently
mixed with the V2 cohort.

## Shared Speed OS evidence across worktrees

Performance research is intentionally isolated in feature worktrees, but Speed OS
evidence is project memory rather than branch-local scratch state. Speed OS therefore
discovers the canonical Git `main` worktree and uses its ignored
`.aoe2war-release` tree as the default shared evidence store for certified release
receipts, historical benchmarks and performance campaigns.

This does **not** weaken Release OS ownership. Certified production state is still
validated by the canonical main worktree's own `aoe2_release.py` and receipt chain.
A performance worktree records its own HEAD separately as `operator_source_sha`, so
benchmark evidence distinguishes the production release being measured from the
Speed implementation performing the measurement.

The optional `AOE2_SPEED_AUTHORITY_ROOT` and `AOE2_SPEED_STATE_ROOT` environment
overrides exist for explicit operator/test isolation. They are not a mechanism for
pointing release authority at arbitrary candidate source. Receipt references remain
portable as `.aoe2war-release/...` regardless of which worktree invoked Speed OS.

## Edge Delivery audit rail

`aoe2war speed edge audit` joins the latest full per-route cost-stack receipt to
source cache-safety evidence and live public response headers. It records Cloudflare
cache status, Next cache status, cache-control directives, Set-Cookie presence and
the measured warm public-to-origin delivery gap.

The audit is deliberately non-mutating. It ranks safe opportunities and keeps
server-personalized or runtime-cookie responses in a fail-closed blocked class.
This creates a durable deployment manifest before any Cloudflare Cache Rule or
other edge mutation is authorized.

`aoe2war speed edge plan` converts that live audit into a non-mutating exact-route
Cloudflare expression only for responses that also prove `x-nextjs-cache: HIT`, do
not prohibit shared caching and do not emit `Set-Cookie`. The generated plan always
bypasses requests carrying any known AoE2WAR cookie discovered from source (including
`aoe2hdbets_session`), leaves `/api/` contracts untouched,
and records `mutation_authorized: false` until external Cloudflare authority is
explicitly connected. Ancestor Next layouts participate in the static
personalization scan, so a future layout-level session read automatically revokes
edge eligibility. The plan reuses a recent live audit only when the certified
production release and a cache-safety source signature still match; `--refresh`
forces a new live header census.

## Edge-cache safety classification

Speed OS never equates "delivery dominated" with "safe to cache." The source
inventory records a conservative cache-safety classification for each page:

- `server_personalized_do_not_cache` — server request/session evidence is visible;
  blanket edge caching is prohibited.
- `static_client_shell_candidate` — the page shell is client-rendered and server
  request personalization is absent; personalized API/client state must remain
  outside any shared shell cache.
- `anonymous_dynamic_candidate_review` — dynamic public SSR with no visible server
  personalization; any ISR/edge policy requires explicit response-equivalence and
  freshness proof before activation.
- `static_or_revalidated_public_candidate` — source appears static/revalidated and
  should be checked for actual CDN HTML/RSC cache participation.

This is static evidence, not an authorization to change cache policy. Session, wallet,
wager, settlement and financial truth remain fail-closed until runtime equivalence is
proven.

## Per-route cost stack

Speed OS V2 supplements public cold and warm measurements with a bounded,
read-only loopback probe executed on the production host. The probe requests the
same governed public route cohort directly from the local Next origin over a
reused connection. Each route can therefore carry:

- cold public TTFB;
- warm public TTFB;
- warm loopback-origin TTFB;
- cold-to-warm connection setup delta;
- warm public-to-origin delivery gap and ratio;
- post-TTFB transfer tail;
- static source-cost evidence;
- browser Ready coverage.

Route-specific origin evidence outranks the old global public/origin ratio when
classifying a target as `server_data` versus `delivery_proxy`. A route whose
origin is already fast must not trigger speculative Prisma/SSR work merely
because its public TTFB is high. Conversely, a genuinely expensive loopback
origin remains an application/data target even when the estate also has a large
network seam.

## Speed OS V3: confidence, browser truth, and stability

Speed OS V3 adds two evidence families without replacing the V2 measurements.

### Durable browser performance evidence

`SpeedReadyMarker` coverage proves that a route has an explicit semantic Ready
boundary. It does **not** prove what users actually observed. Browser timing is
durably ingested by Traffic and is joined back into Speed OS by exact build
version and Traffic's canonical route-group contract.

`aoe2war speed browser` reads the existing Traffic performance overview through
the VPS-local admin API. The Traffic admin credential is sourced and consumed
only on the production host; it is never printed, copied to the operator Mac, or
stored in a Speed receipt. The read is observational and does not mutate Traffic.

Route Ready evidence carries an explicit sample-confidence class:

- `none`: zero samples;
- `single_sample`: one sample;
- `low`: two through four samples;
- `moderate`: five through nineteen samples;
- `high`: twenty or more samples.

Only `moderate` or `high` route evidence may authorize a browser-readiness
diagnosis. A single slow navigation is preserved as evidence but can never by
itself label a route slow. The campaign currently treats a decision-grade Ready
p75 of at least 2,000 ms as browser-readiness debt, matching Traffic's durable
slow-sample threshold. Ready and LCP values remain separate metrics.

### Origin stability evidence

The normal route-origin pass remains the primary benchmark evidence. Each route
now also records its sample distribution (minimum, median, p75, p95, maximum and
spread). If that bounded pass looks expensive or internally unstable, Speed OS
may perform a focused seven-sample loopback reprobe of only the suspicious
route. The focused probe primes the local connection first, so all seven
measured route samples use the already-established loopback connection.

The focused probe is additive evidence. It never overwrites or deletes the
original route median. When a high-confidence focused median is at least 15 ms
lower and the original median is at least 1.75 times the stabilized median, the
campaign records `origin phase variance normalized on focused probe` and uses
the stabilized value only for diagnosis. This prevents cache/generation phase
noise from becoming fake persistent server debt while preserving the raw first
observation for audit.

This contract deliberately favors false negatives over false claims: sparse
browser samples and one-off origin spikes remain visible, but neither may
authorize broad performance work without stronger evidence.

## Route source-cost map

`aoe2war speed inventory` now attaches a conservative static source profile to
every source page. The profile scans the page and its first-hop local imports
for evidence such as dynamic SSR, Prisma calls, generation-cache signals,
parallel `Promise.all` work, Suspense boundaries, client-component boundaries,
images and complete-corpus loaders.

This is deliberately called **source evidence**, not measured latency. A large
static profile does not prove that a route is slow, and a tiny profile does not
prove that an upstream dependency is cheap. Performance Campaign joins this
map to measured route timings only to shorten diagnosis: for example, a warm
server/data bottleneck plus a complete-corpus signal points toward incremental
or generation-keyed derived projections, while a browser-Ready bottleneck plus
client boundaries points toward hydration/media profiling.

The inventory never recommends truncating complete replay truth merely to make
a page benchmark look faster.

## Cold versus warm latency contract

Speed OS V2 preserves the historical isolated-process route benchmark and adds
same-process keep-alive evidence. These answer different questions and must not
be silently substituted for one another.

- **Cold / isolated-process** TTFB includes a fresh command process and, for a
  public HTTPS route, may include DNS, TCP and TLS setup. It remains the
  comparable first-visit metric used by existing receipts.
- **Warm / keep-alive** TTFB is measured after priming the same curl connection
  cache. It better approximates repeated in-site navigation on an already-open
  browser connection.
- **Connection-setup delta** is the observed cold-first-transfer TTFB minus the
  median warm TTFB on the lightweight speed check. It is diagnostic evidence,
  not a promise that every browser will save exactly that amount.
- **Warm public/origin seam** is preferred for deciding whether persistent
  CDN/proxy/network delivery is actually slower than the local Next origin.
  The legacy cold ratio remains in receipts for historical comparability.

Full benchmarks also collect a bounded warm route pass in one curl process,
primed on the lightweight speed endpoint. Route receipts therefore preserve
both the original cold medians and supplemental warm medians without rewriting
the old benchmark contract. Performance Campaign analysis can distinguish
connection setup, persistent delivery/proxy cost, server/data work,
post-TTFB payload transfer, and missing browser Ready evidence.

This separation is deliberately conservative: a large cold/public ratio alone
no longer justifies blaming the CDN or buying server hardware. Speed OS first
asks whether the gap survives connection reuse.


## Browser Ready hot-path discipline

`Ready` measures the first authoritative state in which the marked primary
interface is usable. It must not be delayed by secondary evidence that can
continue resolving after the page is already operable.

For the WOLO landing page, chain-id refresh, stored Keplr restoration, and
balance proof are secondary live evidence. They may update the wallet panels
after first paint; they do not define whether the primary WOLO interface can be
used. The authoritative marker therefore waits only for the local presentation
preference to settle, avoiding an 8-second wallet-restore timeout from becoming
a fabricated page-load cost.

Server-rendered routes must also overlap independent evidence families when
truth semantics allow it. The staking page's Postgres economy/profile work and
its Wolo trust-wallet/chain work are independent. Start both families
concurrently and await them together; never pay one complete upstream wait and
then begin the other.

These optimizations do not permit truth weakening. A secondary wallet value may
remain pending/error, and a database result may still fall back according to
its existing contract. Performance work changes scheduling and readiness
boundaries, not financial or chain authority.

### Global-shell critical-path discipline

Responsive shell variants may coexist in the DOM for presentation, but they must
not duplicate equivalent network work. When desktop/mobile mounts observe the
same authenticated summary or event stream, they share a bounded request/event
broker so CSS-hidden controls do not double the first-second API load.

Global media follows the same rule. Station/program metadata may hydrate before a
listener acts, but media bytes are not page-readiness evidence. Radio WOLO must
not bind `audio.src`, select `preload=auto`, or call `load()` until explicit or
autoplay listening intent exists. This keeps multi-megabyte audio transfers from
competing with route HTML, hydration, critical APIs, Watcher traffic, or Ready.

Cache-safety class is part of the performance contract. A route classified as a
`static_client_shell_candidate` must not become server-personalized merely to
remove one client API round trip unless measured production evidence proves that
the trade is superior to the lost shared-cache option. Speed work must compare
the whole delivery architecture, not optimize one waterfall edge in isolation.

Local production builds and source contracts can prove scheduling and media-request
boundaries, but they do not substitute for production browser A/B evidence. Speed
OS records those proof classes separately and waits for decision-grade browser
samples before claiming a route-level latency improvement.

## Source page and asset inventory

`aoe2war speed inventory` derives the performance estate from the current
Next.js source tree instead of relying on a hand-maintained page count. At this
revision the application contains 100 page entry points: 22 authenticated admin
pages, 77 ordinary public page templates, and one sensitive dynamic public
invoice template.

Every ordinary public page template must have a stable representative in
`docs/audits/performance-route-cohort-v2.txt`. The inventory command maps
dynamic templates such as player, battle, clan, marketplace-shop, matchup and
watch routes onto stable real representatives. CI fails when a new ordinary
public page is added without a benchmark representative, so the Speed OS route
universe grows with the product instead of silently falling behind.

`/market/invoices/[publicId]` is intentionally classified separately. An
invoice is user-specific state; a made-up UUID would measure an error path, not
the real product. It must enter an authenticated or isolated-fixture performance
lane before being claimed as measured. This is an explicit coverage boundary,
not an invisible omission.

The same inventory walks `public/` and records total file count/bytes,
category totals for images, audio, video, fonts, data and downloads, plus the
largest public artifacts. Tracked Git blob identity also exposes exact duplicate
asset groups and the byte footprint that can be removed without recompressing or
guessing at visual similarity. Duplicate evidence is an optimization candidate,
not automatic deletion authority: aliases may intentionally preserve stable
public URLs.

That source inventory complements the existing browser Speed Runtime, which measures actual navigation resources, transferred
bytes, API request count, slowest APIs/resources, long tasks, network
characteristics and explicit application-ready time. Source bytes and runtime
transfer bytes are different evidence and are preserved separately.

The intended rhythm is:

```bash
aoe2war speed inventory --require-complete-public-coverage
aoe2war speed campaign start
# optimize only after the baseline receipt exists
aoe2war speed campaign verify
```

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
It refuses to start while an ordinary public source page lacks a benchmark
representative. The campaign archives the current page/asset inventory alongside
the immutable timing baseline before performance code is changed, binds that
baseline to the exact certified production source/build, and writes a campaign
receipt under `.aoe2war-release/performance-campaigns/`.

Verification captures the source inventory again. Its report therefore includes
page-universe drift, public asset bytes before/after, and exact duplicate bytes
before/after in addition to route timing deltas. A changed page universe during
a performance-only campaign is a warning because speed work must not quietly
become product-scope work.

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
If the current public cohort has gained or lost routes since the baseline, those
page-universe changes are reported separately through source-inventory drift;
they must not change the frozen timing comparison set. New routes enter the next
campaign baseline instead of invalidating an older before/after experiment.
Every route receives an improvement/regression/neutral verdict. A route is a
material TTFB regression only when it is both at least 100 ms and 20% slower;
total-response regression uses at least 150 ms and 20%. Verification preserves
the before and after release/build identities and refuses mismatched cohorts.

The Speed OS source commit and production release are deliberately separate
identities. Benchmark receipts bind `release_sha` to the certified production
source, while `operator_source_sha` records the local tool revision. This
prevents a newer Mac/GitHub control-plane checkout from being mislabeled as the
runtime that was actually measured.

An analyzed-but-unverified campaign protects the same certified release from
accidental replacement. It must not block a new baseline when certified
production has advanced to a different release SHA: the older campaign remains
historical evidence and the new release may freeze its own baseline without
requiring a force override.

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
recursive replay-archive inventory work is forbidden in a public request path.
The current web source no longer performs that filesystem walk and reports the
physical cross-check as unavailable until an operator/background snapshot owns
it. A slow Traffic telemetry relay is likewise observability debt rather than
proof that the user-facing page itself is slow.

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
- per-route origin sample distribution and bounded stability evidence when warranted;
- explicit route-level Ready marker coverage;
- build-matched durable Traffic Ready/LCP aggregates with route-level confidence.

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

## September 5, 2026 certified before-optimization baseline

The first full campaign after Kingdom Intelligence V1 was frozen against exact
certified production source
`31f883e4d8ce9a8835e34e46e7387247aae3b4f6`.

The 77-route cohort measured:

- TTFB p50: **400.0 ms**;
- total p50: **587.2 ms**;
- `/academy`: 604.9 ms TTFB / 2,975.0 ms total;
- `/rivalries`: 793.0 ms TTFB / 2,434.6 ms total;
- `/battle-archive`: 596.6 ms TTFB / 1,127.3 ms total;
- `/zodiac`: 398.5 ms TTFB / 1,354.3 ms total;
- four physical replay-archive scan budget overruns in the prior hour;
- nine database/pool error patterns in the prior hour;
- public `/api/speed/check` TTFB roughly 145x origin during the campaign;
- mounted-volume headroom below 10%.

This receipt is the Before authority for the first September performance
campaign. Do not compare a changed release against a different cohort or
silently substitute the older `67c390...` campaign.

### Generation-keyed public projection rule

Historical rivalry and Battle Archive totals require the complete replay corpus.
That truth requirement does **not** require reconstructing the same projection
for every HTTP request.

Expensive deterministic projections may be retained in-process by the exact
public replay generation plus options that change their result. A replay
generation change invalidates the projection. Rejected loads are not retained.
The complete corpus remains the source of truth; the cache is computation reuse,
not evidence or authority.

### Lightweight card/preview rule

A public card or training landing page must not invoke the complete player
command-center profile merely to obtain a display name, a bounded recent match
feed, and a total match count.

Use the narrow claimed-player preview rail for those surfaces. The preview still
uses exact Steam identity, public replay generation, canonical cleaned replay
rows, replay deduplication, and the normal match-feed builder. It deliberately
does not load WOLO history, staking, watcher aggregates, stream stats, community
honor, normalized metrics, charts, or rivalry summaries that the card does not
render.

## Verification instability contract

A full before/after campaign is not allowed to erase an intermittent timeout by
blindly rerunning the entire benchmark until it looks clean.

Each HTTP sample receives at most one bounded retry. If the retry succeeds, the
successful sample remains eligible for the route median **and** the original
failure is preserved in the benchmark receipt. The campaign verification is
then WARN and names the unstable route(s).

If the bounded retry also fails, Speed OS writes a dedicated failed-attempt
receipt under `.aoe2war-release/performance-attempts/` before stopping. The
failure therefore becomes durable performance evidence rather than terminal
scrollback.

This policy was added after the first `908e4103...` verification attempt timed
out on `/game-stats` after 15 seconds while receiving only a partial response.
That event is evidence of instability; it is not proof that Wave 1 regressed,
and it must not be silently discarded.

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

## Next production-build census

`aoe2war speed build` measures a completed Next production build as a separate
performance evidence rail. It inventories raw `.next/static` bytes, the largest
JS/CSS artifacts, and route-referenced bundle footprints from Next build
manifests.

Raw build bytes are **not** browser transfer bytes and are never substituted for
Runtime/Web Vitals evidence. Their purpose is to expose code-splitting and bundle
regressions early, including in CI immediately after `yarn build`.

The command supports optional route and single-chunk regression ceilings, but
AoE2WAR does not invent a budget before a real baseline exists. Establish the
current build census first; then tighten thresholds from measured production
history as refactor campaigns prove sustainable reductions.

### Operator before/after report

A verified campaign prints the overall p50 before/after in plain language and then
prints **every route in the frozen cohort** with total time, TTFB, milliseconds
saved or added, percentage faster or slower, and the material verdict. The JSON
receipt preserves both the signed legacy delta and positive
`*_faster_percent` / `*_saved_ms` fields so humans and automation do not have
to mentally invert a negative latency delta.

The site-wide speed campaign is therefore auditable route by route: there is no
single flattering average that can hide a page regression.
