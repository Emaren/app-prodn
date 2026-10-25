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

## Exact deployed Next.js route census

The read-only `/api/kingdom-route-census` instrument reads the bounded, local `.next/server/app-paths-manifest.json` of the **running deployed build**. It counts unique page templates separately from API handler files. It classifies public static, public dynamic, public utility, authenticated admin and sensitive dynamic invoice surfaces without exposing operator route paths or individual sensitive IDs.

This is a *build output* observation, not a source-branch estimate or a fresh browser speed benchmark. Source-linked Kingdom Index registered-route counts remain separately owned by the existing 70-route candidate catalog. Speed's 78-route old performance cohort stays historical. The manifest reader does not accept request-controlled paths, follows no final symlink, caps input size and entries and caches a read for two minutes. Missing/malformed manifests result in `unavailable` (HTTP 503); no fallback historical count is presented as live.

Node source / runtime roles: `lib/kingdomBuildRouteClassifier.ts` (pure bounded taxonomy), `lib/kingdomBuildRouteCensus.ts` (server-only bounded reader), `app/api/kingdom-route-census/route.ts` (sanitized no-store projection), `tests/kingdom-build-route-census.test.mts` (synthetic parser regression evidence).

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


## 2026-10-25 — Tab B authority and P0/P1 trust-boundary review (draft source, not deployed)

### Actual source / consumer flow

```mermaid
flowchart LR
  A["Operator CLI / deterministic Council (domain collector)"] --> B["OS bridge writeAoe2OsKingdomIntelligence (persisted report)"]
  B --> C["readAoe2OsKingdomIntelligence (captured_at + receivedAt)"]
  D["OS dashboard run ledger (persisted operator actions)"] --> E["loadPublicKingdomIntelligence (sanitizer)"]
  C --> E
  E --> F["inspectIntelligenceHealthEvidence (typed report contract)"]
  F --> E
  E --> G["GET /api/kingdom-intelligence (no-store)"]
  E --> H["/kingdom-intelligence SSR + 20-second visible-only router refresh"]
  G --> I["/workshop secondary Brain projection"]
  J["Git/release/inspection independent authorities"] -. "NOT YET AUTHORIZED AS CERTIFIED SHA INPUT" .-> F
  K["Kingdom Index GET"] --> N["KingdomBrainClient (four bounded GETs)"]
  L["Kingdom Agents + Patrol GETs"] --> N
  M["Deployed route-census GET"] --> N
  N --> O["brainSignalPolicy: freshness / generation fence"]
  P["config/kingdom-brain-authorities.json (policy graph)"] --> Q["/kingdom-brain structural nodes + edges"]
  O --> Q
```

**Source-of-truth classification.** Git commit IDs prove committed source, not the active process. A certified production SHA and BUILD_ID require independent runtime/controller receipts; bridge `source.exact` and `source.certification.status` are assertions by the same report, not independent certification. The bridge's `generated_at` is the collection time; `receivedAt` is the later storage receipt, never a freshness reset. Public Intelligence and Workshop are projections, not collectors. The route census is a deployed build-manifest observation; the Index is a different rubric/route universe. The static Brain registry is policy; it does not prove live edges, running agents, financial availability or health. The browser makes four bounded read-only GETs, then uses purely local per-generation/cached presentation. It must not launch a heavy scan on refresh.

**P0/P1 failure boundary.** Before this draft, `numberValue(health.p0) ?? 0` and `numberValue(health.p1) ?? 0` in `lib/kingdomIntelligencePublic.ts` silently turned missing, null or malformed counters into zero findings. A recent receive envelope could consequently display an apparently clean finding tally even with absent severity observations. The draft replaces this with a pure, separately tested bounded projection that requires BOTH nonnegative safe-integer counters, valid UTC capture and receipt timestamps, a fresh <=15-minute two-clock window (+30-second skew), a full source-reported production SHA, source-exact report and no contradictory P0/source invariant before rendering either count. Otherwise `p0/p1=null`, doctor score/status and estate become UNKNOWN. A measured zero survives when BOTH counters are present and the report is usable.

**Versioned sanitized observation shape (draft V1).** `lib/kingdomIntelligenceEvidence.ts` emits `sourceGitSha`, optional reported `buildId`, `collectorAuthority`, `producer`, `observedAt`, `receivedAt`, `ttlSeconds`, `status`, `evidenceUri`, `limitations` and `unknownReasons`. `SOURCE_REPORTED` is explicitly NOT VERIFIED; no bridge field is allowed to fabricate an authenticated public receipt URI. Future consumers must obtain the independently certified production SHA and BUILD_ID via a source-owned, bounded and separately authorized adapter before claiming cross-domain certified health. A source mismatch is CONTRADICTORY, not an invitation to reconcile by recasting data. No independent attestation has been added by this draft.

### Outstanding architecture actions / HOLD

