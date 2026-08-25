---
id: "aoe2war.app-prodn.release-engineering"
title: "AoE2WAR Release Engineering"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "release-engineering-contract"
reviewed_at: "2026-08-24"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Release Engineering

## Purpose

AoE2WAR release engineering is the executable, fail-closed production release
contract for `app-prodn`. It separates implementation truth, documentation
truth, GitHub truth, production source truth, build truth, runtime truth,
public truth, recovery truth, and protected WOLO dependency state.

`DEPLOY.md` remains the canonical operator and emergency runbook. This document
defines the automated release model. If the implementation and either document
disagree, stop and reconcile them before production mutation.

## Core invariants

1. Production advances only to an exact sealed Git commit.
2. The Documentation Baseline names the implementation commit described by the
   repository documentation; documentation-only commits may follow it.
3. The release SHA and implementation SHA are distinct identities when the
   generated documentation-baseline commit follows implementation.
4. Production builds occur in a disposable detached Git worktree. Staging
   leaves the live source, `public/`, `.aoe2war-build-version`, `node_modules`,
   and active `.next` runtime unchanged, then copies only a cache-free artifact
   into `.next-release`.
5. The active `.next` runtime is preserved before activation in both fast and
   durable rollback evidence.
6. A candidate is not `CERTIFIED` merely because the service restarted.
7. Activation must prove exact source/build/version identity, critical internal
   and public routes, and protected WOLO listener continuity.
8. The activation rollback trap remains armed through the bounded health soak.
9. Fast rollback copies are a bounded root-filesystem recovery cache. Durable
   rollback and deployment evidence live on the mounted volume.
10. No unmatched rollback artifact is automatically deleted.
11. Ordinary app release tooling may observe WOLO services on ports `8092` and
    `8093` but must not restart, mutate, or reconfigure them.
12. Prisma migrations are permitted only through the protected
    `DATABASE`/`FINANCIAL` additive migration lane: exact migration frontier,
    candidate staged before DB mutation, durable pre-migration `pg_dump` plus
    SHA-256, migration receipt verification, no destructive SQL, and no writes
    to pre-existing columns. Existing tables may gain nullable columns,
    same-release constraints, and bounded backfills of only those new columns.
    A recovery-only production-proven-index canonicalization sublane may record
    an index migration only when every named production index already exists,
    is valid and ready, and its normalized live `pg_indexes.indexdef` matches an
    exact migration-bound SHA-256. Missing or differing indexes fail closed.
    After the ordinary durable pre-migration backup, the controller records the
    state with `prisma migrate resolve --applied`; it executes no production
    index DDL.
13. Mutating release commands are serialized by a deployment lock.
14. Machine-readable receipts must let a fresh operator or AI reconstruct the
    release state without conversational memory.
15. Dependency-contract changes are supported only by the candidate-owned
    dependency lane: frozen-lockfile network fetch with lifecycle scripts
    disabled, then lifecycle/build work in the offline/private sandbox.
    Candidate `node_modules` is hash-bound, staged beside live, atomically
    activated with `.next`, and rolled back as one runtime bundle.

## Operator command surface

The canonical human-facing command family is:

```bash
aoe2war finish -m "Ship the finished feature"
aoe2war finish --dry-run
aoe2war facts
aoe2war dev status
aoe2war dev prepare
aoe2war dev refresh
aoe2war dev serve
aoe2war dev new feature-name
aoe2war deps
aoe2war workspace status
aoe2war status
aoe2war context
aoe2war deploy
aoe2war deploy --dry-run
aoe2war releases --limit 5
aoe2war rollback --dry-run
aoe2war rollback
aoe2war gate
aoe2war manifest
```

The repository command is `bin/aoe2war`. Tony's MBP installs a tiny
`$HOME/bin/aoe2war` wrapper that enters the canonical repository command.
When invoked while the current directory belongs to another registered
`app-prodn` worktree, the canonical CLI proves the shared Git common directory
and re-enters that worktree's own `bin/aoe2war`. This makes the command surface
worktree-aware without treating arbitrary directories as release authority.
`bin/aoe2war` delegates protected production release phases to the lower-level
`bin/aoe2war-release` engine.

`aoe2war release <raw release-engine command/options>` exists for bounded
phase-specific or diagnostic use. Routine end-of-work closure should use
`aoe2war finish`; direct `aoe2war deploy` is the deliberately scoped lower-level
web release lane.

