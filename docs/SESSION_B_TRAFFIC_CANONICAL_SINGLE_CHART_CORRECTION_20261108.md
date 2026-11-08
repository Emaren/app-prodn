---
id: "aoe2war.app-prodn.session-b-traffic-canonical-single-chart-correction-20261108"
title: "Session B — Traffic Canonical Single Chart Correction, 2026-11-08"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "traffic-api"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "traffic-canonical-website-only-exact-daily-finality-required"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B — Traffic Canonical Single Chart Correction, 2026-11-08

## Owner acceptance

The owner explicitly rejected the additional Recent observations graph. The intended visualization is the original historical chart showing Total Traffic, Potential Humans and Confirmed Humans, seamlessly extended with one newly finalized UTC day at a time. In-progress UTC days must be ABSENT (never initialized as zero), and the original semantics must never be substituted with observed IP counts, GET events, browser cohorts or an approximated session classifier.

## Read-only physical source census

The public certified series currently ends **2026-10-19** (131 days). Independent, native read-only private forward-ledger check on HEL1 reports **3,271,147 canonical future candidate events retained from 2026-10-20 through 2026-11-08**, cursor 49,366,016 versus source maximum 49,366,803 (787 raw-row IDs behind at the observed instant). Ledger phase LIVE, integrity PASS, but canonical_day_classification_ready=false, utc_day_completeness_certified=false, ready_to_publish_days=[].

The bounded ingestion receipt audit reported HOLD_SOURCE_COLUMN_ABSENT with 4,000/4,000 sampled recent rows lacking an authoritative insertion-time timestamp and zero known ingestion delays. It explicitly failed remote_log_delivery_complete, global_ip_classification_stable and publication_authorized.

The current read model's newer observed day counts are therefore NOT valid replacement data for the original human/session graph. The legacy all-time full-history publisher was disabled after an unsafe, resource-intensive failure; do not restart it or interpolate data.

## Website source correction

The Traffic server page retains the exact loadPublicTraffic() and the original PremiumTimeSeriesChart data points and SERIES, with strict last-completed-day filtering already enforced by lib/publicTraffic.ts. Removed the owner-rejected Recent observations chart, recent observational bar chart and duplicated daily-observational presentation. The independent information-only browser-sensor rail remains underneath the single original chart. The existing observed daily APIs are unchanged for source forensics and future authorized reporting.

The chart automatically extends whenever the certified daily source publishes another valid day; no special frontend release is needed to advance its dates. The website displays last certified UTC day and a truthful lag warning rather than plotting unknown values as zeros.

## Hard publication blocker

Traffic issue #31 must qualify an incremental canonical session publisher that reproduces the old global-IP/burst/session behavior, verifies cross-midnight sessions, binds insertion-time receipts and remote-log arrival finality, recovers old Oct20+ candidate events without guesswork, and proves two newly completed days before automatic daily acceptance. Any owner-directed data fix must remain read-only until these gates pass.

No changes to Wolo financial roles, Chain C01-C09, 3030 rollback, validator, live traffic ingestion timer or private SQLite tables are authorized by this website patch.

## Acceptance

35/35 targeted Traffic source tests passed on the corrected UI. Source-only until new exact-head CI-qualified candidate is physically promoted with Steam V7+ admission for its new build and rollback. Current public website source 0a7450f9 remains accepted until replaced. Do not claim the October 19 data gap is repaired by hiding an observational chart.

Gate tracking: App #1108, Traffic #31.
