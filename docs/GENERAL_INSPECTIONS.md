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

## October 26, 2026 — Agent watchposts honor evidence freshness

`/api/kingdom-agents` and the shared AoE2WAR OS roster now project the same
`buildWhyNotGreenReport` contract as the existing diagnostic API, evaluated
after source I/O using the read clock. Previously, the roster could label a
full-credit check `healthy` even when the report classified its original
observation as STALE or UNKNOWN. An observed failing cohort could likewise
remain healthy behind a contradictory full score.

Inspection watchposts expose additive `evidenceStatus` and `evidenceReason`
fields. STALE/UNKNOWN observations become `unknown`; observed FAIL becomes
`blocked`; PASS continues through the existing score/state policy. An invalid
or source-unbound snapshot cannot produce healthy watchposts. The signal
retains the original points or cohort counts, and the original observation
time is never renewed. Published scores, category weights, collection count,
source channels and producer-authentication limitations remain unchanged.
These are public evidence projections, not independently authenticated
producer receipts, host certification or financial release permission.

PR #884's nine changed paths were already byte-identical in certified main
`6d2a78224e5a5c647345d6b5ffc91bf94dc84b59`; no source port was required.
Its historical failed control-plane job (run `40222167120`, job
`121256197398`) rejected a stale DocsV2 implementation baseline. Main's
subsequent documentation seal resolved that source-publication defect;
it did not certify current host health.

Regression coverage in `kingdom-agent-policy.test.mts` exercises real roster
projection for expired snapshot and check clocks, missing/future timestamps,
failing cohorts, missing source binding and corrupt weights/scores. The
shared-source contract ensures one collector read is still reused.

## October 25, 2026 — Round Five release-health gate and producer lineage

**Only a dated operational measurement can change Doctor/GI.** Owner evidence
remains Doctor 59/100 UNSAFE (2 P0 / 4 P1), General Inspections 69/100.
The Round Five source work neither changes a score nor runs a collector.

**Source-side correction:** all 66 check rows now include
`expectedProducerChannel` — a deterministic route *hint* for such
producers as SpeedOS cold-browser/edge, Central DocsV2, certified release
gate, bounded OS statfs, original Storage OS expiry ledger, Operator Bridge,
Wolo listener observations and replay closure. `originalProducer`,
`originalProducerReceiptId` and `originalProducerReceiptDigest`
remain **null** because the current sanitized snapshot contains no signed
per-check originals; `producerAuthority:
UNVERIFIED_FROM_PUBLISHED_SNAPSHOT` means no delivery or certification
has been established. Missing/unrecognized check IDs are
`unattributed`, never silently mapped to a trusted producer. The two
root-capacity *Security* and *Organization* origin paths now record actual
bounded statfs capture time; bridge fallback keeps its original observation
time. No additional directory traversal, host probe or polling was added.

### Website-only release health versus separately held finance

| Area | Current dated source/witness | Website-only release decision | Financial/mainnet decision |
| --- | --- | --- | --- |
| DocsV2 `docs-check` and `strict-build` **P0** | Central 8 overdue active docs; exact-head DocsV2 gate FAIL | **Blocking governed source acceptance** until substantive source review, lineage reconciliation and independent strict CI PASS | Passing docs never authorizes funded Wolo |
| `central-source-snapshot-stale` and `central-federation-drift` **P1** | Central snapshot/history not yet reconciled with accepted release source | **Blocking a clean release source certificate** until Central signs exact accepted source/doc IDs; do not rewrite historical SHA pins | Financial source lineage/custody must independently qualify |
| `archive-stale` **P1** | Context camera older than latest source; no subsequent verified fresh archive | **Estate P1 blocks final Finish audit** even though storage recovery and archive generation are owned outside the web release | Does not establish chain insolvency |
| `vps-source-drift` **P1** | WoloChain VPS checkout differs from registered baseline | **Estate P1 blocks final Finish audit**; site-only release requires actual Wolo source ancestry reconciliation while funding remains a separately held authorization | **Financial activation HELD** until actual implementation and custody lineage independently verified |
| Evidence volume 92%, ~26 GiB free | Owner `df`, protected archive filesystem, not an inventory of expendable bytes | **Doctor BLOCKER at the observed 92% capacity**; release preflight accepts only a narrowly proven, governed retention recovery or actual independently verified capacity repair. No blind cleanup | Preserve financial journals, unique evidence and recovery copies |
| VPS Sentry namespace + notification delivery | Sentry #4 observed `226/NAMESPACE`, failing mail, invalid webhook/backoff | **Monitoring reliability deficit**; require actual successful alert delivery and post-repair failure-free host receipts before declaring OS GREEN | No restart of consensus, signer or settlement |
| VPS Sentry Wolo status | #5 legacy 26657/1317 monitor disagrees with separate wolo-1 RPC 27657/REST 1318 witness | **Do not falsely mark production consensus down** from legacy monitoring | Actual RPC identity/liveness alone is not verified custody or settlement |

