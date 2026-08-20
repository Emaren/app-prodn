---
id: "aoe2war.app-prodn.docs-documentation-os"
title: "Documentation OS"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "documentation-operations-contract"
reviewed_at: "2026-08-20"
review_interval_days: 60
sensitivity: "internal"
---

# Documentation OS

Documentation OS turns the existing repository-local documentation checker and
central AoE2WAR documentation federation into an operator-visible lifecycle.
It does not replace repository ownership, the central taxonomy, Git history, or
the protected update engine.

## Goal

The normal lifecycle is:

```text
implementation change
  -> documentation impact
  -> living-contract review when required
  -> generated repository truth
  -> central federation + taxonomy
  -> deterministic validation
  -> immutable Git history
  -> DOCUMENTATION HEALTHY
```

The system optimizes for a low-friction build loop without inventing semantic
documentation. Generated truth is machine-owned. Living contracts change only
when behavior, authority, architecture, policy, or operational procedure
actually changes.

## Operator commands

```bash
aoe2war docs status
aoe2war docs impact
aoe2war docs audit
aoe2war docs update
aoe2war docs update --apply
```

`status` is the normal cheap health view. It reports the local implementation
baseline, registry/checker state, central registry/taxonomy state, review
freshness, and current semantic-impact signal.

`impact` compares the implementation baseline with committed and working-tree
changes. It uses the release risk classifier plus document metadata to rank
living-document review candidates. Candidate ranking is advisory; it is not a
license to rewrite documentation automatically.

`audit` validates all federated source registries and runs generation,
validation, YAML validation, idempotence, taxonomy audit, and strict portal
build in an isolated AoE2WAR-docs worktree. The canonical central repository is
not rewritten by a read-only audit.

`update` delegates to the existing protected `aoe2war update` engine. The
legacy top-level command remains supported for compatibility.

## Operational learning capture

Documentation OS is also the mechanism for removing repeat operator friction.

When a stable topology fact, authority boundary or recovery procedure forces
multiple false starts because it was not encoded, update the owning semantic
runbook before closing the work. Capture the durable rule and the exact safe
operator command, not the chat transcript that exposed the gap.

Examples include:

- canonical production database identity versus sister/shadow databases;
- the distinction between implementation SHA and generated release SHA;
- status/receipt-first recovery after a lost terminal or transport timeout;
- private metadata plus physical-byte verification for managed uploads.

Generated indexes cannot substitute for this semantic knowledge. Fresh
operator/AI sessions should begin at `docs/OPERATOR_START_HERE.md`.

## Impact policy

Documentation OS distinguishes generated maintenance from semantic review.

- Ordinary application/presentation changes default to generated-registry
  refresh only unless a living contract is intentionally changed.
- Infrastructure, watcher, replay-truth, financial, and database changes are
  surfaced for semantic review.
- A semantic-review signal names ranked candidate documents; it does not invent
  prose, silently edit history, or claim that every candidate must change.
- Generated control-plane files are not counted as semantic coverage.

The first version keeps semantic review observable rather than creating a new
manual acknowledgement ceremony. Release enforcement can become stricter only
when evidence shows that it improves correctness without slowing normal product
work unnecessarily.

## Authority boundaries

Repository-local documentation remains authoritative for subsystem behavior,
implementation contracts, and runbooks near the code.

The sibling `AoE2WAR-docs` repository remains authoritative for cross-system
architecture, governance, ADRs, explicit taxonomy, generated catalog/state, and
the unified documentation portal.

Documentation validation does not prove production deployment. Release and
runtime claims remain separately certified by the release engine.

Context archives are evidence, not semantic documentation. Documentation OS
continues using the protected update engine for context refresh while avoiding a
second independent federation implementation.

## Health states

- `HEALTHY`: local registry/checker, implementation baseline, central registry,
  central taxonomy, central repository-state snapshot, and review windows agree.
- `BASELINE_DUE`: implementation changed after the described baseline.
- `IMPACT_PENDING`: a high-risk implementation change has no semantic-document
  change yet and deserves review.
- `FEDERATION_DUE`: repository-local documentation is valid but the central
  snapshot/taxonomy lags it.
- `ATTENTION`: documentation is structurally valid but a secondary central-state
  proof needs refresh.
- `BLOCKED`: malformed metadata, overdue living review, invalid baseline, or a
  failed governed validation prevents a healthy claim.

## Finish integration

`aoe2war finish` already invokes the protected documentation/update engine
before and after deployment. Documentation OS exposes that lifecycle directly
instead of creating a duplicate write path.

A later release-speed pass may remove redundant work between pre-release and
post-release documentation phases, but only after phase timing proves what can
be skipped or reused safely.

## Non-goals

Documentation OS does not:

- rewrite semantic documents from source diffs;
- treat generated indexes as proof that prose is correct;
- duplicate the central taxonomy inside app-prodn;
- mutate production, databases, Wolo, dependencies, or runtime state;
- make a full documentation audit part of every lightweight status check.
