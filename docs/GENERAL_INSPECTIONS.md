---
id: "aoe2war.app-prodn.general-inspections"
title: "AoE2WAR General Inspections"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2war","wolochain","vpssentry"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "inspection-scoring-contract"
reviewed_at: "2026-10-18"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR General Inspections

## October 25, 2026 — Tab C evidence-bound operational gap projection (source-only draft)

**Dated operator screen observations, not new measurements:** General Inspections 69/100:
Speed 63, Documentation 35, Organization/Storage 76, Test & Build 100,
Release & Runtime 64, Security 75, Data/Wolo/Replay 73. Kingdom Intelligence
Doctor 59/100 UNSAFE (P0=2, P1=4) was observed separately. These screen
readings are not independently authenticated host observations and must not
supersede current source-bound receipts or newer trusted measurements.

### Proof origin, TTL and authority

- The **preferred bridge reader** accepts an Operator Bridge
  `kingdom-intelligence.json` envelope and searches existing VPS activation,
  gate, stage and certification files; the **fallback reader** reads local
  `.aoe2war-release` Finish/gate/speed/edge receipts if the bridge is unavailable.
  A valid certified activation binds stage/gate/certification release SHA. A
  transport `receivedAt` is not a new `payload.generated_at` measurement.
- SpeedOS cold-browser LCP/ready/TTFB and Cloudflare edge cohorts require both
  explicit **exact certified release SHA** and current-release assertion.
  Metrics lose live points as their native receipt ages from 24 hours fresh
  to zero at 168 hours, or immediately on a source mismatch. A stale October
  13 measurement cannot grant current live speed points on October 25.
  This also applies to per-browser mutation-boundary credit.
- Replay-corpus accounting requires a matching
  `replay_truth.production_source`, current-release assertion and fresh replay
  receipt (24 hours fresh, zero at 168 hours). Replay history remains useful,
  but must not count as verified current-release operational success.
- The source/build-scoped **Test & Build Integrity** score remains tied to the
  certified gate's declared `required_commands`, validated return codes and
  certification. A successful historic gate is not proof of current Doctor,
  Wolo economics or browser behavior. A validator not required by the
  certified gate scope stays explicitly marked not required.
- Bridge-backed Doctor, systemd, Wolo listener and security observations
  decay with capture/receipt delivery (one hour fresh, zero after six).
  Root/volume capacity prefers live read-only VPS statfs; older bridge capacity
  is a decaying fallback. Immutable certification proof does not expire solely
  because the last host heartbeat is old.
- The seven inspection categories use their own pre-existing canonical
  100-point weights; these are **not** the Kingdom Index 30/25/20/15/10
  page-quality certification criteria.

### Machine-readable why-not-green

`GET /api/general-inspections?report=why-not-green` projects **one already
collected, sanitized** `GeneralInspectionsSnapshot` into a source-attributed
seven-category PASS / FAIL / UNKNOWN matrix and an exact-weight repair queue.
The response includes each check ID, awarded/max/missing points, timestamp,
TTL, uncertainty reason and owner-evidence repair. The default API response
and website visual layout remain unchanged; no additional host scan, operator
command, database write, service restart, signing or financial operation occurs.

A **FAIL** is assigned only to fresh explicit measured operational/source
invariant mismatches. A missing timestamp, expired receipt, partial checker
coverage or unavailable host truth is **UNKNOWN**, not an observed failure.
The new report does not change the persisted underlying score or independently
certify a claimed positive reading; `measuredHealthChanged=false`.

Documentation aggregate scores are not an ID-level DocsV2 review registry.
To close a Documentation 35 reading, obtain the **current detailed DocsV2
review/expiry and reference-drift output** from the documentation owner,
record each exact document ID and policy deadline, reconcile missing
registry/index entries and renew legitimate source reviews. Do not delete
failing documents, change the scoring threshold, relabel an expired review
as current or invent overdue IDs from aggregate ratios. Source correction
is distinct from the later authorized host proof.

### Read-only repair queue and acceptance