**Verified current Finish gate, not merely a recommendation:** The
canonical `scripts/aoe2_finish.py` at main inspects Doctor **BLOCKER**
findings in dry-run and preflight, allowing only narrowly authorized
provenance or policy-controlled protected capacity remedies
(lines ~4266–4318, 4689–4726). Its final independent
`./bin/aoe2war audit --json` **fails when either P0 or P1 is nonzero**
(lines ~4963–4984), and its final Doctor blocks on every remaining
`BLOCKER` (lines ~4988–5005). Consequently **all six currently observed
Estate findings prevent normal Finish certification** until actually
repaired or an explicitly approved, source-reviewable controller policy
changes. A site's funding boundary does **not** exempt `vps-source-drift`
from the final source/estate gate. The observed 92% evidence volume
breaches the Doctor critical threshold; a hypothetical automatic retention
forecast is not authorization to clean storage and cannot be assumed.
Warnings alone do not necessarily trigger that final hard stop, but they
still prevent declaring a 100/HEALTHY Doctor. This gate interpretation is
a source reading of the present controller; it is not proof of the
controller's actual deployment or an authorization to run Finish.

**Release control separation:** The current source can pass TypeScript/Node/
PostgreSQL/Next while DocsV2 remains blocked. Even after DocsV2 passes,
a production release requires the actual original controller workflow,
a signed owner/witness, the accepted source SHA versus emitted BUILD_ID,
unchanged source/secret controls and real host/rollback/pre-post-check
evidence. Those conditions are not satisfied by a GitHub-only draft.
Never treat an internally reported `CERTIFIED` label as independent
production authority. Website-only release admission does not authorize
funded settlement, balance writes, signing or treasury operations.

### Bounded owner-only reinspection and immutable evidence plan

1. Central DocsV2 single writer substantively reviews all eight #30 items,
   keeps per-item reviewer+source history, corrects actual discrepancies,
   intentionally reseals the accepted combined tree and proves strict checks.
2. Wolo owner reconciles the exact VPS checkout ancestry and certified baseline
   (without touching the live chain); context owner captures and hashes a
   source-complete new durable archive, retaining the previous generation.
3. Storage owner reads only the already-indexed recovery/expiry records and
   small `statfs` counters, verifying two protected hot and three cold
   checkpoints. No broad Mac `du`, unbounded SSH hash walk, `--apply`
   or deletion. If reclaim isn't provably safe, review volume expansion.
4. VPS Sentry owner separately fixes namespace-instance lifecycle, verifies a
   real end-to-end delivery receipt with independent sink acceptance,
   and updates the mainnet monitoring registry to actual `wolo-1`
   identity/authorized ports; no service restart in this branch.
5. After legitimate owner-approved deployment, an operator (not a public GET)
   runs the **original** `aoe2war doctor --json` and inspect producer
   in a bounded maintenance window. Preserve command version, exact SHA,
   actual BUILD_ID, `observedAt`, monotonic collection sequence,
   immutable native receipt digest, original P0/P1 codes, and source-vs-host
   capture clock. The existing bridge consumes only permitted published
   receipts; API requests never run Doctor or mutate infrastructure.
