---
id: "aoe2war.app-prodn.docs-release-recovery-os"
title: "AoE2WAR Release Recovery OS"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "release-recovery-contract"
reviewed_at: "2026-08-24"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Release Recovery OS

## Purpose

AoE2WAR Release Recovery OS converts previously understood release failures into
bounded, evidence-backed recovery paths inside the ordinary one-command release
workflow.

The operator contract remains intentionally small:

~~~bash
aoe2war finish
~~~

or, when a commit message is required:

~~~bash
aoe2war finish -m "Ship the finished feature"
~~~

The operator should not need to remember the shell-level recovery procedures
behind known release failures.

The governing rule is:

> Automatically recover only states whose safety can be proved from exact
> source, runtime, receipt, capacity, and protected-service evidence. Unknown or
> ambiguous state remains fail-closed.

Release Recovery OS does not weaken production boundaries. It removes repeated
human diagnosis only for failure classes that have a tested recovery contract.

## Core invariants

1. `aoe2war finish` remains the normal operator entry point.
2. An exact current staged release receives first right of resume.
3. A staged candidate is never discarded merely because newer Git authority
   exists.
4. Superseded-stage retirement requires exact durable provenance.
5. A current-release stage with missing or inconsistent evidence is never
   automatically retired.
6. Root-space recovery uses only explicitly approved reclaim classes.
7. Recovery stops as soon as the configured release floor is restored.
8. Active runtime identity must remain unchanged during pre-release recovery.
9. Protected Wolo listeners `8092` and `8093` must remain exactly one each.
10. Database state is never changed by Release Recovery OS.
11. Rollback material is never reclaimed by Release Recovery OS.
12. Every mutating recovery path leaves durable evidence.
13. The release gate establishes deterministic Prisma generated state before
    TypeScript or Prisma validation.
14. Recovery never substitutes for the canonical release checks that follow it.

## Recovery matrix

| Condition | Automatic action | Required proof | Outcome |
| --- | --- | --- | --- |
| Root meets release floor | None | Filesystem capacity | Continue |
| Root below release floor | Bounded reclaim ladder | Source/build/service/Wolo identity and mounted-volume capacity | Re-prove capacity, continue |
| Approved reclaim exhausted below floor | None beyond approved classes | Recovery receipt + remaining capacity | Stop |
| Exact current staged candidate | Resume exact artifact | Release SHA, BUILD_ID, artifact and receipt bindings | Continue at activation |
| Current staged candidate but exact resume evidence invalid | None | Current-release classification | Stop |
| Exactly one durable receipt proves stage belongs to older release | Retire stale staged trees only | Old SHA, staged BUILD_ID, previous live identity, zero runtime refs, service/Wolo health | Continue ordinary ship |
| Zero/multiple matching durable stage receipts | None | Ambiguous provenance | Stop |
| Live process references staged tree | None | `/proc` reference proof | Stop |
| Prisma Client absent/stale locally | `npx prisma generate` | Committed schema + project Prisma toolchain | Continue validation |
| Unexpected database frontier | None | Protected migration contract | Stop |
| Wolo listener boundary abnormal | None | Listener proof | Stop |

## Bounded root-headroom recovery

The configured release floor remains authoritative. When root capacity is below
that floor, `finish` may enter learned recovery before operational release work
continues.

Recovery consumes the lowest-value approved storage first.

### Tier 1 — regenerable APT material

The lane may remove only regenerable APT metadata/cache material:

- `/var/lib/apt/lists/*`
- top-level `/var/cache/apt/*.bin`
- cached `.deb` files in `/var/cache/apt/archives`

APT cleanup is refused while `apt`, `apt-get`, `dpkg`, or
`unattended-upgrade` is active.

### Tier 2 — bounded system journal

If the floor is still unmet, the journal may be vacuumed to the configured
retention floor.

Current policy:

~~~text
100 MiB
~~~

This is bounded retention, not wholesale log deletion.

### Tier 3 — closed rotated nginx `.log.1`

If more space is still required, only files matching:

~~~text
/var/log/nginx/*.log.1
~~~

may be considered.

For each candidate the controller must:

1. verify the file exists;
2. prove it is not open through process file descriptors;
3. copy it to durable mounted-volume recovery evidence;
4. compute source SHA-256;
5. compute destination SHA-256;
6. require both hashes to match;
7. sync the durable copy;
8. remove only the verified root copy;
9. remeasure capacity.

Selection stops immediately when the configured release floor is met.

Durable evidence lives beneath:

~~~text
/mnt/HC_Volume_105319120/aoe2war/root-headroom-recoveries/
~~~

The receipt records before/after free space and reclaimed amounts attributed to
APT, journal, and nginx recovery.

### Never automatic

Root-headroom recovery does not automatically remove:

- `/tmp` broadly;
- active `.next`;
- active `node_modules`;
- `.next-rollback-*`;
- `.node_modules-rollback-*`;
- PostgreSQL data;
- WoloChain binaries, state, services, or data;
- arbitrary application/runtime data;
- unknown files merely because they are large.

If approved classes cannot restore the release floor, `finish` stops.

## Superseded staged-candidate recovery

A staged runtime is production-adjacent evidence. It is not ordinary disposable
cache.

The controller first attempts the established exact-resume path:

~~~text
current release SHA
        +
live staged BUILD_ID
        +
exact local or durable stage receipt
        ↓
resume exact candidate
~~~

Only when exact current-release resume evidence is unavailable may the system
evaluate superseded-stage retirement.

Automatic retirement requires all of the following:

1. exactly one durable stage receipt matches the live staged BUILD_ID;
2. that receipt names a valid release SHA different from current intended
   authority;
3. the receipt binds expected previous production source;
4. the receipt binds expected active BUILD_ID;
5. the receipt binds the staged BUILD_ID;
6. production source remains clean and exact;
7. the web service remains active;
8. protected Wolo listener counts remain exact;
9. no process has a `cwd`, `root`, executable, or file descriptor referencing
   `.next-release` or `.node_modules-release`.

The system then writes durable retirement evidence and removes only:

~~~text
.next-release
.node_modules-release
~~~

It does not touch:

~~~text
.next
node_modules
.next-rollback-*
.node_modules-rollback-*
database state
Wolo state
~~~

Durable retirement evidence lives beneath:

~~~text
/mnt/HC_Volume_105319120/aoe2war/stale-stage-retirements/
~~~

After retirement the controller re-proves:

- production source;
- active BUILD_ID;
- clean production checkout;
- web-service health;
- internal HTTP health;
- Wolo `8092`;
- Wolo `8093`.

Only then may ordinary current-authority shipping continue.

## Fail-closed staged states

Automatic retirement is forbidden when:

- the candidate belongs to the current intended release;
- current-release evidence is invalid and older provenance cannot be proven;
- zero durable receipts match;
- more than one durable receipt matches;
- durable provenance is malformed;
- staged runtime/dependencies have live process references;
- source, BUILD_ID, service, or Wolo invariants are unsafe.

These states require diagnosis. They are not permission to delete staged
material manually.

## Deterministic Prisma preparation

Release validation may not depend on whether a developer previously happened to
generate Prisma Client in a worktree.

When implementation validation includes lintable code and the repository has a
Prisma schema, the release gate runs:

~~~bash
npx prisma generate
~~~

before:

~~~bash
npx tsc --noEmit
~~~

For database-class releases it also runs before:

~~~bash
npx prisma validate
~~~

Generated state is therefore established from the project schema and project
Prisma toolchain as part of release validation.

This grants no production database mutation authority. `prisma generate` is
local build preparation. Production migration authority remains exclusively in
the protected migration lane.

## Evidence and receipts

Learned recovery extends the existing receipt-first release architecture.

Primary durable locations include:

~~~text
/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/
/mnt/HC_Volume_105319120/aoe2war/rollbacks/
/mnt/HC_Volume_105319120/aoe2war/root-headroom-recoveries/
/mnt/HC_Volume_105319120/aoe2war/stale-stage-retirements/
~~~

Stage, migration, activation, certification, rollback, and recovery evidence
remain separate authorities for their respective phases.

A fresh operator or AI should be able to reconstruct why recovery occurred from
repository and receipt evidence without conversational memory.

## Operator procedure

### Normal case

Build the feature and run:

~~~bash
aoe2war finish
~~~

Do not manually perform a known recovery merely because its condition appears.
Let the release controller classify it.

### If `finish` stops

A fail-closed stop means the controller could not prove that an automatic action
was safe.

Inspect:

~~~bash
aoe2war status
aoe2war releases --limit 5
~~~

Use exact receipts and live source/build/provenance.

Do not respond to uncertain state with blind commands such as:

~~~text
git pull
aoe2war deploy
prisma migrate deploy
systemctl restart ...
rm -rf ...
~~~

A stopped automatic lane is not permission for an untracked mutation.

### If the condition is new

Investigate it once, establish a bounded recovery contract, prove it
adversarially, document it, and only then consider teaching Release OS to handle
that failure class automatically.

The design goal is not “never stop.”

The design goal is:

> Never require repeated human work for a failure class whose safe solution is
> already known and machine-provable.

## Implementation authority

Principal implementation seams:

~~~text
scripts/aoe2_finish.py
  root_release_floor_bytes
  root_below_release_floor
  remote_root_headroom_recovery_script
  recover_root_headroom
  execute_finish

scripts/aoe2_release_auto.py
  resolve_stage_receipt
  remote_superseded_stage_retirement_script
  retire_superseded_stage
  ship_all

scripts/aoe2_release_gate.py
  command_plan

config/aoe2war-operations.json
  finish.auto_root_headroom_recovery
  finish.root_headroom_journal_limit_mib
  capacity.root_free_warn_gib
~~~

Regression protection:

~~~text
tests/test_aoe2_finish.py
tests/test_release_auto.py
tests/test_release_gate.py
~~~

## August 24, 2026 learned-recovery closure

This contract followed a healthy Challenge Foundation V3 release that exposed
three recurring operator-cost classes:

1. insufficient root headroom despite safe reclaimable material;
2. a staged candidate whose release authority became superseded before
   activation;
3. validation depending on ambient Prisma Client generation.

Each case originally failed closed correctly but required manual diagnosis.

Release Autopilot V2.2 converts those known solutions into tested controller
behavior while preserving production, database, rollback, and Wolo boundaries.

The permanent lesson is:

> Yesterday's solved incident should become tomorrow's boring branch in
> `aoe2war finish`.