1. **Source-fixable:** refuse stale/cross-release Speed and replay credit;
   fail safely under a deleted/corrupt receipt; preserve scoped gate semantics;
   validate canonical weighted arithmetic and diagnostic report generation.
2. **Documentation owner:** resolve exact expired DocsV2 IDs, bad references and
   registry drift using a dated, source-bound strict DocsV2 receipt. The
   source score alone cannot identify those IDs.
3. **Host owner:** capture current read-only Doctor P0/P1 details, active
   release/build/source identity, VPS services and capacity, speed cohorts
   and replay/Wolo safety receipts on the actual certified production build.
   Listener availability does **not** prove wallet custody or settlement.
4. **Central certification:** verify exact-head CI and independently required
   production/browser evidence before claiming **next measured operational
   health**. A complete gap-report tool is only **health tooling completeness**.

This draft is not a release request and grants no permission to mutate finance,
restart consensus or settlement, run Finish, alter production journals or award
Kingdom Index points.


## October 18, 2026 — archival score lineage remains immutable under live agent updates

The dated `/leaderboard` source review scored **64/100** and its rubric
dimensions are historical evidence, not the current measured score. Previously
a newer operator agent observation replaced the review in one map; once it
expired, the UI could relabel that newer agent number as the "historical review"
and show its stale dimensions as history.

The Index now maintains separate baseline source-review and current agent
lineages. A fresh, aligned observation supplies the live measured score and
its own dimension breakdown; an expired/uncorroborated agent claim supplies
neither. The historical review score and dimension bars remain derived only
from the dated baseline. The "observed" count recognizes current agent-only
routes instead of depending on the existence of an archived review. Pure
lineage tests cover current, expired and absent-review cases.

This change does **not** independently verify an agent-produced number,
install the scoring agent, change page appearance, or award 100. Financial
release and current 100-point specialty gates remain unaffected.

## October 18, 2026 — nightly agent-readable route dependency gap evidence

The `.github/workflows/kingdom-index-source-census.yml` workflow now
publishes an additional JSON evidence artifact from
`scripts/kingdom_index_dependency_evidence.py`, plus a GitHub Actions
step summary of route files, unresolved local imports, nonliteral imports
and lexical-census status. On PRs, inspect `/leaderboard` and
`/kingdom-index`; on schedule/manual runs, inspect all 68 registered
routes. Changes to shared config, lockfiles, Prisma schema and module
resolver trigger the census, not only page-local components.

These results are strictly **source-only diagnostic observations**.
The original source census `--check` remains a blocking drift guard.
A job success means **the sensor ran**, not that complete dependency
closure, the deployed bundle, p95 performance or business correctness was
proven. No quality point is awarded, no production source is authenticated,
and no finance/release permit is created. Artifacts support agent triage
and a future trusted receipt/criterion evidence pipeline.

## October 18, 2026 — latest-only Index inspection polling

Kingdom Index uses one request-start sequence for its sixty-second and
visibility-triggered refreshes. A slow earlier successful response cannot
replace a newer snapshot; a slow earlier failure cannot set SIGNAL
UNAVAILABLE after a newer successful observation. Unmount aborts still
prevent state updates. The gate is a pure helper with reversed-completion
regressions, and the Index route fingerprint is regenerated exactly.

This prevents presentation drift **without** creating measurements or
certifying a route. Current agents still require source-bound evidence,
freshness and independent certification before a 100/100 green claim.

## October 18, 2026 — canonical route-census identity for every Index page

Kingdom Index now selects the 68-route, CI-updated
`config/kingdom-index-routes.json` `sourceTree` fingerprint for ALL
public pages. The legacy `lib/pageChangeManifest.generated.ts` is generated
by a different algorithm, covers only 25 routes and contains outdated
Leaderboard source versions. Its fingerprints are not interchangeable
with the Index route census and no longer override that census for scoring.

The detail display labels this value ROUTE SOURCE and explicitly warns:
it is a **route-local Git blob census**, not an authenticated deployed
runtime identity, fully closed transitive import graph, CI/build attestation
or independent proof of production correctness. The source-census workflow
tests exact local fingerprints; a shared import can still change without
changing the route-local value. That unresolved coverage prevents 100/100.

