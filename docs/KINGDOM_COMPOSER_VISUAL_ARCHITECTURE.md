---
id: "aoe2war.app-prodn.kingdom-composer-visual-architecture"
title: "Kingdom Composer & Autonomous Engineering Visuals — Draft Contract"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain","vpssentry"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "visual-workflow-design-not-runtime-or-financial-authorization"
reviewed_at: "2026-10-31"
review_interval_days: 7
sensitivity: "internal"
---

# Kingdom Composer & Autonomous Engineering Visuals — Draft Contract

**User intention (October 31, 2026):** AoE2WAR should make its graphs, feedback loops, agent formations, swarms, engineering organizations and deployment run-up **visually comprehensible and astonishing on the actual website**, with **minimal prose**. Build an expressive, evidence-bound UI for six currently owner-relayed ChatGPT work lanes, growing safely to seven, eight, nine, then larger measured groups up to a ceiling of 1,000 if independent capacity tests support it. No fictional autonomous workers, no imaginary real-time heartbeats, and no browser-to-root/financial endpoints. Production deployment of frozen #1061 is P0. This is P3 and never blocks release, chain integrity or recovery.

## 1. System identity — one new ROLE, not an OS count bump

**System Composer / Kingdom Composer** is a **proposed role or module inside Orchestra OS**, not a new operating system, daemon, signatory, priority authority, or unbounded worker. It translates an approved Central intent into a **versioned, inspectable workflow composition**:
- input: one immutable objective, owner priority/scope, agent capability inventory, dependencies, resource and permission ceilings, required independent review, source/build/host/live evidence requirements;
- output: graph of typed tasks and gates, proposed lane→task allocation, allowed concurrency, predicted critical path as a *simulation only*, budget and fallback plan; unique plan ID and content hash;
- validations: no cyclic blocking dependencies unless explicitly approved bounded loop, no competing file/host write lease, no duplicate probes, anti-replay/idempotent handoffs, unique task ownership, exact source refs, no missing financial/production review, no invented live state;
- dry-run by default; separate reviewed Orchestra executor may dispatch only pre-authorized work. A human owner relays ChatGPT browser-session prompts until an authenticated worker harness actually exists.

**Authority boundaries:** Central Command owns priority and approval → Composer owns *planning/articulation* → Orchestra owns scheduling/dispatch → Agent OS owns bounded single worker execution → Loop Engine owns observe/decide/verify/retry control → Swarm OS owns multi-worker capacity and coordination → Release/Deployment OS own production authorities → Doctor evaluates health → Shepherd supervises policy, escalation and protection. Neither Composer nor Shepherd is an autonomous OS solely by its title.

## 2. Website's visual language — graphics first

