---
id: "aoe2war.app-prodn.session-b-c03-protecthome-steam-v16-recovery-20261109"
title: "C03 restricted Steam V16 ProtectHome source evidence and second rollback"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only exact-identity fail-closed App release; no funding"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# C03 restricted Steam V16 ProtectHome source evidence and second rollback

The physical App #1271 cold cutover on November 9 at 17:22:59 UTC started the staged repaired R25 source dd00367a, but the scheduled V15 Steam oneshot returned HOLD:NONIDENTIFYING_PERMISSIONERROR. Original V14 was restored and rebound to restored web PID194854. Exact negative promotion receipt: d986e5c338ed8bf362a5668b8183a69566ee811a927707ebffca2621e8ee97fe. Root-only C03 v2 rollback returned zero. The 3030 finance-writable legacy process, masked payout units, 8092-8095 socket quarantine and Wolo validator PID1009 were preserved.

V15 source directly required three /root/... source and release artifacts that a systemd oneshot with ProtectHome=yes cannot read. **Do not weaken ProtectHome.** This V16 source identifies those three exact source receipts, hashes them and binds only immutable 0400 root-owned copies to private /etc/aoe2war/web-prod-v16. It never publishes private runtime.env, signing secrets, keys, wallet state or payout databases. The directory must be root 0500; source files must be regular root-owned, mode 0400, one inode and source-pinned. The V16 systemd unit changes only the exact old Steam script filename while preserving ProtectHome=yes, ProtectSystem=strict, capabilities and egress constraints.

This second one-use forward controller v2 uses a fresh root-private directory and distinct physical receipt and is source-bound to the merged #1266 exact staged build, old/new restricted 3032 service hashes, unchanged 2048 MiB V8, 3355443200-byte systemd memory drop-in, original DB role/environment SHA, Steam V14/V16 scripts/units and root-only C03 restricted rollback v3. Rollback v3 uses a fresh one-use recovery receipt because v2's receipt was already correctly consumed on the failed live drill. It returns solely to original restricted 3032 and re-enrolls V14 to its new PID. It never calls legacy 8092/8093, grants SQL rights, unblocks 8094/8095, moves WOLO, alters validator or adds a third Next process.

**Functional acceptance is strengthened:** /api/bets must return 200 in the repaired process. A financial HOLD 503 is safe but is NOT accepted as a working bet board; its observation triggers the guarded restricted rollback. V16 health also explicitly refuses 503 and 500. Partially copied evidence or stale V16 directory blocks reactivation; a stale/missing policy, wrong unit, orphaned lease evidence or changed C03/C04 identity must fail closed in scheduled refresh.

Source-only targeted tests cover exact evidence scope, 0400 sandbox copies, missing/changed privileged source, denial on partial publication, finance socket masks, 503 disqualification, process recovery. **No current-source test alone proves production:** the live second cutover, signed-in Steam OpenID, ordinary/admin/AI-Scribe Chrome sessions, session persistence and nonce replay, all seven views, images, sustained RSS/heap, recurring Steam rotation, and real C02 HEL1 8094 POST/GET remain separate physical requirements. C03_APP_HANDOFF=HOLD and C02_APP_TRANSPORT=HOLD until those are met.
