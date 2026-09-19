---
id: "aoe2war.app-prodn.general-inspections"
title: "AoE2WAR General Inspections"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2war","wolochain","vpssentry"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "inspection-scoring-contract"
reviewed_at: "2026-09-19"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR General Inspections

## Purpose

General Inspections is the public-facing maintenance board for the AoE2WAR operating estate.
It turns existing receipts and live capacity signals into explicit weighted scores instead of
relying on memory, vibes, or a manually maintained green dashboard.

The route is /general-inspections. It is the last entry in the Kingdom dropdown, immediately
after Speed.

## Inspection categories

The first version has seven independent 100-point inspections:

1. Website Speed
2. Documentation
3. Organization & Storage
4. Test & Build Integrity
5. Release & Runtime Integrity
6. Security & Resilience
7. Data / Wolo / Replay Integrity

Each category must total exactly 100 points. The scoring module rejects any category whose
weights do not total 100, and the Node contract tests enforce the category totals.

## Evidence contract

The page is receipt-backed. It does not execute shell commands from the browser and does not
accept user-controlled filesystem paths.

The server snapshot may read only known local evidence surfaces, including:

- Finish and activation receipts;
- release-gate receipts;
- Performance OS cold-LCP and edge receipts;
- Doctor and estate evidence embedded in Finish;
- current VPS root and mounted-volume filesystem statistics;
- the bounded Storage Expiry ledger;
- the canonical Watcher download directory;
- a tracked Mac housekeeping snapshot for facts that production cannot observe directly.

Absolute evidence paths and raw security internals are not returned to the browser.

## Freshness and decay

A passing receipt is not permanently worth full credit.

Checks that depend on operational evidence apply a freshness window. Fresh evidence receives
full credit, then decays through the warning window, and eventually reaches zero when the proof
is too old to support a current claim.

This is deliberate. A system that was healthy last week is not automatically healthy now.

## Status colors

Green means at least 90 percent of the available mark.
Watch means at least 67 percent but less than 90 percent.
Action means below 67 percent.

Test ratios are displayed as numerator and denominator pills whenever the receipt contains a
real count. The page must never manufacture a denominator merely to make a test group look
complete.

## Test provenance

The current local release gate seals the active Node test inventory with an exact file count.
The General Inspections page displays that count directly.

GitHub CI also executes the Python contract suite. Until the GitHub run result is imported into
a local release receipt with an exact per-run denominator, the Python line remains explicitly
identified as remote-CI evidence rather than pretending a local 42/42 result was sealed.

## Organization and storage policy

Organization & Storage measures headroom and housekeeping, not raw byte minimization.

Protected replay evidence, parser evidence, settlement state, financial evidence, and recovery
proof must never lose marks merely because they consume space. Redundant compiled runtimes,
stale staging bodies, duplicate downloadable binaries, and regenerable caches should lose marks
when they exceed the current retention contract.

The score therefore rewards bounded recovery windows and punishes known reclaimable runtime
debt.

## Mac evidence boundary

Production cannot directly inspect the operator Mac. Mac storage and worktree hygiene therefore
use a tracked snapshot with a capture timestamp. That evidence decays until a newer housekeeping
capture replaces it.

This is intentionally weaker than live VPS evidence and makes stale workstation maintenance
visible instead of silently assuming the Mac remains clean forever.

## Fail-closed rules

- Missing evidence means missing credit.
- Stale evidence loses credit.
- A category whose weights do not total 100 is invalid.
- User-controlled paths are forbidden.
- General Inspections is read-only.
- Wolo, databases, settlement, and protected evidence are never mutated by inspection.
- A display score never overrides the underlying Doctor, release, Speed OS, Storage OS, or
  recovery receipt.
