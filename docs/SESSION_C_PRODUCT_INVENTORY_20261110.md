---
id: "aoe2war.app-prodn.session-c-product-read-only-inventory-20261110"
title: "Session C PRODUCT — Read-only worktree and release candidate inventory"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","kingdom-foundry","kingdom-traders"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-only-session-c-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Session C PRODUCT — Read-only worktree and release candidate inventory

## Observation provenance

Actual read-only local Git/df/du census on the connected owner M1, November
10, 2026 ~14:05 UTC. The source-only F6 worktree was created afterwards.

M1 data volume: 460 GiB total; 401 GiB used; **23 GiB free**, about 95%
used. No file deletion, archive migration, build-tree cleanup or forced
history consolidation was performed. Native 30 GiB market capture is HOLD.

## Separate PRODUCT checkouts

| Checkout | Source and branch prefix | Approx disk | Owner |
|---|---|---:|---|
| app-prodn | 34782231f / session-c/r25-nonfinancial | 540 MiB | C |
| app-nonfinancial-observability | 58b175cc6 / session-c/traffic-watcher | 288 MiB | C |
| app-paper-status-seam | a1883ffc5 / session-c/kt-paper-status | 288 MiB | C |
| foundry-f0-review | a841d468f / session-c/foundry-f0 | 287 MiB | C |
| kingdom-foundry-f1 | 781dc1cb3 / session-c/foundry-f1-f3 | 288 MiB | C |
| kingdom-foundry-f6 | 5866bdf53 / session-c/foundry-f6 | ~287 MiB | C |
| kingdom-traders | 2276ae924 / session-c/kt68 | 15 MiB | C |
| kingdom-traders-kt70 | b2048f5ba / session-c/kt70 | 11 MiB | C |
| kingdom-traders-kt71 | 43c888161 / session-c/kt71 | 11 MiB | C |
| kingdom-paper-bridge | c73aed4 / session-c/kt-paper-bridge | Not measured | C |
| session-b-app-c02 | 06e673865 / session-b/r25-sniper | 246 MiB | B exclusive |

The inspected Git checkouts were clean. The owner-approved pinned PRODUCT
source guard passed. Session B checkout was not mutated. Check the real
heads and dirty state again before any future release.

## PR/source ancestry and conflicts

- App PR #1281: 34782231f, admin-first PAPER bridge UNMOUNTED.
- App PR #1288: 58b175cc6, stacked on #1281; Traffic/Watcher/Storage
  source CI qualified, but original Traffic audience series for Oct 20
  onward remains unverified and held.
- Foundry App PR #1291: a841d468f, reviewed F0 source and docs,
  separately based on R25 b1ef050b954be734c9f34147361e0d02d7c89b19.
- Foundry App PR #1296: 781dc1cb3, stacked on #1291, independent
  GitHub CI successful.
- F6: 5866bdf53 implementation, stacked on #1296. This F0-F6
  stack is NOT the same ancestry as #1281/#1288; never force
  branch consolidation or merge conflicting App histories.
- Kingdom Traders #120/#121/#122: 2276ae924 / b2048f5ba /
  43c888161, separate repo, fully source qualified (not funded).
- B independently owns Sniper media, Steam, 3032, website auth
  matrix and rollback. C supplies only separate reviewed source.

## Read-only storage hygiene

No .next directories were seen in the four checked App directories
from the initial generated-build census. Their Git checkout sizes do
NOT establish deletability. Historical Watcher and Traffic documents
have different provenance/retention; do not delete by similar names.

The PRODUCT root also holds operator-private auth/receipt and release
package directories, plus storage-ops and public recipient metadata.
Their contents were NOT opened. Treat all as retained or protected until
exact owner, backup/recovery, security and rollback dependencies are
independently established. No protected FINANCIAL root inspection.

**Proposed cleanup: NONE. Deletion permission: NONE.**

## HEL1 live read-only baseline

At 2026-11-10 14:05:59 UTC: root ~23 GiB free (85% used), memory
7.6 GiB installed / 1.9 GiB available, swap ~6.0 GiB used.
kingdom-traders-paper systemd active as kingdompaper PID 779129;
96 MiB memory limit, 15% CPU. Listeners observed on localhost
127.0.0.1:9447 (PAPER) and 127.0.0.1:3032 (web).
This is a listener/service observation only, NOT a new authenticated
market-price or public UI acceptance receipt.

Website 3032/3030 release remains B/Central-only; native financial
services and Intel C06/C07 remain Codex-owned. No PAPER orders,
funded operations, financial code or service changes in this inventory.