## Feature-worktree development and closure

Feature worktrees are first-class inputs to ordinary AoE2WAR closure.

The normal development lifecycle is:

```text
aoe2war dev new <feature>
  -> exact dependency/environment preparation
  -> writable production-shaped localhost shadow
  -> implementation + browser verification
  -> aoe2war finish -m "..."
  -> canonical ff-only promotion
  -> GitHub publication
  -> protected deploy/certification
```

A feature handoff is eligible only when:

- the caller is a registered worktree from the same `app-prodn` Git common
  repository;
- it has a named non-`main` branch;
- canonical operator `main` is clean;
- canonical `main` exactly equals GitHub `main`;
- the feature is a descendant of that exact main;
- production is reachable and clean.

The feature worktree owns candidate completion, the implementation commit,
the generated Documentation Baseline refresh/commit, exact validation and the
fail-closed fast-forward handoff. The baseline refresh occurs after the
implementation commit and before the full gate, so documentation validation
describes a real committed implementation rather than a dirty worktree. It
never silently chooses a merge or rebase. Canonical main continues to own
GitHub publication, documentation federation, protected deployment,
certification, estate audit, Doctor and public performance proof.

### Development-data safety

`aoe2war dev` may mirror selected production-shaped read data into the local
disposable shadow. It must never provide local application code with a
production database write credential.

Shadow database lifecycle is intentionally split:

```text
local PostgreSQL bootstrap authority
  -> DROP/CREATE disposable shadow

normal aoe2user application role
  -> owns shadow
  -> builds current schema
  -> performs normal local application writes
  -> remains NOCREATEDB
```

Snapshot selection begins from bounded product roots and follows referenced
foreign-key parents from the current local schema. This prevents feature
fixtures from silently omitting required parents such as Direct Chat shared
lobby messages. Cycles are permitted in the dependency graph; restore uses
local bootstrap authority with trigger-safe `pg_dump --disable-triggers`
evidence while the production credential remains inside the VPS process.

High-volume surfaces are bounded by explicit machine policy. The development
shadow is realism for testing, never production truth.

### Dependency contract

Every external runtime package imported by tracked application runtime source
must be explicitly declared in `package.json`. The checker parses JavaScript /
TypeScript syntax through the TypeScript AST rather than regex, so strings,
comments and JSX text cannot masquerade as package imports.

The dependency contract runs during `aoe2war dev prepare` and in the protected
release gate.

### Hash-bound validation reuse

Gate receipts bind validation to:

- release scope digest;
- target tree digest;
- implementation digest with documentation-only files excluded;
- dependency digest;
- test-execution contract digest;
- toolchain digest;
- release-validator digest.

An exact matching target may reuse the complete PASS receipt without rerunning
validation.

A later descendant that changes only generated/documentation material may
inherit the expensive implementation validation only when the implementation,
dependency, test-contract, toolchain and validator digests remain exact. That
descendant still runs cheap diff, documentation, secret and dependency
revalidation.

Any implementation, dependency, test-contract, toolchain or validator change
invalidates inheritance and forces the full gate.

`config/test-contract.json` and `scripts/run_test_contract.py` are the machine
authority for the active Node test invocation. Operators and AI agents should
not manually reconstruct loader flags or substitute raw `node --test` commands
for the canonical contract.

### Public Workshop Chronicle closure

`aoe2war finish` owns the public Workshop Chronicle as part of ordinary release
closure. After production is certified, Finish compares Git workdays in
`America/Edmonton` against published Workshop history and idempotently creates or
refines a small human-readable set of Chronicle headings for uncovered or
machine-owned workdays.

The Chronicler deliberately does not publish one row per commit. It strips
release/documentation noise, groups the meaningful source work into at most four
daily public records, and keeps hashes plus the underlying commit subjects inside
the existing click-to-drill-down technical record. Multiple releases on one day
refine the same deterministic records.

Hand-curated Workshop days remain authoritative and are never overwritten by the
automatic Chronicler. Automatic rows carry the dedicated
`aoe2war-finish-chronicler` ownership marker.

