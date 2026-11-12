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
- Native Git auto-merged source files, including Kingdom index route metadata. The **only** textual conflicts were generated DocsV2 files: docs/DOCUMENTATION_CONTROL_PLANE.md and docs/document-registry.json. These were regenerated from the combined source rather than choosing an incomplete 137- or 138-document side; combined DocsV2 registry preserves both source tracks and is regenerated after any subsequent B report/source changes.

## The actual source effects, not a commit-count myth

| Track | Source decisions preserved |
|---|---|
| 45 mainline commits | Qualified PRODUCT boundary security, owner signed-promotion source review, Watcher/Traffic/storage observational read models, UTC missing-day chart geometry, 39-link Kingdom menu regression contracts, featured-warrior decoded fallback, anonymous avatar media HEAD restriction, canonical Traffic snapshot/calculation provenance and exact source reseals. Temporary diagnostic commits were reverted on main; do not restore them. |
| 62 B-only commits | Restricted public-player optional replay stats (unavailable rather than fake zero), source-pinned Steam V22 original/stage/activation dual profiles and one-use guards, exact 3032 same-slot restart/inverse source, durable source-install sentinel and Ed25519 verification proposal, C-to-B UID650 source versus native Linux build separation, independent Linux artifact member verification, C03 existing-user reader/nonce/presence and protected writer deny-source, independent first/second release-and-rollback runbook. |
| Source overlap | Only five paths were changed on both historical tracks: config/kingdom-index-routes.json, docs/document-registry.json, docs/DOCUMENTATION_CONTROL_PLANE.md, docs/WATCHER_164_DOWNLOAD_ART.md and docs/WATCHER_TELEMETRY.md. Git resolved the semantic route change automatically; only the two generated DocsV2 files conflicted. |

Every SHA, commit subject, first-parent changed path list and multiple applicable source-effect labels is inspectable in the JSON ledger. Exactly **45/45 main** and **62/62 B** commits are enumerated. Labels identify impacted domains, not physical feature acceptance.

## Complete remote App branch and PR source census

The exact GitHub snapshot at 2026-11-11T23:53:03Z covers **417 remote branches and 316 open PRs**, including 316 PR-linked heads and 101 preserved no-PR heads. All 316 PRs have **complete actual changed-file lists** from GitHub GraphQL, with full pagination for nine PRs exceeding 100 files: **5,100 changed-file entries**, zero truncated. Every no-PR branch has its HEAD source-commit changed-file list AND exact canonical-main...branch comparison: **101/101, 3,036 additional changed-path entries**, none reached the 300-file response limit. All source SHA, branch/PR ancestry and owner-lane/purpose labels are in the machine JSON. **This closes the source-path census; it does not prove any nonancestral PR is content-equivalent to main, merge-safe or deployed.**

- Open PR disposition counts: ACTIVE_NEXT 3, ALREADY_ANCESTRAL 13, FINANCIAL_HOLD 61, NEEDS_REVIEW 232, SUPERSEDED_PRESERVE 7.
- Remote branch disposition counts: ACTIVE_NEXT 3, ALREADY_ANCESTRAL 32, FINANCIAL_HOLD 78, NEEDS_REVIEW 297, SUPERSEDED_PRESERVE 7.
- For each PR: exact HEAD SHA and base, complete GitHub changed source paths, overlapping historical main/B paths, paths currently missing/present in canonical main and B's verified integration tree, and nearest overlapping open PRs. Full source data is an inventory, not entitlement to mass-cherry-pick.
- For every no-PR remote branch: exact head, GitHub main compare status/ahead/behind, complete returned changed-path set and latest commit source. **82 diverged, 18 behind and 1 identical** to the snapshot main. All original branches remain intact.
- The 33 existing M1 PRODUCT checkouts and irreplaceable PAPER/Traders local histories remain C-owned; this B remote-branch census did not open, reset, delete, overwrite or rebase any of those worktrees. The backlog is explicitly **NOT a PRODUCT DEV-GO or public-release prerequisite**.

## Source uniqueness and sensible next PRODUCT intake

