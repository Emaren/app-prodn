---
id: "aoe2war.app-prodn.session-b-mainline-app-branch-ledger-20261111"
title: "Session B canonical-main and App branch/PR reconciliation ledger, November 11 2026"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "read-only mainline/PR/branch source census; no merge, branch deletion, financial or production install authority"
reviewed_at: "2026-11-11"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B canonical-main and App branch/PR reconciliation ledger, November 11 2026

**Read-only analysis of App refs, not permission to merge, delete, deploy, alter A's financial domain, or operate HEL1.** The associated machine-readable ledger is at [SESSION_B_APP_BRANCH_PR_LEDGER_20261111.json](evidence/SESSION_B_APP_BRANCH_PR_LEDGER_20261111.json) and records all exact SHAs plus 107 per-commit source effects.

## Verified reconciliation of canonical main

- GitHub origin/main at snapshot: `3933f695ec48d4e2cab68e93194b745fab2e4b7d`; original B PR #1331 accepted head: `78d851062eb88a1886e833c68da5331087ce4879`.
- Exact common ancestor: `b1ef050b954be734c9f34147361e0d02d7c89b19`. Divergence: **45 main-only / 62 B-only** commits. The old R25 history is common ancestry, **not** a second train to cherry-pick.
- Same original B integration worktree made a true two-parent source merge: `51bcb00bfd71eedac481501da72fcd7854be4f82`, Git tree `c68318ee0e701d6943e3ec1775a432fd78706409`. Verified first parent = original B, second parent = actual canonical main. Neither main nor the older B branch was reset.
- Native Git auto-merged source files, including Kingdom index route metadata. The **only** textual conflicts were generated DocsV2 files: docs/DOCUMENTATION_CONTROL_PLANE.md and docs/document-registry.json. These were regenerated from the combined source rather than choosing an incomplete 137- or 138-document side; combined registry includes **140** explicit documents, zero unclassified, before this report.

## The actual source effects, not a commit-count myth

| Track | Source decisions preserved |
|---|---|
| 45 mainline commits | Qualified PRODUCT boundary security, owner signed-promotion source review, Watcher/Traffic/storage observational read models, UTC missing-day chart geometry, 39-link Kingdom menu regression contracts, featured-warrior decoded fallback, anonymous avatar media HEAD restriction, canonical Traffic snapshot/calculation provenance and exact source reseals. Temporary diagnostic commits were reverted on main; do not restore them. |
| 62 B-only commits | Restricted public-player optional replay stats (unavailable rather than fake zero), source-pinned Steam V22 original/stage/activation dual profiles and one-use guards, exact 3032 same-slot restart/inverse source, durable source-install sentinel and Ed25519 verification proposal, C-to-B UID650 source versus native Linux build separation, independent Linux artifact member verification, C03 existing-user reader/nonce/presence and protected writer deny-source, independent first/second release-and-rollback runbook. |
| Source overlap | Only five paths were changed on both historical tracks: config/kingdom-index-routes.json, docs/document-registry.json, docs/DOCUMENTATION_CONTROL_PLANE.md, docs/WATCHER_164_DOWNLOAD_ART.md and docs/WATCHER_TELEMETRY.md. Git resolved the semantic route change automatically; only the two generated DocsV2 files conflicted. |

Every SHA, commit subject, first-parent changed path list and multiple applicable source-effect labels is inspectable in the JSON ledger. Exactly **45/45 main** and **62/62 B** commits are enumerated. Labels identify impacted domains, not physical feature acceptance.

## Remote branch and open-PR census

At `2026-11-11T23:05:40Z`, exact GitHub ref census found **417 remote branches** and **316 open PRs**, including **316** PR head branches and **101** additional remote refs. Every remote branch exact SHA and every open PR exact head/base, title, draft state and owner-lane inference are captured.

- PR classification counts: ACTIVE_NEXT 3, ALREADY_ANCESTRAL 13, FINANCIAL_HOLD 64, NEEDS_REVIEW 229, SUPERSEDED_PRESERVE 7.
- Branch classification counts: ACTIVE_NEXT 3, ALREADY_ANCESTRAL 32, FINANCIAL_HOLD 80, NEEDS_REVIEW 295, SUPERSEDED_PRESERVE 7.
- **66 priority PRs** have actual GitHub changed-file evidence (none hit the 100-file pagination limit). For remaining PRs, file-level equivalence is explicitly **not claimed**; statuses default conservatively to NEEDS_REVIEW except exact ancestral SHAs and financial-domain classification. Full branch/PR inventory coverage is complete; per-file source-overlap verification remains **partial**. Ledger does not block PRODUCT DEV-GO.