Agent-fed observations must match the current census namespace, have
recent timestamps, and remain noncertified. An old 20-character manifest
identity or the historical Leaderboard 64 cannot receive current credit.
No additional agent writer, finance permission, deployment authority or
source-closure certificate is implemented by this change.

## October 18, 2026 — show the route-specific quality proof gates

Kingdom Index details now render the existing `specializedAssurance.gates`
with each requirement and its actual `unverified` status, rather than
silently transporting those obligations in API JSON. For HD Leaderboard,
this includes independent Steam rating and result precedence, rank/pagination,
lane-cache coherence, and the real-browser test matrix. This is an honest
checklist of missing evidence, not a declaration that any gate passed.

The details are visible in both the default Ledger View and the optional
Realm View. No Leaderboard page component, rank calculation, asset or style
was changed by this Index presentation. Specialty obligations remain
noncrediting and mandatory before a full engineering certificate.

## October 18, 2026 — live Kingdom Index score is not the historical 64

The Kingdom Index opens **Ledger View** by default; Realm View remains
available from the existing toggle. The 64/100 HD Leaderboard value in
`config/kingdom-index-baseline.json` is a **historical source review**, not
a current release-bound quality score. The source review is preserved as
`lastReviewScore` and its dimension bars are labeled historical in the detail
drawer. It no longer occupies the live `score` field on the route ledger.

The public `score` field now accepts only a nonstale, source-aligned **agent**
observation. The agent's typed timestamp must include an explicit timezone
and time, and the readout expires after 15 minutes (or if more than five
minutes in the future). Agent observations are reported as `AGENT OBSERVED`,
NOT certified; agent claims cannot yield a displayed 100. Source reviews,
unverified `certified` claims, missing or drifted source, and stale evidence
display `—` as current quality; the old review remains inspectable.

`/api/kingdom-index` uses `private, no-store` so the 60-second visible-page
poll cannot be served a CDN-held or stale-while-revalidate score snapshot.
The optional server-managed evidence feed still requires an explicitly
configured `KINGDOM_INDEX_EVIDENCE_PATH`, valid dimensions and compatible
source versions. **No agent reporter or independently authenticated 100-point
criterion verifier is installed by this change.** Without a current feed,
the index remains unmeasured rather than inventing an upgrade.

This is display truth and score freshness, NOT a new score or a financial
release permit. The ranking specialty gates and production browser/database
evidence in issue #668 remain open. The historical 64 stays in source
history for honest comparison with future independently measured releases.

## October 18, 2026 — report each missing evidence point before prioritizing upgrades

The read-only `scripts/report_general_inspections.mjs` command analyzes
one certified General Inspections API snapshot and reports the largest
weighted proof gaps across the seven official categories without changing
scores or thresholds. Its `--expected-release=<40-hex-sha>` option binds
the report to the intended deployed source. Missing timestamps, duplicate
check identities, mismatched weighted arithmetic, or unavailable response
fail closed rather than producing a false healthy score.

This tool does not run benchmarks, refresh Doctor evidence, change
WoloChain, or assume that 100/100 is attainable without the missing live
measurements. Use its sorted losses to prioritize repairs, refresh original
evidence from the appropriate authority, then verify genuine point gains.


## October 18, 2026 — Kingdom Index page-specific quality evidence

Kingdom Index now separates **one site-wide engineering rubric** from
**route-specific obligations**. `config/kingdom-index-quality-rubric.json` is
the universal 30 correctness + 25 functionality + 20 performance +
15 maintainability + 10 testing budget; every one of its 20 criteria must
be supported by inspectable exact-release evidence before a certified 100.
`config/kingdom-index-assurance-profiles.json` defines additional,
**noncrediting** mandatory proofs for riskier domain surfaces. HD Leaderboard
must prove Steam RM/DM authority and disconnect vetoes, betting must prove
money conservation and financial-side-effect boundaries, replay pages require
exact final-artifact authority, while AoE2WAR OS requires manifest, staging
and rollback proof. These are not extra points. General-purpose route profiles
default to the common rubric; future route-specific obligations must be
reviewed before certification.

