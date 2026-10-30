---
id: "aoe2war.app-prodn.solo-website-capacity-policy-v1"
title: "AoE2WAR Solo-owner Website-only Capacity Decision v1"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","VPSSentry"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "proposed-operational-policy-not-authorization"
reviewed_at: "2026-10-30"
review_interval_days: 7
sensitivity: "internal"
---

# AoE2WAR Solo-owner Website-only Capacity Decision v1

**No release-GO decision is recorded. No physical gate is waived.**
This policy affects neither frozen W1 nor funded Wolo/custody.

## Two separate physical gates

1. Original website Finish: HEL1 root ordinary free >=5 GiB and attached data volume <92% used; financial service continuity and rollback remain mandatory.
2. Additional conservative #1008 proposal: attached data volume ordinary >=30 GiB, effective <=88% and Finish <92%, with 6/6 source-consistent encrypted captures and independent physical isolated restores. These are additional owner policy requirements, not already enforced by original Finish.

## Measured facts and recovery risk

Owner-native HEL1 2026-10-30 06:02:54Z: root free 66.7039 GiB; attached data volume free 21.0223 GiB, effective used 92.5725%, Finish used about 92.878%. Minimum genuinely additional usable volume free **12.9417 GiB plus continuing-write margin** to meet conservative effective <=88%. The original <92% requirement also FAILS. No verified ciphertext transfer, no reclaim, no 6/6 distinct physical restores. 48.01 GiB live Traffic SQLite DB and its 2.25958 GiB internal freelist are not an approved source of filesystem space.

## Owner alternatives; neither selected

**A. Preserve conservative added policy** (recommended while E proofs are absent). Require E's source-consistent encrypted six-class captures, offhost ciphertext SHA readback, distinct independent full physical restores and exact-path owner-approved disposition before reclaim. Then remeasure >=30 GiB available, <=88% effective, <92% Finish and root >=5 GiB. Lowest unproven recovery/build risk, but postpones website W1 until measured.

**B. Explicitly propose reduced ADDITIONAL website-only constraints for independent B/C review.** A time-limited, candidate-bound owner-only policy could evaluate a smaller verified restore scope and capacity cushion **only if** protected original root >=5 GiB and attached volume <92% STILL pass; otherwise a separate reviewed successor engine must explicitly supersede those original gates. Must establish worst-case staged build+node_modules+rollback sizes, growth margin, recovery point and owner-approved exact exclusions, and independently assess likelihood of ENOSPC, rollback failure, Traffic loss or live financial interference. Current evidence does NOT justify option B and no selection is implied. Never delete protected files to make a nominal threshold, change financial/custody writers, fake restores, or count SQLite internal freelist as free disk.

**Default HOLD**, no automatic activation. Record chosen policy only after express owner consent and independently reviewed native code and witness; each candidate needs fresh PRE_STAGE and PRE_ACTIVATE approvals. No old owner-v4 permit reuse.

Release order W1 b46a51f1592c9f296839924ae55e722618b10d35, then post-W1 fa5c350b35cba7ace8d4515a7ad52ba4e1534295.
