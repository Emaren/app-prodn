---
id: "aoe2war.app-prodn.storage-os"
title: "AoE2WAR Storage OS"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2war","wolochain","vpssentry"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "storage-operating-contract"
reviewed_at: "2026-09-19"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Storage OS

## Purpose

Storage OS keeps the AoE2WAR production estate inexpensive, recoverable, bounded,
and observable without turning deployment into a long-running storage-maintenance job.

Primary operator surface:

```bash
aoe2war storage status
aoe2war storage estate --measure
aoe2war storage local-maintain
aoe2war storage local-maintain --apply
aoe2war storage plan
aoe2war storage maintain
aoe2war storage maintain --apply
aoe2war storage campaign start --max-generations 25
aoe2war storage campaign status
aoe2war storage campaign pause
aoe2war storage campaign resume
aoe2war storage verify
```

The older `aoe2war storage-retention` command remains a separate cache-only
primitive and never deletes durable rollback generations.

## Storage classes

- **Live:** current runtime, databases, settlement state, parser state.
- **Hot recovery:** newest two canonical durable activation rollbacks stay expanded.
  The next archive candidate is the third-newest expanded generation: the
  generation that has just fallen out of the hot recovery window.
- **Warm/cold recovery:** older canonical generations may become verified `.tar.zst`
  archives with exact manifests and immutable receipts.
- **Legacy/unknown:** never changed automatically.
- **Regenerable:** separate bounded cache/staging retention lanes.

## Whole-estate census and local reclaim

`aoe2war storage estate` is the fast cross-plane storage census. It reports the
operator Mac filesystem, VPS root filesystem, mounted production volume, fast
rollback count, expanded rollback debt, and cold archive count in one command.
Pass `--measure` when exact local cache allocation is worth the extra filesystem
walk. The estate census also measures generated context-camera retention debt:
more than one ZIP or TGZ per series is surfaced as structural debt, and the
canonical audit raises a P1 when a core TGZ series is over-retained.

Ordinary `aoe2war finish` remains the normal closure path and allows the context
retention policy to collapse each generated series to its newest camera.
`--preserve-context-history` is an exceptional forensic switch: it deliberately
suspends that pruning and should not be carried into routine Finish runs.

`aoe2war storage local-maintain` is deliberately narrower than a generic disk
cleaner. Preview mode measures exactly four allowlisted regenerable Mac caches:
Yarn, Go build cache, pnpm cache, and CoreSimulator cache. `--apply` removes only
those paths, refuses symlinks/path escape, remeasures free space, and seals a
local maintenance receipt. Recovery vaults, Codex sessions, CrossOver bottles,
MobileSync backups, project sources, and evidence are observable protected
classes and are never targets of this command.

Capacity health and retention topology are separate facts. A volume below the
capacity threshold may still carry structural rollback debt. The lean-retention
expiry lane remains authoritative for reducing the runtime estate to two hot
expanded rollback generations plus three proven cold checkpoints.

## Capacity policy

| Volume used | State | Policy |
| --- | --- | --- |
| `< 78%` | Healthy | No cold archival due |
| `78–82%` | Watch | Observe growth |
| `82–85%` | Maintenance due | Deliberate archival allowed |
| `85–92%` | Attention | Archival high priority |
| `>= 92%` | Critical | Fail closed on unnecessary growth |


## Maintenance hysteresis

The healthy target and maintenance trigger intentionally form a hysteresis band.

A normal maintenance run does not begin automatically while the volume is in
the `78–82%` WATCH range. Automatic/deliberate maintenance becomes due at
`>=82%`.

Once an `--until-target` batch has already completed at least one verified
archive transaction, it may continue through the WATCH range until the volume
reaches `<78%`. The batch still stops immediately on a failed safety proof,
missing eligible generation, explicit transaction limit, or other fail-closed
condition.

This avoids repeated maintenance churn around the 82% boundary while preserving
the rule that WATCH alone does not initiate archival work.

## One-generation transaction

A single transaction is the maximum mutation unit. It proves certified runtime,
Wolo continuity, canonical target identity, matching activation evidence, creates
and verifies an archive, performs isolated exact round-trip restoration proof,
rechecks the source against races, publishes immutable evidence, replaces only
that proven expanded generation, then re-proves runtime and Wolo continuity.