The public `/api/kingdom-index` snapshot includes
`specializedAssurance`, an additive read-only `profile` and array of
`{id, requirement, status:"unverified"}` objects. **Unverified is not a
passing score.** The public scoring budget, the historical 64/100 leaderboard
assessment and financial operations remain unchanged. The historical
assessment is not a current/live score on the Ledger.

### Read-only route-dependency evidence

`scripts/kingdom_index_dependency_evidence.py` **reuses** the existing
`aoe2_module_graph.py` lexical extractor and resolver. It follows static
local TypeScript/JavaScript imports, JSON/CSS references and possible literal
`/api/` route links; includes ancestor Next.js layout, template and error/loading
boundaries with their transitive imports; and includes the present package lock,
Prisma schema, build configuration and middleware/instrumentation inputs.
Interpolated backtick imports are flagged for review, not treated as resolved.
Its hash remains working-tree evidence and does not authenticate a build artifact. It records unresolved imports and dynamic module
references without claiming to resolve runtime paths.

~~~bash
python3 scripts/kingdom_index_dependency_evidence.py --route /leaderboard --json
python3 scripts/kingdom_index_dependency_evidence.py --all --json > /tmp/aoe2war-route-dependencies.json
~~~

This is a **working-tree source diagnostic**, not a Next.js compiler/bundler
closure proof or production certification. A `STATIC_LEXICAL_CENSUS_ONLY`
result is not proof that all possible imports, runtime APIs, server actions,
dynamic SQL queries, financial effects or network dependencies were examined.
The instrument never executes source, reads keys, changes state or awards
quality points; tests exercise transitive shared-code changes, repository
config changes, literal API references and unknown/dynamic imports.

Two older version mechanisms remain separate:
`scripts/kingdom_index_source_audit.mjs` hashes a narrow catalog subset
from committed Git blobs; `generate_page_change_manifest.py` hashes
page-specific working-tree files for a legacy page notice manifest.
`lib/kingdomIndex.ts` may prefer the latter for overlapping routes.
**Neither older hash is a dependency-complete certificate.** The new
diagnostic reports extra evidence but does not silently replace either.
Only migrate the identity policy after testing side-by-side behavior and
authenticating exact Git source, API data inputs and deployed artifact.

### Path to real 100/100

First establish source dependency visibility, domain-specialized invariants,
browser/accessibility evidence and production-scale P75/P95, queries, heap and
staleness receipts. Then record verified criterion-level proof in a
reviewed, nonforgable release-bound ledger. Keep unknown/failed gates unearned.
Only extract large UI modules behind behavior-preserving snapshots and
performance parity. Do not reward file-count reductions or arbitrary
decomposition. See app issue #668 for the HD Leaderboard execution ladder.

## Purpose

General Inspections is the public-facing maintenance board for the AoE2WAR operating estate.
It turns existing receipts and live capacity signals into explicit weighted scores instead of
relying on memory, vibes, or a manually maintained green dashboard.

The route is /general-inspections. It is the last entry in the Kingdom dropdown, immediately
after Speed.

## Operator evidence triage (read-only)

Use `./bin/aoe2war inspections` to fetch the existing no-store public
`/api/general-inspections` evidence ledger and list each category's unearned
weighted points, missing check ID, detail and timestamp. It does **not**
rerun Doctor, perform a release, refresh the bridge, touch Cloudflare or write
any inspection result. `--json` emits the normalized diagnostic.
`--file SNAPSHOT.json` reads an already-saved public JSON response without
network access for offline analysis.

The CLI's HTTPS source is pinned to AoE2WAR. If the API is inaccessible, missing
any of the seven categories, or returns invalid score fields, the command
reports STOP rather than fabricating a healthy inspection. In particular,
a Python HTTP 403 may come from an upstream browser-access policy. Do not
weaken Cloudflare or production authentication to make the CLI green.
From an authorized Chrome session on `/general-inspections`, read its
same-origin public API, save the returned JSON as a file and use
`./bin/aoe2war inspections --file /path/to/general-inspections.json`.
The saved file is evidence, not a new score or a substitute for freshness.

