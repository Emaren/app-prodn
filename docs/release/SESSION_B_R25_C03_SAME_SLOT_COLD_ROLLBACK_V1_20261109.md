---
id: "aoe2war.app-prodn.session-b-r25-c03-same-slot-cold-rollback-v1-20261109"
title: "Session B C03 same-slot finance-restricted cold rollback"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "source-staged-fail-closed-cold-rollback-no-production-financial-change"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B C03 same-slot finance-restricted cold rollback

## Physical reason for a cold, same-port rollback

HEL1 has ~7.75 GiB host RAM, more than 6 GiB swap used, and native Wolo validator PID1009. A permanent third Next.js server on 3033 is not an acceptable memory design. The root-owned emergency-only dynamic-UID 3033 uses ~9–10 MiB and returns HTTP 503 for protected routes, but cannot preserve signed-in website continuity.

The production restricted R25 website already runs as unprivileged Linux user aoe2war-web-prod and connects as restricted PostgreSQL role aoe2war_web_prod from a root-managed environment file. Existing UID990 NFT response policy permits source port3032 but rejects responses from port3033. The proposed safe fallback is only ONE full Next.js runtime at a time on original port3032, with preserved original executable, root-pinned unit, and the same restricted database identity. Never use finance-writable 3030 as rollback.

## Source-pinned exact units

Original app source 4ab96cc7c1c0ba43a0403795485d3f410a6ba07f; web unit SHA256 42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621; build 20261108182649-ca81f00609. The held App PR #1266 candidate source dd00367a9d648e66ebbe9f56e17f323efbdaca6f; build 20261109145214-de9c4f1054; BUILD_ID MMjuPTuU3DGMrq-Phwo98, 44,998 files, complete stage/overlay receipts SHA256 fb8e1dbaf4a509496b403127e824eac4e233c868579a1d6e34d1e2159da23d44 and 3cdd41faaa371f6e500d802048a6c64d36b1e931bc7289b485f103e4fe93ec1f.

Replacing exactly FOUR approved old runtime path occurrences yields candidate unit SHA256 41bc6fc3e62247394bd0531ac07428c83eed9dfa76578b76846cb1b48d2c640e. Root-only original environment SHA256 2b0c9123a0c01090846966b56bf68ae4d57dab8ec1310b900abc01c0e32de52c; installed Steam V14 unit SHA256 17d640fde690e4e780dfd7370bd9d99122ccde7d567c0a043c8060739e6181f4.

## Source control and exact physical recovery

--inspect is strictly read-only. It checks the original and candidate source markers, four path substitutions, original and candidate build metadata, SQL environment file hash, validator/legacy 3030 PID, Steam V14 unit SHA, masks/closed financial ports and disk headroom.

--restore deliberately has NO promotion capability. It is an exact, one-use recovery path ONLY after some independently approved release controller has started the candidate as the sole restricted 3032 runtime and the installed web unit matches the reviewed candidate SHA. It stops only aoe2hdbets-web-prod.service, atomically replaces the candidate unit with the original 0600 backed-up SHA-verified unit, reloads systemd and starts the original restricted web runtime on 3032. It checks the original deployment version and records an unoverwriteable private 0600 physical receipt. A separate new Steam enrollment is mandatory after any process restart. Original protected financial units, SQL, custody, Chain, NFT policy and Nginx remain untouched.

This controller's exact V14 SHA requirement is intentionally fail-closed when Steam or auth environment changes. The next release requires new source-bound review rather than a broad bypass.

## Acceptance and remaining blockers

9/9 new negative tests PASS in isolated source. No actual public rollback was executed by these tests. Before a real candidate promotion, independently prove signed-in real Chrome ordinary/admin/AI Scribe sessions, nonce replay/expiry denial, post-restart session continuity, native financial negative SQL, Steam durability, memory-bounded realistic workload and exact source/build parity. Then perform physically witnessed cold-stop/restart and measure actual rollback timing. The older build itself has a genuine 2-GiB V8 crash history and cannot be certified stable solely from running now.

C03_APP_HANDOFF=HOLD. Source tooling is not an authenticated rollback receipt or permission to fund or modify Chain financial roles.