The activation rollback directory name identifies the activation that created the
rollback. Its embedded `source-sha` identifies the **prior runtime** preserved by
that activation. Those identities are intentionally different truth planes.

## Proven B2B2 pilot

The source-controlled lane is mechanically derived from pilot SHA-256:

`aae6f7f3c367a8a6f59c918b37ba2cafc6897cf25d18e6cc212373ca925420ae`

The pilot archived `activate-20260818T003527Z-1a4e983b86d4`, round-trip verified
it exactly, retained immutable receipts, replaced only the expanded generation,
and kept Wolo advancing without a process restart.


## Adaptive maintenance governor

Cold archival no longer assumes that the safest useful maintenance budget is a
permanent 20% CPU ceiling. Every expensive archival stage is still isolated in
its own transient systemd unit, but the runner now leases currently unused host
headroom when live evidence supports it.

The governor selects one of three profiles before each bounded stage:

- **CONSERVATIVE** preserves the proven 20% CPU / idle-I/O lane.
- **BALANCED** may use up to 50% CPU quota per vCPU, capped at 200%.
- **BURST** may use up to 75% CPU quota per vCPU, capped at 300%.

BALANCED/BURST require stronger free-memory and host-load evidence. During the
stage, Wolo remains the hard authority. A soft Wolo-staleness, no-progress, or
memory-pressure signal immediately revokes the lease and demotes the active
unit to CONSERVATIVE. The existing hard abort conditions remain unchanged.

This is deliberately not "run maintenance at maximum speed." It is
**revocable headroom leasing**: use spare capacity aggressively while proving
the protected workload remains healthy, then surrender that capacity before
the protected workload is endangered.

Rollback compression uses zstd's available worker threads; the systemd CPU
quota remains the aggregate governor. Replacement receipts record total
transaction duration so Storage OS can compare throughput across generations
and future governor revisions.

## Terminal-independent campaign controller

Long archival campaigns no longer need to remain attached to an interactive
terminal. `aoe2war storage campaign start` binds a campaign to one exact
certified app source SHA and BUILD_ID, writes atomic durable local campaign
state, then launches the controller in a detached process group with its output
redirected to a durable campaign log.

The controller still invokes the existing proven **one-generation** archive
worker. It does not weaken or enlarge the transaction mutation unit. After each
successful generation it persists the completed generation, resulting volume
usage, and verified-receipt count before it is allowed to plan the next one.

Campaign lifecycle:

- `start` creates a new source/build-bound campaign and detaches it from the
  operator terminal;
- `status` reports durable progress, current generation, process liveness,
  completion reason, and log path;
- `pause` is cooperative and only takes effect **between generations**; there
  is intentionally no campaign SIGKILL/SIGTERM operator path;
- `resume` restarts a stopped/failed/paused controller only when the canonical
  source and certified build still equal the campaign authorization;
- if source/build authority changes, planning becomes inconsistent, or a
  transaction dies in an ambiguous evidence state, the controller fails closed
  rather than manufacture continuity.

Closing a terminal therefore does not stop an active campaign. A machine reboot
or controller crash may require `resume`; if the previous interruption occurred
inside a one-generation transaction and exact evidence cannot be re-established,
resume remains blocked for explicit census/recovery rather than guessing.

## Lean retention policy — September 13, 2026

Retain two complete immediate rollback generations and three verified compressed
checkpoints: the newest archive in each of the latest two represented ISO weeks,
plus the proven B2B2 pilot `activate-20260818T003527Z-1a4e983b86d4`.
The active production runtime is additional to those recovery points.

Superseded application runtimes are rebuildable from retained Git history.
`aoe2war storage expiry` owns their explicit expiry contract:

- `inventory` is read-only and identifies every keep/expiry decision;
- `prepare <canonical-campaign-directory>` seals a complete JSON deletion ledger,
  hashes expanded content into compressed manifests or reuses an earlier sealed
  content manifest only after the current tree reproduces the exact prior metadata
  identity, verifies cold archives and their original receipts, and proves
  production identity;
- `apply-one <ledger> <sha256> <generation>` expires exactly one approved runtime
  body after rechecking the ledger, content identity, retained checkpoints,
  source/build/services, release/retention/archive locks, and Wolo progression;
- immutable intent and completion receipts supplement all existing evidence;
- archive verification recognizes a valid expiry receipt and still verifies the
  retained original tree manifest;
