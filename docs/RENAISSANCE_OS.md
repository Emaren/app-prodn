---
id: "aoe2war.app-prodn.renaissance-os"
title: "Renaissance OS"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "renaissance-campaign-integration-contract"
reviewed_at: "2026-10-19"
review_interval_days: 30
sensitivity: "internal"
---

# Renaissance OS

Renaissance OS introduces a twelve-destination visual engineering campaign with **fifteen conceptual instruments** grouped into twelve independent visual views. It is a read-only *integration overlay* on existing AoE2WAR source owners, not a new domain authority.

## Source-bound contract

- Planning order: `config/renaissance-campaign.json` — **132 existing** Next page templates / seven phases. Adding Renaissance pages changes the site's total template count; recount with existing SpeedOS/source census rather than presenting 132 as live estate size.
- Runtime evidence: `lib/kingdomIndex.ts` — only independently accepted observations. No 100 is inferred from source; `lib/kingdomIndexAuditStatus.ts` currently treats claimed certified observations as provisional.
- Static dependency visibility: `scripts/kingdom_index_dependency_evidence.py` — lexical evidence, **not** complete Next build closure.
- Canonical source registry: `config/kingdom-index-routes.json` — 76 existing public routes at baseline. Renaissance routes require centrally reviewed public Index registration, never silent local score grants.
- Policy: `config/kingdom-index-assurance-profiles.json` and `config/kingdom-index-quality-rubric.json` — single rubric authority.
- Operational authority: Kingdom Intelligence; structural atlas: Kingdom Brain; inspections: General Inspections; release: existing protected `./bin/aoe2war` controller.
- Financial boundary: WoloChain custody, Satchel, stake, settlements remain HOLD; visual route changes do not authorize money movement.
- Privacy: the Renaissance public snapshot intentionally suppresses private, admin and invoice route details. Only aggregate admin counts are presented.

## Implemented in this PR

- Twelve separately routed, visually differentiated destinations across Command, Atlas, Circuit, Marshal, Doctor, Vault, Arbiter, Test Forge, Architect, Integration Train, Sentinel and Chronicles.
- Server-side snapshot of real versioned campaign data and existing public Index scores (no fabricated agents, workers, test passes, performance or production certifications).
- A read-only operator CLI for `verify`, `map`, `next`, `doctor /route` and `impact path`, reusing the existing bounded static dependency analyzer.
- A single **Renaissance Campaign** navigation doorway in both castle and account menus; the command landing page adds an accessible twelve-chamber gateway using the canonical module registry. All twelve existing destination pages, content and direct URLs remain intact, as do the existing in-page instrument tabs.
- Contract tests for route uniqueness, phase coverage, private-route exclusion and route-page existence.

## Explicitly not yet implemented

Actual GitHub write leases, intelligent PR collision service, automated code-changing workers, browser test runner, trusted receipt signer, independent per-criterion certification verifier, or production-release activation. Their visual instruments show planning definitions, real current-source data and **unverified** states; they must never claim a running service.

## Verification and release

```bash
python3 scripts/renaissance.py verify
python3 scripts/renaissance.py doctor /kingdom-intelligence --json
python3 scripts/renaissance.py impact lib/kingdomIndex.ts --json
node --experimental-strip-types --test tests/renaissance-campaign.test.mts
```

Only after PR review, exact-head CI, protected merge and independently cleared release gates may an authorized operator consider the existing `./bin/aoe2war status`, `update --json`, `finish` workflow. This PR is **NOT DEPLOYED** and **NOT financially authorized**.


## Master-owned real Next.js/Chrome candidate acceptance (Brain and Tests)

The shared workflow at .github/workflows/renaissance-page-next-acceptance.yml
collects read-only, bounded candidate browser observations, never releases or
independent scoring approvals.

After this master workflow is independently reviewed and present on the default
branch, operators can manually dispatch an exact-head candidate run for just
one specialist rather than wasting a second full production compilation:

```bash
gh workflow run renaissance-page-next-acceptance.yml --ref main -f target=brain
gh workflow run renaissance-page-next-acceptance.yml --ref main -f target=tests
```

The workflow's target is an enumerated choice (all, brain, tests). Its matrix
maps each choice to an approved PR number and page-local runner; the omitted
input on ordinary review PRs still exercises BOTH pages. The workflow fetches
the current exact specialist SHA at run time and rechecks it after execution.
A requested run is not a passing result. Do not use the manual command before
the workflow exists on the approved default branch, and never reinterpret
an old job rerun as evidence for a changed source without inspecting the new
attempt's receipt and SHA.
 On its PR it executes a two-page matrix and,
after approved default-branch integration, supports manual workflow dispatch:

- Brain draft PR #808: tests/kingdom-brain-next-app-acceptance.py
- Tests draft PR #807: tests/kingdom-tests-next-acceptance.py

Each job resolves the current same-repository, open draft PR head through the
GitHub API, checks out that exact SHA rather than a synthetic merge, installs
frozen Yarn dependencies without install scripts, builds real Next.js,
then executes its existing source-bound desktop/phone Chromium runner
against loopback Next and controlled API fixtures. It checks the PR head again
afterwards, rejecting changed-source evidence, and uploads output even on
test failure when available. Test-generated JSON, BUILD_ID and screenshots
are candidate-only and must remain labelled accordingly.

IMPORTANT: The old branches inherit an incorrectly hashing legacy prebuild
page-change manifest generator. Until reviewed master PR #817 is approved and
integrated, this browser-only workflow invokes the direct Next.js compiler
after Prisma and build-version generation to avoid mutating committed tracked
sources. It is NOT a full yarn build lifecycle, release preflight or approved
release-equivalent build. Required DocsV2, security-patched source, route census,
normal build-lifecycle, trusted score issuer and exact production SHA/BUILD_ID
attestation are separate and must stay fail-closed. All browser values from
controlled responses are fixtures, not live backend observations.

The shared Kingdom Instruments wording OVERALL VERIFIED SCORE still belongs to
issue #745 and can legitimately fail the Tests whole-page evidence trust check.
Do not weaken that assertion to make the browser job green. Never attach
production credentials, direct browser tests at production, touch WoloChain
or held War Satchel, or publish a criterion score from these receipts.
