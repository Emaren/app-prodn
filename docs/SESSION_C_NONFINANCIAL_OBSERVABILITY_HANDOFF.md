---
id: "aoe2war.app-prodn.session-c-nonfinancial-observability-handoff"
title: "Session C — Nonfinancial observability source handoff (NOT deployed)"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","traffic-app","traffic-api","aoe2-watcher","storage-os"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-only-session-c-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Session C — Nonfinancial observability source handoff (NOT deployed)

## Exact identity and ownership

This is a separate Session C PRODUCT worktree, on branch
session-c/traffic-watcher-storage-readmodels-20261110.
The reviewed implementation source is
565075dc791c9d538638416b0f577403694c5e3f,
based exactly on fully green App PR #1281 at
34782231fbcd7491a83c45cb6872764595710901.
The accepted R25 b1ef050b lineage is preserved in both ancestors.

Session B retains the actual R25 website, public 3032, Steam V20,
Nginx and authenticated Chrome role/session acceptance. This source is
additive and never modifies any Session B-owned existing implementation
file or its separate session-b-app-c02 worktree. No production API route,
page, navigation item, middleware, finance SQL, settlement, bet, WOLO
transport, or Chrome-auth session is changed. There is no third Next
runtime. The current public Traffic original chart is not replaced.

## Implementation with explicit trust limits

- lib/sessionCTrafficContinuity.mjs: accepts bounded, date-ordered
  normalized candidate original-certified Traffic day records plus
  separately bounded provisional observed-only IP/GET records.
  Requires an exact last original certified day. Any interior certified
  or provisional gap is represented as null and reported by UTC date,
  never backfilled as zero. Real documented zero-day originals remain
  legitimate zero. Original sessions never merge with provisional IPs
  into a single misleading certified human series. Rejects overlapping,
  duplicate, out-of-order, future, invalid date and count inconsistencies.
  This code does NOT independently authenticate archived original source
  bytes or ingest Traffic; output status always source-certification HOLD.
- lib/sessionCWatcherVisibility.mjs: groups Watcher 1.6.5 source
  observations into current/stale/future/version mismatch/disconnected/
  unverified counts with a bounded heartbeat TTL. No watcher ID, UID,
  IP or raw telemetry is copied out. An observed heartbeat never
  certifies replay monitoring, user consent, release installation,
  or a successful update. It sends no notification and restarts nothing.
- lib/sessionCStorageCapacity.mjs: deterministic Mac/HEL1 root/
  HEL1 evidence-volume capacity and reserve risk from an explicitly
  server-signed-visual-only input. Missing/stale/invalid planes are
  UNKNOWN rather than zero or healthy. Mac research source floor is
  30 GiB; host capacity warning reference is 8 GiB per plane.
  No actual C06 backup/source HMAC/C07 restore or natural automation
  cycle is claimed from a visual receipt. No cleanup/deletion authority.
- components/SessionCNonfinancialObservationPanel.tsx:
  responsive UNMOUNTED server-rendered preview, labeled HOLD and
  source boundaries, no hook/fetch/order/write/button, no financial
  controls, no new public page or nav link.
- tests/session-c-ops-observation-contract.test.mjs:
  deterministic positive and adversarial tests for all three contract
  families and responsive absence of browser secrets/fetch.

## Offline acceptance and HTTP behavior

The dedicated workflow now fetches full Git history, rather than a
default one-commit PR checkout, so docs_v2_check.py can independently
prove the recorded implementation baseline commit is a true ancestor.
This does NOT bypass or replace the existing documentation verifier.

The 14 source contract tests run with Node builtin test runner; existing
9 PAPER seam tests and 88-route census continue separately.
The lightweight session-c-observability-offline GitHub workflow runs the
contract and existing PAPER seam checks, route census and documentation
index check without a private runtime, database, network API or third
Next.js build.

No REST route is currently mounted. Therefore HTTP 401, 403, 503 and 200
on this new candidate are FUTURE ADMISSION EXPECTATIONS, NOT PHYSICAL
production evidence: a future admin-only route should return 401 when
unauthenticated, 403 for authenticated nonadmins, 503 when source
authentication or source continuity fails, and 200 only for separately
verified read-only private source status after a B/Central release
handoff. The actual PAPER operator HTTPS service remains on its
independently authenticated localhost-only port 9447; the App status
bridge from PR #1281 is also unmounted and disabled by default.

## Capacity and rollback

Each pure read model has finite bounded input: at most 1500 original UTC
days, 60 provisional days, 200 Watcher observations and three storage
planes. No daemon, socket, new copy of Traffic archive, queue, database
writer or periodic polling has been started. The additional static
source checkout costs disk only (no runtime RAM/CPU). No heavy Next
build is run on the 15 GiB-free owner Mac. Exact resource timing must
be measured by Session B before any production integration.

A future source rollback means omitting/unmounting this additive UI and
the three independent pure modules. There is no new public selector to
revert and no FINANCIAL table to restore today. Protected website 3032,
existing 3030 rollback, Steam V20, Traffic storage history, and C06/C07
financial recovery on the Intel Mac remain untouched.

## Handoff gates

1. Session B authenticates admin and ordinary/nonadmin role/session
   matrix and identifies a source SHA for accepting this interface.
2. Traffic source owner pins original canonical archive bytes and daily
   rollup continuity; watcher and storage evidence owners attest actual
   trusted receipts. No guessing source freshness from UI presence.
3. Central approves any real admin-only route and public 3032 release.
4. Actual 401/403/503/200 HTTP acceptance and reversible deployment are
   then tested by Session B. Until then PRODUCT_APP_SEAM=STAGED,
   TRAFFIC_WATCHER_STORAGE=SOURCE_PROGRESS, LIVE_TRADING=HALT.

Sources: App handoff issue #1280 and draft PR #1281. Kingdom Traders
source PR #120 qualified; separate KT70 draft PR #121 is offline only.
