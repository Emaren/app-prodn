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

## Phase I command surface

Phase I is intentionally read-only:

```bash
bin/aoe2-release status
bin/aoe2-release context
bin/aoe2-release status --json
```

`status` serves operators. `context` is a compact AI/operator handoff. `--json` is the machine-readable contract for future gates, receipts, CI, and deployment automation.

Phase I observes local and GitHub Git truth, Documentation Baseline ancestry, production source/worktree state, web-service health, active/staged build identity, internal/public build-version parity, rollback inventory, disk space, and protected WOLO listeners on 8092/8093. It performs no commit, push, reset, build, service restart, database mutation, or WOLO mutation.

## Planned automation surface

Later phases may add `gate`, `seal`, `ship`, `prove`, and `rollback`. They are not authoritative until implemented, tested, documented, and sealed through the same release process.

## Release Manifest and provenance

A future manifest will bind implementation commit, release/documentation commit, previous production commit, changed-file set and risk class, required gates/results, migration declaration, build identity, artifact SHA-256, activation timestamp, and rollback/receipt identity.

Until a runtime has such a manifest, tooling must label its artifact provenance `legacy-unmanifested`; source/runtime parity alone is not cryptographic build provenance.

## Risk principle

Automation reduces ceremony for low-risk presentation releases and adds mandatory gates for higher-risk surfaces. Financial authority, betting, settlement, replay-result authority, Prisma/schema changes, authentication, watcher protocol changes, and infrastructure changes must never receive weaker validation merely because the release CLI is convenient.

## Context handoff principle

A fresh operator or AI session begins with `aoe2-release context`. It states what is local, what is on GitHub, what source is on production, what runtime is active, whether a candidate is staged, whether the Documentation Baseline is coherent, whether public runtime identity matches, and whether protected dependencies appear present.

This replaces manual reconstruction of release state; it does not replace authoritative domain documents needed to understand a feature change.
