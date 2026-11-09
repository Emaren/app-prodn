---
id: "aoe2war.app-prodn.docs-c04-native-wolo-rest-paging"
title: "C04 — Native Cosmos REST paging and heartbeat source correction"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain","postgresql"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "source-tested-no-live-finance-writer-activation"
reviewed_at: "2026-11-08"
review_interval_days: 14
sensitivity: "internal"
---

# C04 — Native Cosmos REST paging and heartbeat source correction

## Root cause and physical contract
Native wolo-1 REST /cosmos/tx/v1beta1/txs uses bare one-based
page=N&limit=100. The old App lib/woloMainnetTransfers.ts submitted
pagination.offset and pagination.limit, which the actual node ignores.
App issue #1249 records the duplicated first page, not a missing
historical chain transfer.

A fresh read-only localhost-1318 two-page probe on HEL1 returned exactly
100 messages for each of page=1&limit=100 and page=2&limit=100, zero txhash
overlap. Concatenated two-page transaction-hash digest SHA256:
f765f20600950f300b01d8e8325e8b4ec56bdeb68e387bf3251fc450d5b65b3f.

An earlier Session A read-only 43-page census reconciled all 4,300 bank-send
messages, transaction hashes, heights, sender/recipient and uwolo amounts
against 4,300 original HD indexed transfers, with zero missing on either
side. This does not prove which historic App claim each transfer paid.

## App patch and invariants
- lib/woloRestTxPages.ts: fixed-purpose bounded parser with bare page and
  limit, 100 records per request, maximum 100,000, duplicate hash/replayed
  page rejection, missing/error/invalid-total/truncated-page denial,
  uppercased transaction identity, no financial writes.
- lib/woloMainnetTransfers.ts calls this helper. Classification and
  memo/height/owner processing remain unchanged. A complete source-query
  success gate now precedes ANY upsert, preventing partial HD financial
  index writes when one of multiple paginated queries fails.
- scripts/backfill-wolo-mainnet-transfers.mjs explicitly exits nonzero
  when the backfill returned ok:false, even outside the enrolled shell.
- The old production heartbeat shell grepped JSON counters but returned
  success even when the producer output had ok:false.
- scripts/wolo-transfer-heartbeat-result-guard.mjs requires valid JSON
  with ok:true, chainId=wolo-1, empty errors, integer counters and
  positive height. It never prints raw bodies or credentials.
- scripts/aoe2-wolo-transfer-heartbeat.c03-held.sh is a source-only
  replacement preserving original arguments/lock. DO NOT install until
  Session A approves a C03 restricted financial-writer transition.

## Test and release boundaries
- Pure Node adversarial fixtures exercise real page 2, partial limits,
  repeated first page, drifted total, truncated replies, malformed
  hashes, missing output, HTTP errors and oversized requests.
- Heartbeat fixtures cover false/missing ok, malformed JSON, wrong chain,
  negative/fractional counters and invalid height.
- Tests perform NO signer/key access, no live DB write or WOLO transfer.
- A must approve writer/service enrollment after a C06/C07 exact restore,
  C03 writer isolation and source-bound rollback. Zero fallback to 8092.
- Historic claimed-without-hash liabilities remain UNKNOWN; corpus match
  is not authenticated Comet proof or obligation-level finality.

**Acceptance: C04 SOURCE REPAIR QUALIFIED, NOT CHAIN C04 CLOSED.**
