---
id: "aoe2war.app-prodn.living-kingdom-admin"
title: "Living Kingdom Admin Observatory"
type: "reference"
status: "draft"
owner: "renaissance-tab-d"
systems: ["app-prodn"]
audience: ["developers","operators","auditors"]
source_of_truth: "git"
authority: "admin-journey-read-projection"
reviewed_at: "2026-10-25"
review_interval_days: 30
sensitivity: "internal"
---

# Living Kingdom Admin Observatory

*Source review trail: issue/PR #888; this is admin-only, not public Index certification.*

Admin-only pages: /admin/living-kingdom and /admin/living-kingdom/[uid].
Admin JSON endpoints: /api/admin/living-kingdom and /api/admin/living-kingdom/[uid].
Existing app/admin/layout.tsx requires server admin; every API GET independently
checks requireAdmin before reading any data. HTTP 401/403, 404 and error
responses explicitly set Cache-Control: private, no-store.

## Authority hierarchy

1. Durable authenticated page_view and click: existing UserActivityEvent,
   published by UserExperienceTracker. No tracker, new schema or migration created.
2. Confidence/engagement: existing buildJourneySummary heuristic, applied
   to redacted per-user events. Never a verified fact of attentiveness.
3. Live avatar presence: authenticated server-side UID join to the existing
   livingKingdomHub.publicProjectionForUid and hub.stats. This is a local
   process-only ephemeral lease, not a persistent movement or cluster census.
   Absent projection means NOT OBSERVED HERE, never proven offline.
4. Traffic service: authoritative for passive visitor/request analytics.
   Radio WOLO /api/admin/radio/listeners is authoritative for listening
   signals; its pathTrail and Traffic visitor ID are NOT equivalent to
   Living Kingdom presence or authenticated page_view history.
   No cross-source identity join is implemented.

## Selection and bounded reads

The existing loadJourneySummaryMap allocates one global newest-event cap
and only afterwards buckets events per user. Heavy users may crowd out
quiet accounts. This implementation independently samples up to 121
indexed recent events PER selected user and publishes 120 maximum,
with the extra item serving only as a clipping detector. It displays
up to 20 users per cursor page, using bounded (21) roster fetch and
a scoped query per user. Search is sanitized to 48 characters.
Windows are 7/30 days; history is cursor-paginated at 40 records
per request. No global newest-N slice is used to rank quiet users.

Dashboards, trends, return counts, dwell totals and transitions are
summaries of the CURRENT SELECTED COHORT ONLY (at most 20 accounts),
not all-accounts or whole-site statistics. Return evidence requires
activity on two distinct UTC dates inside the sampled interval.
A clipped window with one observed day yields UNKNOWN, not false.
Dwell sums successive same-session event gaps at most 10 minutes;
one event yields UNKNOWN, not measured zero. It cannot show foreground
attention or an exact page timer. History pagination is a slice
of available evidence, not a lifetime account ledger.

## Strict privacy and missing data

Private/admin/auth/wallet/invoice paths, dynamic identifying segments,
raw sensitive URLs, queries and hash fragments, click target labels,
all event metadata and raw session IDs are removed from JSON output.
Admin history never proxies the raw /api/admin/users/[uid]/activity
endpoint. The UI shows only anonymous coarse route groups, generic
click labels and timestamps, plus user identity already available to
admins. No passwords, forms, chats, wallet actions or signer state are read.

Historical scroll positions and paths WERE NOT PERSISTED.
No scroll heat map, path sequence, count or duration is fabricated.
Coarse aggregate scroll instrumentation is a future, separately reviewed
privacy/domain contract with bounded sampling and retention. The existing
game avatar presence remains mandatory on eligible realms, with local-only
self-hide, and the global site overlay is not modified.

## Verification commands

    node --experimental-strip-types --test tests/admin-living-kingdom-projection.test.mts tests/admin-living-kingdom-authority.test.mts
    npx tsc --noEmit
    yarn lint
    yarn build

Verification must use the exact PR-head SHA and captured emitted BUILD_ID;
none of the candidate jobs imply live production deployment. A real Chrome
acceptance needs a *fixture admin login*, seeded safe events and independent
401/403 tests, 7/30-day filters, pagination, historical-scroll absence and
DB no-mutation receipts. Without that authorized fixture, browser evidence
remains NOT MEASURED, not passed. Existing DocsV2 registry is shared Central
ownership and is not edited here.

## Overlay and shared navigation #887

The global LivingKingdomClient, public avatar animation, self-hide behavior,
presence realm allowlist, Speed Proof, Gray Dot and October theme are
untouched. These admin pages are intentionally outside public realm
eligibility. Central must separately assign shared nav links/overlay coverage
changes before merge. This branch is NOT a financial release.
