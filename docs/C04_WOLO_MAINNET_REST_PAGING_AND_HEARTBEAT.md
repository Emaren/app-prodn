---
id: "aoe2war.app-prodn.c04-wolo-rest-pagination-heartbeat"
title: "C04 native WOLO REST pagination and fail-closed index heartbeat"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain", "postgresql"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-pending-c03-financial-writer-release"
reviewed_at: "2026-11-08"
review_interval_days: 14
sensitivity: "internal"
---

# C04 native WOLO REST pagination and fail-closed index heartbeat

## Live incident and correct protocol

HEL1's deployed Cosmos REST on 127.0.0.1:1318/cosmos/tx/v1beta1/txs
**ignores** pagination.offset, pagination.page, pagination.limit and
offset-style arguments in the legacy App transfer writer. It implements
**plain one-based page=N&limit=100**. Consequently the old indexer silently
refetched the first page, while the oneshot shell grepped created/updated/
txsSeen counters without verifying JSON ok.

Source files:
- lib/woloMainnetTransfers.ts: fixed 100-result pages and plain page;
  track immutable transaction hashes and refuse missing, malformed,
  oversized or overlapping pages. Truncate only after fetching a whole page.
- lib/woloMainnetTransfers.ts also rejects the entire write phase if ANY
  paginated source query failed; it returns ok:false with zero created,
  updated or parsed records. Partial successes cannot mutate the HD index.
- scripts/backfill-wolo-mainnet-transfers.mjs: exit nonzero when result.ok
  is false, rather than merely printing an error-containing JSON receipt.
- scripts/verify-wolo-transfer-heartbeat.mjs: pure JSON verifier rejects
  false/missing ok, wrong chain, wrong mode, nonempty errors, invalid height,
  missing query attempts or invalid counters. No private errors/DB strings
  are written to the systemd journal.
- scripts/aoe2-wolo-transfer-heartbeat-v2.sh: source-candidate replacement
  retaining working directory, file permissions, flock and bounded scanning.
  It requires BOTH a successful worker exit AND a valid JSON result. This
  script is NOT installed as the live financial writer.

## Physical read-only evidence and scope

The real localhost Cosmos REST on HEL1 was accessed via private SSH tunnel
from the M1. New App source returned 220 distinct tx hashes across three
native pages. Max height 2,813,553; min height 2,423,706; zero financial
writes. This is a read-only paging test, not a funded canary or authenticated
Comet payment-finality statement.

Separate Session A local parity previously matched 4,300 bank-send transfer
messages to the HD indexed corpus. This old offset bug is a resilience
problem, not proof of missing historical transfers. All 69 claimed-without-
hash historical claims, including 889/9645, remain UNKNOWN liabilities.

Negative tests include first-page repetition, malformed successful HTTP,
oversized pages, repeated hashes, invalid limits, short-page truncation,
false or missing ok, upstream failures, sensitive error body secrecy and
bad heartbeat counters.

## Production coordination and rollback — Session A's C03 boundary

The live heartbeat service still uses aoe2hd_user and is a financial SQL
writer. Session B does not patch that live service, modify HD/DE financial
grants or restart it without Session A's reviewed C03 producer window.

For a coordinated rollout: byte-pin existing script, live unit, source SHA,
effective service identity, full backup and rollback first. Quiesce only
this writer under C03 review. Install new worker JS, verifier and shell
together; prove real REST pages 1/2/3, actual restricted writer grants and
fail-closed result. Rehearse a bounded idempotent write on the exact C07
restored HD database before any separately approved live write. Roll back
by restoring prior source/unit while preserving all indexed transfer rows
and UNKNOWN financial claims. Never reroute payout to legacy 8092.

C04 formal gate closure and finance migration remain owned by Session A.