## Priority for next PRODUCT and Renaissance work

| PR | Classification | Exact open PR HEAD | Product/lane decision and source overlap |
|---|---|---|---|
| [#1331](https://github.com/Emaren/app-prodn/pull/1331) | `ACTIVE_NEXT` | `78d851062eb8…` | B integration active; true current-main merge is in same preserved worktree. Await exact merged-head CI, Linux review and offline signer/root permits. Main non-doc overlap: 0 path(s). |
| [#1319](https://github.com/Emaren/app-prodn/pull/1319) | `ACTIVE_NEXT` | `d5f2964c843b…` | C UID650 runner is independent PRODUCT work. Main already has the baseline product boundary; C's private recovery denial and real kernel evidence require separate root admission. Main non-doc overlap: 3 path(s). |
| [#1281](https://github.com/Emaren/app-prodn/pull/1281) | `ACTIVE_NEXT` | `34782231fbcd…` | Kingdom Traders PAPER preview and disabled frontend seam are **not on main** (non-document changed paths unrepresented). Source-held C PRODUCT next task; do not silently copy it into B release or arm money. Main non-doc overlap: 0 path(s). |
| [#1288](https://github.com/Emaren/app-prodn/pull/1288) | `NEEDS_REVIEW` | `58b175cc68b8…` | Main already contains Session C Traffic/Watcher/storage visibility panel and four core read-model paths. Remaining standalone PR/docs/workflow require source review before any import. Main non-doc overlap: 4 path(s). |
| [#1294](https://github.com/Emaren/app-prodn/pull/1294) | `NEEDS_REVIEW` | `3c9074b87ded…` | Uncertified Traffic-day refusal fixture exists as separate B source; canonical main retains UTC gaps and snapshot provenance. Review before any incremental integration. Main non-doc overlap: 0 path(s). |
| [#1289](https://github.com/Emaren/app-prodn/pull/1289) | `NEEDS_REVIEW` | `30aecfc8c615…` | Sniper managed portrait projection audit is separate source; main featured fallback and HTTP HEAD safeguards are not equivalence to three real portrait byte tests. Main non-doc overlap: 0 path(s). |
| [#1326](https://github.com/Emaren/app-prodn/pull/1326) | `NEEDS_REVIEW` | `1bdb63f5eaa6…` | Steam lease renewal proof is independently open review. Never change protected Steam lease policy without V22 exact-source root authority. Main non-doc overlap: 0 path(s). |
| [#1320](https://github.com/Emaren/app-prodn/pull/1320) | `NEEDS_REVIEW` | `f61c7c507997…` | Lock-file-only Steam sandbox drop-in is source proposal; B's current explicit Steam unit SHA pin remains authoritative until reviewed. Main non-doc overlap: 0 path(s). |
| [#1330](https://github.com/Emaren/app-prodn/pull/1330) | `SUPERSEDED_PRESERVE` | `f91e57c2602a…` | All this PR's reviewed transaction source is a direct ancestor of B integration branch. Preserve the original PR/commit; do not cherry-pick twice. Main non-doc overlap: 0 path(s). |
| [#1316](https://github.com/Emaren/app-prodn/pull/1316) | `SUPERSEDED_PRESERVE` | `e32bab09daa3…` | Historical serialized same-slot B source is an exact ancestor of new B integration; original PR and rollback evidence preserved. Main non-doc overlap: 0 path(s). |
| [#1311](https://github.com/Emaren/app-prodn/pull/1311) | `SUPERSEDED_PRESERVE` | `54a75f618080…` | Original source-pinned dual Steam V22 profile implementation is already in B ancestry, not canonical main until the B integration lands. Main non-doc overlap: 0 path(s). |
| [#1309](https://github.com/Emaren/app-prodn/pull/1309) | `SUPERSEDED_PRESERVE` | `c2687b5f8cc8…` | One-use same-slot controller source is already in B ancestry, preserved without a second branch. Main non-doc overlap: 0 path(s). |
| [#1307](https://github.com/Emaren/app-prodn/pull/1307) | `SUPERSEDED_PRESERVE` | `06c9e77d39a4…` | Original public-player artifact verifier source is already in B ancestry, new independent B Linux reviewer is additional. Main non-doc overlap: 0 path(s). |
| [#785](https://github.com/Emaren/app-prodn/pull/785) | `NEEDS_REVIEW` | `1b198fbb2120…` | Watcher Observatory live fleet map remains proposed source with Kingdom route path overlap; not equivalent to current main Watcher read-only telemetry. Main non-doc overlap: 1 path(s). |
| [#828](https://github.com/Emaren/app-prodn/pull/828) | `NEEDS_REVIEW` | `d40db2d20db0…` | Watcher 1.6.6 telemetry includes HTTP/PG/schema migration source and requires independent authority/freshness review; do not piggyback into website cutover. Main non-doc overlap: 0 path(s). |
| [#722](https://github.com/Emaren/app-prodn/pull/722) | `NEEDS_REVIEW` | `b74ed04d1d29…` | Watcher event retry and telemetry SQL sources overlap PR #828; do not install duplicate schema or double-ingest without a review. Main non-doc overlap: 0 path(s). |
| [#917](https://github.com/Emaren/app-prodn/pull/917) | `NEEDS_REVIEW` | `add87b18b77b…` | 60-second Renaissance Index telemetry proposal source overlaps route config; no score inflation or live freshness claim. Main non-doc overlap: 1 path(s). |
| [#916](https://github.com/Emaren/app-prodn/pull/916) | `NEEDS_REVIEW` | `8350ad5d4224…` | Renaissance browser scorecard source is a separate physical Chrome workstream, not implied by website compilation. Main non-doc overlap: 0 path(s). |
| [#913](https://github.com/Emaren/app-prodn/pull/913) | `NEEDS_REVIEW` | `637a3709701f…` | Renaissance 88-route worklist source-only. Keep separate from public Index certification. Main non-doc overlap: 0 path(s). |
| [#912](https://github.com/Emaren/app-prodn/pull/912) | `NEEDS_REVIEW` | `d306770c98a6…` | Renaissance accessibility and DOM-selector proof needs actual browser evidence; no blanket migration. Main non-doc overlap: 0 path(s). |
| [#891](https://github.com/Emaren/app-prodn/pull/891) | `NEEDS_REVIEW` | `fd5504485ff8…` | Living Kingdom admin journeys/presence are separate review requiring signed admin/reader authority. Main non-doc overlap: 0 path(s). |
| [#834](https://github.com/Emaren/app-prodn/pull/834) | `NEEDS_REVIEW` | `925ebe171801…` | Replay Stage Radar is candidate Watcher/result operator UX, review against present native observer truth. Main non-doc overlap: 0 path(s). |
| [#1095](https://github.com/Emaren/app-prodn/pull/1095) | `NEEDS_REVIEW` | `855b4526d4ec…` | Central Job Exchange and work board are older dashboard source, check existing canonical main before duplicating. Main non-doc overlap: 0 path(s). |

## Existing product truth to keep—not reimplement

- **PWA:** canonical main already has app/manifest.ts, app/layout.tsx PwaRegister and components/pwa (install prompt, mobile nav, connection status). No separately named PWA open PR surfaced by the PR title scan. Preserve this existing feature, test actual installed-browser behavior before claiming its physical acceptance.
- **Chat and messaging:** canonical source already includes app/api/lobby/chat, clan message translation, contact-Emaren messages and system-message/admin paths. None of the current B V22 source edits grants new message privileges; catalog existing routes and client behavior before any replacement.
- **Kingdom Traders:** PAPER 9447 remains protected on HEL1 and is not a proposed new Next.js slot. The C PRODUCT preview (PR #1281) is held behind the PRODUCT runner; financial execution, wallet/API keys, trades and settlement are out of B's scope.
- **Watcher/Renaissance:** current main includes certified Traffic archives, 39-link navigation, featured-warrior fallback and C read-only observation panel. Older Watcher 1.6.6 ingress/SQL and Renaissance browser scorecards are separate unresolved PRs, not proof that the merged website contains those features.

## Do not let cleanup become a release dependency

The JSON label set is strictly: ACTIVE_NEXT, ALREADY_ANCESTRAL, SUPERSEDED_PRESERVE, FINANCIAL_HOLD, NEEDS_REVIEW. **ACTIVE_NEXT never implies installation permission.** SUPERSEDED_PRESERVE is a preservation instruction, not authority to close/delete a PR or branch. FINANCIAL_HOLD means defer to Session A. NEEDS_REVIEW is not a source-absence claim. No PR merged or closed and no branch moved/deleted during census.

The next B release action requires exact merged-head GitHub CI; a NEW independently verified Linux x86-64/Node22.22.0 artifact bound to the actual merged HEAD/tree/lock; then separately approved owner/Central root signer, C UID650 physical proof, A C03 finance reader/HBA grants, immutable stage, exact V22 candidate profile and two real admin+ordinary 3032 rollback cycles under distinct nonces. None of that is inferred from ledger status. Keep original 3030, emergency 3033, PAPER 9447, C04 masks and 8092–8095 listeners untouched.
