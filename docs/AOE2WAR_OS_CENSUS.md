---
id: "aoe2war.app-prodn.os-architecture-registry-v1"
title: "AoE2WAR OS — Canonical inventory and capability ownership"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain","vpssentry","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "architecture-census-not-release-or-financial-authorization"
reviewed_at: "2026-10-31"
review_interval_days: 7
sensitivity: "internal"
---

# AoE2WAR OS — Canonical inventory and capability ownership

**Reconciled source registry (PR #1025; not live state):** [`config/aoe2war-os-registry.v1.json`](../config/aoe2war-os-registry.v1.json). This file is the *proposed* normalized architecture inventory on a dedicated review PR, NOT a replacement for existing domain runbooks, not certified production state, and not merged into the live website. D's source audit in PR #1025 reconciles the aliases and appends the immutable taxonomy/value gates, but still requires exact-head CI, DocsV2 validation, review and eventual merge before becoming a certified authoritative registry. Neither this draft nor a GitHub issue acts as an activation permit.

## Truth: count by type, NEVER by file names

As of the source snapshot 2026-10-31:

| Scope | Count | Evidence and meaning |
| --- | ---: | --- |
| Public constellation OS nodes | **8** | `lib/kingdomIntelligencePublic.ts` allowlist: Release, Documentation, Storage, Host, Recovery, Workspace, Speed, Replay Truth. Eight source-present public identities; does **not** certify eight autonomous daemons or even eight live workers. |
| System Doctor | **1 role** | Ninth *node* in same allowlist, not an OS. Diagnostic/policy observations, with UNKNOWN states distinguished from active. |
| AoE2WAR OS umbrella | **1** | `/aoe2war-os`, an overarching navigation/source-evidence surface; NEVER a subordinate of itself. |
| Central Command OS | **1 existing OS** | `docs/CENTRAL_COMMAND_OS.md`, `/admin/central-command`, queue authority outside that eight-node public constellation. It is NOT a newly invented OS. |
| Additional existing source-implemented identity | **1** | Code Health OS source scanner and receipt writer (not a public constellation card and no autonomous-worker proof). |
| Additional draft/proposed subordinate identities | **5** | Deployment (#1088 draft), Orchestra, Agent, Swarm, WoloChain. Draft/source/proposal is not live. |
| **Reconciled planning roster** | **15 subordinate + 1 umbrella = 16 named OS identities** | Source/evidence taxonomy, **not** a certified live-estate or daemon count. Source-present subordinates: 10; proposed/draft: 5. |
| System Shepherd | **1 supervisory role** | `/kingdom-agents` “Shepherd's Orders” presently an existing UI coordination concept. No independently verified autonomous “Shepherd OS” runtime is inferred. |
| Independently verified running OS workers | **UNKNOWN** | Source/CI/UI labels never imply live systemd processes, heartbeats or active self-improving agents. |

**Why the earlier seven-count was wrong:** `docs/document-registry.json` currently registers seven specifically titled OS documentation files (Central Command, Documentation, Performance, Release Recovery, Renaissance, Replay Truth, Storage). This is **document coverage**, not the constellation or total unique OS count. For example Host, Workspace and Speed are visible UI OS entries, whereas Performance and Renaissance are registered documents; `RELEASE_RECOVERY_OS.md` spans concepts represented by both Release and Recovery nodes. *Never union these sets naively.* Preserve existing documents and decide aliases/authority in explicit reviewed mappings.

## Reconciled v1 subordinate map (8 constellation + Central + Code Health + 5 planned)

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
| code-health | Code Health OS | Existing source-only | Dedicated scripts/aoe2_code_health.py scanner writes source inventory and hashed receipts; not an autonomous daemon or Central decision authority. |

**Alias verdicts, supported by source:** Performance OS's documented Speed OS V2/V3 collectors and receipts make Performance a documentation/operating-name alias of the constellation Speed OS, not an extra independent owner. Renaissance OS explicitly declares itself a read-only multi-domain integration overlay, not a new operating authority; preserve its own document ID and campaign/qualification code but do not count it twice. Code Health OS owns a distinct executable source scanner and receipt directory and therefore earns one additional **source-present** subordinate identity, separate from Central's governance. Council is a composite diagnostic reader of Doctor/Host/Release evidence rather than a new authority; Loop Engine and Graph are cross-cutting primitives without independently proven OS contracts. Nothing here erases the named capability.


## Composer: reconciled role, not a sixteenth subordinate OS

The **System Composer / Kingdom Composer** identity is `aoe2war.role.system-composer`: a proposed dry-run planning **role under Orchestra OS** `aoe2war.os.orchestra`. System Doctor and System Shepherd remain distinct non-OS roles, so the role count is **3**. Subordinate identities remain **15**, plus the AoE2WAR umbrella **1**; verified independent live workers remain UNKNOWN. Central-approved priority → Composer plan graph → reviewed Orchestra scheduling → bounded Agents/Swarm; Doctor diagnoses, Shepherd escalates, Release executes and additive Deployment #1088 admits scope. No new execution/finance authority. Source: Central [#1090](https://github.com/Emaren/app-prodn/pull/1090) head `8b275229c16f67dc65f9d3bd4b500faf11aa72a0`, [visual architecture](KINGDOM_COMPOSER_VISUAL_ARCHITECTURE.md).

Seven versioned view identities (graph, loop, swarm, army, hierarchy, composer, run-up) map to typed evidence nodes/edges in the machine registry. They render unknown when source/native/live truth is absent. Public is sanitized/read-only and visually immersive; private plan editor stays simulation-only. No duplicate pollers, counterfeit telemetry, runtime worker claims or P3 impediment to F #1083 P0.

## Immutable authority IDs, distinct truth states, and classification

**Canonical immutable runtime-catalog IDs:** `aoe2war.os.release`, `aoe2war.os.documentation`, `aoe2war.os.storage`, `aoe2war.os.host`, `aoe2war.os.recovery`, `aoe2war.os.workspace`, `aoe2war.os.speed`, `aoe2war.os.replay-truth`, `aoe2war.os.central-command`, `aoe2war.os.code-health`, `aoe2war.os.deployment`, `aoe2war.os.orchestra`, `aoe2war.os.agent`, `aoe2war.os.swarm`, `aoe2war.os.wolochain`. The umbrella has distinct `aoe2war.os.umbrella`. Diagnostic roles use `aoe2war.role.system-doctor` and `aoe2war.role.system-shepherd`. These IDs are additive namespace bindings to existing registry short keys; original documentation front-matter IDs, source paths, existing routes and receipt identifiers **are never rewritten**.

Each registry entry has `authority_domain`, `source_authorities`, `aliases`, `lifecycle`, `value_gate`, `native_runtime_proof` and `live_deployment_proof`. Lifecycle distinguishes **source-present** from **draft-unmerged/proposed**. Native and public live states remain **UNVERIFIED**, not "inactive", "healthy", or a fabricated worker zero. Existing source code does not prove an autonomous worker. System Doctor is a diagnostic role, System Shepherd a coordination role; neither gets an invented daemon, OS count or financial authority.

**Independent operating authority is not granted by the catalog.** Release OS retains existing `bin/aoe2war` and `scripts/aoe2_release*.py` deployment and certified rollback. Deployment OS #1088 offers additive website-only source-policy decisions, but cannot activate production or inherit Wolo signers. Central Command OS retains owner priority/human dispatch; Orchestra proposes DAG/lease orchestration, Agent defines bounded workers, Swarm governs verified concurrent review, and the AoE2WAR umbrella only presents truthful cross-domain evidence. Wolo custody/consensus execution has separate financial authorization. Cross-domain provenance edges are not root production privileges.

### Agent → loop → graph → swarm value ladder

An **agent** is a bounded, authenticated task/permission/budget/receipt actor, not a browser tab. A **loop** repeats observable plan/execute/evaluate/stop transitions with bounded costs and explicit stop conditions; it is not automatically another OS. A **graph** links source, dependency, permission and receipt lineage across existing domain owners, without stealing their authorities. A **swarm** coordinates multiple authenticated, independently reviewable agents under real lease fencing and measured throughput; allocated human-relayed sessions, independently observed active workers and certified capacity are **three distinct metrics**. Current six lanes prove allocation only.

**Value gates:** every OS must connect a unique source owner and documented permission to evidence of real product value—exact deployed source/runtime/Next BUILD_ID and reversible cutover for Release/Deployment; written and restored bytes for Storage/Recovery; CI and bounded docs registry for Documentation; bounded native state for Host; SHA/receipt-backed source-quality findings for Code Health; production performance cohorts for Speed; replay/result origin for Replay Truth; independently reviewed priority and lease outcomes for Central/Orchestra/Agent/Swarm. Numeric unknowns remain null, not invented. Only an explicitly reviewed version may gain new execution permissions.

### P0 invariant and update policy

F [#1083](https://github.com/Emaren/app-prodn/pull/1083) must keep old service 3030 PID and any WarGraph work untouched while reviewing isolated exact #1061 on separate 3031, then change only an approved Nginx route with immediate rollback. B enforces actual SELECT-only nonfinancial isolation; C proves staged build; E authenticates capacity and rollback; G independently verifies public/internal live runtime. This P3 census **may never delay P0**, change #1088, issue an owner consent token, introduce a new signer, or imply production activation. Review taxonomy after source merger or major domain-ownership change, not on public GET.

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
