---
id: "aoe2war.app-prodn.os-architecture-registry-v1"
title: "AoE2WAR OS — Canonical OS Inventory and Architecture Authority Map (draft v1)"
type: "reference"
status: "draft-source-only-not-deployed"
owner: "central-command"
systems: ["app-prodn","wolochain","vpssentry","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "architecture-census-not-release-or-financial-authorization"
reviewed_at: "2026-10-31"
review_interval_days: 7
sensitivity: "internal"
---

# AoE2WAR OS — Canonical inventory and capability ownership

**Working source of truth (draft):** [`config/aoe2war-os-registry.v1.json`](../config/aoe2war-os-registry.v1.json). This file is the *proposed* normalized architecture inventory on a dedicated review PR, NOT a replacement for existing domain runbooks, not certified production state, and not merged into the live website. D must reconcile aliases, integrate with the actual [Thousand-Engineer roadmap PR #1025](https://github.com/Emaren/app-prodn/pull/1025), maintain DocsV2 registry, obtain review and only then promote a versioned authoritative registry. Neither this draft nor a GitHub issue acts as an activation permit.

## Truth: count by type, NEVER by file names

As of the source snapshot 2026-10-31:

| Scope | Count | Evidence and meaning |
| --- | ---: | --- |
| Public constellation OS nodes | **8** | `lib/kingdomIntelligencePublic.ts` allowlist: Release, Documentation, Storage, Host, Recovery, Workspace, Speed, Replay Truth. Eight source-present public identities; does **not** certify eight autonomous daemons or even eight live workers. |
| System Doctor | **1 role** | Ninth *node* in same allowlist, not an OS. Diagnostic/policy observations, with UNKNOWN states distinguished from active. |
| AoE2WAR OS umbrella | **1** | `/aoe2war-os`, an overarching navigation/source-evidence surface; NEVER a subordinate of itself. |
| Central Command OS | **1 existing OS** | `docs/CENTRAL_COMMAND_OS.md`, `/admin/central-command`, queue authority outside that eight-node public constellation. It is NOT a newly invented OS. |
| Additional planned subordinate identities | **5** | Deployment (#1088 draft), Orchestra, Agent, Swarm, WoloChain. Draft/source/proposal is not live. |
| **Planning target** | **14 subordinate + 1 umbrella = 15 OS names** | **Not a certified universal exact estate count**; more existing named OS contracts need alias/domain review. |
| System Shepherd | **1 supervisory role** | `/kingdom-agents` “Shepherd's Orders” presently an existing UI coordination concept. No independently verified autonomous “Shepherd OS” runtime is inferred. |
| Independently verified running OS workers | **UNKNOWN** | Source/CI/UI labels never imply live systemd processes, heartbeats or active self-improving agents. |

**Why the earlier seven-count was wrong:** `docs/document-registry.json` currently registers seven specifically titled OS documentation files (Central Command, Documentation, Performance, Release Recovery, Renaissance, Replay Truth, Storage). This is **document coverage**, not the constellation or total unique OS count. For example Host, Workspace and Speed are visible UI OS entries, whereas Performance and Renaissance are registered documents; `RELEASE_RECOVERY_OS.md` spans concepts represented by both Release and Recovery nodes. *Never union these sets naively.* Preserve existing documents and decide aliases/authority in explicit reviewed mappings.

## Proposed v1 subordinate map (8 current constellation + 1 existing external + 5 planned)

| ID | OS | Status | Owns / cannot duplicate |
| --- | --- | --- | --- |
| release | Release OS | Existing UI identity | Source/build promotion, controlled release evidence and backend release operations; does not replace Recovery/Deployment. |
| documentation | Documentation OS | Existing | Source docs and semantic/generated registry federation. |
| storage | Storage OS | Existing | Disk, archive, retention, bytes and restore evidence. |
| host | Host OS | Existing UI identity | Host health, service inventory and maintenance boundaries. |
| recovery | Recovery OS | Existing UI identity | Tested bounded repair and rollback procedures; shares existing Release Recovery contract, not a competing executor. |
| workspace | Workspace OS | Existing UI identity | Working-tree/workspace and provenance observations. |
| speed | Speed OS | Existing UI identity | Performance/speed proof; reconcile alias to Performance OS. |
| replay-truth | Replay Truth OS | Existing | Replay winner/provenance/evidence classification; not payout authority. |
| central-command | Central Command OS | Existing private source | Priority, human relay, risk/governance decisions, source/CI/host evidence ledger; no imaginary tab-automation. |
| deployment | Deployment OS | Draft PR #1088 | Scope-aware website/chain release policy, phase admission and evidence orchestration; **Release OS remains execution machinery**. |
| orchestra | Orchestra OS | Proposed | Workflow DAGs, dependency/lease dispatch and handoff adapters; Central remains priority authority, Agent OS executes tasks. |
| agent | Agent OS | Proposed | Bounded single-worker runtime/tool harness, permissions, state, budget and retries; use current #1086 ledger. |
| swarm | Swarm OS | Proposed | Authenticated multi-agent coordination, independent review, concurrency and gradual evidence-gated scale; use #1025. |
| wolochain | WoloChain OS | Proposed | Chain/RPC/consensus/indexer/bridge health and historical-mainnet reconciliation; NO new unapproved money/settlement signers. |

Renaissance OS, Performance OS, Code Health OS, Council OS, Loop/Graph engines and other named capabilities are in the machine-readable `unreconciled_named_capabilities` section. They are **not deleted or assumed identical**. D must decide whether each is a distinct domain OS, existing alias or cross-cutting submodule. Therefore the final target may exceed 15: the goal is accurate ontology, not a pleasing number.

## Kingdom Composer and six living visual systems (proposed P3)

The owner has proposed **Kingdom Composer / System Composer** as a workflow-composition **role**, not a new subordinate OS or a third release authority. Its home is Orchestra OS: convert Central-approved priorities into typed, reviewed dependency graphs, resource-aware lane placements, collision checks and immutable plan receipts. Central decides *why/what/priority*; Composer composes *how the tasks connect*; Orchestra schedules *when/by whom*; Agent OS executes individual bounded work; Swarm OS coordinates authenticated multi-worker groups. Doctor evaluates; Shepherd supervises policy and escalation. The three supervisory/composition roles (Doctor, Shepherd and proposed Composer) remain **outside the 15-name OS planning count**.

**Required visual surfaces:** neural dependency graphs, feedback loops/engine cycles, authenticated swarm formations and “engineering armies,” organization command maps, Composer workflow mixing desk and rig-style Kingdom Run-Up. These must be rich interactive diagrams using real receipts and terse labels, not prose-dominated pages. See [`docs/KINGDOM_COMPOSER_VISUAL_ARCHITECTURE.md`](KINGDOM_COMPOSER_VISUAL_ARCHITECTURE.md) for routes, ownership, provenance, public/admin separation, responsive/reduced-motion targets, resource budgets and fail-closed UNKNOWN/STALE rules. D/G own source and UI deliverables *after P0*; no new daemon, polling source or fabricated active agent identity.

## Hierarchy: capability, not a decorative staircase

`Documentation → executable scripts → scheduled/event-driven services → bounded agents → feedback loops → dependency/provenance graphs → multi-agent swarms`

- **Script** = deterministic, inspectable action; **timer** = a wakeup trigger, not inherently intelligence.
- **Agent** = a tool-governed decision/execution lifecycle with local state, scoped permission and independent receipts.
- **Loop** = a repeated **observe → plan → act → check → retain/evaluate → continue/stop** control pattern. Some loops are supervised; uncontrolled loops are not autonomy.
- **Graph** = a causal/dependency/source/permission/data lineage model spanning all lower levels, not a superior OS or simple graph UI. Graph engine becomes its own OS only if it actually owns unique operational contracts.
- **Swarm** = many bounded agents with orchestration, leases, work accounting, independent reviews, cost/resource caps, priority, fault containment, escalation and truthful progress. Six browser tabs currently means six owner-relayed allocations, not six unattended running workers.
- **System Doctor** evaluates diagnosis/health; **System Shepherd** coordinates policy/human priority; both consume the same receipt and OS ownership registry rather than becoming shadow authorities.
- **Kingdom Run-Up** (#1089) projects real release phases to public-safe read-only and admin evidence UI. It never hosts production SSH/signers or activates deployment directly.

## Formal truth files and governance

**Architecture index:** this document and `config/aoe2war-os-registry.v1.json` (draft).  
**Domain canonical contracts:** `docs/CENTRAL_COMMAND_OS.md`, `docs/RELEASE_RECOVERY_OS.md`, `docs/DOCUMENTATION_OS.md`, `docs/STORAGE_OS.md`, `docs/PERFORMANCE_OS.md`, `docs/RENAISSANCE_OS.md`, `docs/REPLAY_TRUTH_OS.md`, existing Host/Workspace and chain/replay repositories. They remain separately authoritative for their behavior.
**Long-range engineering roadmap:** `docs/CENTRAL_SWARM_1000_ENGINEERING_ROADMAP.md` in draft PR #1025, implementation issue #1026. D owns edits to the actual roadmap—not only comments.
**Standing priority queue:** Central #984. **Production deployment receipts:** Central #934, F #1083, C #1084, B #1085, E #1087, G #1076; receipts must be current and source/host/public identity aligned. **Visual concept:** #1089.
**History:** Git commits, SHA256 artifacts, immutable evidence receipts, typed decision journal and change log. A future registry must expose stable IDs, aliases, domains, owner, source and UI routes, maturity/source/CI/physical/live status, cost, dependencies, and approved capabilities.

## Immediate release noninterference — P0

Exact candidate `0cee3c836c4b0760478280c145e02e81e470ce0e` source verified/extracted physically on HEL1, root archive SHA256 `c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101`. **Do not equate this with BUILD_STAGED, CANDIDATE_RUNNING, PUBLIC_ROUTED or LIVE_VERIFIED.** Owner C #1084 consent attempt failed before SSH because the typed phrase was incomplete; a full exact printed phrase is required for the first actual C build. B #1085 poststart witness returned HOLD because its guard isn't installed yet; do not rerun or invent isolation.

Original production `aoe2hdbets-web.service` MainPID 2625090 on port 3030 may host a settlement-capable WarGraph worker; **never stop/restart it for website-only deployment**. F #1083 must cut over public Nginx only after C source/build, B actual enforced isolated candidate on 3031, E measured rollback and G independent observation. No RSA detour, fabricated signer, unapproved financial network/database access, data deletion or in-place replacement.

**Hard precedence:** P0 ship website; P1 genuine Wolo settlement/mainnet/blockers by isolated finance authority; P2 standing queue; P3 OS ontology/visual orchestration. All P3 changes additive and cannot block P0.