Current main already has PWA install/manifest/mobile navigation, existing lobby/clan/contact messaging, 39-link Kingdom menu, canonical certified Traffic/UTC gaps, featured-warrior image safety, and C's core source-only Watcher/Traffic/storage observer. A PR changing the same filename is NOT proof of equivalent behavior. Conversely, an entirely absent file proves a proposed source capability is not present on current main and must be reviewed before integration.

- **Kingdom Traders:** C PR #1281 has nine proposed paths missing from canonical main, including the PAPER preview panel and disabled frontend seam. Preserve it for C UID650 PRODUCT development. The protected PAPER process on port 9447 is not an authorization to place new trading or financial writers into B.
- **Watcher/replay and telemetry:** PR #785 Watcher Observatory has eight proposed paths missing; the read-only core from PR #1288 is already on main but its old standalone workflow/test/docs are not all present. PRs #828 and #722 both carry Watcher SQL/PG migrations; they remain FINANCIAL_HOLD for original database authority and duplicate schema overlap, even though a read-only watcher website can be released independently.
- **PWA/chat/messaging:** existing canonical main implements PWA manifest/register/install UI and lobby, clan and owner-contact message routes. No new unique, independently accepted PWA source PR is evidenced by the open-PR diff census. One proposed private Storage Sentinel inbox (#950) includes service/systemd source and must not be imported into ordinary site code.
- **Avatars, Traffic, player/admin:** PR #1289 has two absent Sniper managed-portrait audit/test paths. PR #1294 has two absent traffic certification source/test paths, while main keeps known canonical gaps. PRs #1303/#1304 include private-document and player denial tests not fully represented in main; earlier genuine authenticated profile-document GET 500 remains a physical acceptance risk. PR #1094 includes distinct proposed admin engineering-view paths. No deployed fixes inferred.
- **Renaissance:** PRs #785, #917, #916, #913, #912, #891 preserve proposed Observatory, 60s Index telemetry, browser acceptance, 88-route criteria/accessibility, and admin journey/presence work. Current canonical source and ordinary website compilation do not certify the older physical Chrome or financial authority requirements.
- **Prior V22/release:** older B PRs #1330/#1316/#1311/#1309/#1307 remain exact ancestors of current B integration but are not in canonical main until #1331 merges. Their independent PRs are preserved; **do not replay them**. PR #1331 itself remains DRAFT and UNMERGED.

## Priority for next PRODUCT and Renaissance work

| PR | Classification | Exact open PR HEAD | Product/lane decision and source overlap |
|---|---|---|---|
| [#1331](https://github.com/Emaren/app-prodn/pull/1331) | `ACTIVE_NEXT` | `07defac8aeff…` | B mainline integration is current-main compatible with accepted full App/Linux CI at the previously reviewed exact HEAD. A new true direct-login C03 source fix requires fresh exact-head validation; production still HOLD. |
| [#1319](https://github.com/Emaren/app-prodn/pull/1319) | `ACTIVE_NEXT` | `d5f2964c843b…` | C UID650 runner is independent PRODUCT work. Main already has the baseline product boundary; C's private recovery denial and real kernel evidence require separate root admission. Changed files absent from current main: 2 of 7; same-path code equivalence not asserted. |
| [#1281](https://github.com/Emaren/app-prodn/pull/1281) | `ACTIVE_NEXT` | `34782231fbcd…` | Kingdom Traders PAPER preview and disabled frontend seam are **not on main** (non-document changed paths unrepresented). Source-held C PRODUCT next task; do not silently copy it into B release or arm money. Changed files absent from current main: 9 of 13; same-path code equivalence not asserted. |
| [#1288](https://github.com/Emaren/app-prodn/pull/1288) | `NEEDS_REVIEW` | `58b175cc68b8…` | Main already contains Session C Traffic/Watcher/storage visibility panel and four core read-model paths. Remaining standalone PR/docs/workflow require source review before any import. Changed files absent from current main: 3 of 9; same-path code equivalence not asserted. |
| [#1294](https://github.com/Emaren/app-prodn/pull/1294) | `NEEDS_REVIEW` | `3c9074b87ded…` | Uncertified Traffic-day refusal fixture exists as separate B source; canonical main retains UTC gaps and snapshot provenance. Review before any incremental integration. Changed files absent from current main: 2 of 4; same-path code equivalence not asserted. |
| [#1289](https://github.com/Emaren/app-prodn/pull/1289) | `NEEDS_REVIEW` | `30aecfc8c615…` | Sniper managed portrait projection audit is separate source; main featured fallback and HTTP HEAD safeguards are not equivalence to three real portrait byte tests. Changed files absent from current main: 2 of 6; same-path code equivalence not asserted. |
| [#1326](https://github.com/Emaren/app-prodn/pull/1326) | `NEEDS_REVIEW` | `1bdb63f5eaa6…` | Steam lease renewal proof is independently open review. Never change protected Steam lease policy without V22 exact-source root authority. Changed files absent from current main: 5 of 7; same-path code equivalence not asserted. |
| [#1320](https://github.com/Emaren/app-prodn/pull/1320) | `NEEDS_REVIEW` | `f61c7c507997…` | Lock-file-only Steam sandbox drop-in is source proposal; B's current explicit Steam unit SHA pin remains authoritative until reviewed. Changed files absent from current main: 2 of 4; same-path code equivalence not asserted. |
| [#1330](https://github.com/Emaren/app-prodn/pull/1330) | `SUPERSEDED_PRESERVE` | `f91e57c2602a…` | All this PR's reviewed transaction source is a direct ancestor of B integration branch. Preserve the original PR/commit; do not cherry-pick twice. Changed files absent from current main: 3 of 5; same-path code equivalence not asserted. |
| [#1316](https://github.com/Emaren/app-prodn/pull/1316) | `SUPERSEDED_PRESERVE` | `e32bab09daa3…` | Historical serialized same-slot B source is an exact ancestor of new B integration; original PR and rollback evidence preserved. Changed files absent from current main: 11 of 13; same-path code equivalence not asserted. |
| [#1311](https://github.com/Emaren/app-prodn/pull/1311) | `SUPERSEDED_PRESERVE` | `54a75f618080…` | Original source-pinned dual Steam V22 profile implementation is already in B ancestry, not canonical main until the B integration lands. Changed files absent from current main: 4 of 6; same-path code equivalence not asserted. |
| [#1309](https://github.com/Emaren/app-prodn/pull/1309) | `SUPERSEDED_PRESERVE` | `c2687b5f8cc8…` | One-use same-slot controller source is already in B ancestry, preserved without a second branch. Changed files absent from current main: 3 of 5; same-path code equivalence not asserted. |
| [#1307](https://github.com/Emaren/app-prodn/pull/1307) | `SUPERSEDED_PRESERVE` | `06c9e77d39a4…` | Original public-player artifact verifier source is already in B ancestry, new independent B Linux reviewer is additional. Changed files absent from current main: 4 of 6; same-path code equivalence not asserted. |
| [#785](https://github.com/Emaren/app-prodn/pull/785) | `NEEDS_REVIEW` | `1b198fbb2120…` | Watcher Observatory live fleet map remains proposed source with Kingdom route path overlap; not equivalent to current main Watcher read-only telemetry. Changed files absent from current main: 8 of 18; same-path code equivalence not asserted. |
| [#828](https://github.com/Emaren/app-prodn/pull/828) | `FINANCIAL_HOLD` | `d40db2d20db0…` | Watcher HTTP/PG/schema-migration work overlaps another source candidate and touches original database authority; defer SQL to A and keep read-only website portions separately reviewable. |
| [#722](https://github.com/Emaren/app-prodn/pull/722) | `FINANCIAL_HOLD` | `b74ed04d1d29…` | Watcher HTTP/PG/schema-migration work overlaps another source candidate and touches original database authority; defer SQL to A and keep read-only website portions separately reviewable. |
| [#917](https://github.com/Emaren/app-prodn/pull/917) | `NEEDS_REVIEW` | `add87b18b77b…` | 60-second Renaissance Index telemetry proposal source overlaps route config; no score inflation or live freshness claim. Changed files absent from current main: 7 of 12; same-path code equivalence not asserted. |
| [#916](https://github.com/Emaren/app-prodn/pull/916) | `NEEDS_REVIEW` | `8350ad5d4224…` | Renaissance browser scorecard source is a separate physical Chrome workstream, not implied by website compilation. Changed files absent from current main: 0 of 2; same-path code equivalence not asserted. |
| [#913](https://github.com/Emaren/app-prodn/pull/913) | `NEEDS_REVIEW` | `637a3709701f…` | Renaissance 88-route worklist source-only. Keep separate from public Index certification. Changed files absent from current main: 0 of 3; same-path code equivalence not asserted. |
| [#912](https://github.com/Emaren/app-prodn/pull/912) | `NEEDS_REVIEW` | `d306770c98a6…` | Renaissance accessibility and DOM-selector proof needs actual browser evidence; no blanket migration. Changed files absent from current main: 0 of 24; same-path code equivalence not asserted. |
| [#891](https://github.com/Emaren/app-prodn/pull/891) | `NEEDS_REVIEW` | `fd5504485ff8…` | Living Kingdom admin journeys/presence are separate review requiring signed admin/reader authority. Changed files absent from current main: 0 of 11; same-path code equivalence not asserted. |
| [#834](https://github.com/Emaren/app-prodn/pull/834) | `NEEDS_REVIEW` | `925ebe171801…` | Replay Stage Radar is candidate Watcher/result operator UX, review against present native observer truth. Changed files absent from current main: 3 of 3; same-path code equivalence not asserted. |
| [#1095](https://github.com/Emaren/app-prodn/pull/1095) | `NEEDS_REVIEW` | `855b4526d4ec…` | Central Job Exchange and work board are older dashboard source, check existing canonical main before duplicating. Changed files absent from current main: 1 of 31; same-path code equivalence not asserted. |

## Existing product truth to keep—not reimplement

- **PWA:** canonical main already has app/manifest.ts, app/layout.tsx PwaRegister and components/pwa (install prompt, mobile nav, connection status). No separately named PWA open PR surfaced by the PR title scan. Preserve this existing feature, test actual installed-browser behavior before claiming its physical acceptance.
- **Chat and messaging:** canonical source already includes app/api/lobby/chat, clan message translation, contact-Emaren messages and system-message/admin paths. None of the current B V22 source edits grants new message privileges; catalog existing routes and client behavior before any replacement.
- **Kingdom Traders:** PAPER 9447 remains protected on HEL1 and is not a proposed new Next.js slot. The C PRODUCT preview (PR #1281) is held behind the PRODUCT runner; financial execution, wallet/API keys, trades and settlement are out of B's scope.
- **Watcher/Renaissance:** current main includes certified Traffic archives, 39-link navigation, featured-warrior fallback and C read-only observation panel. Older Watcher 1.6.6 ingress/SQL and Renaissance browser scorecards are separate unresolved PRs, not proof that the merged website contains those features.

## Do not let cleanup become a release dependency

The JSON label set is strictly: ACTIVE_NEXT, ALREADY_ANCESTRAL, SUPERSEDED_PRESERVE, FINANCIAL_HOLD, NEEDS_REVIEW. **ACTIVE_NEXT never implies installation permission.** SUPERSEDED_PRESERVE is a preservation instruction, not authority to close/delete a PR or branch. FINANCIAL_HOLD means defer to Session A. NEEDS_REVIEW is not a source-absence claim. No PR merged or closed and no branch moved/deleted during census.

The last reviewed integrated B HEAD passed full App CI and independent Linux byte verification. The new, genuinely necessary A-matched direct-login source repair requires fresh HEAD CI and a **new** source-pinned Linux archive; older approved artifact IDs remain evidence for their old bytes only. A **conditional existing-auth Option L** permits independent normal website/product release before C03 finance quarantine, with original auth SQL mutation fully disclosed; see [pre-C03 source-only boundary](release/SESSION_B_PRE_C03_NONFINANCIAL_SITE_RELEASE_BOUNDARY_20261111.md). Root staging still needs a separately trusted HEL1 production signer/root-owned SOURCE_INSTALL and exact ACTIVATE_ONLY permits, plus two actual admin+ordinary authenticated 3032 rollback repeats. C's M1 owner-approved local DEV signer is **not** HEL1 production authority. Preserve original 3030, emergency 3033, PAPER9447, C04 masks and finance port closures. None of the ledger classifications admits financial/funded activity or authorizes HEL1 changes.