- legacy metadata, source patches, credentials, databases, replay/parser evidence,
  user media, settlement data, and Wolo state are never generic expiry targets.

Run this explicit, bounded maintenance lane after releases when a generation
falls outside the two-generation window. Each campaign produces its exact ledger
before expiry. Do not retain endless cold application bodies, and do not confuse
an expired compiled runtime with deleted unique project evidence.

### Cross-campaign content-proof reuse

A completed expiry campaign leaves a content-hashed manifest for every expanded
runtime it inspected. Later campaigns may reuse that proof instead of reading the
same unchanged runtime bytes again, but reuse is evidence-driven rather than a
cache shortcut.

The newer campaign first walks the live runtime tree without reading file
contents and computes the same metadata identity used by expiry verification. A
prior manifest is reusable only when its ledger and manifest are direct read-only
files, generation/path/source/build identity agrees, every regular manifest row
contains a SHA-256, every manifest path remains inside the runtime root, the
manifest reconstructs the exact current tree identity, and the tree identity is
unchanged on a second post-copy walk. The reused manifest bytes are copied into
the new campaign and their source ledger/manifest digests are recorded.

Any missing, writable, malformed, drifted, ambiguous, or otherwise unverifiable
prior evidence simply falls back to a fresh full content hash. The ledger records
`content_proof_summary.fresh_hash` and
`content_proof_summary.reused_sealed_manifest` so the optimization remains
observable.

A September 19 inode census across 12 current rollback generations found zero
cross-generation shared inodes. Hash memoization by inode therefore has no
measured value for this estate; sealed-manifest reuse is the durable acceleration
path.

## Deployment boundary

Runtime expiry is serialized with deployment. Complete or stop the current
one-generation transaction before running canonical `aoe2war finish`.


## Live handoff into a newer Storage OS

A Storage OS implementation may be upgraded without abandoning a proven
one-generation campaign. The first-class operator lane is:

```bash
aoe2war storage handoff start [CAMPAIGN]
aoe2war storage handoff status [HANDOFF]
aoe2war storage handoff resume [HANDOFF]
```

The handoff controller is detached from the initiating terminal and persists
every transition atomically. Each transition also seals a create-once, mode-0444,
fsynced JSON receipt whose path and SHA-256 are chained into the mutable handoff
state. If a terminal or process dies after that receipt seals but before the
state file advances, reinvocation reuses the exact receipt rather than inventing
a new proof. Its state machine is:

1. `V1_RUNNING`
2. `V1_FROZEN`
3. `TRANSACTION_SEAM_PROVEN`
4. `SOURCE_READY`
5. `RUNNER_RECONCILED`
6. `V2_CERTIFIED`
7. `V1_RETIRED`
8. `V2_RESUMED`

The canonical seam is the boundary after a one-generation worker has sealed its
replacement receipt and released the release, retention and archive locks, but
before the campaign controller starts another generation. The handoff requests
the existing cooperative campaign pause; it does not SIGSTOP, SIGTERM or SIGKILL
the archive controller. `V1_FROZEN` is accepted only when the campaign itself
reports `PAUSED` with
`OPERATOR_PAUSE_BETWEEN_GENERATIONS`, no current generation timestamps remain,
and the V1 controller PID is dead.

Handoff authorization requires an actual live V1 campaign controller in
`RUNNING` or `RUNNING_TRANSACTION`: its PID must be alive and its process
command must identify the exact `aoe2_storage_campaign.py _run <campaign>`
controller. An already paused, merely created, dead, or PID-reused campaign
cannot manufacture V1 identity; start or resume the ordinary campaign first.

The initial receipt records the V1 campaign source/build, the exact target
`main` source, and the observed V1 PID/PPID/PGID/command plus descendant
identities. The target must be a clean local `main`, equal to `origin/main`,
and descend from the certified V1 source. Target drift after handoff
authorization fails closed.

After the seam is proven, the handoff starts canonical `aoe2war finish` in its
own session and records the Finish PID and log. A lost initiating terminal
therefore does not own either the handoff or Finish lifetime. On reinvocation,
the controller resumes from the last durable state. A target source merely being
live is not sufficient takeover authority: it must also have a handoff-era
fully `CERTIFIED` Finish receipt proving the maintenance-runner reconciliation
phase. If activation succeeded but a later Finish closure check failed, the
handoff reruns canonical Finish to complete that closure rather than accepting
the partial receipt or deadlocking. Canonical Finish remains the only deployment
path.

