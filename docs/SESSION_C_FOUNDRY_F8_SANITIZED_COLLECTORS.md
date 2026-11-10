---
id: "aoe2war.app-prodn.foundry-f8-offline-collectors"
title: "Foundry F8 — Offline normalized collectors, source HOLD, immutable observation digest"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "kingdom-foundry"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "product-only-session-c-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Foundry F8 — Offline normalized collectors, source HOLD

## Exact ancestry and source ownership

F8 implementation source:
ecb2bd51c3907c2f7ea8c1704113449a2c70aa35.

Parent F7 draft App PR #1298 source:
9a73314a11ec9693d0939136b9fc74b9d8b9895e;
F6 draft #1297:
491a92b824309731edb7a4bb97b28129ae099d3e;
F0–F5 drafts #1291 and #1296 remain independently CI green.

Session C-owned PRODUCT worktree: kingdom-foundry-f8.
Branch: session-c/foundry-f8-sanitized-collectors-20261110.
No Session B checkout, public R25 production, financial SQL, custody,
signers, Intel cold receiver, PAPER account credentials or native
market data were accessed or changed.

## Actually working source

nightforge_collectors.py exposes:
- seal_offline_fixture: deterministic, explicitly local research-only
  JSON fixture creator. It is NOT a production collector or trusted
  source and cannot attest systemd, vendor CI or Steam sessions.
- review_snapshot: accepts at most 4096 bytes, exact allowed keys,
  known PRODUCT_B/PRODUCT_C lane, exactly one typed, sanitized
  observation family, a local SHA256 content digest, a reported UTC
  time no more than one hour old (relative to an externally supplied
  evaluation clock), and no unknown fields or unbounded strings.
  Rejects duplicated JSON keys, nested object/list payloads, financial
  identifiers, executable/report text, malformed times, future/replayed
  observations, poisoned digests and forged producer modes.
- review_batch: one to 20 distinct offline snapshots, grouped into
  normalized severity/code findings with zero network calls.

Supported fixed field sets (no arbitrary service logs):
systemd services/timers; GitHub draft PR and CI status; Steam
admin/ordinary authentication *reports*; Watcher 1.6.5 state;
canonical Traffic certification day/gap *reports*; Storage OS
capacity; private PAPER source age/CRC/HALT *reports*; managed
media counts; and app route status *reports*.

The existing F3 diagnostic derives a fixed summary from each typed
observation. The outgoing F0 event permanently writes source SHA
"unknown", regardless of a report-supplied valid-looking Git SHA.
No source-bounded observation is allowed to claim the service is
physically authenticated. A report with reported native CRC TRUE
still cannot authorize a native market price, a PAPER order, nor
anything in FINANCIAL.

F8 evidence ABI v2 has a distinct SHA256 of the exact sanitized
snapshot and the diagnostic code: it prevents different observations
of the same kind from being silently collapsed by F1's
unique-evidence task fingerprint. Duplicate identical snapshots
remain idempotent. F1 accepts v2 evidence only as permanent HOLD,
even if a forged event contains an actual pinned Git HEAD. F1 v1
compatibility and all original F0–F7 tests remain intact.

F7 private owner dashboard now displays sourceSha "unknown" as
HOLD_SOURCE_UNVERIFIED instead of crashing or incorrectly
presenting it as a verified source. It does not mount any webpage.

## Physically run local source acceptance

At the exact F8 implementation source above:
- 15/15 new F8 adversarial tests PASS.
- Full F0–F8 suite 100/100 tests PASS.
- Includes physical owner-private SQLite F1 ingestion of two
  distinct same-category observations and rejection of duplicate
  same-snapshot replay; F2 refuses to enqueue both HOLD events.
- Even substituting the real current Git commit into a v2 event
  cannot escalate source trust or enable a job.
- Source tests cover all nine typed observation categories,
  poisoned/duplicate JSON, future/stale time, fake capture authority,
  out-of-lane and unknown fields, embedded sensitive input, duplicate
  replay, bounded batches, and zero network, model, shell, broker,
  finance or order access.

These are offline/synthetic research receipts, NOT authentic external
source collection. Source SHA and content hash are local change
detectors, NOT a signer/HMAC, independent witness, live native checksum
or externally verifiable freshness. A later unprivileged collector
would require its own separately authorized read-only service API
and source attestation before any promotion of source authority.

## Release packet and rollback

Public F8 routes: NONE. New local network listeners: NONE.
HEL1 CPU/RAM/disk impact from F8: ZERO, because nothing is
installed. No scheduled service, resident inference or Python worker.
M1 worktree, tests and small documents only; no new market capture.

Website integration 401 anonymous, 403 ordinary authenticated
nonadmin, 503 missing trusted source, 200 genuine admin-only read
are FUTURE contract expectations, NOT measured HTTP responses.
Session B alone can authorize public 3032/rollback 3030 source
admission after the authenticated role matrix and Central review.
GitHub green checks and a sanitized fixture never confer release
authority.

A future stand-alone read-only observation service needs a
dedicated unprivileged PRODUCT identity, mutually authenticated
limited-read sources, pinned exact Git source, no raw financial
content, private 0600 state, finite memory/CPU/disk, no persistent
model, off-host source evidence where required, documented restart
and rollback. The existing F7 offline 0600 HTML export may be
reviewed independently, never copied to the public document root.

Rollback today: leave the F8 draft unmerged. This additive module
is not imported by production; F7 source and deployed services
remain unchanged.

**Status: source tests PASS; independent exact-head GitHub CI pending.**
**Foundry executor DISABLED; Nightforge HEL1 inference HOLD.**
**Private PAPER new orders HALT, live trading HALT, financial unchanged.**
