---
id: "aoe2war.app-prodn.renaissance-88-round4"
title: "Round Four: Disposable Browser Dependencies and A11y Triage"
type: "runbook"
status: "draft"
owner: "renaissance-tab-d"
systems: ["app-prodn"]
audience: ["engineers", "auditors", "operators"]
source_of_truth: "git"
authority: "candidate-fixture-observation"
reviewed_at: "2026-10-25"
review_interval_days: 30
sensitivity: "internal"
---

# Tab D Round Four — #899

## Scope and lineage

- Parent Forge #897: \`2494d99f4b3a61e76cc6100537e70aba68b60df4\`
- Central #900 on top of #897 owns \`/requests\` focus and the new component.
  **Tab D may not edit it or use source-only tests to claim its patch deployed.**
- Central #892 owns 146 candidate pages / 275 handlers; parent Forge source
  remains historical 144/273, always 88 public Index routes in seven phases.
- Chrome source evidence: #12606170411, SHA-256
  \`4ac303238793feaf8fa2a49599158203d9ed260a4d39b42f2d7837fc76f35792\`,
  BUILD_ID \`jwrNVCFXUfHF2vB3w4MBi\`. 60 navigation PASS /
  26 unknown dependency / 2 fragment focus FAIL. No page cert scores.

## Isolated database / API contract

The Chrome workflow now creates a uniquely named ephemeral PostgreSQL 16
cluster under \`$RUNNER_TEMP/renaissance88-*\`, bound ONLY to 127.0.0.1:55437.
It refuses preexisting data folders and occupied port; cluster never imports
production snapshots, credentials, migrations or data. The isolated schema
comes from the checked-out Prisma schema using \`prisma db push\` against a
hard-coded ephemeral OWNER_URL. Two invented, nonadmin users
\`fixture-scout\` and \`fixture-archivist\` are its only seeded data.
Every financial/custody-related table remains empty. This is a feature test
database, not a mainnet or settlement environment.

Next receives only \`renaissance_reader\` with SELECT grants and
\`default_transaction_read_only=on\`. A deliberately attempted INSERT must
fail before Chrome starts. After seeding, the script SHA-256 fingerprints a
complete data-only \`pg_dump\`; after Chrome it repeats the dump and aborts
on any content change. The workflow also fingerprints \`public/**\` and
\`.next/static/**\` before and after, and verifies tracked files remain
unchanged. This is direct evidence for **this isolated fixture only**,
not proof of production GET nonmutation. The daemon is killed in a shell
trap, with CI runner teardown protecting orphaned scratch files.

The browser tests only four *source-audited* GET routes against actual
local Next: \`/api/deployment-version\`, \`/api/kingdom-route-census\`,
\`/api/kingdom-index\` and \`/api/players/generation\` (last one requires
the verified seeded database). Each is an exact path with no query.
\`/api/header-summary\` is intentionally excluded: its GET queues a market
ensure operation. Financial, private, wallet, Radio, external and
authenticated APIs remain blocked/synthetic 503. Client-side attempted
POST/PUT/DELETE, even telemetry, are blocked and counted. This is a
MIXED read-only/local/synthetic API scenario, **not full domain/API
acceptance**. Source/server external-service calls are not proved
isolated merely by browser interception. Never supply real wallet keys,
production upstream URLs or user credentials to this job.

Database-backed RSC errors still classify as UNKNOWN when synthetic
dependencies are present; errors under independently verified real
fixture authority require investigation rather than automatic PASS.
All unexecuted specialized gates stay UNKNOWN. The run may legitimately
fail if schema initialization, role denial, data stability or immutable
assets cannot be proved.

## Repeatable CI controls

1. 7 Python + 11 Node prior route/redirect contract tests, plus the new
   fixture source and API policy negative tests.
2. One exact source SHA / local Next BUILD_ID and emitted manifest digest.
3. Full 88 routes, one desktop and one mobile Chrome navigation per route
   on PR, 176 axe-core WCAG A/AA automated scans and 176 JPEG captures.
4. Strict attempted-write block, four exact audited local read-only APIs
   with response status accounting, unreviewed endpoints synthetic 503.
5. SHA-256 of PostgreSQL table+sequence dump before and after, and
   public/static assets before and after; fail on differences.
6. Upload per-route receipts including missing criteria, fixture
   provenance and manifest identity. The only scorer is Tab A.

Source/negative contracts must pass before Chrome starts.
Hard limits: Source runner 15 min; Chrome runner 60 min;
Next build 30 min; PostgreSQL schema push 8 min; Chrome execution
27 min. Actual duration should be measured from completed job, not
assumed. The nightly workflow is **not installed on main** until merge.
The local fixture cannot test authenticated paths or live custody.

## Fifteen source-owner accessibility repair assignments

These were serious/critical axe rule IDs on normally rendered pages.
Assignments are **recommendations to Central**, not authorizations for
Tab D to edit shared components. Reproduce on the matching local
build/viewport and inspect the flagged DOM nodes; rule IDs alone do
not prove the exact responsible component. Keep app styling and all
Speed Proof, Gray Dot V2, Living Kingdom and October overrides intact.

| Route | Automated rule | Proposed owning surface | Next targeted regression |
| --- | --- | --- | --- |
| /academy | nested-interactive | Academy page interactive card/link composition | Tab and screen-reader clickable nesting |
| /bets | aria-required-children (critical) | Bets interactive list/grid wrapper | Valid role/child hierarchy |
| /champions/legacy | link-name (25 nodes per viewport) | Legacy Champions links / repeated card renderer | Each link has programmatic accessible name |
| /download | scrollable-region-focusable | Download panel overflow wrapper | Tab can reach scroll container |
| /forum | color-contrast | Forum typography/tokens | WCAG A/AA contrast per state |
| /hd-replay-engine | aria-progressbar-name | Replay progress indicator component | Progress role has accessible name |
| /kingdom-forge | aria-prohibited-attr, color-contrast | Forge cards/tokens | Remove invalid attribute; verify contrast |
| /kingdom-intelligence | color-contrast, scrollable-region-focusable | Intelligence status widget/overflow | Contrast + keyboard scroll |
| /library | aria-required-children (critical) | Library list/grid semantics | Correct children with documented role |
| /renaissance | scrollable-region-focusable (mobile) | Renaissance dashboard overflow wrapper | Mobile keyboard scroll |
| /renaissance/atlas | scrollable-region-focusable (mobile) | Renaissance Atlas overflow wrapper | Mobile keyboard scroll |
| /replay-laboratory | aria-required-attr (critical) | Replay Laboratory rich-control widget | Required ARIA attributes |
| /speed | scrollable-region-focusable (mobile) | Speed Proof dashboard overflow wrapper | Mobile keyboard scroll |
| /wolochain | aria-prohibited-attr, color-contrast | WoloChain runtime/status cards | Valid ARIA and WCAG contrast |
| /wolomania | color-contrast | Wolomania typography/tokens | WCAG A/AA text contrast |

Potential shared groups: mobile overflow in Renaissance/Atlas/Speed;
contrast in Forum/Forge/Intelligence/WoloChain/Wolomania; ARIA hierarchy
in Bets/Library; replay progress/form in HD Replay/Laboratory; repetitive
unnamed champion links. These may or may not share an underlying component:
confirm with source imports and actual DOM before assigning a shared
change. Central may distribute nonoverlapping page-local PRs.

The other 26 prior \`html-has-lang\` findings were from RSC error
fallback documents and do not justify a global HTML-language edit.
Likewise, \`/about\` and \`/roadmap\` hash-focus remediation belongs
solely to Central #900, not this branch.

## Nonclaims and remaining authority

Anonymous Chrome PASS proves only candidate smoke on a chosen view.
Axe-core is not a full accessibility audit. Server GET nonmutation and
asset stability are verified only for the ephemeral fixture (if the
new job succeeds); live production, authenticated roles, Wolo accounting,
replay fixtures, external service failure recovery, full 88-route
specialty gates, certified P75/P95, and provenance-signed production
identity stay UNKNOWN. Do not award a 100 or edit the Central scorer.
