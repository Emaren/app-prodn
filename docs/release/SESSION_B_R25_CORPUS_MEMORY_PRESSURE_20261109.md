---
id: "aoe2war.app-prodn.session-b-r25-corpus-heap-pressure-20261109"
title: "Session B R25 generation-aware replay corpus pressure repair"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "source-only-nonfinancial-r25-memory-guard"
reviewed_at: "2026-11-17"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B R25 generation-aware replay corpus pressure repair

## Exact physical problem

At November 9 2026, 14:10:46 UTC, R25 PID 3750280 hit its real V8 2,048-MiB heap limit and aborted; the failure was not a kernel OOM. Systemd restarted PID 4183890 at 14:10:55 UTC, invalidating the Steam process-bound receipt. A read-only Nginx audit of 14:09:50-14:10:46 found many distinct player-profile, matchups and game-detail GETs, with repeated restricted PostgreSQL 42501/P2039 failures on replay_parse_attempts. This overlap is a plausible source of substantial per-request allocation, but it is NOT a demonstrated heap retention profile. All financial ports 8092-8095 remained closed. The existing C03/C04 fingerprint was unchanged after restart.

The live database has 61,803 game-stat rows, including 7,052 final rows. Several App projection caches rebuild rich replay corpuses when a generation watermark changes. The watermark has a one-second coalescing window; parallel unique dynamic routes may request separate generation versions and allocate multiple heavy projections concurrently. Each generation-keyed loader previously coalesced only the same key, not different keys. A bounded direct read-only physical probe of the existing R25 PID for players, rivalry, battle-archive, leaderboard and one game-detail page showed HTTP 200 and small isolated settled RSS increments. This does NOT establish that a multi-route peak workload is stable.

## Narrow nonfinancial source repair

Add an opt-in serial heavy-corpus mode to the existing per-Prisma-source generation-keyed loader. This preserves all complete historical rows, same-generation coalescing and failure retries, but allows only ONE active projection build per loader/source across generation changes. It does not serialize ordinary lightweight caches or requests. The full-corpus leaderboard, profile replay, exact-Steam profile and public rivalry/board caches opt in, with a reduced but positive generation retention ceiling. No finance SQL, role, chain, transport, external API or pager authorization changes.

Install a passive 30-second production-only process-memory census for the explicitly restricted R25 runtime. It emits rounded RSS, heapUsed, heapTotal, external and array-buffer MiB with PID/uptime only; no cookie, token, URL, SQL or personal data. It neither restarts processes nor increases a V8 heap limit. Retain the existing uncaught-exception monitor and hard financial isolation.

## Acceptance guard

Source and synthetic bounded concurrency tests do NOT demonstrate a fix on a live historical corpus. Require exact-head CI, source/build/artifact SHA proof, isolated current restored database replay stress, a functioning independently finance-restricted authenticated rollback, and a cold-start qualified production cutover. Monitor at least the old crash workload across sustained traffic and observed generation changes, V8 heapUsed/heapTotal, RSS, CPU, swap, GC, and real login continuity. Any recurring heap abort, high-water growth, stale authorization, incorrect history or bank mutation is HOLD and rollback. The current 3033 503-only listener is emergency containment only, not an authenticated production rollback. Steam V14 source is separately merged but not installed while the R25 process identity remains unstable.

**C03_APP_HANDOFF=HOLD.** No change to C01-C09 gate status, 8092/8093 masks, production SQL permissions, C09 signing or customer balances.


## November 17, 2026 — WE2 historical-source re-review

This is a **dated November 9 draft/source-and-incident record**, not the current
HEL1 release procedure, current process-ID census, operational signer permit,
or proof that its proposed Steam/rollback runtime is now installed. Statements
such as “current PID,” “original runtime” and candidate BUILD_ID in the
historical sections refer to their recorded November 9 observation. The
November 16 public website had source
`09ff9eeccb93b4701d1cfd1ff329f0286cdc6e16`, with the existing
Factory V3 controller and finance sockets 8092–8095 closed; the proposed
nonfinancial follow-up PR #1394 has separate exact-source review, Factory and
authenticated browser gates. Never run a historical controller or trust an
old source-pinned permit against the newer runtime. All WoloChain custody,
writer fences, funding, C02/C03/05/06/07/09 and independent restores remain
under WE1 authority; nothing in this re-review authorizes financial SQL,
native 8094/8095, customer funds or changes to protected services.

This WE2 `aoe2war-web` source-owner review renewed the **historical-document
freshness only**. It does not re-attest the original host's transient PID,
systemd, NFT, PostgreSQL or memory measurements. New physical assertions
require a fresh, source-bound operational receipt.
