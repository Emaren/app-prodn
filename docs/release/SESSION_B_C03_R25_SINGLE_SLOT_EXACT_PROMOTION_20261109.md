---
id: "aoe2war.app-prodn.session-b-c03-r25-single-slot-exact-promotion-20261109"
title: "C03 exact restricted 3032 R25 promotion and automatic rollback"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "root-only one-use candidate admission, finance-quarantined"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# C03 exact restricted 3032 R25 promotion and automatic rollback

This source-only controller is a narrowly reviewed, separate forward action to the #1267/#1269 rollback. The original finance-restricted production website remains the only full Next.js runtime, and promotion cold-stops that unit, swaps its four exact runtime paths, and cold-starts the CI-staged heap repair on the same port 3032, using the original root-held auth/database environment, OS identity, root-owned media bindings, resource limits and Nginx routing.

Before action, the script binds the existing 3355443200-byte systemd MemoryMax drop-in, 2048-MiB V8 heap, old/new unit SHAs, pinned two stage receipts, exact source markers and BUILD_ID, validator and legacy 3030 PIDs, C04 masks/closed 8092–8095, source-staged Steam V15 script and service-unit hashes, and the independently accepted root-only v2 recovery controller. Missing or altered source, unrelated systemd changes, wrong roles, unavailable capacity, or any reopened financial port prevent promotion.

Activation stops the scheduled Steam refresh timer and waits for the one-shot to finish. It stops and replaces only aoe2hdbets-web-prod.service (one Next.js server throughout), starts the repaired 3032, checks exact deployment version, /, /players and /api/bets (200 or finance-restricted 503, never 500). It then installs the reviewed Steam V15 script and one-field service-unit substitution, enrolls exact repaired PID/source/build, executes one actual Steam refresh, restarts timer and rechecks C04 protection. The root-private 0600 one-use promotion receipt explicitly leaves full signed-in browser and C03 formal acceptance HOLD.

If any activated precondition or health check fails, it returns Steam to original V14 service bytes, executes root-reviewed v2 restricted 3032 cold rollback, attempts bound V14 re-enrollment to new original PID, and writes a durable negative receipt; it never starts legacy 3030 or unmasks finance writers. A separate one-use --restore action is available after a qualified successful promotion. It also requires exact unit hashes, masks and process version, and consumes the reviewed v2 rollback receipt.

**Warnings:** dry source tests are not physical acceptance. Production requires all exact-head CI, root source-hash confirmation and read-only --inspect first, followed by actual deployment. Genuine Chrome Steam OpenID ordinary/admin/AI-Scribe access, session continuity, nonce denial, seven protected page views, images, sustained V8 slopes and recurring Steam refresh across lease expiry remain manual physical predicates even if the script reports admission PASS. Never use the script's source-only PASS as a C03_APP_HANDOFF YES, do not authorize financial SQL or WOLO transfers, and preserve a full HOLD on native C02 until real 8094/8095 acceptance.