6. Confirm *each* canonical check's original source, producer age, TTL,
   receipt acceptance, failure owner and actual measured weight. Only a fresh
   66/66 PASS evidence census **and** Doctor's own independently sourced
   100/HEALTHY proof permits claiming green. Reducing the score by rejecting
   stale evidence is correct until actual repair.

**Governance:** This is an acceptance plan, not proof that an automatic
scheduler, systemd repair, archive, new Wolo receipt or release has occurred.
See [central #773](https://github.com/Emaren/app-prodn/issues/773),
[DocsV2 #30](https://github.com/Emaren/AoE2WAR-docs/issues/30),
[VPS Sentry #4](https://github.com/Emaren/vps-sentry/issues/4)
and [#5](https://github.com/Emaren/vps-sentry/issues/5).

## October 25, 2026 — Round Four replay-safe 66-check report

The read-only `GET /api/general-inspections?report=why-not-green`
still performs exactly **one** existing collector read. It now passes the
**request-time clock** into the existing projection rather than deriving
all freshness from an embedded `snapshot.generatedAt` alone.
A previously legitimate 100/100 JSON snapshot replayed after six hours is
**STALE**, not newly valid proof; a more-than-five-minute future-dated
snapshot is **UNKNOWN**. The published historical category scores and
original source/BUILD_ID claims are preserved, not recomputed or renewed.

Each of the 66 `evidenceChecks` rows now labels the **claimed** source
SHA/build version and explicitly reports
`originalProducerReceiptId: null` and
`originalProducerReceiptDigest: null` because the current sanitized
`InspectionCheck` contract lacks independent per-check receipt identifiers.
They **must not** be substituted by a stable `checkKey`, timestamp,
browser URL or hash of reserialized report content. Native producer receipts
remain the owner-owned requirement for promotion to independently verified
PASS. Derived `evaluatedAt`, `snapshotAgeHours`,
`snapshotEvidenceStatus` and per-check `evidenceStatus` are diagnosis
fields only. Request-clock sampling is bounded, read-only and does not
scan directories, run Doctor, or schedule any background task.

**Post-merge authority gate:** The Operator Bridge owner must attach,
for each original check receipt, a content-addressed producer receipt ID,
original observation time, release SHA, actual BUILD_ID, environment/host,
receipt-type, explicit finding codes, validated TTL and independent
source identity. A hash of an unauthenticated bridge self-report cannot
certify a release. Actual reinspection of host security/chain state needs
a separate owner-approved safe collection path; no public API may start
processes. Documentation P0/P1 closure still depends on the governed
Central DocsV2 single writer, fresh context camera, and WoloChain ancestry;
none can be closed from this projection.

**Bounded capacity evidence:** Existing `statfs` reads are individually
timestamped from the real host observation time; older bridge-backed
fallback capacity carries the original bridge `generated_at` rather than
being silently rebranded as a new local sample. Both have a six-hour
reporting TTL, while a true filesystem read uses no recursive storage walk.
A timestamp-less or expired capacity check is UNKNOWN/STALE; a *fresh
local measured* threshold deficit is FAIL. A partially credited aging
bridge fallback is UNKNOWN, **not** proof of a new capacity incident.
Immutable certification proofs also need an original observation timestamp
even though their certification validity does not automatically expire.

**Explicit limitations:** 66 rows identify 66 scoring contracts, **not**
66 new original physical measurements. A full scored row may still carry
UNKNOWN/STALE, requiring owner acceptance of new source-bound evidence.
Source-only CI does not prove production host repair. Protected evidence
volume was owner measured at 92% capacity; avoid heavy Mac inventory
scripts and all unapproved cleanup. VPS Sentry
[`#4`](https://github.com/Emaren/vps-sentry/issues/4) and
[`#5`](https://github.com/Emaren/vps-sentry/issues/5)
own namespace/delivery and historical RPC-monitor reconciliation; live
`wolo-1` uses RPC `27657`, REST `1318`, not retired `26657/1317`.
WheatAndStone auto-renewal intentionally remains shelved.


## October 25, 2026 — Renaissance Round Three: explicit source-versus-operation closure

**Disposition: HOLD.** Latest independently supplied owner read-only Doctor at
`2026-10-25T14:18:42.058942Z` was **59/100 UNSAFE** with Estate **P0=2,
P1=4**; observed General Inspections was **69/100**, not remeasured after
the source-only draft. The reported category scores are dated, not certified
post-repair grades. CERTIFIED production source
`6be434c00469afa4acb0623715c3bcf724f927f4` and BUILD_ID
`xqX6Oi-zV5gSKH1kIC4zC` matched in that owner receipt. None of the
following pending repairs allows reusing this October 25 receipt as fresh.

### Estate Doctor's six exact audit producers and resolution dependencies

| Severity, original `area/key` | Observed root/provenance | Source-side remedy / external proof required |
| --- | --- | --- |
| P0 `Documentation/docs-check` | Central strict check returned rc=2 on expired Developer guide and historical central Rivalries metadata; not evidence of a missing entire corpus | Central docs owner performs substantive review, reconciles canonical metadata and reruns `docs-check` on exact accepted source |
| P0 `Documentation/strict-build` | Strict build blocked by same docs-generating error, rc=2 | Requires docs-check and its own successful strict build; never waive the build gate |
| P1 `Documentation/central-source-snapshot-stale` | Central app snapshot `ad781a02aa5ffa6fd0053b817fcccf6ee0429f51` differs from actual production `6be434c00469afa4acb0623715c3bcf724f927f4` | Central verifies active vs source lineage and reviews/updates snapshot; preserve prior commit as historical |
| P1 `Documentation/central-federation-drift` | Central `audit-taxonomy` rc=2 at same expired review blockers | Source/doc registry steward fixes real federation and reruns taxonomy audit; not equivalent to changed hash = healthy |
| P1 `Context Durability/archive-stale` | AoE2HDBets 2026-10-23T20:03:51Z archive predates 2026-10-25T00:50:51Z latest source | VPSSentry context owner produces, hashes and verifies a newer source-complete camera without deleting the prior one |
| P1 `WoloChain/vps-source-drift` | VPS checkout `78c25985420ee41a6678c42fab8ea8d6c3b1b519` vs registered implementation baseline `4ce11c4965da64e3d4dee6a8681b6198e1aba1eb` | WoloChain owner reviews actual code ancestry/dirty state and production contract, then governs any baseline adjustment; does **not** imply failed RPC |

**Documentation details:** The original error cites
`AoE2WAR-docs/docs/start-here/developer.md` (reviewed 2026-07-26)
and `app-prodn/docs/RIVALRIES_AND_WAR_VAULT.md`. App-prodn **source AND
local document registry** already recorded Rivalries `reviewed_at:
2026-10-25`; **central taxonomy** still held `2026-07-26`. Do not
blindly change app review timestamps. Eight central Oct 24 review deadlines,
three central-to-app hash disagreements, and the central implementation
baseline are separate review/federation work. All five original individual
source-doc checker commands passed; central generation/strict checks failed.
The source-only PR's strict DocsV2 baseline gate remains owned by Central's
**single writer**; Tab C must not edit shared `docs/document-registry.json`,
`scripts/aoe2_doctor.py`, or `scripts/aoe2_audit.py`.

### Original Doctor 13 independent deduction points (not hidden by Estate totals)

| Exact Doctor finding | Points | Owner-proven action and gate |
| --- | ---: | --- |
| `Disaster Recovery/volume-capacity-critical` | 8 | Mounted evidence volume 296G / 258G used / 26G available, 92% full (inode use 17%); Storage OS read-only retention/protected restore/cold-checkpoint census, independently authorize any verified transaction; use expansion if safe retention cannot free sufficient bytes |
| `Host/failed-units` | 2 | Failed `certbot.service` (historical WheatAndStone-only NXDOMAIN, domain intentionally abandoned) and `vps-sentry-unit-event@started__ssh.service.service` (226/NAMESPACE); verify newly clean active Certbot cycle and VPS Sentry operator-event delivery, not reset-failed cosmetics |
| `Toolchain/next-contract` | 1 | Installed Next 15.5.28 vs operations contract 15.5.27; toolchain owner decides/validates supported version and exact-source tests, updates contract only with reviewed evidence |
| `Architecture/semantic-map-runtime-stale` — `SYSTEM_MAP.md` | 1 | VPSSentry map owner reviews and source-certifies runtime seal including active release identity; preserve dated historical seals |
| `Architecture/semantic-map-runtime-stale` — `SERVER_STORAGE_MAP.md` | 1 | Same independent source-certified map refresh for storage map |

**No user action needed for WheatAndStone:** Its specific Certbot renewal config was
successfully **parked** by the operator under
`/etc/letsencrypt/renewal-shelved/wheatandstone.ca.conf`; do not restore
unowned DNS or remove other certificate renewals. Locally served
`aoe2war.com` TLS was valid through 2026-12-19, but public-edge status
and next Certbot success are independent tests. VPS Sentry issue
`Emaren/vps-sentry#4` owns upstream event namespace/delivery repair:
`vps-sentry.service` captured events but the email path failed without
`/etc/postfix/main.cf`, and webhook reported invalid/backoff. A successful
collector or publisher is **not** proof of alert delivery. Current deployed
template already matches source `RuntimeDirectory=vps-sentry` and
`ReadWritePaths=/var/lib/vps-sentry`; 226/NAMESPACE occurred during
concurrent SSH stop/start event instances. Lifecycle race remains unproven.

### Seven-category repair and evidence queue (66 canonical check contracts)

The **dated** 69/100 snapshot implies 214 missing *category* points across
seven categories (not 214 independently confirmed current failures). Each
check's **PASS/FAIL/STALE/UNKNOWN** requires its original receipt from the
current running build. The published category total cannot identify which
checks were awarded points. Never allocate missing points to a check by guess.

| Dated category | Missing of 100 | Canonical check IDs / source-bound next evidence |
| --- | ---: | --- |
| Speed 63 | 37 | `lcp50`, `lcp95`, `ready50`, `ready95`, `ttfb95`, `static-edge`, `dynamic-edge`, `featured-edge`, `stable-lcp`, `speed-fresh`: new exact-release browser/edge cohorts, bounded sampling, native capture times |
| Documentation 35 | 65 | `doctor-docs`, `docs-control`, `taxonomy`, `strict-doc-build`, `audit-taxonomy`, `source-docs`, `system-map`, `storage-map`, `central-doc-repo`, `docs-fresh`: independent docs review and Central accepted metadata/federation receipts |
| Organization 76 | 24 | `root-free`, `volume-used`, `mac-free`, `hot-rollbacks`, `cold-checkpoints`, `expiry-debt`, `watcher-downloads`, `staging`, `worktrees`, `caches`: current statfs and **read-only** Storage OS inventories, no unapproved deletion |
| Test & Build 100 | 0 | `node-tests`, `python-tests`, `typescript`, `eslint`, `docs-gate`, `secret-scan`, `dependency`, `prisma`, `production-build`: preserve historical certified source/build scope, report aged gate `STALE` for current-readiness purposes rather than rescoring history |
| Release 64 | 36 | `certified`, `doctor`, `estate-findings`, `build-parity`, `service`, `source-parity`, `receipt`, `finish`: observed build identity, certified history plus new read-only Doctor; do not run Finish/host release on GET |
| Security 75 | 25 | `vpssentry`, `failed-units`, `updates`, `reboot`, `maintenance`, `secrets`, `recovery`, `root-resilience`, `security-fresh`: event-hook/notification roundtrip, patch evidence and actual recovery proof |
| Data/Wolo/Replay 73 | 27 | `wolo-8092`, `wolo-8093`, `wolo-estate`, `parser-estate`, `recovery-data`, `watcher-release`, `db-mutation`, `wolo-mutation`, `data-fresh`, `evidence`: port 27657 chain `wolo-1` RPC independently observed alive/not-catching-up at block 2,634,595, but neither 8092/8093 listener nor RPC health proves custody/finality/financial solvency |

### Sustainable evidence policy (source implemented vs owner-owned activation)

This draft adds **additive** machine-readable `evidenceChecks` to existing
`GET /api/general-inspections?report=why-not-green`. Each row exposes
`checkKey=category/checkId` (a *check contract*, **not** a fabricated original
receipt ID), raw capture time, original TTL, derived `nextDueAt`, current
`evidenceStatus` **PASS, FAIL, STALE or UNKNOWN**, earned points,
repair classification and detail. The legacy `gaps[].status`
`pass/fail/unknown` field remains backward compatible. A full-weight
check with a current, mathematically valid but failing sample ratio is
reported **FAIL** without altering its awarded weight, and expired original
evidence is **STALE** even when historical credit was 100. Invalid ratios,
absent times and missing original producer receipt IDs remain UNKNOWN.

**No independent reinspection scheduler is activated by this read-only source
change.** Existing production Operator Bridge/Storage OS owners must schedule
and certify bounded collection before the earliest `nextDueAt`, with a
**6-hour-or-faster** window for rapidly changing release/security/Wolo
receipts and original 72/168-hour producer TTLs for documentation and
browser cohorts. A schedule alone is not a completed measurement; each run
must append immutable, content-hashed original producer evidence with
captured-at, received-at, exact source SHA, BUILD_ID, host identity,
producer name, check ID, result and next deadline, then prove that the
*deployed* reader consumes it. Never use a transport receive time as a
new observation or a signed self-attestation as independent release truth.
No competing Doctor, hidden background task, finance authority or host write
may be added to the public report.

**Finite operating queue:** (1) Central source-review/taxonomy fixes and
DocsV2 single-writer accepted baseline; (2) Wolo ancestry and VPSSentry
context camera; (3) protected volume-retention plan and capacity remedy;
(4) VPS Sentry issue #4 namespace + notification delivery;
(5) toolchain/map and other real Doctor warnings; (6) current source/build
browser/edge/replay/host intake; (7) exact-head source CI and *separate*
operator production verification; (8) same 66 checks independently prove
full points and `evidenceStatus=PASS`, and Doctor independently proves
100/HEALTHY without blockers or warnings. As of this draft, steps 1–8
are **not complete**; overall 100 is not claimed.


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

### Exact source-registry triage observed on October 25

Read-only comparison: `Emaren/AoE2WAR-docs main` taxonomy blob
`26e18f739e7585b41de0d260e914c9cc62b35b77` (225 entries);
`Emaren/app-prodn main` source registry blob
`f7c1af190ad1ae77e311189fee4a005e0afa5be5` (96 entries).
These are GitHub **source registry** observations, not a contemporaneous VPS
Doctor receipt. `reviewed_at + review_interval_days` with the governance SLO
(date due still valid; overdue starting next day) identifies **eight central
active entries overdue after 2026-10-24**:

| Exact doc ID | Repository | Source path |
| --- | --- | --- |
| `aoe2war.arch.truth-planes` | AoE2WAR-docs | `docs/architecture/truth-planes.md` |
| `aoe2war.gov.documentation-lifecycle` | AoE2WAR-docs | `docs/governance/documentation-lifecycle.md` |
| `aoe2war.gov.metadata-contract` | AoE2WAR-docs | `docs/governance/metadata-contract.md` |
| `aoe2war.gov.review-slos` | AoE2WAR-docs | `docs/governance/review-slos.md` |
| `aoe2war.home` | AoE2WAR-docs | `docs/index.md` |
| `aoe2war.start.ai-agent` | AoE2WAR-docs | `docs/start-here/ai-agent.md` |
| `aoe2war.start.developer` | AoE2WAR-docs | `docs/start-here/developer.md` |
| `aoe2war.app-prodn.docs-rivalries-and-war-vault` | app-prodn | `docs/RIVALRIES_AND_WAR_VAULT.md` |

The **app-prodn source registry itself** has zero overdue active positive-
interval entries. Treat `review_interval_days=0` historical, generated and
superseded records as intentionally outside normal review expiry, not sixteen
phantom failures.

Three `app-prodn` paths have different source hashes in the central
taxonomy versus the current local registry: `docs/DOCUMENTATION_CONTROL_PLANE.md`,
`docs/RIVALRIES_AND_WAR_VAULT.md`, and `docs/PAGE_CHANGE_NOTICES.md`.
That is **federated reference drift to investigate**, not automatic proof of
corruption: central may be pinned to an intentionally older reviewed source.
DocsV2 owner must review the changed content and policy, then produce a
source-pinned, approved registry synchronization and strict-check receipt.
No automatic source registry write is made by Tab C.

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



### October 25 Round Two — independent fallback, documentation and Doctor closure

Tab C source review found a second stale-credit path in the local Finish
fallback (`lib/generalInspections/serverSnapshot.ts`), not just the preferred
Operator Bridge. Both producers now zero any expired Speed cohort receipt
(24 hours full, zero by 168 hours) or mismatched release/build proof, rather
than aging only the freshness weight while keeping metric points. The local
fallback also gates its documentation checks to the certified Finish source,
build and original Finish observation (full for 12 hours, zero by 72).
The bridge requires a non-fallback original documentation capture plus fresh
collection/delivery clocks and exact active release/build for **all ten** docs
checks. A missing timestamp cannot borrow a new delivery timestamp.

The `why-not-green` report treats gate source/build history as separate from
live performance: a gate may have had a historic Test & Build score of 100 on
its certified release, but an expired 168-hour gate observation is now
`UNKNOWN` for *current* evidence in the diagnostic report, never a silently
current PASS. This is report classification only; the canonical check weights,
required-command policy and scored gate receipts do not change.

The October 25 historical category-level repair ledger is:

| Inspection | Historical / 100 | Missing | Actual read-only closure |
| --- | ---: | ---: | --- |
| Website Speed | 63 | 37 | Exact-source/build browser and edge receipts; audit p50/p95, cohort counts, capture TTL and mutation proof |
| Documentation | 35 | 65 | All ten actual weighted docs check results, central strict gates, five source checkers, taxonomy, maps, repository parity and reviewed document IDs |
| Organization/Storage | 76 | 24 | Root/volume read-only capacity, expiry/rollback protections, staging, download generations, operator worktree receipts |
| Test & Build | 100 | 0 | Preserve certified declared-command gate; report its source/build/time authority separately from current runtime |
| Release/Runtime | 64 | 36 | Runtime active source/build, certified activation, Doctor's exact failures, service and Finish closure |
| Security | 75 | 25 | Current criticals, systemd units, host update/reboot posture, secret scan and recovery class receipts |
| Data/Wolo/Replay | 73 | 27 | Wolo 8092/8093 counts, replay corpus/freshness, browser mutation boundary, recovery and Watcher contract |

**Do not infer check-level earned points or precise Doctor fault IDs from
these seven rounded category scores.** The Doctor publisher keeps its
complete `findings` under `scripts/aoe2_doctor.py` and nested Estate
`info.estate.findings`, but the Council/Brain public health adapter forwards
only `doctor_score`, `doctor_status` and Estate `p0`/`p1` totals.
For P0=2 and P1=4, the Estate aggregation itself deducts 20+8=28 Doctor
points under today's policy. A Doctor 59 means total deduction 41 and thus
**13 additional points deducted by independent Doctor checks**, with exact
keys still UNKNOWN pending the original read-only Doctor receipt. Do not
silently replace that missing evidence with guessed six IDs or treat
a public 59 as evidence of a specific broken Wolo daemon.

The independently owner-observed `wolo-1` mainnet RPC at 127.0.0.1:27657
responded on October 25 (height 2,634,595, catching_up=false); legacy
26657 is intentionally quiet. That fixes the **diagnostic interpretation**,
not the estate P0/P1 list or financial settlement certification. The
operational contract already specifies port 27657.

To reproduce the closure: (1) Central's single DocsV2 owner intentionally
refreshes the shared registry's implementation baseline and this Markdown's
hash on the final source head, then runs the strict checker; (2) exact-head
Node/TypeScript/Next/Python/PostgreSQL/source-census CI must succeed with
no skipped mandatory checks; (3) owner reads `aoe2war doctor --json` and
the no-store General Inspections JSON on the same live certified release,
checking original capture and receipt delivery times; (4) reproduce exact
P0/P1 keys and each 35/100 Documentation weighted deficit from those
observations; (5) only then repair under the correct domain owner, recollect
fresh evidence, and compare deltas. A source-only PR cannot independently
claim that the live reported 69/59 has changed.


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
