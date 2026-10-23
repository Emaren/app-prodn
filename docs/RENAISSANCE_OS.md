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


## Master-owned real Next.js/Chrome candidate acceptance (three specialist pages)

The shared `.github/workflows/renaissance-page-next-acceptance.yml` is a
**read-only candidate browser evidence collector**, not a production release,
credential authority or authenticated score issuer. A normal review PR event
executes all three isolated exact-source jobs:

- Brain draft #808: `tests/kingdom-brain-next-app-acceptance.py`
- Intelligence draft #805: `tests/kingdom-intelligence-next-app-acceptance.py`
- Tests draft #807: `tests/kingdom-tests-next-acceptance.py`

On independently reviewed integration to the default branch, manual dispatch
accepts only `all`, `brain`, `intelligence` or `tests`. To run one:

```bash
gh workflow run renaissance-page-next-acceptance.yml --ref main -f target=brain
gh workflow run renaissance-page-next-acceptance.yml --ref main -f target=intelligence
gh workflow run renaissance-page-next-acceptance.yml --ref main -f target=tests
```

**These manual commands are unavailable until the workflow is approved and
present on default `main`.** Until then the master draft PR's normal
pull-request CI owns the test invocation. The bounded enum determines a
fixed page-to-PR and page-to-runner mapping; no arbitrary checkout SHA,
command, repository or target URL is operator-supplied.

Each CI job resolves the current **open draft, same-repository PR** to an exact
40-hex source SHA; checks out that commit (not an inferred merge); installs
frozen application dependencies without install hooks; builds real Next.js;
executes system Chromium against explicit loopback-only Next and controlled
read-only API fixtures; then confirms the PR head did not advance. Artifacts
retain available source SHA, emitted BUILD_ID, raw JSON/screenshot/server logs
even on a browser failure. Source drift fails closed; passing fixture checks
never prove the live backend or independent rubric criteria.

**Candidate-only limitation:** the old unmerged specialist branches inherit
a faulty legacy prebuild page-change manifest generator. This workflow uses
the direct Next.js compiler after Prisma/build-version generation to avoid
mutating tracked source. It is NOT a complete `yarn build` lifecycle, patched
mainline integration, DocsV2 approval, canonical source census, issuer review,
or release-equivalent BUILD_ID. Reviewed master #817 NUL hash correction,
Next.js 15.5.28, protected release #665 and the three specialized gates
remain separate prerequisites.

The Tests whole-page acceptance deliberately rejects inherited shared
`OVERALL VERIFIED SCORE` wording. Exclusive shared-owner draft #821
proposes truthful source-readiness labels, but testing old #807 alone cannot
observe #821 until reviewed combined-source integration. Do not weaken the
whole-page assertion or treat a standalone #821 CI run as actual Tests
acceptance. No production credentials, deployments, WoloChain or held War
Satchel actions belong to this workflow.