Workshop publication occurs only after runtime certification. If the certified
application is healthy but Chronicle reconciliation fails, release truth remains
`CERTIFIED` while Finish records `CERTIFIED_WORKSHOP_INCOMPLETE` and stops before
claiming complete closure. A later Finish run may safely resume the idempotent
public-history reconciliation.

The Workshop route itself must not make below-the-fold Chronicle history part of
the initial navigation critical path. A real route-level Workshop hero paints
immediately, while the Chronicle first page loads only as the reader approaches
the timeline.

### Browser evidence

Automated source contracts do not prove every interactive browser behavior.
For UI work whose correctness depends on portal ownership, pointer/focus
ordering, optimistic reconciliation, browser layout state or persisted
interaction state, the feature must receive an appropriate browser smoke on the
writable production-shaped shadow before release. The Direct/Nav Chat
reaction/reply/edit fix is the reference example: source tests were green before
a real browser proof exposed the missing data and event-lifecycle requirements.

## Interactive operator recovery discipline

The release engine already owns fail-closed validation, locking, staging,
rollback traps and receipts. An outer interactive `set -euo pipefail` wrapper is
not part of the release contract and should not be added around canonical
operator commands.

For AI-assisted or recovery-sensitive operation:

1. inspect `aoe2war context` and `aoe2war status` first;
2. when debugging, use one visible lifecycle action at a time;
3. never infer failure from a lost terminal, SSH timeout, or long build alone;
4. never blindly retry an uncertain activation;
5. re-open a terminal and reconstruct state from Mac/GitHub/production identity,
   BUILD_ID/build version, provenance and receipts;
6. resume or roll back only through the release controller's recognized state.

Application releases can take many minutes because the gate, isolated build and
bounded health soak are real work. During a direct deploy, generated
documentation baseline handling may create a documentation-only release commit
after the implementation commit. The resulting release SHA is expected to be a
descendant of the implementation SHA.

## Release state model

The intended successful lifecycle is:

```text
DIRTY
  -> GATED
  -> SEALED
  -> PUBLISHED
  -> STAGED
  -> ACTIVE
  -> SOAKING
  -> VERIFIED
  -> CERTIFIED
```

`status` derives operator-facing state from local Git, GitHub, the
Documentation Baseline, production checkout/runtime identity, public version
parity, protected WOLO listeners, and matching activation receipts.

While `.next-release` exists, status reports `STAGED` before ordinary
production-source parity. In that state the live checkout intentionally remains
on the previous production SHA. A normal `aoe2war deploy` (and therefore
`aoe2war finish`) resumes only a stage receipt whose release SHA and candidate
BUILD_ID exactly match the live staged artifact; it does not rebuild or
republish the candidate. If that exact receipt is absent locally, the engine may
rehydrate it from VPS evidence only when exactly one durable receipt matches. It
re-proves the previous source, active and staged BUILD_IDs, cache-free artifact
digest, manifest/gate digests, service/build-version identity, and protected
listener counts before installing the exact receipt and its bound evidence
locally. Missing, conflicting, ambiguous, or mismatched evidence stops before
activation.

Safety/blocking states include `DOCS_INVALID`, `DIVERGED`,
`PRODUCTION_DIRTY`, `RUNTIME_UNHEALTHY`, `RUNTIME_UNVERIFIED`,
`PROTECTED_SERVICE_ALERT`, and a healthy `PUBLISHED` state when GitHub/main is
newer than a deliberately restored certified production runtime.

## One-command deploy

`aoe2war deploy` is the authoritative protected automatic transmission.
Ordinary releases remain zero-migration; database releases enter the explicitly
classified additive migration lane and must satisfy its stronger evidence
contract.

### 1. Preflight

The engine requires:

- local branch `main`;
- clean local worktree;
- a valid Documentation Baseline ancestor;
- reachable, clean production;
- active `aoe2hdbets-web.service`;
- internal/public build-version parity;
- exactly one live protected listener on each of `8092` and `8093`;
- either no staged candidate and a real change to ship, or one exact staged
  candidate with a matching receipt that can be resumed safely.

A local `fcntl.flock` deployment mutex prevents concurrent mutating release
commands from racing each other.

### 2. Documentation baseline

When implementation changed since the current Documentation Baseline, the
engine runs the documentation generator with baseline refresh and may create a
generated documentation-only commit. That commit becomes the release SHA while
the baseline continues to identify the implementation SHA.