Finish owns maintenance-runner reconciliation, release serialization,
certification, final Estate/Doctor proof and protected Wolo continuity. A
successful handoff does not invent a second deployment authority. Only after the
exact target source is the active certified runtime may the state advance through
`RUNNER_RECONCILED` and `V2_CERTIFIED`.

Before V1 retirement, every PID recorded in the original V1 process-family
snapshot must be dead. The paused campaign can then adopt the exact new certified
source SHA and BUILD_ID through a dedicated handoff rebind receipt in its own
state. Rebinding is allowed only from a proven `PAUSED` transaction seam and
only when the requested V2 source/build equals current certified production.
The existing campaign `resume` path then launches the backlog under V2 and the
handoff seals `V2_RESUMED`.

This creates the controlled "mid-air refuel" contract: finish the current exact
transaction, freeze the old controller from replanning, certify the new control
plane, retire the recorded V1 process family, then resume the same storage
backlog under the new governor. No partially verified generation is discarded,
reinterpreted, or replayed by guesswork.

If a handoff is incomplete, Kingdom Intelligence ranks the exact
`aoe2war storage handoff resume <id>` action ahead of generic Finish/storage
advice. A handoff or campaign stopped inside an ambiguous one-generation
transaction remains fail-closed until the exact transaction evidence is
reconciled.


## Deployment boundary

Cold archival is deliberately outside the latency-critical `aoe2war finish`
path. Finish may inspect storage health; multi-minute historical compression is
maintenance, not deployment.


## Privilege and serialization boundary

Read-only Storage OS inspection uses the normal `tony@hel1` authority.

Mutating cold archival uses the explicit `root@hel1` maintenance authority
because archive files, verification trees, archive receipts, and archive locks
are root-owned evidence surfaces. Those surfaces must not be made world-writable
to avoid a privilege boundary.

A cold-archive transaction acquires locks in this order:

1. canonical `release.lock`;
2. `storage-retention.lock`;
3. `rollback-archive.lock`.

All acquisitions are non-blocking and fail closed. The canonical release lock is
opened without truncating holder metadata before the flock succeeds.

This prevents deployment, rollback/release maintenance, cache retention, and cold
archival from intentionally mutating the recovery estate concurrently.

## September 19 housekeeping doctrine

The live estate is now explicitly split between proof that must survive and runtime weight
that only accelerates recovery.

The preferred lean policy is:

- keep the active production runtime;
- keep exactly two complete immediate rollback generations;
- keep exactly three verified compressed cold checkpoints under the current checkpoint policy;
- keep immutable activation, archive, expiry, and deployment receipts;
- keep protected replay, parser, user-media, database-recovery, settlement, Wolo, financial,
  and security evidence;
- retire superseded compiled runtime bodies once the ledger proves that Git and release
  evidence are sufficient to reproduce them;
- keep Watcher distribution bytes to the current release plus one previous release when
  compatibility requires it, while retaining small release manifests and checksums;
- treat build caches, package-manager caches, scratch builds, and abandoned staging bodies as
  regenerable unless a separate contract explicitly promotes them to evidence.

A local source checkout must not become a second historical binary warehouse. The operator Mac
may point its ignored public downloads path at the canonical Watcher distribution directory
instead of duplicating every installer generation.

Root and mounted-volume capacity are different control surfaces. Root should hold the live
runtime and bounded fast recovery only. Durable receipts and protected evidence belong on the
mounted volume. Moving bytes from root to the mounted volume is useful only when those bytes
still deserve retention; moving junk does not make junk authoritative.

General Inspections consumes this policy as observable maintenance debt. A proven reclaimable
runtime body may reduce the Organization & Storage score until expiry completes, while protected
evidence is not penalized merely for existing.

## Safety invariants

- Wolo mutation forbidden.
- Database mutation forbidden.
- Legacy metadata and unique source/data mutation forbidden; generated runtime bodies require their own exact reviewed ledger.
- Newest-two rollback mutation forbidden.
- One archive transaction = one generation.
- Missing/inconsistent evidence fails closed.
- Deploy receipts remain protected evidence.
\n
