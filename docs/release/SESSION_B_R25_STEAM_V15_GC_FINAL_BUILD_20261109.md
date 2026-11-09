---
id: "aoe2war.app-prodn.session-b-r25-steam-v15-gc-final-build-20261109"
title: "Steam V15 source-pinned R25 heap-build enrollment and nft lease zero handling"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only, two exact restricted 3032 process profiles, no Chain permission"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# Steam V15 source-pinned R25 heap-build enrollment and nft lease zero handling

Original V14 is installed and operating but its two exact process enrollments do not include the source-staged #1266 heap-repaired candidate dd00367a9d648e66ebbe9f56e17f323efbdaca6f. A real V14 refresh HOLD at 2026-11-09 15:44:05 UTC occurred with LEASE_EXPIRY_UNOBSERVABLE_OR_DIFFERENT_UNITS. No actual offending nft value was logged in that refresh: a zero-second GC-edge counter is one possible cause, not proven fact. A later 240-read real nft observation covering 720 lease counters found zero anomalies, so do not erase the earlier HOLD.

V15 pins only two runtime profiles: original finance-restricted 4ab96cc7... (for cold recovery) and the staged repaired dd00367a... at exact source, 3032-only systemd unit, 2048MiB V8 ceiling, stage source/overlay SHA and original Nginx/financial-protection identity. It does not permit arbitrary PID, artifact, port, domain or funding permission.

Its strict read-only lease function does not accept zero seconds as a usable lease. It retries a zero-second nft element for three 350ms bounded read-only polls. Persistent zero and any other malformed, missing, wrong-unit, altered firewall or protected-listener state fail closed. No nft rule or Steam destination is expanded.

The companion v15 Steam service unit is a byte-for-byte substitution of the reviewed V14 service, changing only the versioned script filename. It cannot be installed as acceptance until the same 3032 repaired candidate is running, exact CI is green, original source and unit are archived for restore, and the active process is enrolled into v15 using independently accepted root-only controls. Steam V14 must remain available for rollback. After any process restart, re-enroll the final PID and start ticks; demonstrate actual repeated refreshes spanning lease rotation.

Source tests are nonphysical and do not certify OAuth sign-in or role continuity, 8094, finance permissions, funded payouts, or C03. C03_APP_HANDOFF=HOLD until live acceptance.