When all changes since the baseline are documentation-only, the baseline is not
needlessly moved.

### 3. Gate

The release gate:

- computes the exact release scope;
- hashes the scope;
- classifies risk;
- binds tree, implementation, dependency, test-contract, toolchain and
  validator identity;
- reuses an exact PASS receipt only when every required identity remains exact;
- may reuse expensive implementation validation across a documentation-only
  descendant while rerunning cheap documentation/security/dependency checks;
- runs the full applicable fail-closed validation plan whenever a bound
  implementation/toolchain/contract identity changes;
- writes a machine-readable gate receipt beneath
  `.aoe2war-release/gates/`.

Risk order:

```text
NO_CHANGE -> DOCUMENTATION -> PRESENTATION -> APPLICATION -> INFRASTRUCTURE
          -> WATCHER -> REPLAY_TRUTH -> FINANCIAL -> DATABASE
```

Release-engineering changes trigger the complete release-engineering test suite
and explicit Python compilation, including the rollback implementation.

### 4. Exact GitHub publish

The engine pushes the exact sealed release SHA to `origin/main` only when the
remote is a valid ancestor. It refuses non-fast-forward ambiguity and verifies
GitHub landed on the exact release SHA.

### 5. Release manifest

The manifest binds:

- release SHA;
- implementation/documentation baseline;
- previous production SHA;
- exact changed-file scope;
- risk class;
- migration declaration;
- gate receipt and digest;
- deployment policy.

The manifest and companion SHA-256 live beneath
`.aoe2war-release/manifests/`.

### 6. Isolated stage beside live

Production source remains on the manifest's previous production SHA throughout
staging. The engine fetches the sealed release, verifies pinned Yarn `1.22.22`,
creates a temporary detached worktree for that exact release, and materializes
a candidate-owned dependency tree. Dependency network fetch uses
`--frozen-lockfile --ignore-scripts`; lifecycle scripts/build work then run in
the offline/private sandbox. Build hooks, Prisma generation, the generated
build-version sidecar, dependency tree, and Next build output therefore belong
only to the candidate until activation.

After a successful build, the engine removes `.next-release/cache` and
binary-safely relocates embedded absolute worktree paths to the canonical live
repository path. The disposable and live paths are deliberately equal in byte
length, and staging fails if any disposable path remains. The engine then hashes
the cache-free relocated artifact, copies it to the live checkout as
`.next-release`, and removes the temporary worktree. It finally proves that the
live source, `public/`, `.aoe2war-build-version`, `node_modules`, active `.next`,
service, public version, and protected listeners remained unchanged.

Staging records:

- current active BUILD_ID;
- candidate BUILD_ID;
- live and candidate build versions;
- deterministic staged artifact SHA-256;
- bound manifest/gate evidence;
- previous/live production source identity and isolation invariants;
- WOLO listener counts.

Durable stage evidence is stored beneath:

```text
/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/
```

The durable directory contains the exact local stage receipt plus its SHA-256
sidecar, manifest, gate receipt, and stage-status proof. That complete evidence
set is the crash-recovery and Mac/VPS handoff boundary; a candidate without it
may still be resumed from an already-valid local receipt on the staging host,
but another host must fail closed rather than reconstruct trust from the
artifact alone.

A successful stage leaves ignored `.next-release` and
`.node_modules-release` candidate artifacts beside the unchanged live runtime.
Their identities are hash-bound in the stage receipt. Activation stops the web
service, swaps the candidate dependency tree and Next runtime together, advances
source/build-version identity, and keeps paired fast/durable rollback material.

### Bounded release-build memory policy

The production build sandbox is intentionally resource-bounded. A build OOM is
a stage failure, not permission to weaken production isolation or raise memory
limits beyond safe host capacity.

For release staging (`NEXT_DIST_DIR=.next-release`):

- lint runs explicitly in `prebuild`;
- TypeScript validation runs explicitly as `tsc --noEmit` in `prebuild`;
- those checks are sequential and must pass before `next build`;
- Next's duplicate in-build lint/type workers are disabled only for that
  release-build mode, because equivalent checks already passed in the same
  fail-closed build lifecycle;
- ordinary/non-release builds retain Next's normal built-in lint/type behavior;
- `experimental.webpackBuildWorker` is explicitly enabled because this repo has
  a custom `webpack()` hook;
