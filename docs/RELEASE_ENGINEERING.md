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
reviewed_at: "2026-08-09"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Release Engineering

## Purpose

AoE2WAR release engineering converts the production runbook into executable,
fail-closed policy. The objective is not more ceremony. It is to preserve the
existing production safeguards while making routine releases faster, simpler,
more reproducible, easier to resume in a fresh AI session, and easier to audit.

`DEPLOY.md` remains the canonical operator and emergency runbook. This document
defines the release model that automation must implement. If automation and the
runbook disagree, stop and reconcile them before production mutation.

## Core invariants

1. Production advances only to an exact sealed Git commit, never an unspecified moving branch tip.
2. Implementation truth, documentation truth, GitHub truth, production-source truth, build truth, runtime truth, and public truth are verified separately.
3. The Documentation Baseline names the implementation commit described by repository documentation. Documentation-only commits may follow it.
4. Production builds occur beside the active runtime in `.next-release`; a failed build must not replace the live `.next` runtime.
5. A deploy preserves a usable prior runtime before activation.
6. Runtime activation is followed by internal and public proof; critical proof failure must fail closed and preserve or restore rollback capability.
7. Database migrations require explicit reviewed migration scope and rollback planning.
8. WOLO services are protected dependencies. Ordinary app release tooling may observe them but must not restart, mutate, or reconfigure them.
9. Release tooling itself is tested and versioned in Git.
10. Machine-readable state and receipts must let a new operator or AI recover release context without conversational memory.

## Release state model

Target lifecycle:

```text
DIRTY -> GATED -> SEALED -> PUBLISHED -> STAGED -> ACTIVE -> VERIFIED -> CERTIFIED
```

Safety states include `DOCS_INVALID`, `DIVERGED`, `PRODUCTION_DIRTY`, `RUNTIME_UNHEALTHY`, `RUNTIME_UNVERIFIED`, and `PROTECTED_SERVICE_ALERT`.

## Implemented command surface

Release Engineering I currently implements:

```bash
bin/aoe2-release status
bin/aoe2-release context
bin/aoe2-release status --json
bin/aoe2-release gate
bin/aoe2-release gate --json
bin/aoe2-release manifest
bin/aoe2-release manifest --json
bin/aoe2-release ship --dry-run
bin/aoe2-release ship --dry-run --json
bin/aoe2-release ship --stage
bin/aoe2-release ship --stage --json
```

`status` serves operators. `context` is a compact AI/operator handoff. JSON output is the machine-readable contract for gates, receipts, manifests, CI, and deployment automation.

Phase I observes local and GitHub Git truth, Documentation Baseline ancestry, production source/worktree state, web-service health, active/staged build identity, internal/public build-version parity, rollback inventory, disk space, and protected WOLO listeners on 8092/8093. It performs no commit, push, reset, build, service restart, database mutation, or WOLO mutation.

`gate` determines the release scope, calculates a SHA-256 scope identity, classifies release risk, runs the applicable fail-closed validation plan, and records a machine-readable gate receipt beneath the ignored local `.aoe2war-release/gates/` state directory.

The risk ladder is ordered from lower to higher consequence:

```text
NO_CHANGE -> DOCUMENTATION -> PRESENTATION -> APPLICATION -> INFRASTRUCTURE
          -> WATCHER -> REPLAY_TRUTH -> FINANCIAL -> DATABASE
```

Risk classification may only add validation as consequence rises. It must never weaken domain-specific safety requirements.

`manifest` requires a clean local tree, Mac/GitHub parity, a valid Documentation Baseline, clean reachable production source that still precedes the release, and a matching PASS gate receipt for the exact committed release scope. It then writes an ignored local release manifest and companion SHA-256 file beneath `.aoe2war-release/manifests/`.

The manifest binds the release commit, implementation/documentation baseline, previous production commit, exact changed-file scope, risk class, migration declaration, gate receipt, and core deployment policy before production source advances.

