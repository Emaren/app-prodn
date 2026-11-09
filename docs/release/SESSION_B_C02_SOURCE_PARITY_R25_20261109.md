---
id: "aoe2war.app-prodn.session-b-c02-source-parity-r25-20261109"
title: "C02 exact native-8094 forward-only App transport source parity in R25"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfunded source-only App transport parity; Chain finance owner retains execution"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# C02 exact native-8094 forward-only App transport source parity in R25

## Source lineage and reconciliation

App #1268 merged at c0613c9aae95050aa5fafaced87be703025707ad into integration/20261023-satchel-final-gated, NOT into the Session B R25 website release lineage. The latter was independently checked with git merge-base --is-ancestor and returned 1. No C02 transport, journal or runtime source existed in the exact #1273 R25 release. A merged source on a different branch is not physical App deployment or production C02 acceptance.

This PR carries ONLY the exact blob from App #1268 lib/warSatchelNativeOnlyReturn.ts, with Git blob parity checked on Mac and source hash pinned by the test manifest. It brings an inert, typed native 8094 transport library into the R25 App source, without an importer, route or scheduled execution worker. It can never itself create a native ledger credit, payout approval or WOLO movement. Its fresh synthetic claim IDs are exactly 900000000001..999999999999 and exclude historical claim IDs 889 and 9645. The strictly shaped signed-v2 approval input rejects claim_group_key=market, legacy hash and absent historical transfer-index fields BEFORE any journal write or network request. The caller must authenticate the actual independent operator signature and original reserve/owner funding evidence before invocation; syntactic presence of signature fields is NOT cryptographic verification.

The library requires a finance-owner durable insertOnce journal before any POST to local 8094 /satchel/v1/returns/execute. Duplicate, uncertain timeout, unknown GET, 404, lost ACK and restart recovery never re-POST an operation. All transport responses remain UNKNOWN/creditAuthorized=false, even if a candidate transaction hash appears. Only GET /satchel/v1/returns/execution/{claim_id} may recover it, and no 8092/8093 or legacy settlement endpoint is available in this source.

## Explicit boundaries and unaccepted gates

The full C02 finance journal / native return runtime and their PostgreSQL14-migration source, original claim/funding lineage, reserve reviewer identity and financial proof verifier still reside in the separate financial integration branch, with Session A. They are NOT copied, imported, installed or activated into the restricted web runtime. An upstream 13th test for funded Prisma journal/migration compatibility is explicitly skipped in this App-only source port and labeled HOLD; this is not silently made green. The real Go 8094 handler test is also intentionally skipped unless a separately authorized isolated inert listener is explicitly provisioned. Neither source-only port nor upstream inert Mac tests establish authentic HEL1 production 8094/8095 operation acceptance.

This branch does not change Next routes, existing App read projections, systemd units, V8 heap, memory cap, port listeners, PostgreSQL grants, C01 keys, C05 reserves or C09 funding. No third Next, legacy payout fallback, chain reset or WOLO movement. C02_APP_TRANSPORT=HOLD; C03_APP_HANDOFF=HOLD until physical and independent evidence qualifies. Merge only after exact-head CI, and do not count the two skipped Chain-owned gates as App transport completion.
