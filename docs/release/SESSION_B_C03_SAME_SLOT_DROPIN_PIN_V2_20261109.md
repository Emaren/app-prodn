---
id: "aoe2war.app-prodn.session-b-c03-same-slot-dropin-pin-v2-20261109"
title: "C03: source-pinned same-slot rollback with existing systemd memory drop-in"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only, finance-restricted, requires physical acceptance"
reviewed_at: "2026-11-17"
review_interval_days: 7
sensitivity: "restricted"
---

# C03: source-pinned same-slot rollback with existing systemd memory drop-in

The original reviewed #1267 root controller has an impossible live HEL1 precondition: its restore requires DropInPaths empty. HEL1's actual aoe2hdbets-web-prod.service has a legitimate, root-owned systemd memory cap drop-in. Do not delete or override it to satisfy an outdated predicate.

The additive v2 rollback controller accepts only the exact existing /etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf whose SHA-256 is 9590e15b4544680e0eec8a16cac43c272cd1e06267be46b0fa26c741d2e57438, with root ownership, one regular inode, mode 0644, and effective systemd MemoryMax=3355443200 bytes. A missing/extra drop-in, altered SHA, altered permission or effective bound is a HOLD. Original unit and candidate remain the exact four-path, 3032-only substitution from #1267; runtime V8 remains 2048 MiB.

No promote, third Next server, 3030 fallback, finance grant, 8092/8093 restart, native settlement action or WOLO movement is added. Inspect is read-only. Restore still requires the exact candidate to be live, is one-use with independent 0600 receipt, and reverts only the restricted website.

Not physical acceptance: the v2 script's source tests include original denial paths plus changed/extra drop-ins, non-root ownership, SHA drift, and changed effective MemoryMax. A physical, source-verified staged v2 inspect, candidate promotion, actual rollback, Steam process re-enrollment, authenticated Chrome sessions and memory durability are separate requirements. C03_APP_HANDOFF=HOLD until those pass.


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
