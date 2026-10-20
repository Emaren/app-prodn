---
id: "aoe2war.app-prodn.transparent-machinery-instruments"
title: "Transparent Kingdom Machine Instruments"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "visual-only-read-side-projection-contract"
reviewed_at: "2026-10-19"
review_interval_days: 30
sensitivity: "internal"
---

# Transparent Kingdom Machine Instruments

Six new visual-first source-bound instrumentation **pages**, not six new authorities. Source: `components/kingdom-instruments/KingdomInstruments.tsx` and its distinct per-view CSS. All six are publicly navigable and registered in the Kingdom Index and Speed OS public template cohort. They reuse existing read-only API projections, use no-store requests with bounded timeouts, poll at most once per 90 seconds when visible and distinguish unavailable from zero.

| Page | Authoritative readers | Unique visual projection |
| --- | --- | --- |
| `/kingdom-sensors` | `/api/general-inspections`, `/api/kingdom-intelligence` | Instrument rack: actual category checks, doctor/storage/speed evidence |
| `/kingdom-tests` | `/api/general-inspections`, `/api/kingdom-index` | Weighted proof lanes, criterion counts and registered source reviews |
| `/kingdom-recovery` | `/api/kingdom-intelligence`, `/api/general-inspections` | Restorability vault; off-host recovery and release-invariant truth; no fabricated successful restores |
| `/kingdom-systems` | `/api/kingdom-route-census`, `/api/kingdom-patrol`, `/api/kingdom-intelligence` | Machine racks; exact deployed build route classes, API count and policy-only patrol coverage |
| `/replay-laboratory` | `/api/hd-replay-engine` | Unknown-result frontier; parser failure categories, unresolved logical battle receipts. Does not duplicate the upload parser or forge a winner |
| `/wolo-machine` | `/api/wolo/status`, `/api/kingdom-intelligence`, `config/wolo-machine-capabilities.json` | Wolo-1 consensus core, module source topology, HD financial provenance circuit and explicit release HOLD visibility |

## HD is the product scope; DE is an external stub

`/wolo-machine` is the dedicated **HD-first internal blockchain machinery view**, not an alias for `/wolo-1` (existing redirect), `/wolochain` (public explainer), `/wolo` (currency) or Valopers (explorer). The source topology maps bank/staking/governance/consensus/IBC plus separately authorized settlement and custody roles. These are **DECLARED** modules/relationships, not a claim that each module is healthy, deployed or verified.

DE appears **only as an inert explicitly severed external-consumer stub**, without DE API polling, DE repository writes, DE transaction paths, cross-service source ownership or DE execution authority. A future DE integration must have a separate producer authority and cannot silently change the HD certification rubric.

**Important financial safety:** a live WoloChain block height and active 8092/8093 service are not custody certification, an approved binary hash, solvency, a reconciled settlement, or permission to activate War Satchel. The current live WoloChain provenance mismatch cannot be independently proven from existing *public* read-side APIs. The Wolo Machine therefore displays financial release as **UNVERIFIED** until a separately approved redacted financial attestation feed exists. It uses existing current-source and P1 evidence from Kingdom Intelligence, but never calls those generic app observations proof of the chain settlement's implementation baseline.

The existing application `finish` release controller remains authoritative and may refuse deploy when WoloChain source provenance conflicts with its financial implementation baseline. **Do not remove DE from shared financial safety proofs or falsify the Wolo baseline to ship HD pages**; any scoped HD-only release must establish a separate signed/independently reviewed authority that accounts for shared money moving boundaries.

## Visual UX requirements

Each page is a machine-like instrument: tactile obsidian/metal, radial optics, glass tubing, brass/steel frames, huge numeric readings, precise provenance chips, subtle motion only if supported by user preferences. No generic white-text dashboards; no essay walls. Labels exist to protect accuracy, assist keyboard/screen-reader users and expose source names. Existing pages retain their visual appearance.

## Next evidence gates

- Strict source checks and source-version fingerprints must pass full TypeScript, Next build, Node contracts, security and documentation checks.
- Browser verification is required at desktop/mobile and keyboard/reduced-motion settings before public visuals can be called production-certified.
- Existing Kingdom Brain/Index/Agents remain primary truth/patrol/quality owners. Per-route sourceTree fingerprints cover only route-local files today; shared component transitive closure remains a future source-dependency certification task.
- Recovery counts cannot imply backups were restored unless the existing source exposes independently tested restore proof. Replay counts are drawn from canonical HD replay provenance, with unknown results remaining unknown.
- No sensors/agents/AI-hours, tests or release progress may be invented. Missing evidence is displayed as UNKNOWN.
- These pages are a visual read-side release, not Satchel custody activation. Protected post-merge CI and `./bin/aoe2war finish` remain separate operations and must not bypass a Wolo financial HOLD.
