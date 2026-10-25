---
id: "aoe2war.app-prodn.renaissance-88-factory"
title: "Renaissance 88 Public Route Evidence Factory"
type: "runbook"
status: "draft"
owner: "renaissance-tab-d"
systems: ["app-prodn"]
audience: ["developers", "operators", "auditors"]
source_of_truth: "git"
authority: "candidate-browser-diagnostics"
reviewed_at: "2026-10-25"
review_interval_days: 30
sensitivity: "internal"
---

# Renaissance 88 Public Route Evidence Factory

*Candidate diagnostics only — this factory does not award a quality score.*

This Forge-owned round-three implementation is stacked on Test Forge PR #886,
NOT the Living Kingdom admin UI PR #891 or Central's census child #892.
The **public Index queue is exactly 88 named static pages**, separate from
the candidate website total of **146 page templates and 275 route handlers**
when Central #892 is integrated, with seven Renaissance phases.
The current #886 source parent still has the historical 144/273 baseline.
The Watcher is a separate desktop application, not a Next page.

## What actually runs

- \`scripts/renaissance_88_plan.py\` validates the 88 public entries against
  Index source, source routes, phase order and specialty gate definitions;
  publishes a private route dossier and conservative overlay policy matrix.
  Optional \`--deep\` reuses the existing static graph walker and records its
  missing imports, runtime/dynamic/Prisma gaps and lexical dependency digests.
  Optional \`--build-dir .next --expected-build-id ...\` binds a *local Next
  candidate* BUILD_ID and emitted manifest SHA-256; absent paths halt.
  Never treat local BUILD_ID as a deployed attestation.
- \`scripts/renaissance_88_browser.cjs\` actually launches installed Chrome
  through pinned playwright-core 1.57, against ONLY
  \`http://127.0.0.1:3137\`. It visits each assigned route with desktop
  1440x900 and mobile 390x844, real DOM navigation, real Tab key, pinned automated axe-core 4.10.3 WCAG A/AA observations,
  bounded viewport JPEG screenshots, basic image-alt/landmark/title signals, Chrome timings and available
  JS heap estimate. Client API GETs receive synthetic local 503 error
  fixtures, external egress and all browser POST/PUT/DELETE mutations are
  blocked. These failures are *fixture responses*, not real API domain proof.
  The server-side Next GET path remains unproven nonmutating; run ONLY in
  isolated/disposable CI without production credentials or production DB.
- \`scripts/renaissance_88_receipts.mjs\` independently validates exact
  receipt SHA/BUILD_ID/route identity, refuses fake PASS/missing viewport/
  duplicate sample/production claims, and assembles an 88-row machine JSON
  coverage file, retaining unexecuted routes as UNMEASURED.
- Dedicated Python/Node regressions test public count, source policy,
  fail-closed impact, wrong BUILD_ID and forged receipts.

CI \`.github/workflows/renaissance-88-factory.yml\` runs source/policy/unit
checks on PRs, then one **bounded pilot cohort** (1/8 of public routes,
desktop + mobile, single sample each) against locally built Next/Chrome.
When merged, the scheduled 03:41 UTC job and explicit workflow_dispatch
are designed to run **all 88 routes**, 3 samples × 2 viewports. The
schedule **is not installed or running while this workflow is unmerged**.
If the source job fails, the Chrome job is intentionally skipped.
If Chrome never launches, no browser PASS is reported. Independent
domain/PG/replay, real API, authenticated user paths, actual tab lifecycle,
production speed and real WCAG/screen-reader audits require separate
authorized fixtures and remain UNKNOWN.

## Commands — branch checkout on disposable development/CI environment

    SHA="$(git rev-parse HEAD)"
    python3 -m unittest discover -s tests -p test_renaissance_88_factory.py -v
    node --experimental-strip-types --test tests/renaissance-88-factory.test.mts
    python3 scripts/renaissance_88_plan.py plan --deep --expected-sha "$SHA" --output /tmp/public88.json
    python3 scripts/renaissance_88_plan.py impact app/layout.tsx --expected-sha "$SHA"
    python3 scripts/renaissance_88_plan.py matrix --expected-sha "$SHA"

For a *disposable* built Next candidate (never launch against production or
connect production DB):

    yarn build
    python3 scripts/renaissance_88_plan.py plan --expected-sha "$SHA" \
      --build-dir .next --expected-build-id "$(cat .next/BUILD_ID)" --output /tmp/public88-built.json

Using an already installed compatible Chrome and isolated playwright-core
under \`/tmp/tabd-pw\` with no new project dependencies:

    BROWSER_BASE_URL=http://127.0.0.1:3137 \
    AOE2WAR_PROD_DB_PREVIEW=false \
    PW_HOME=/tmp/tabd-pw CHROME_BIN=/usr/bin/google-chrome \
    node scripts/renaissance_88_browser.cjs --plan /tmp/public88-built.json \
      --out /tmp/tabd-88-out --cohort 0 --cohorts 8 --samples 1 \
      --route-ms 18000 --deadline-ms 720000
    node scripts/renaissance_88_receipts.mjs --plan /tmp/public88-built.json \
      --directory /tmp/tabd-88-out --out /tmp/tabd-88-out/coverage.json --allow-partial true

The loopback Next server must separately be started in the same disposable
environment. These commands do not start/restart production services.
To sweep the whole public Index on a candidate, use
\`--cohort 0 --cohorts 1\` (never by hand-editing the 88 routes).

## Honesty and policy

The source scanner cannot prove transitive compiled/runtime closure or
automatically protect downstream metadata; its \`impact\` action conservatively
invalidates **all 88** on changed source until closure is independently
complete. That is deliberate, not a performance optimization bug.
Future work can group routes by verified shared dependencies and hold
unaffected evidence ONLY when exact full compiled closure exists.
Unknown imports, generated Prisma and dynamic edges remain explicit.
No sample under ten is qualified for a P75/P95 assurance gate: numbers with
3 attempts are exploratory diagnostics only, not performance certification.
Heap signal can be absent; absence is UNKNOWN not 0.

Overlay policy is source-bound, not a forced on/off claim:
- Speed Proof: authoritative-route source declaration distinct from
  independently observed *current-route explicit* readiness, never substitute
  a retained prior-route sample.
- Gray Dot: enrollment/revision manifest is source policy; a badge may already
  be read and invisible, so presence alone proves nothing about its revision.
- Living Kingdom: run the existing \`livingKingdomRealmForPath\` source
  predicate; preserve mandatory eligible public-avatar behavior, anonymous
  participation rules and local-only self-hide. Missing canonical resolver
  means UNKNOWN, never “absent by policy.”
- Seasonal Blackout: Academy, Statistics, Traffic and Speed intentionally
  excluded. Real effective theme/override/time-window verification needs
  authenticated/safe fixtures; source policy alone is not a runtime PASS.
- Protected/admin/finance routes are excluded from the public 88. No
  privileged data is exposed through public GET, no mutation, signing,
  custody, transfer, payout, funding, release or settlement occurs.

## Resource estimate and owner gates

Two GitHub hosted Ubuntu jobs per event. Source job ceiling **15 minutes**.
Chrome job ceiling **60 minutes**, including full Next build (hard-capped
30m), browser run (27m), and artifact collection. Maximum reserved ~75
runner-minutes per PR/nightly run; observed runtime is unknown until CI.
The PR candidate now tests 88 routes × 2 viewports × 1 sample (176 navigations) using one shared Next build.
Nightly default tests 88 × 2 × 3 (~528 navigations). Browser target
time budget max 25 minutes; routes with failures emit FAIL or incomplete
UNKNOWN. All artifacts retained for 14 days, and each route receipt is
separately SHA-256 addressed in coverage.json.

**Next gates:** Central reviews overlay shared source issue #887, resolves
DocsV2 governed reseal, tests alternate API/replay/postgres failure
conditions with separate domain owners, confirms actual browser artifacts
and build identity, and requests scorer adapter only through Tab A.
No automatic score admission or release authority is granted by this tool.

## Validated pilot and 88-route expansion

The initial PR-head local Chrome pilot generated 11 route receipts, 22 real
navigation requests and actual Next BUILD_ID `ChvRNt_JI6u0xLOUor2nD` at
commit `47dbf7d8c9528b8364489cab60f929a1e049f4d2`. Eight routes
passed basic desktop/mobile navigation; `/kingdom`, `/players`, `/watch`
were UNKNOWN after local PostgreSQL `P1001`, not verified production
failures. The runner's verdict was corrected to distinguish blocked
client telemetry POST attempts (not executed) from GET navigation, and to
require the actual final route to match the requested path.

Subsequent branch revision expands each PR to **all 88 routes**, one
sample for each viewport, with bounded Chrome runs, screenshot evidence
and real axe-core A/AA scans. Results remain UNKNOWN until that exact
revised SHA has independently completed. An axe automated pass does not
replace human screen-reader, domain-owner or authenticated acceptance.
