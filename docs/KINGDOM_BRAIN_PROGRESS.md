---
id: "aoe2war.app-prodn.kingdom-brain-progress"
title: "Kingdom Brain, Progress and Patrol Contract"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain","vpssentry"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "cross-surface-integration-contract"
reviewed_at: "2026-10-19"
review_interval_days: 30
sensitivity: "internal"
---

# Kingdom Brain, Progress and Patrol Contract

## Authority, never duplication

- **Kingdom Intelligence** (`docs/KINGDOM_INTELLIGENCE.md`) remains the deterministic operational Brain. It owns state collection and operator recommendations.
- **Kingdom Brain** (`/kingdom-brain`) is an interactive, visual *authority and dependency atlas*. Its versioned structural registry is `config/kingdom-brain-authorities.json`. It never claims a declared ownership edge is a fresh healthy process.
- **Kingdom Progress** (`/kingdom-progress`) is an evidence-first visual campaign register. `config/kingdom-progress-projects.json` lists project scopes and possible milestones, but none is accepted as complete without separate authenticated and exact-source completion evidence.
- **Kingdom Agents** continues to project real General Inspections watchposts and Kingdom Intelligence system signals. `config/kingdom-patrol-disciplines.json` declares eight diagnostic disciplines; `lib/kingdomPatrolCoverage.ts` computes assignment policies for registered Kingdom Index pages. Policy-only rows are not active agent processes, scans or quality certificates.
- **Kingdom Index** retains the existing 30/25/20/15/10 rubric, specialist gates, historical score lineage, and current-evidence rules. This change does not modify that rubric.
- **SpeedOS** retains its separate source-template inventory and dated benchmark representatives. Historical 78 measured URLs, 68 baseline Index public routes and historical 110 total page entry points are different sets, not conflicting measurements of one variable.

## Public read-only contract

- `/kingdom-brain` reads only `/api/kingdom-index`, `/api/kingdom-agents`, and `/api/kingdom-patrol`. It must distinguish policy coverage, source-dated signals, and independently verified operational health.
- `/kingdom-progress` reads existing sanitized `/api/kingdom-intelligence` only to show source observation recency. No project completion percentage, AI hours, commits, deployment status or milestone acceptance is inferred from that source. A future authenticated progress-evidence adapter is separately required.
- Both pages use bounded foreground-only polling and network deadlines, no new background collection workers, no financial mutations, no unrestricted logs and no authority to certify or release anything.
- A future route-wide census must count file templates (public, private utility, sensitive dynamic, admin), distinct benchmark URLs and API handlers separately, all generated from source and versioned build proofs.
- No existing page's visual design is changed by these new pages. The new views are high-density, visual-first instruments; descriptions exist for accessibility and direct authority drilldowns rather than explanatory prose walls.

## Before anyone assigns 100/100

Release-build dependency closure, criterion-level independent evidence, current production browser checks and current-source certification are required. A route-local Git blob fingerprint cannot account for every shared import. New routes begin unmeasured until existing auditors prove otherwise.

## Progressive rollout

1. Integrate the source registries, new visual surfaces and pure policy-only patrol coverage under CI on a draft PR.
2. Audit live production/source counts with `./bin/aoe2war speed inventory`, reconcile with the existing protected Index census.
3. Attach real receipts for route-level source checks, deployments, security, browser performance, sensor status, and agent inspections. Avoid duplicate heavy file scans on public GETs.
4. Add a separate evidence-backed project-milestone adapter; only then may progress pills fill automatically.
5. Evaluate future `/kingdom-recovery`, `/kingdom-sensors`, `/kingdom-tests`, `/kingdom-systems`, and Replay Laboratory against existing AoE2WAR OS, General Inspections, VPSSentry, Kingdom Intelligence, and Parser Observatory. New pages require unique evidence authority and useful visual contracts; do not invent thin aliases.
6. Keep the War Satchel/Auto Bets financial worktree and WoloChain HOLD untouched; build/deploy these visual routes through ordinary protected app controller only.

## Operations and incident memory

Telemetry/event logs should become summarized, rate-limited, retained diagnostic **receipts** with explicit data owner, correlation identifier, source SHA, timestamp, severity, remediation and closure evidence. A recurring agent reads bounded new evidence and known unresolved failures, not raw ever-growing unfiltered logs. Secrets, PII, transactions and signing material are never copied into a public-facing dashboard. Alerts and known fixes should remain linked to the original underlying authority and reopen if the same objectively proven regression returns.
