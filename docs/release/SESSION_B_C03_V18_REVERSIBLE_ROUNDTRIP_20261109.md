---
id: "aoe2war.app-prodn.session-b-c03-v18-reversible-roundtrip-20261109"
title: "C03 V18 retained-site reversible rollback and return: exact source and isolated receipt"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "one-slot source-pinned nonfunded rollback/return; no financial release"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# C03 V18 retained-site reversible rollback and return: exact source and isolated receipt

The reviewed b1ef R25 website remains physically retained on HEL1 PID465815, same 3,355,443,200-byte MemoryMax, unchanged UID, and 3032 unit SHA f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a. Steam V18 source SHA256 is 42dbba88209ba703a5d8472e83c3865d890e5a9b7481587102b33deba5f51c4b, unit SHA 8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032. Original restricted R25 unit is SHA 42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621, original source 4ab96cc7c1c0ba43a0403795485d3f410a6ba07f, build YF_YxSAxc0izAfRG0ARsc and version 20261108182649-ca81f00609. Candidate source is b1ef050b954be734c9f34147361e0d02d7c89b19, build QVzgMJiQwhFvwrRbY9oZW, version 20261109194837-9ac998896a and manifest a306aebc8643feb3ae0ae75249f3bf8b4c19b11a7f4957a8e882d0b845a1a58d.

## Reusable same-slot mechanism

The new script scripts/release/r25_c03_v18_reversible_roundtrip_v1.py provides **read-only --inspect** and opt-in **--physical** modes, never automatic deployment. It source-pins the existing retained controller, CI artifact, accepted-runtime PID, public roles, V18 C01/C04 nft topology, two allowed Next site processes and closed ports8092–8095. Each leg stops the Steam timer and website BEFORE changing exact systemd unit bytes, starts the one reviewed replacement, proves build/health, re-enrolls Steam against the new PID, refreshes nft and restores timer, then rechecks protected services, memory, role and ports. It exercises candidate → original restricted 3032 → same candidate, never a third Next or a 8094/8095 service.

Failure before website stop preserves the running candidate and only repairs timer. Failure after website mutation attempts source-verified candidate recovery, else original restricted website with V18. Negative result is always HOLD even if site was safely recovered; immutable one-use receipt stores actual result. It never grants financial access, credits customer balances, alters wallet or backup, or authenticates owner sessions artificially.

## Isolated physical evidence and hold

On Nov 9, the one-slot lifecycle/adversarial FakeHost suite passed 7 groups; the private owner Mac receipt sealed **14 vectors** (one full positive roundtrip, 11 injected stop/health/enrollment/refresh failures, third Next process denial, and permanently unhealthy candidate fallback to original). Controller SHA256 31d98b68da903922ccc49e75c595e58f0ebbfbc2b5338f4011c65b1deacf677d; receipt SHA256 9fcd3c0be40830945a77559a602b121efa4b6334ab19f7fb10159937a7db363a; PASS_ISOLATED_ROLLBACK_AND_RETURN_WITH_NEGATIVE_RECOVERY. No live website switching or authenticated owner validation was performed by that test.

HEL1 read-only census found a preexisting third Next on port3031 (R24 PID1483304) and Python-only failclosed port3033. Exact R24 3031 had zero Nginx selectors, zero connections, zero reverse dependents and a disabled unit file. A guarded **R24-only stop** completed receipt SHA256 38cec1654b260a753b36fe185ff0bca2baf177dc2a3d25f86b423321b3aab3e3. Port3031 inactive; production PID465815 and original 3030 rollback PID2625090 unchanged; Steam source unchanged, ports8092–8095 closed and no WOLO moved. Port3033 remains Python-only and is not authenticated rollback.

Physical --physical is NOT yet accepted: requires reviewed CI PR, private root installation, read-only --inspect and independent signed-in owner/nonadmin session proof. The code alone is NOT C03_APP_HANDOFF_ACCEPTED and never closes Chain C03. Session A owns financial writer, C06/C07, C02 native custody and C09 permission.
