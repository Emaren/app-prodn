---
id: "aoe2war.app-prodn.docs-watcher-166-documentation-baseline-review"
title: "Watcher 1.6.6 — Source-bound Documentation Review Procedure"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "docs-v2-release-control"
reviewed_at: "2026-10-19"
review_interval_days: 30
sensitivity: "internal"
---

# Watcher 1.6.6 — Source-bound Documentation Review Procedure

The DocsV2 implementation-baseline validator correctly refuses code changes that have not been intentionally reconciled with the generated documentation index and registry. Do not delete or bypass this gate, invent a PASS receipt, or point the baseline at an unrelated commit.

The **read-only Watcher DocsV2 Source-Bound Baseline Proposal** GitHub Actions job checks out the exact PR head with full ancestry and uses the canonical repository generator:

`python3 scripts/docs_v2_check.py --write --refresh-baseline --branch <PR_BRANCH> --head <EXACT_SOURCE_SHA>`

It then reruns `python3 scripts/docs_v2_check.py`, checks for whitespace errors, and uploads the exact generated registry, index, catalog metadata, source SHA receipt, SHA-256 inventory and Git patch as an **unapproved review artifact**. This workflow grants only contents:read, does not push commits, and cannot release or deploy.

A reviewer must inspect the generated diff for correct documentation coverage and source ownership, then deliberately apply and commit only the generated documentation files to the same PR. The normal CI documentation control-plane check and separately protected AoE2WAR release-controller PASS remain independent requirements. A proposal artifact being green is not authorization to merge, migrate databases, publish Watcher 1.6.6, or activate betting and custody.