- `experimental.webpackMemoryOptimizations` is enabled;
- release worker concurrency is bounded to two CPUs.

Do not solve a release-build OOM by disabling validation without a replacement,
raising `MemoryMax` past safe host capacity, restarting WoloChain, or building
inside the live production tree.

A failure before `.next-release` / `.node_modules-release` artifact copy leaves
the certified runtime unchanged and requires no runtime rollback.

### Learned release recovery

`aoe2war finish` includes a bounded learned-recovery layer for failure classes
whose safe resolution is already machine-provable. The canonical contract is
[`RELEASE_RECOVERY_OS.md`](RELEASE_RECOVERY_OS.md).

Current automatic recovery classes are:

- **low production-root headroom** — reclaim regenerable APT material first,
  then bound the journal, then checksum-archive only closed rotated nginx
  `.log.1` files until the configured floor is restored;
- **superseded staged candidates** — exact current-release resume remains first,
  then `.next-release` and `.node_modules-release` may be retired only when one
  durable receipt proves older provenance and staged trees have zero runtime
  references;
- **ambient Prisma generated state** — `npx prisma generate` runs
  deterministically before TypeScript and Prisma validation.

These conveniences do not expand mutation authority. Ambiguous/current staged
state, live staged references, insufficient approved reclaim, abnormal Wolo
listeners, database uncertainty, or runtime identity drift remain fail-closed.

Root recovery never broadly removes `/tmp`, active runtime/dependencies,
rollback material, PostgreSQL data, or Wolo state. Superseded-stage recovery
never touches active runtime or restarts Wolo.

Every mutating recovery path leaves durable evidence, and ordinary release
checks re-prove capacity, runtime identity, service health, and protected Wolo
state afterward.

### Protected additive Prisma migration lane

When the manifest contains Prisma migrations, automatic release is allowed only
for `DATABASE` or `FINANCIAL` risk and only after the exact candidate has been
staged beside the unchanged live runtime.

The migration phase must:

- derive the exact pending Prisma frontier and require it to equal the manifest;
- reject unexpected, partial, destructive, or non-additive migration work;
- create durable `pg_dump -Fc --no-owner --no-acl` evidence before the first
  production DB mutation;
- SHA-256 bind that backup on the mounted evidence volume;
- deploy the exact migration frontier;
- verify each declared migration is applied exactly once with no unfinished or
  rolled-back row;
- write durable migration status before runtime activation.

A failed app activation after successful additive DB migration does not justify
an ad-hoc production DB rollback. The previous app remains backward-compatible
with the additive schema while the engine recovers or activates the exact staged
candidate.

### Production-proven CHECK replacement lane

A separate production-proven CHECK-replacement mode covers the narrow case
where a release must replace named PostgreSQL CHECK constraints on an existing
table. It does not widen the ordinary additive lane.

Every participating migration must declare the dedicated mode marker and, for
each affected CHECK, the exact table and constraint identity plus SHA-256 of
both the live pre-migration `pg_get_constraintdef` and the required
post-migration definition. The SQL contract permits only the corresponding
proof-bound `DROP CONSTRAINT` and `ADD CONSTRAINT ... CHECK` statements plus
transaction boundaries.

On a wholly pending release frontier, the release engine first proves every
live BEFORE hash. It then creates the normal durable pre-migration PostgreSQL
dump, applies the exact Prisma frontier, and proves every live AFTER hash before
the migration is accepted and its durable receipt is written. That receipt
records each exact before/after CHECK proof.

For an already-applied release, the engine requires the durable release-bound
receipt to contain those exact CHECK proof lines and independently re-proves the
live AFTER definitions. Missing, changed, partial, mixed, duplicated, or
unrelated SQL fails closed. This mode provides no authority over Wolo or
settlement state.

### Activation transport timeout recovery

Transport timeout is **not** equivalent to activation failure.

The exact remote activation receipt directory is known before activation starts.
If the Mac-side SSH wait expires, the orchestrator must not restage, remigrate,
or blindly retry. It enters an unknown-remote-state recovery lane and polls only
that exact durable activation directory.

Automatic recovery is allowed only when durable evidence and live runtime truth
simultaneously prove:

- `status=CERTIFIED`;
- exact release/previous SHA, active BUILD_ID, build version, artifact and
  dependency identity;
