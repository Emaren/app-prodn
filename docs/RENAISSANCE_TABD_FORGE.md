---
id: "aoe2war.app-prodn.renaissance-tabd-forge"
title: "Renaissance Tab D — private census forge and Test Forge queue"
type: "runbook"
status: "draft"
owner: "renaissance-tab-d"
systems: ["app-prodn"]
audience: ["developers","operators","auditors"]
source_of_truth: "git"
authority: "candidate-private-source-inventory"
reviewed_at: "2026-10-25"
review_interval_days: 30
sensitivity: "internal"
---

# Renaissance Tab D — private census forge and Test Forge queue

Status: draft; source evidence only; not a scorer, production sign-off or public API.

## 2026-10-25 source finding
- Source Git commit 6be434c00469afa4acb0623715c3bcf724f927f4.
- Complete GitHub tree: 144 page templates, 273 source route handlers: 270 inside app/api and 3 non-API.
- Historical config baseline 144/273 and 88 Index-eligible public pages.
- The Kingdom Brain screenshot says 145 deployed pages and 278 deployed handlers.
  This is UNRESOLVED until actual emitted .next/server/app-paths-manifest.json
  and .next/BUILD_ID from the same deployment are compared to identical source inclusion rules.
  One generated not-found page and five metadata handlers are hypotheses, NOT verified causes.
- Source includes alias pages: about and roadmap redirect into requests; never certify their UI independently.

## Private local/operator CLI

Run commands on a clean exact Git checkout. CLI emits JSON to stdout only.
Commands do not write source, deploy, mutate database or call public HTTP APIs.

    SHA="$(git rev-parse HEAD)"
    python3 scripts/renaissance_tabd_forge.py verify --fast --expected-sha "$SHA"
    python3 scripts/renaissance_tabd_forge.py inventory --expected-sha "$SHA" > /tmp/renaissance-tabd-144.json
    python3 scripts/renaissance_tabd_forge.py doctor /kingdom-index --fast
    python3 scripts/renaissance_tabd_forge.py impact lib/kingdomIndex.ts
    python3 scripts/renaissance_tabd_forge.py map --fast
    python3 scripts/renaissance_tabd_forge.py next --fast
    python3 scripts/renaissance_tabd_forge.py matrix --fast

When an emitted build is available:

    python3 scripts/renaissance_tabd_forge.py inventory \
      --expected-sha "$SHA" --build-dir .next \
      --expected-build-id "$(cat .next/BUILD_ID)" > /tmp/renaissance-tabd-emitted.json

The file produced contains PRIVATE source paths, including admin and financial dependency
hints; never serve it on a public GET. The scanner reuses the bounded lexical source
analyzer; transitive compiled imports, conditional dynamic requires, runtime-only
edges, and generated Prisma artifacts remain UNKNOWN. The --fast switch explicitly
marks dependency closure UNMEASURED, rather than disguising it as complete.
A clean tracked tree is checked independently from the expected SHA.

## Tiered evidence architecture

| Tier | Trigger | Artifact | Hard boundary |
| --- | --- | --- | --- |
| Source cheap | PR or changed-source push, 12m | 144 planning entries, kind, scope, source counts, mismatch queue, test output, SHA/digest | Source only |
| Integrated build | nightly/manual, 45m | Real Next app-paths manifest, BUILD_ID, exact-source mismatch queue | Candidate only |
| Chrome and accessibility | exact-head phase cohorts, 12 pages/batch | Real keyboard, axe and interaction assertions, guarded public GET/API read checks | No admin/private without fixture |
| Isolated PostgreSQL/replay | separate authorized container/fixture | Domain invariants, query/write counters, replay proof | No chain/custody |
| Controlled performance | fixed fixture and repeated samples | P75/P95 latency + heap/memory budgets | No production inference |
| Live release | Central-only protected approval | Signed independent live parity and gates | This lane never executes |

Campaign 000 /kingdom-index is the prerequisite gate; the seven-phase config
order remains unchanged. CI success is NOT certification; all 144 score fields
stay null. No generated worker, write lease, human signer or autoplay certification.

## Unresolved
- Compare exact build/runtime manifest and identify all six mismatched entries.
- Full emitted Next and runtime transitive source closure.
- Generated Prisma integrity, dynamic import and runtime producer edges.
- Phase browser/axe/public API tests, authorized admin cohorts and dynamic fixtures.
- PostgreSQL and replay-domain cases, controlled P75/P95 and heap memory.
- Independently observe public GET for source/DB/financial nonmutation. This script
  writes nothing, but that is NOT proof that production GET endpoints have no writes.
- Preserve owner path boundaries; active PRs #816/#818 edit shared Renaissance docs,
  #802 edits the existing CLI. Do not overwrite those paths without Central approval.