Design a visually unified, responsive, fast **Kingdom Engineering Observatory** with at least six separate **interactive, source-bound visual modes**, reusing `/aoe2war-os`, `/kingdom-intelligence`, `/kingdom-agents`, `/admin/central-command`, and `/aoe2war-os/deployment` (Kingdom Run-Up issue #1089); route selection requires collision review, not page cloning.

| Mode | Actual graphic / behavior | What counts as real evidence |
| --- | --- | --- |
| **Neural Graph / Kingdom Constellation** | Animated node-edge dependency constellation; pulse only when there is an actual timestamped event; tap reveals artifact and linked blockers. Cytoscape-like static/source graph or custom SVG/Canvas renderer chosen after performance evaluation. | Pinned source artifact, exact dependency type and provenance; edge created by a cited contract, not association hallucination. |
| **Loops / Engine Cycles** | A circular observe→plan→act→verify→persist track; segments illuminate from genuine receipt events, with bounded loop iterations, backoff, stop and HOLD states; visual throttle instead of constant motion. | Event time, iteration, monotonic attempt ID, state, finite stop condition and last measured heartbeat, if any. |
| **Swarm / Engineering Army** | Six existing owner-relayed agent cards as an identifiable formation with lanes B–G; future 7→9→12→24→100→250→1000 formation uses clustering and zoom levels. Independent rank, lease, review, status and capacity gauges; distinguish proposed workers from live workers. | Assigned ≠ online ≠ independently verified active; live only with authenticated worker heartbeat + source/host witness. 1,000 is architecture ceiling, not current count. |
| **Engineering Organization / Command Hierarchy** | Interactive chain-of-command tree: owner→Central→Composer/Orchestra→teams/agents→independent reviewers→release gates. Dependency/authority edges visually different. | Versioned registry ID, owner, capability/permission and independent approval evidence. |
| **Composer / Workflow Mixing Desk** | An orchestration console with movable lanes and graph edges; visually composes a dry-run plan, forecasts critical path as estimated, shows conflict/risk overlays, exports versioned reviewed plan/prompt packets. Public version is read-only/sanitized; admin planner is draft-only and no direct execution. | Proposed plans always tagged DRAFT/SIMULATION until admitted; no fabricated completion; each node links to PR/task/receipt. |
| **Kingdom Run-Up / Release Engine** | Drilling-rig launch sequence: source→build→isolate→parallel run→route→verify→rollback readiness, separate old/live rail. Status lights, physical-like gauges, proven interlocks and abort/rollback paths. | Exact C/B/E/F/G receipts; C #1084 independently verified real BUILD_STAGED with 87,038 files, Next BUILD_ID `-dJl5VyecHu5BKNvfErJe` and tree SHA256 `5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d` (Central #934 comment 6547581709); 3031 startup and public cutover remain independently unverified at that witness. |

### Extreme visual-first presentation rule

**Minimal prose**: concise stage labels and numerical signals only; spatial hierarchy, iconography, color, topology and state changes communicate at a glance. Details/provenance available in **on-demand drawer/tooltips** and an accessible semantic/table fallback, not walls of text. A useful first screen shows the state in 3 seconds even when no worker is active. *Never suppress required financial-risk / HOLD explanations to achieve minimal text*. Touch/keyboard, accessible contrast and reduced-motion alternatives are mandatory. Desktop 1440/1920, tablet 768, mobile 375 acceptance; avoid huge SVG DOMs at scale—virtualize/aggregate clusters, worker-side preprocessing or server-precomputed bounded projections when justified. GPU/CPU/battery and HEL1 overhead must be measured before enabling motion/polling; no double collector jobs.

Palette: obsidian steel, dim brass/gold, cool cyan for authenticated activity, emerald for verified success, amber HOLD/pending, red failure, **neutral grey UNKNOWN**. Animations should follow event receipts (never simply spin forever). Keep every older page/version alive; introduce additive navigation, not destructive redesign.

### Public vs admin

Public: sanitized anonymous graph/topology, counts only if verified, stage badges, route from existing public AoE2WAR OS, no internal ports/paths/PIDs/secret names/financial liability/OS vulnerabilities. **No public plan submission**.
Admin: source-authorized worker/task IDs, lease and conflict states, protected blockers, exact hashes/build IDs and evidence links, original vs candidate release rails, read-only receipt timeline, proposed Composer plan editor with explicit review gate. No root SSH, systemd management, direct code deployment or financial/custody authority via browser.

### Honest display states

`PROPOSED`, `ASSIGNED`, `SOURCE_VALIDATED`, `CI_PASS`, `HOST_VERIFIED`, `RUNNING_VERIFIED`, `LIVE_VERIFIED`, `HOLD`, `STALE`, `UNKNOWN` (separately typed); don't infer a heartbeat from a draft PR or a colored light. “Armies” and “swarm” are *visual metaphors* for task topology, not a claim that a real army or 1,000 daemons exists.

## 3. Reusable data model, single observation spine

Use `config/aoe2war-os-registry.v1.json` IDs (draft PR #1090), Central issue #984 queue and #934 release ledger, G's PR #1086 hash-chained task receipt ledger, existing private Intelligence/Doctor/Shepherd read models and C/B/E/F/G native receipts. Define **one** versioned projection of `node(id, kind, status, sourceRef, verifiedAt, confidence/evidenceKind, capability, cost)` and `edge(from,to,kind,evidenceRef)`. Never build a second master ledger or each-page pollers. Event-driven with bounded low-frequency cached reads; stale status explicit.

Measured ROI gates: deploy lead time, operator intervention count, duplicate/audit loop avoided, route conflict prevented, latency/memory of visual render, stale feed age, restored bytes and money/chain invariants. If a module creates no distinct capability or measurable operational advantage, keep it a submodule instead of a standalone “OS.”

## 4. Ownership / order

- **P0 B/C/E/F/G:** exact #1061 isolate/build/route/verify; preserve original web PID 2625090, Wolo and rollback. No visual work on their release critical path.
- **P3 D:** integrate **Composer role** in registry #1090, update actual `docs/CENTRAL_SWARM_1000_ENGINEERING_ROADMAP.md` PR #1025, source docs/DocsV2, differentiate Composer/Orchestra/Central/Agent/Doctor/Shepherd, and define typed nodes/edges.
- **P3 G:** after G #1076 live verifier, build additive source-only visual prototype and public/admin read model with tests; reuse #1086 ledger and existing views, source vs host vs live proof; no new agent daemon.
- **P3 Central:** preserve #934 and #984 precedence, relay prompts, never spend a release cycle proving animations instead of real #1061 BUILD_STAGED.

### Acceptance checklist

- [ ] Registered Composer role is proposed, no new phantom OS/verified worker count.
- [ ] Graph, loop, swarm, army, engineering hierarchy, composer and run-up **all have visual prototypes**, each binds to the shared typed node/edge/receipt model; if no evidence, graceful UNKNOWN view.
- [ ] Actual source and CI, admin authorization, public sanitization, keyboard/accessibility and responsive performance tested.
- [ ] Every displayed task/worker connects to a durable source ref or is explicitly PLAN_ONLY.
- [ ] Independent instrumentation proves page refresh and animation do not inflate HEL1 load.
- [ ] The original website source #1061 gets LIVE_VERIFIED separately; this P3 design never blocks that release.

**References:** [Central #934](https://github.com/Emaren/app-prodn/issues/934), [queue #984](https://github.com/Emaren/app-prodn/issues/984), [roadmap #1025](https://github.com/Emaren/app-prodn/pull/1025), [registry #1090](https://github.com/Emaren/app-prodn/pull/1090), [visual Run-Up #1089](https://github.com/Emaren/app-prodn/issues/1089), [Agent Ledger #1086](https://github.com/Emaren/app-prodn/pull/1086).

## 5. Stable visual-role identities and gates

`aoe2war.role.system-composer` is a proposed module of `aoe2war.os.orchestra`, not a new subordinate OS, daemon or deployment signer. Its seven view IDs are `aoe2war.visual.graph`, `aoe2war.visual.loop`, `aoe2war.visual.swarm`, `aoe2war.visual.army`, `aoe2war.visual.hierarchy`, `aoe2war.visual.composer`, and `aoe2war.visual.run-up`. All are design-only until independent UI acceptance; lack of native/live receipt must render UNKNOWN, not animation-driven active.

Plan inputs require a Central-approved immutable objective/source, scoped capabilities, unique owner/leases, acyclic blocking dependencies, budget, conflict/reviewer gates and exact provenance. Output is an immutable dry-run graph, simulated critical path and optional prompt packet—not direct dispatch. Measure avoided duplicate handoffs/collisions, throughput and UI/host cost before promotion. Original 3030/Wolo and frozen #1061 P0 F #1083 remain untouched.
