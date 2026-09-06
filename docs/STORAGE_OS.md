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
reviewed_at: "2026-08-19"
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
aoe2war storage plan
aoe2war storage maintain
aoe2war storage maintain --apply
aoe2war storage verify
```

The older `aoe2war storage-retention` command remains a separate cache-only
primitive and never deletes durable rollback generations.

## Storage classes

- **Live:** current runtime, databases, settlement state, parser state.
- **Hot recovery:** newest five canonical durable activation rollbacks stay expanded.
  The next archive candidate is the sixth-newest expanded generation: the
  generation that has just fallen out of the hot recovery window.
- **Warm/cold recovery:** older canonical generations may become verified `.tar.zst`
  archives with exact manifests and immutable receipts.
- **Legacy/unknown:** never changed automatically.
- **Regenerable:** separate bounded cache/staging retention lanes.

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

## Storage lifecycle direction

Five expanded activation generations remain the hot rollback window. Keeping
every older generation expanded is not a long-term retention strategy; older
generations belong in exact verified cold form.

The next architectural step after the adaptive governor is to remove backlog
creation itself:

1. create/retain exact generation manifests at release time;
2. when a generation falls out of the newest-five hot window, enqueue one
   asynchronous verified cold-archive transaction rather than waiting for disk
   pressure;
3. preserve milestone releases and unique evidence explicitly;
4. add an encrypted off-host evidence authority plus restore drill before any
   policy is allowed to expire unique local cold archives;
5. evaluate content-addressed/deduplicated generation storage so growth tracks
   changed bytes rather than repeatedly storing identical dependency trees.

Until off-host authority and restore proof exist, unique verified archives are
not automatic deletion candidates.


## Live handoff into a newer Storage OS

A Storage OS implementation may be upgraded without abandoning a proven
one-generation transaction. The canonical seam is the boundary after a worker
has sealed its replacement receipt and released the release, retention and
archive locks, but before the local batch orchestrator starts the next
generation.

Finish now reconciles the installed root-owned maintenance runner at exactly
that serialized boundary. If a worker is still active, the same locks make the
handoff fail closed. Once the seam is free, the new runner is atomically
installed with exact SHA, syntax, owner/mode, durable receipt and Wolo
continuity proof before the normal operational Doctor proceeds.

This permits a controlled "mid-air refuel": finish the current exact
transaction, freeze the old batch from replanning, certify the new control
plane, then resume the remaining storage backlog under the new governor. No
partially verified generation is discarded or reinterpreted.


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

## Safety invariants

- Wolo mutation forbidden.
- Database mutation forbidden.
- Legacy rollback mutation forbidden.
- Newest-five rollback mutation forbidden.
- One archive transaction = one generation.
- Missing/inconsistent evidence fails closed.
- Deploy receipts remain protected evidence.
\n