After this inspection UI is deployed, its **Copy current inspection evidence**
control is the preferred path: it copies the already-loaded public snapshot's
scores, missing checks, receipt times and notes to the clipboard **without any
additional HTTP request**. The operation is read-only; it neither triggers
Doctor nor publishes new evidence. If browser clipboard access is unavailable,
the page retains its normal per-check inspection details.

A certified `aoe2war doctor 100/100` is not a certificate that all seven
weighted inspections are green. Their proof comes from separate authorities:
newest sealed VPS activation, periodically published Mac Operator Bridge
Kingdom Intelligence, mounted-vault recovery/retention evidence, and
current-release cold-browser plus edge receipts. Bridge publication has its
own freshness requirement; a live heartbeat does not establish a fresh
Brain snapshot. A low Release & Runtime Integrity score after Finish should
be diagnosed by the *actual* check-level source/build parity, Finish closure,
and bridge evidence-age fields, not by weakening weights or pretending a
stale historical receipt proves the current release.

## Inspection categories

The first version has seven independent 100-point inspections:

1. Website Speed
2. Documentation
3. Organization & Storage
4. Test & Build Integrity
5. Release & Runtime Integrity
6. Security & Resilience
7. Data / Wolo / Replay Integrity

Each category must total exactly 100 points. The scoring module rejects any category whose
weights do not total 100, and the Node contract tests enforce the category totals.

## Evidence contract

The page is receipt-backed. It does not execute shell commands from the browser and does not
accept user-controlled filesystem paths.

Production uses a two-plane evidence contract:

1. **Durable VPS authority.** The active release identity, gate result, candidate build version,
   and certification are read from the newest fully certified activation receipt on the mounted
   AoE2WAR volume. This receipt is authoritative even if the operator bridge is briefly behind
   immediately after deployment.
2. **Sanitized Kingdom Intelligence bridge.** The Mac operator plane publishes a compact
   `kingdom-intelligence.json` state file to the VPS. Council and Brain reduce Doctor, audit,
   workspace, documentation, SpeedOS, recovery, host, Wolo, replay, and storage observations to
   safe counts, statuses, booleans, timings, and source SHAs before they cross the bridge.

The production scorer may additionally read only bounded VPS-local surfaces whose state is not
owned by the Mac bridge: current filesystem statistics, the sealed Storage Expiry ledger, the
canonical Watcher download directory, and durable deployment receipts.

Source authority distinguishes **exact source identity** from **implementation-equivalent
identity**. A certified production commit may remain current when the canonical local/GitHub
head is a proven documentation-only descendant of the repository's implementation baseline and
the certified production commit lies on that same baseline-to-head lineage. This prevents a
documentation refresh from manufacturing release debt while still requiring a real deployment
whenever implementation authority advances.

Local development has a direct-receipt fallback that reads the developer checkout's
`.aoe2war-release` evidence. Production must not depend on that Mac-only tree existing on the
server.

Absolute Mac paths, raw Doctor payloads, Cloudflare ray identifiers, avatar URL allowlists,
secret material, and raw security internals are not returned to the browser.

## Watcher release authority

Watcher release identity is not copied into the General Inspections baseline. The scorer imports
`WATCHER_RELEASE.version` and `WATCHER_RELEASE.previousVersion` from the canonical app release
contract. `sync-watcher-release.mjs` rotates the old current version into `previousVersion` when
a newly certified Watcher is synchronized. `aoe2war watcher-downloads` is the governed live-vault
retention rail: current + previous are protected, and an older strict versioned filename is
reclaimable only when its exact SHA-256 is independently present in the corresponding immutable
public GitHub release. This keeps download-generation hygiene and the Data / Wolo / Replay
Watcher check bound to the release users can actually download instead of a manually maintained
inspection snapshot.

The tracked baseline remains authority only for slow-changing inspection policy such as storage
headroom targets and rollback-window counts; it must not duplicate mutable product release IDs.

## Speed evidence bridge