- **Workshop downstream trust defect:** `lib/workshopBrain.ts` still contains `p0: data.health?.p0 ?? 0` and `p1: data.health?.p1 ?? 0`, so the Workshop's *secondary* summary can turn this API's new nulls back into zero. It is OUTSIDE Tab B's exclusive write allocation. Request central assignment for a separate null-preserving Workshop consumer patch before claiming estate-wide P0/P1 closure.
- **Independent live source verification:** Central inspection/release owners must provide an authenticated, cached, sanitized `certifiedProductionSha` / BUILD_ID (no new public GET heavy scanner). Never treat the bridge's own source flags as its own independent witness.
- **PR coordination:** Existing #805 owns the Intelligence page-local Recovery hook, UI and browser tests; #808 owns Brain polling/client/brainSignalPolicy; #745/#821 own shared Instruments. They are not superseded. Latest-only generation, visibility/resume, timeout and multi-feed classification were already implemented on current main and reviewed in their separate source/browser lanes. Physical browser and actual deployed exact-SHA qualification still require central integration.
- **Certification:** This draft is candidate source only. Verify adapter unit/integration tests, exact-head CI, next-build browser state, release source and specialized Index gates under the campaign; no production promotion or 100/100 follows from this patch.

**Next design recommendation:** Keep the deterministic engine, bridge, sanitized adapter, graph policy and individual browser selectors separate. Prefer one trusted typed envelope per source plus explicit join rules at the consumer; avoid a giant shared Brain God object or one new scanner per public request.


## 2026-10-25 — Round Two: minimal certified source join and downstream Workshop correction (DRAFT)

**Existing independent inputs (read-only):**
- `lib/generalInspections/serverSnapshot.ts` projects the protected Finish/release receipt into `GeneralInspectionsSnapshot.releaseSha` (full 40-hex) and `buildVersion`. These are *separate* from the Intelligence bridge's self-reported `source.exact`, production SHA and claimed certificate status. General Inspections is the independently sourced release comparator already used by `lib/kingdomAgentsPublic.ts`; its snapshot must still pass the release controller's actual certification/freshness evidence, not be promoted solely because a typed field is present.
- `lib/kingdomIntelligenceEvidence.ts` exposes a sanitized bridge observation with full `sourceGitSha`, optional reported `buildId`, 15-minute TTL, capture/receive times and a `SOURCE_REPORTED|UNKNOWN|STALE|CONTRADICTORY` status. `SOURCE_REPORTED` does not mean independently CERTIFIED.
- `lib/kingdomReleaseEvidence.ts` already reconciles the inspection's 40-hex production SHA against the 12-hex Intelligence summary for Agents. Reuse this arbitration contract, do not launch another inspection scan from a public page.
- `lib/kingdomBuildRouteCensus.ts` reads the running Next app-paths manifest and public `NEXT_PUBLIC_AOE2WAR_BUILD_VERSION`. This `buildVersion` is **not automatically the actual Next BUILD_ID** from `.next/BUILD_ID` or a signed release controller's artifact receipt. Never compare unlike fields or self-attest build equivalence.

**Proposed smallest source-bound join (requires central authority owner approval, NOT implemented here):**
1. The existing *server-side* General Inspections/release control aggregator supplies an independently certified production receipt containing validated full `certifiedSourceSha`, **actual** `nextBuildId`, certified artifact/release ID, independently observed runtime timestamp, TTL and receipt status. Reuse/carry its already-materialized snapshot. No second heavyweight filesystem/Doctor/CI scan per GET; no trusting bridge-provided `certification.status` for this purpose.
2. A pure, typed join compares `certifiedSourceSha === intelligence.health.observation.sourceGitSha` using **all 40 hex characters**; validates actual `nextBuildId` against independently observed/receipt-backed running Next BUILD_ID (not just `buildVersion`) and the source's observation time/TTL; rejects missing, future, stale or contradictory evidence as `UNKNOWN`, `STALE` or `SOURCE_MISMATCH`. Never turn an absent certificate into a success. The bridge observation cannot independently validate its own production process.
3. Consumers (`Kingdom Agents`, `Workshop Brain`, and any cross-domain KI health merge) may use `VERIFIED` only when the independent source/build/runtime join passes and **all component observations themselves are usable**. Keep basic source-reported telemetry viewable with explicit `SOURCE_REPORTED` labeling; hide certified health assertions, P0/P1 *clearance*, green agent processes and release badges on mismatches. Existing Index criterion/gates remain with their own scorer owner.
4. The resulting public projection exposes only sanitized receipt reference (if explicitly approved), source ID, build ID, status and limitations—not private Finish paths, signer material, sensitive CLI output or release journal internals. No GET mutation and no financial release/chain action.

**Workshop-only implementation now reviewed separately:** `lib/workshopBrain.ts` and the existing Workshop panel preserve `p0/p1=null` when unavailable, stale, structurally invalid or contradictory, and show `UNKNOWN` rather than literal `null` or numerical zero. A valid *source-reported* measured zero remains zero. Workshop no longer treats the bridge self-asserted `source.exact`, `CERTIFIED` or positive global health as independently proved release success. The three Workshop views share this one SSR projection. This makes the consumer fail closed, but does **not** independently certify production.

**Ownership / continued HOLD:** An authorized central integration owner must implement the shared source/build receipt read-side interface, integrate it with Agents and public health claims (without changing `lib/generalInspections/**` or `lib/kingdomIndex*` in Tab B), regenerate DocsV2 intentionally on exact reviewed integration ancestry, re-run source-bound CI and real Chromium on the final combined candidate, then separately qualify live runtime. These are not implied by a successful standalone Workshop PR.