- exact stage/manifest/gate SHA-256 bindings;
- clean current production source;
- active service and internal/public version parity;
- no staged runtime/dependency tree remains;
- completed bounded health soak and retention evidence;
- unchanged protected WOLO listener counts;
- valid fast and durable rollback paths.

Only then may the normal local activation receipt be written and certification
continue. Missing, conflicting, partial, ambiguous, or non-certified evidence
remains `REMOTE_STATE_UNKNOWN`; the engine must stop and tell the operator not
to retry blindly.

### 7. Zero-mutation activation preflight

Before the runtime swap, activation re-verifies:

- the bound stage receipt and its hashes;
- exact candidate artifact identity;
- previous source/live runtime identity and unchanged build-version sidecar;
- service health;
- internal/public live version parity;
- critical routes;
- canonical Git transport;
- protected WOLO counts.

Dry-run activation performs zero production mutation.

### 8. Activate with rollback trap armed

Before mutation, the engine copies the prior active runtime to durable rollback
storage without rebuildable `.next/cache`, and records the previous source and
build-version identity:

```text
/mnt/HC_Volume_105319120/aoe2war/rollbacks/
```

It arms the rollback trap and stops `aoe2hdbets-web.service` before changing any
member of the activation bundle. While the service is stopped it preserves a
fast root copy named `.next-rollback-activate-<UTC>`, swaps `.next-release`
into `.next`, advances the live checkout to the exact release SHA, writes the
candidate `.aoe2war-build-version`, and then starts only the web service.

Until certification commits, any critical failure after mutation exits through
the activation failure trap, which stops the service, preserves the exact
candidate back in `.next-release`, restores the previous `.next`, resets source
to the previous production SHA, restores the prior build-version sidecar,
restarts the service, and proves the complete restored identity.

### 9. Immediate proof and bounded health soak

After restart the candidate must prove:

- service active;
- exact release source;
- clean production checkout;
- exact candidate BUILD_ID;
- exact internal/public candidate build version;
- exact candidate content identity;
- no leftover `.next-release`;
- critical internal routes:
  `/`, `/api/lobby`, `/api/bets`, `/api/deployment-version`;
- matching public routes;
- unchanged WOLO listener counts.

The rollback trap then stays armed during a bounded health soak.

Defaults:

```text
AOE2_RELEASE_SOAK_SECONDS=60
AOE2_RELEASE_SOAK_INTERVAL_SECONDS=10
```

The implementation bounds soak duration to 10–300 seconds and interval to
5–60 seconds. Each sample repeats service/source/build/version/route/WOLO
proof. The normal default produces six samples over 60 seconds.

A soak failure prevents certification and triggers the existing activation
recovery path.

### 10. Certification

Only after the soak passes does the engine write `status=CERTIFIED` in the
durable activation evidence and commit the activation as successful.

The local activation receipt lives beneath:

```text
.aoe2war-release/activation-receipts/
```

Certification binds release SHA, implementation SHA, prior production SHA,
previous/active build IDs, candidate build version, artifact SHA, manifest/gate
evidence, durable/fast rollback identity, soak evidence, and WOLO continuity.

### 11. Verified fast-rollback retention

Retention runs only after certification and is intentionally non-fatal.

The managed namespaces are:

```text
.next-rollback-activate-*
.next-rollback-manual-*
```

A fast copy is eligible for pruning only when its `BUILD_ID` has a verified
durable twin in either:

```text
/mnt/HC_Volume_105319120/aoe2war/rollbacks/*/next/BUILD_ID
/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/*/current-next/BUILD_ID
```

Default:

```text
AOE2_RELEASE_FAST_ROLLBACK_KEEP=1
```

The implementation bounds the keep count to 1–10. It keeps the newest matching
fast copies and may delete only older verified duplicates. A missing BUILD_ID,
missing durable match, unsafe path, identity drift, or deletion problem is
recorded and kept rather than guessed away.

Legacy rollback directories outside the managed namespaces are not candidates.

Retention writes its plan/result into the durable activation receipt and
re-proves the active service/source/build and protected WOLO counts afterward.

### 12. Independent final proof

The local operator process re-collects production state and independently
confirms certified provenance, exact source/build/version identity, public
version parity, critical routes, and protected WOLO continuity.

Only then does `aoe2war deploy` report:

