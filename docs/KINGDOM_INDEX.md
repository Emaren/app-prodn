---
id: "aoe2war.app-prodn.kingdom-index"
title: "Kingdom Index Public Engineering Atlas"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2war","kingdom-intelligence"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "public-engineering-evidence-contract"
reviewed_at: "2026-10-18"
review_interval_days: 30
sensitivity: "internal"
---

# Kingdom Index

The public `/kingdom-index` atlas lists all nonprivate static App Router destinations, grouped into five districts. The spatial map is the default, with a switch to ledger rows and genuine historical sparklines. No page layout except the shared navigation is changed.

The score axis is **engineering readiness**, not design quality, aesthetics, popularity, SEO, or a raw PageSpeed score. It is intentionally independent of General Inspections, Doctor, and the release-controller certification.

## Source and scoring

`config/kingdom-index-routes.json` is an explicit public route census. `scripts/kingdom_index_source_audit.mjs --check` checks current committed route existence and SHA-based route-local fingerprint; `--write` updates fingerprints after an intentional source revision. This is **route-local evidence**, not complete transitive dependency tracking. The existing 25-page `PAGE_CHANGE_MANIFEST` retains precedence where available.

`config/kingdom-index-baseline.json` currently contains a single **provisional** leaderboard source-review mark (64/100). It must not be presented as a certified live measurement. No other page receives a guessed score.

The optional `KINGDOM_INDEX_EVIDENCE_PATH` is an operator-owned, **read-only** sanitized evidence JSON file outside the application deployment. Its `{schema:1,observations:[...]}` rows must have exact `href`, `sourceVersion`, numeric integer `score` 0–100, `checkedAt` ISO timestamp, `kind` and optional `history` records. Only exact registered routes can be published. The public GET route never accepts browser input and never writes.

A score with mismatched source version is marked DRIFTED. Evidence older than 30 days is marked STALE. Missing scores, history, load-time or payload numbers remain absent; sparklines require at least two actual readings. A score can only be displayed as current when source identity, freshness, and authority agree.

## Pending (not silently claimed)

- Independently reviewed grading rubric and machine-checkable receipts for each 100-point dimension.
- Secure operator bridge production publication/rotation of the sanitized evidence JSON.
- Verified performance, source dependency graph and browser probes per route.
- Agent daily score refresh and release-aligned drift assessment.
- Cold/warm production testing, contrast/reduced-motion UX inspection and protected Finish.

The scheduled GitHub workflow performs daily **source-census inspection only**. It neither certifies pages nor writes production data. It is not equivalent to a full agent-run engineering audit.