Brain publishes only a compact SpeedOS summary. Cold-browser evidence contains sample count,
p50/p75/p95/max timing metrics, LCP-target stability count, and the three mutation booleans.
Edge evidence contains only `passed/total` counts for static HTML, dynamic HTML, and Featured
Avatar delivery plus the release SHA, timestamp, and overall verification state.

If either Speed proof belongs to the previous production release, the performance category
visibly loses current-release credit and emits a note. Deploying a new release therefore cannot
inherit a permanent green speed mark from an older release.

## Freshness and decay

A passing receipt is not permanently worth full credit.

Checks that depend on operational evidence apply a freshness window. Fresh evidence receives
full credit, then decays through the warning window, and eventually reaches zero when the proof
is too old to support a current claim.

This is deliberate. A system that was healthy last week is not automatically healthy now.

## Status colors

Green means at least 90 percent of the available mark.
Watch means at least 67 percent but less than 90 percent.
Action means below 67 percent.

Test ratios are displayed as numerator and denominator pills whenever the receipt contains a
real count. The page must never manufacture a denominator merely to make a test group look
complete.

## Test provenance

The release gate seals both executable test inventories into the durable gate receipt. Node
coverage comes from `scripts/run_test_contract.py`; Python coverage comes from
`scripts/run_python_contract.py`, which discovers every tracked `tests/test_*.py` contract
before running the complete unittest suite.

General Inspections parses those exact receipts instead of carrying a hand-maintained Python
file count or awarding partial credit for an unsealed remote run. The validator command return
code is the pass/fail authority; parsed file counts are display/provenance detail when the bounded
receipt tail still contains the runner's opening count banner. A successful required validator
therefore remains proven when only that banner has rotated out of the bounded tail, while a
missing or nonzero command still fails closed. New gate receipts also seal
`required_commands`, the exact validator set selected by the governed release scope. A
validator that the gate explicitly declares out of scope is displayed as **Not required by
certified gate scope** rather than being misreported as a failure. A validator that is required
but missing or failed still loses its full credit fail-closed. Legacy receipts without an
explicit required-command set retain the conservative missing-evidence behavior. GitHub CI
invokes the same Python runner so local release proof and remote CI cannot silently drift onto
different test inventories.

## Organization and storage policy

Organization & Storage measures headroom and housekeeping, not raw byte minimization.

For the two VPS-local capacity gauges (root headroom and mounted-volume usage), live `statfs`
measurements take precedence over an older Mac Operator Bridge payload. This matters after a
protected Finish reclaims verified runtime bytes **after** the Brain captured a capacity
snapshot. If the VPS cannot measure a filesystem, a fresh Brain snapshot is a visibly labeled
fallback and its capacity credit decays with the collection and delivery timestamps. Stale
fallback figures cannot earn current capacity credit. The Mac operator's own disk headroom
remains bridge-derived because the VPS cannot directly measure the Mac.

Protected replay evidence, parser evidence, settlement state, financial evidence, and recovery
proof must never lose marks merely because they consume space. Redundant compiled runtimes,
stale staging bodies, duplicate downloadable binaries, and regenerable caches should lose marks
when they exceed the current retention contract.

The score therefore rewards bounded recovery windows and punishes known reclaimable runtime
debt.

A staging pathname alone is not debt. A Wolo recovery stage that is exactly referenced by a
current VERIFIED Recovery OS receipt is protected evidence and is excluded from scratch/staging
debt. Unreferenced recovery stages and generic release scratch remain visible and lose marks.
Watcher release staging is a separate authority domain: raw directory presence is excluded from
generic staging debt because `aoe2war watcher-staging` must first prove whether the bytes are
reclaimable exact duplicates or protected unique evidence. General Inspections never converts
Watcher directory age or entry count into deletion authority.

Host patch scoring follows the same authority boundary: actionable upgrades reduce the score;
Ubuntu-phased deferrals remain visible but do not. General Inspections must consume Host OS
classification rather than reinterpreting the raw package count.

## Mac evidence boundary

