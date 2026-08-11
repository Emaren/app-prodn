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
reviewed_at: "2026-08-10"
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
12. Automated plain ship refuses Prisma migrations. Database changes require a
    separately reviewed migration/backup/rollback procedure.
13. Mutating release commands are serialized by a deployment lock.
14. Machine-readable receipts must let a fresh operator or AI reconstruct the
    release state without conversational memory.
15. The automatic isolated-build lane requires an unchanged `yarn.lock` and
    unchanged dependency/package-manager sections in `package.json`. A
    dependency-contract-changing release fails closed instead of silently
    reusing incompatible production `node_modules`.

## Operator command surface

The canonical human-facing command family is:

```bash
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
`$HOME/bin/aoe2war` wrapper that execs the repository command, so the operator
surface works from any directory. `bin/aoe2war` delegates to the lower-level
`bin/aoe2war-release` engine.

`aoe2war release <raw release-engine command/options>` exists for bounded
phase-specific or diagnostic use. Routine production releases should use
`aoe2war deploy`.

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

`aoe2war deploy` is the authoritative no-migration automatic transmission.

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
- runs the applicable fail-closed validation plan;
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
staging. The engine fetches the sealed release, proves `yarn.lock` and the
package dependency contract did not change, verifies pinned Yarn `1.22.22`,
creates a temporary detached worktree for that exact release, and copies the
already-proven production dependency tree into that disposable worktree.
Build hooks, Prisma generation, the generated build-version sidecar, and Next
build output can therefore mutate only the temporary worktree and its copied
`node_modules`.

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

A successful stage ends with only the ignored `.next-release` artifact added.
The current automatic lane rejects any release that changes `yarn.lock` or the
dependency/package-manager sections of `package.json`; a future dependency-swap
lane must atomically install, activate, and roll back `node_modules` before that
boundary can be relaxed.

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
AOE2_RELEASE_FAST_ROLLBACK_KEEP=2
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

The automatic `aoe2war deploy` lane refuses any release manifest containing
Prisma migration paths. This is intentional.

Database releases require an explicit higher-risk procedure covering backup,
migration-history coherence, compatibility, application order, proof, and
rollback. Until that lane is deliberately implemented and sealed, fail-closed
refusal is the correct production behavior.

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
