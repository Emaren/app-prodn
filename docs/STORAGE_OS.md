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