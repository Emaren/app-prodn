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
reviewed_at: "2026-09-22"
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

Production uses a two-plane evidence contract:

1. **Durable VPS authority.** The active release identity, gate result, candidate build version,
   and certification are read from the newest fully certified activation receipt on the mounted
   AoE2WAR volume. This receipt is authoritative even if the operator bridge is briefly behind
   immediately after deployment.
2. **Sanitized Kingdom Intelligence bridge.** The Mac operator plane publishes a compact
   `kingdom-intelligence.json` state file to the VPS. Council and Brain reduce Doctor, audit,
   workspace, documentation, SpeedOS, recovery, host, Wolo, replay, and storage observations to
   safe counts, statuses, booleans, timings, and source SHAs before they cross the bridge.

The production scorer may additionally read only bounded VPS-local surfaces whose state is not
owned by the Mac bridge: current filesystem statistics, the sealed Storage Expiry ledger, the
canonical Watcher download directory, and durable deployment receipts.

Source authority distinguishes **exact source identity** from **implementation-equivalent
identity**. A certified production commit may remain current when the canonical local/GitHub
head is a proven documentation-only descendant of the repository's implementation baseline and
the certified production commit lies on that same baseline-to-head lineage. This prevents a
documentation refresh from manufacturing release debt while still requiring a real deployment
whenever implementation authority advances.

Local development has a direct-receipt fallback that reads the developer checkout's
`.aoe2war-release` evidence. Production must not depend on that Mac-only tree existing on the
server.

Absolute Mac paths, raw Doctor payloads, Cloudflare ray identifiers, avatar URL allowlists,
secret material, and raw security internals are not returned to the browser.

## Watcher release authority

Watcher release identity is not copied into the General Inspections baseline. The scorer imports
`WATCHER_RELEASE.version` and `WATCHER_RELEASE.previousVersion` from the canonical app release
contract. `sync-watcher-release.mjs` rotates the old current version into `previousVersion` when
a newly certified Watcher is synchronized. This keeps download-generation hygiene and the
Data / Wolo / Replay Watcher check bound to the release users can actually download instead of
a manually maintained inspection snapshot.

The tracked baseline remains authority only for slow-changing inspection policy such as storage
headroom targets and rollback-window counts; it must not duplicate mutable product release IDs.

## Speed evidence bridge

Brain publishes only a compact SpeedOS summary. Cold-browser evidence contains sample count,
p50/p75/p95/max timing metrics, LCP-target stability count, and the three mutation booleans.
Edge evidence contains only `passed/total` counts for static HTML, dynamic HTML, and Featured
Avatar delivery plus the release SHA, timestamp, and overall verification state.

If either Speed proof belongs to the previous production release, the performance category
visibly loses current-release credit and emits a note. Deploying a new release therefore cannot
inherit a permanent green speed mark from an older release.

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

The release gate seals both executable test inventories into the durable gate receipt. Node
coverage comes from `scripts/run_test_contract.py`; Python coverage comes from
`scripts/run_python_contract.py`, which discovers every tracked `tests/test_*.py` contract
before running the complete unittest suite.

General Inspections parses those exact receipts instead of carrying a hand-maintained Python
file count or awarding partial credit for an unsealed remote run. The validator command return
code is the pass/fail authority; parsed file counts are display/provenance detail when the bounded
receipt tail still contains the runner's opening count banner. A successful required validator
therefore remains proven when only that banner has rotated out of the bounded tail, while a
missing or nonzero command still fails closed. New gate receipts also seal
`required_commands`, the exact validator set selected by the governed release scope. A
validator that the gate explicitly declares out of scope is displayed as **Not required by
certified gate scope** rather than being misreported as a failure. A validator that is required
but missing or failed still loses its full credit fail-closed. Legacy receipts without an
explicit required-command set retain the conservative missing-evidence behavior. GitHub CI
invokes the same Python runner so local release proof and remote CI cannot silently drift onto
different test inventories.

## Organization and storage policy

Organization & Storage measures headroom and housekeeping, not raw byte minimization.

Protected replay evidence, parser evidence, settlement state, financial evidence, and recovery
proof must never lose marks merely because they consume space. Redundant compiled runtimes,
stale staging bodies, duplicate downloadable binaries, and regenerable caches should lose marks
when they exceed the current retention contract.

The score therefore rewards bounded recovery windows and punishes known reclaimable runtime
debt.

A staging pathname alone is not debt. A Wolo recovery stage that is exactly referenced by a
current VERIFIED Recovery OS receipt is protected evidence and is excluded from scratch/staging
debt. Unreferenced recovery stages and generic release scratch remain visible and lose marks.
Watcher release staging is a separate authority domain: raw directory presence is excluded from
generic staging debt because `aoe2war watcher-staging` must first prove whether the bytes are
reclaimable exact duplicates or protected unique evidence. General Inspections never converts
Watcher directory age or entry count into deletion authority.

Host patch scoring follows the same authority boundary: actionable upgrades reduce the score;
Ubuntu-phased deferrals remain visible but do not. General Inspections must consume Host OS
classification rather than reinterpreting the raw package count.

## Mac evidence boundary

Production cannot directly inspect the operator Mac. Current Mac headroom and workspace hygiene
therefore arrive through the sanitized Kingdom Intelligence bridge and inherit the bridge
capture timestamp. Preserved dirty or unmerged non-agent worktrees remain visible, but they do
not reduce the hygiene score when Workspace OS classifies them for review and reports zero
cleanup candidates plus zero canonical drift. Actionable cleanup debt and canonical drift are
the scoring authority; preserved unique work is evidence, not garbage.

The tracked baseline file remains only as a local-development fallback. It must not claim a
clean canonical workspace when Workspace OS reports cleanup candidates or canonical drift.

This evidence is intentionally weaker than live VPS filesystem evidence: if the operator bridge
ages out, its contribution decays instead of silently assuming the Mac remains healthy forever.

## Fail-closed rules

- Missing evidence means missing credit.
- Stale evidence loses credit.
- A category whose weights do not total 100 is invalid.
- User-controlled paths are forbidden.
- General Inspections is read-only.
- Wolo, databases, settlement, and protected evidence are never mutated by inspection.
- A display score never overrides the underlying Doctor, release, Speed OS, Storage OS, or
  recovery receipt.