`ship --dry-run` validates the bound manifest and gate receipt, verifies Mac/GitHub/repository and production ancestry, checks the canonical production Git execution identity and transport, requires all production Git metadata to be owned and writable by the deploy user, verifies the dedicated deploy key is readable with the expected ownership, restrictive mode, and fingerprint, requires a healthy active runtime with internal/public build-version parity, requires protected WOLO listeners on 8092/8093, refuses releases with Prisma migrations, refuses an existing staged build, and writes a SHA-256-bound deployment plan beneath `.aoe2war-release/ship-plans/`.

The dry run performs zero production mutation.

`ship --stage` is the first bounded production-mutation phase. It revalidates the sealed manifest, gate receipt, production state, Git transport, live runtime identity, public version parity, and protected WOLO listeners before mutation. It then persists the bound manifest and gate evidence into durable deployment storage, advances production source only to the exact sealed release SHA, and builds the candidate beside the live runtime in `.next-release` as the production application user.

Staging records candidate BUILD_ID, candidate build version, and a deterministic SHA-256 identity for the staged `.next-release` artifact. It then proves the existing `.next` BUILD_ID, live internal/public build version, web-service state, and protected WOLO listener counts did not change. `ship --stage` never stops, starts, or restarts the AoE2WAR web service and never mutates WOLO services.

Durable stage evidence is written beneath the root-owned deployment-receipt parent without weakening that parent. Forge creates only the per-release receipt directory through the VPS narrow passwordless `/usr/bin/install` capability, with ownership `tony:tony` and mode `0750`.

Production Git mutation has one canonical execution identity: `tony`. The production `.git` metadata must contain no foreign-owned entries and no directories that are unwritable by that user. Repository transport is bound to `/home/tony/.ssh/gh_deploy_aoe2hdbets_app_prodn`, fingerprint `SHA256:229KVsTphLtYRwmLbqR82g+uIBRip3wzmXfR3etNcZk`, with SSH config fallback disabled through `-F /dev/null`, exact-key authentication, strict host-key checking, and the canonical Tony-owned known-hosts file. A transport that merely resolves GitHub through another identity is not sufficient release proof.

Failure handling distinguishes the production-mutation boundary. A failure before source advancement reports that recovery was not required and does not reset production. Once source mutation begins, a failure removes the candidate build, restores the previous production source and pre-build version identity, and leaves the live `.next` runtime running. Successful staging deliberately stops at `STAGED`; it does not activate the candidate.

Plain `ship` remains deliberately unavailable until activation, internal/public proof, certification, and automatic runtime rollback are implemented and sealed.

## Planned automation surface

Later phases may add staged-artifact activation, mutating one-command `ship`, plus `seal`, `prove`, and `rollback`. They are not authoritative until implemented, tested, documented, and sealed through the same release process.

## Release Manifest and provenance

The implemented predeploy manifest binds implementation commit, release/documentation commit, previous production commit, changed-file set and risk class, gate receipt, migration declaration, and core release policy before production mutation.

Staging receipts now record staged build identity, candidate build version, deterministic artifact SHA-256, and durable pre-activation evidence. Future provenance evolution will bind activation timestamp, internal/public proof results, certification state, and rollback identity to the completed deployment receipt.

Until a runtime has such a manifest, tooling must label its artifact provenance `legacy-unmanifested`; source/runtime parity alone is not cryptographic build provenance.

## Risk principle

Automation reduces ceremony for low-risk presentation releases and adds mandatory gates for higher-risk surfaces. Financial authority, betting, settlement, replay-result authority, Prisma/schema changes, authentication, watcher protocol changes, and infrastructure changes must never receive weaker validation merely because the release CLI is convenient.

## Context handoff principle

A fresh operator or AI session begins with `aoe2-release context`. It states what is local, what is on GitHub, what source is on production, what runtime is active, whether a candidate is staged, whether the Documentation Baseline is coherent, whether public runtime identity matches, and whether protected dependencies appear present.

This replaces manual reconstruction of release state; it does not replace authoritative domain documents needed to understand a feature change.