```text
PASS: RELEASE SHIPPED + CERTIFIED — WOLO UNTOUCHED
```

## Release identity and provenance

Do not collapse these identities:

- **implementation SHA** — code implementation described by documentation;
- **release SHA** — exact Git commit published/deployed, which may be a
  documentation-only descendant of implementation;
- **BUILD_ID** — Next build identity;
- **build version** — public/internal deployment version;
- **artifact SHA-256** — staged artifact identity;
- **content SHA-256** — root-name-independent candidate/active runtime content
  identity;
- **activation receipt** — evidence binding the above to proof and rollback.

The same release SHA can legitimately have multiple separately certified build
artifacts if the exact source is rebuilt. Release history therefore records
release plus artifact/runtime identity rather than assuming a Git SHA implies
one unique build.

## Certified release history

`aoe2war releases` reads only local activation receipts that declare:

- schema `1`;
- kind `aoe2war-activation-result`;
- status `CERTIFIED`.

It is a read-only operator history surface. Multiple certified artifacts for
one release SHA are intentionally visible.

## Explicit certified rollback

`aoe2war rollback` is one-step, receipt-driven recovery, not arbitrary SHA
selection.

Preconditions include:

- clean local worktree;
- Mac HEAD equals GitHub main;
- production is reachable, clean, active, and version-coherent;
- current production source equals local/GitHub source;
- current runtime has matching `CERTIFIED` activation provenance;
- no staged candidate exists;
- protected WOLO listeners are present.

The rollback target comes from the current certified activation receipt's
`previous_production_sha` and `previous_build_id`. The engine then requires a
matching earlier `CERTIFIED` activation receipt for that exact
release/build/version and validates its supporting evidence.

`aoe2war rollback --dry-run` proves the plan and source with zero production
mutation.

A real rollback:

1. chooses an exact fast rollback when it matches or a durable rollback
   fallback when required;
2. preserves the currently running certified runtime as forward rescue
   evidence before mutation;
3. restores target source and target runtime together;
4. restarts only the AoE2WAR web service;
5. proves internal/public critical routes and exact target version;
6. requires WOLO listener counts unchanged;
7. re-collects state and requires the target to be recognized as `CERTIFIED`;
8. writes durable remote and local rollback receipts.

After a successful rollback, `aoe2war status` may correctly show `PUBLISHED`
instead of `CERTIFIED` at the repository level when GitHub/main is newer than
the deliberately restored certified production source.

The live August 10, 2026 rollback/forward-recovery fire drill is frozen in
`docs/RELEASE_ENGINEERING_SEAL_2026-08-10.md`.

## Production Git transport

Production Git mutation has one canonical execution identity:

- user: `tony`;
- origin: `git@github.com:Emaren/app-prodn.git`;
- deploy key: `/home/tony/.ssh/gh_deploy_aoe2hdbets_app_prodn`;
- deploy-key fingerprint:
  `SHA256:229KVsTphLtYRwmLbqR82g+uIBRip3wzmXfR3etNcZk`;
- known-hosts file: `/home/tony/.ssh/known_hosts`;
- Git protocol: `0`.

The repository-local `core.sshCommand` disables config fallback with
`-F /dev/null`, requires the exact key, `IdentitiesOnly=yes`,
`BatchMode=yes`, strict host-key checking, and the canonical known-hosts file.

Foreign-owned or unwritable `.git` metadata blocks release.

## Database migration boundary

`aoe2war finish` includes one deliberately narrow higher-risk database lane for
additive Prisma releases. A migration-bearing candidate must pass a `DATABASE`
or `FINANCIAL` release gate. The migration contract rejects destructive SQL,
insertion/deletion of pre-existing production truth, mutation of pre-existing columns,
and non-additive `ALTER TABLE` work. A pre-existing table may receive nullable
columns and constraints over columns added by the same release; a bounded
backfill may populate only those newly added columns.

After the exact candidate is published and staged, but before activation, the
lane verifies that the production pending migration frontier exactly equals the
release manifest. It then writes a durable PostgreSQL custom-format dump,
records its SHA-256, applies the exact frontier from an isolated worktree, proves
each migration landed exactly once with no unfinished Prisma rows, and writes a
release-bound migration receipt. Activation refuses a partial or unexpected
frontier, a previously applied release without its durable receipt, or any
missing/invalid proof.

