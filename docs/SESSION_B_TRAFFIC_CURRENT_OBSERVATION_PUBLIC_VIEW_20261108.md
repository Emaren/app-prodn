---
id: "aoe2war.app-prodn.session-b-traffic-current-observation-public-view-20261108"
title: "Session B — Traffic Current Observation Public View, 2026-11-08"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "traffic-api"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "observed-project-activity-website-only-no-canonical-certification"
reviewed_at: "2026-11-24"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B — Traffic Current Observation Public View, 2026-11-08

## Actual evidence and visible problem

The user's public Traffic screenshot at approximately 13:51 UTC showed the canonical historic Total/Potential/Confirmed Human chart ending October 19, followed further down by recent observed daily buckets through November 8 (partial). The independently streamed browser-intelligence panel displayed a loading fallback. Production source e0586a7b7c355c3b29037d78c71fe26d528d2475 remains healthy on 3032.

Read-only physical HEL1 checks at approximately 13:52 UTC:

- Certified canonical sessions, loopback Traffic API public-audience-series: HTTP 200, 131 completed days through October 19.
- Observed qualifying IP / GET counts, observed-daily-series: HTTP 200, current activity through November 8, latest UTC day partial.
- Observed browser beacon cohort, observed-browser-insights: HTTP 200, last completed browser day November 7, initial query about 9.1 seconds and subsequent warm query about 2 milliseconds.

These are DIFFERENT measurements. Qualifying IPs are not humans. Filtered GETs are not sessions. Browser-observed cohorts are not canonical independent certified-human figures. The screenshot documents the streaming fallback; it does not establish that every later request hangs indefinitely.

The canonical public-audience publisher timer is intentionally disabled after the full-history recomputation failed on an eighteen-million-row input. Traffic issue #31 requires verified coherent offhost source backup, ingress clock and late-log finality evidence, global-IP/cross-day session equivalence, memory-bounded atomic publication, and at least two actual newly certified days. The old timer must not be restarted or replaced by observational totals.

## Source-only UI repair

The existing dynamic Traffic page now displays its separate current observed activity first through the original typed, GET-only, canonical-cutoff-checked ProvisionalTraffic read model. The UI provides an interactive observed trend chart with two independently scaled explicit metrics:

- Filtered GET requests (not sessions), left axis.
- Qualifying IP addresses (not people), right axis.

The chart uses its own statistics SVG/gradient variant, preserving the original certified chart's IDs and styling. 7D/30D/ALL controls and hover labels derive from the existing PremiumTimeSeriesChart. The latest day remains identified as partial; the original compact 14-day bars and observed count cards remain available.

The certified historic Traffic chart with the original Total/Potential/Confirmed Humans data, selected series and exact markup is unchanged, placed underneath a precise certification and evidence boundary. The original last-published warning now belongs to that historical section, not the top of the page. No database grants, counters, ingestion programs, timers, human classifications or financial services were changed.

The independent observed-browser rail retains its bounded timeout and fails closed on unknown data. A slow initial API response is not concealed as new session totals.

## Acceptance and remaining holds

Five targeted Traffic-related Node contract files passed 35/35 cases, including strict separation of provisional from certified source, validation of dates, count hierarchy, privacy thresholds and historical chart integrity. The updated UI itself is SOURCE ONLY until a CI-qualified exact build and guarded public release physically succeed.

The current deployed website e0586a7b... must be preserved with Steam safe re-admission and rollback if a new runtime replaces its PID. A confirmed Scribe and admin login is an acceptance requirement, not permission to reassign accounts. Chain C01–C09 remain solely under Session A.

Canonical tracking: https://github.com/Emaren/traffic-api/issues/31 and https://github.com/Emaren/app-prodn/issues/1108.

## 2026-11-16 — B source-backed historical re-review

Review basis: the retained original document and the current canonical App main `d36e9f98e44b0a4de438c5cc623706873c333ca5`, compared to source anchors: `app/traffic/page.tsx` Git blob `f24bb376573b3f98de031d85ae1cbb025e51ce90`; `lib/publicTraffic.ts` Git blob `1b8be987b16abdbc39f8357b9a761d1f2e664dea`.

The current Traffic page/chart and completed-day source do not authorize restoring an obsolete experimental observation chart. Provisional observations and project daily rollups cannot replace the 131 canonical certified days; newer incomplete days remain explicitly unverified.

Disposition: **B-owned nonfinancial/source-history review only.** Original dated release and CI evidence remains historic; this review is not a new physical acceptance, privileged B release permit, protected Steam/FINANCIAL admission, or authorization for the pending Ember Reign campaign singleton. Preserve the source/receipt distinction.

## 2026-11-24 -- WE2 source review in Atlas production era

Actual evidence comparison: historical dated document versus exact canonical main `f14bf4625ed124beafe80dc34188dcb7da16daa0`; physically accepted Atlas is distinct source `ed4b0ac878725eeb62c86b79ae416511da903e7d`. This is a source review, NOT an owner-native signer, new browser login, financial release, database migration, renewed permit or new site deployment.

- `app/traffic/page.tsx`: current canonical-main blob `f24bb376573b3f98de031d85ae1cbb025e51ce90`
- `lib/publicTraffic.ts`: current canonical-main blob `1b8be987b16abdbc39f8357b9a761d1f2e664dea`

**Current finding:** Source remains unchanged. Provisional traffic observations must never be silently equated with certified canonical visitor counts.

**Scope restriction:** Original historic evidence retained. A code blob change requires new exact source qualification; prior release receipts and physical T10 evidence are immutable. No inference of a newly admitted ninth Factory invocation.
