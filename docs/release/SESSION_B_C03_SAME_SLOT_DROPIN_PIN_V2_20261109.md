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
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# C03 restricted 3032 drop-in-preserving rollback v2

The original reviewed #1267 root controller has an impossible live HEL1 precondition: its restore requires DropInPaths empty. HEL1's actual aoe2hdbets-web-prod.service has a legitimate, root-owned systemd memory cap drop-in. Do not delete or override it to satisfy an outdated predicate.

The additive v2 rollback controller accepts only the exact existing /etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf whose SHA-256 is 9590e15b4544680e0eec8a16cac43c272cd1e06267be46b0fa26c741d2e57438, with root ownership, one regular inode, mode 0644, and effective systemd MemoryMax=3355443200 bytes. A missing/extra drop-in, altered SHA, altered permission or effective bound is a HOLD. Original unit and candidate remain the exact four-path, 3032-only substitution from #1267; runtime V8 remains 2048 MiB.

No promote, third Next server, 3030 fallback, finance grant, 8092/8093 restart, native settlement action or WOLO movement is added. Inspect is read-only. Restore still requires the exact candidate to be live, is one-use with independent 0600 receipt, and reverts only the restricted website.

Not physical acceptance: the v2 script's source tests include original denial paths plus changed/extra drop-ins, non-root ownership, SHA drift, and changed effective MemoryMax. A physical, source-verified staged v2 inspect, candidate promotion, actual rollback, Steam process re-enrollment, authenticated Chrome sessions and memory durability are separate requirements. C03_APP_HANDOFF=HOLD until those pass.