Outside the separately proof-bound production-proven CHECK-replacement and
production-proven index-canonicalization modes, this authority does not extend
to destructive migrations, mutation of existing tables, arbitrary SQL, manual
in-place migration, or database restoration. Those remain separately reviewed
break-glass procedures. Wolo services and settlement state remain outside these
lanes entirely.

## WOLO protected boundary

Ports `8092` and `8093` are protected dependencies, not release targets.

The app release engine may observe listener counts and require continuity. It
must not restart, upgrade, reconfigure, transfer through, or otherwise mutate
those services.

Every stage, activation, soak, rollback, retention proof, and final
certification treats WOLO continuity as an invariant.

## Receipt map

Local ignored release state:

```text
.aoe2war-release/
  gates/
  manifests/
  ship-plans/
  stage-receipts/
  activation-receipts/
  rollback-receipts/
  patch-backups/
  deploy.lock
```

Durable VPS evidence:

```text
/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/
/mnt/HC_Volume_105319120/aoe2war/rollbacks/
```

Root `.next-rollback-*` directories are fast recovery cache/evidence and are
subject only to the verified retention policy above.

## Documentation-control interaction

`.aoe2war-release/` is operational state and is excluded from documentation
discovery. Backup copies of Markdown beneath release state must never be
mistaken for canonical repository documents.

For repository documentation:

```bash
python3 scripts/docs_v2_check.py
python3 scripts/docs_v2_check.py --write
python3 scripts/docs_v2_check.py --write --refresh-baseline
```

Use `--write` for documentation-only changes. Use `--refresh-baseline` when
intentional implementation changes need the generated Documentation Baseline
advanced.

## Context handoff

A fresh operator or AI session should begin with:

```bash
aoe2war context
aoe2war status
aoe2war releases --limit 5
```

These surfaces reconstruct release state. They do not replace domain-specific
contracts for betting, replay truth, settlement, Watcher behavior, or database
authority.


## Finish self-maintenance invariants — 2026-08-14

`aoe2war finish` owns the routine transition from finished code to certified
operating state. Operators should not have to pre-run TypeScript, ESLint,
`git diff --check`, context cleanup, or generated-doc pushes merely to make the
command succeed.

Additional fail-closed invariants:

1. Production root and the canonical mounted volume are measured separately
   before expensive maintenance/release work and again at final certification.
   Root free space below the contract warning floor blocks the release before
   staging; mounted-volume use at the critical threshold also blocks.
2. A clean `AoE2WAR-docs` checkout that is only ahead of origin is validated
   through the central docs gates and pushed automatically. A clean checkout
   behind origin may fast-forward. Dirty or truly diverged docs history remains
   a hard stop.
3. Before an AoE2WAR context capture, stale generated archives for the requested
   series are bounded to the newest generation and the Mac must prove enough
   free space for staging, compression, and the expected output.
4. Project context packaging is strict: a failed child ZIP/TGZ step propagates
   its exit status. The update engine still independently requires exactly one
   archive for the requested `CTX_TS`, a portable checksum sidecar, and a
   matching SHA-256.
5. Storage relocation of arbitrary live dependencies remains guided rather than
   automatic. `finish` may apply only its explicitly contracted retention
   policy; broader root relocation requires a separately proven storage action.

## Finish-owned context overlap and final audit

`aoe2war finish` owns the complete end-of-work transaction. Its internal update
fast path may defer context compression so the exact planned capture runs beside
the remote deployment, and may defer update's broad final estate audit because
finish performs one authoritative audit after post-release reconciliation and
Operator Bridge reload.

The overlap is bounded to the context projects chosen by the locked update plan
and is settled before post-release update replans the estate. Failure falls back
to ordinary synchronous post-release context reconciliation.

## Persistent build-cache decision

A production experiment with a copied persistent Yarn/Next cache was retired
after the warm path measured slower than the certified V1.2 stage and consumed
about 3.4 GiB of durable-volume capacity. Release staging therefore retains the
fresh scripts-disabled network dependency fetch followed by the network-private
frozen offline build.

This is an evidence-based rejection of that cache topology, not a relaxation of
release guarantees. Frozen dependency inputs, Prisma engine identity, candidate
dependency hashing, cache-free artifact hashing, activation certification,
rollback evidence, and Wolo protection remain authoritative.