Production cannot directly inspect the operator Mac. Current Mac headroom and workspace hygiene
therefore arrive through the sanitized Kingdom Intelligence bridge and inherit the bridge
capture timestamp. Preserved dirty or unmerged non-agent worktrees remain visible, but they do
not reduce the hygiene score when Workspace OS classifies them for review and reports zero
cleanup candidates plus zero canonical drift. Actionable cleanup debt and canonical drift are
the scoring authority; preserved unique work is evidence, not garbage.

The tracked baseline file remains only as a local-development fallback. It must not claim a
clean canonical workspace when Workspace OS reports cleanup candidates or canonical drift.

This evidence is intentionally weaker than live VPS filesystem evidence: if the operator bridge
ages out, its contribution decays instead of silently assuming the Mac remains healthy forever.
A live Operator Bridge PID or heartbeat does not renew this evidence by itself. After Finish,
Kingdom Intelligence must publish a new bounded snapshot once the Finish lock clears; if that
publication fails, General Inspections remains conservatively degraded and the bridge must expose
and retry the publication failure rather than masking it as healthy liveness.

## Fail-closed rules

- Missing evidence means missing credit.
- Stale evidence loses credit.
- A category whose weights do not total 100 is invalid.
- User-controlled paths are forbidden.
- General Inspections is read-only.
- Wolo, databases, settlement, and protected evidence are never mutated by inspection.
- A display score never overrides the underlying Doctor, release, Speed OS, Storage OS, or
  recovery receipt.

## October 18, 2026 — Kingdom Index certification and special-gate policy

The public `/kingdom-index` uses one common, 100-point **engineering quality
rubric**: correctness 30, functionality 25, performance 20, maintainability
15, tests 10. Each dimension contains four distinct criteria. The specialized
evidence profiles in `config/kingdom-index-assurance-profiles.json` add
mandatory **proof obligations**, not extra score points. All 68 registered
public routes now have an explicit profile assignment, even where the profile
is the general one. An unassigned future route emits an unverified
`missing-assurance-profile` gate; it is not assumed safe.

### Status and independent attestation

A dated `source-review` or `agent` inspection is not a certified 100.
Furthermore, an operator-authored observation saying `kind:"certified"`,
even with a matching source hash and GitHub links, is **not itself proof**
that the 20 criteria, relevant specialty gates, independent data/financial
truth, real-browser behavior, and production performance were certified.

The server now treats every such *unverified certification claim* as
`provisional` after checking source and staleness, and labels it explicitly
`CERTIFICATION CLAIM UNVERIFIED`. No certificate counts as current without
a future independent, authenticated receipt verifier; no arbitrary JSON
field or GitHub URL makes that verifier's decision. Source drift and stale
timestamps take precedence over provisional labeling.

The historical HD Leaderboard 64/100 source review remains unchanged. Source
dependency snapshots from `scripts/kingdom_index_dependency_evidence.py`
are working-tree lexical observations only, not complete Next.js bundle or
deployed-source identity certification.

### Route-by-route campaign protocol

1. Confirm the exact deployed Git source, route source closure, imported
   APIs/shared modules, and freshness. Preserve unresolved dependencies.
2. Establish page-specific authority: Steam ratings and ties for rankings;
   holds, refunds, payout and GET side effects for finance; chain-of-truth
   for replays; challenge/holder authority for titles; signed release
   provenance for AoE2WAR OS.
3. Collect independent browser/mobile/accessibility/load and database
   observations with timestamps, source and reproducible test conditions.
4. Score each of the 20 **weighted criteria** from actual inspectable
   evidence. A specialty gate marked unverified or failed prevents 100,
   regardless of the arithmetic. An unknown criterion earns no points.
5. Record PR/commit/test artifacts, source drift, operational limitations
   and the next highest-value defect. Refactor only behind parity tests;
   preserve published visuals unless intentionally commissioning redesign.
6. Stop at objective diminishing returns, not when an LLM thinks a number
   looks good. A 100/100 rating must be independently reproducible.

The application read model remains observational and read-only; financial
operations, Wolo signing, payouts and settlement releases require their
separate protected authorities.
