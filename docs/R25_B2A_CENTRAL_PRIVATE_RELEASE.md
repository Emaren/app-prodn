---
id: "aoe2war.app-prodn.r25-b2a-central-private-release"
title: "R25 B2a — Central Command Private UI Release"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "post-r25-reviewed-source-not-production-admission"
reviewed_at: "2026-10-31"
review_interval_days: 7
sensitivity: "internal"
---

# R25 B2a — Central Command Private UI Release

Implementation source pin: `4238c39f4ce423809e2bb12f6de81827a03b74eb` from immutable #1061 source `0cee3c836c4b0760478280c145e02e81e470ce0e`.

**Included product:** three private Central Command routes and two GET-only GitHub evidence APIs. Exact source and browser policies are described in the source PR #1095. This is a **separate candidate, not yet merged or deployed**.

## Exact route contract

- `/admin/central-command/job-board`
- `/admin/central-command/lanes`
- `/admin/central-command/work-board`
- `/api/admin/central-command/events`
- `/api/admin/central-command/work-ledger`

## Production and browser acceptance

- All private page routes are guarded by the parent `app/admin/layout.tsx` `requireServerAdmin()` and API-specific `requireAdmin`; expected anonymous request is denied. Do not treat a 401/redirect as proof the page is missing.
- Required exact-head CI: release/build/type tests, focused source contracts, complete DocsV2, and browser suite at **375/768/1440** using a real isolated disposable fixture; check unauthorized access, safe no-store response, source-provenance timestamps and UNKNOWN/STALE fallback. Do not claim current PASS before workflows complete.
- **F owns real deployment** only after #1061 is independently `LIVE_VERIFIED`, separately approves this successor SHA and its stage, checks B 3031 guard, versioned static assets and complete G public/authenticated BEFORE/AFTER acceptance with existing Nginx-only rollback.
- Finance is a separate Wolo protected plane. No new paid storage, credentials, root operations, settlement endpoints or autonomous agents. Source and documentation status cannot certify running production.

## Stop conditions

Missing CI, unexpected imports, auth bypass, stale data shown as live, wrong Next BUILD_ID, missing rollback or non-reviewed dependency version means **HOLD**; no host mutation. Do not overwrite C's sealed 87,038-file artifact or E's rollback copy.
