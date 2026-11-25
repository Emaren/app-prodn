---
id: "aoe2war.app-prodn.session-b-c03-protecthome-steam-v16-recovery-20261109"
title: "C03 restricted Steam V16 ProtectHome source evidence and second rollback"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "historical-evidence"
authority: "dated incident evidence only; no current operational authority"
reviewed_at: "2026-11-25"
review_interval_days: 0
sensitivity: "restricted"
---

# C03 restricted Steam V16 ProtectHome source evidence and second rollback

> **November 25, 2026 — documentation disposition (source only).** Historical disposition: preserve the original November incident record and its subsequent source review verbatim. Prior authority label: source-only exact-identity fail-closed App release; no funding. All process IDs, receipts, commands, source pins and deployment claims below refer to their original observation only. Do not execute old controllers or treat this record as current admission; use the current Factory and separate financial authority. No renewed operational approval or physical attestation.


The physical App #1271 cold cutover on November 9 at 17:22:59 UTC started the staged repaired R25 source dd00367a, but the scheduled V15 Steam oneshot returned HOLD:NONIDENTIFYING_PERMISSIONERROR. Original V14 was restored and rebound to restored web PID194854. Exact negative promotion receipt: d986e5c338ed8bf362a5668b8183a69566ee811a927707ebffca2621e8ee97fe. Root-only C03 v2 rollback returned zero. The 3030 finance-writable legacy process, masked payout units, 8092-8095 socket quarantine and Wolo validator PID1009 were preserved.

V15 source directly required three /root/... source and release artifacts that a systemd oneshot with ProtectHome=yes cannot read. **Do not weaken ProtectHome.** This V16 source identifies those three exact source receipts, hashes them and binds only immutable 0400 root-owned copies to private /etc/aoe2war/web-prod-v16. It never publishes private runtime.env, signing secrets, keys, wallet state or payout databases. The directory must be root 0500; source files must be regular root-owned, mode 0400, one inode and source-pinned. The V16 systemd unit changes only the exact old Steam script filename while preserving ProtectHome=yes, ProtectSystem=strict, capabilities and egress constraints.

This second one-use forward controller v2 uses a fresh root-private directory and distinct physical receipt and is source-bound to the merged #1266 exact staged build, old/new restricted 3032 service hashes, unchanged 2048 MiB V8, 3355443200-byte systemd memory drop-in, original DB role/environment SHA, Steam V14/V16 scripts/units and root-only C03 restricted rollback v3. Rollback v3 uses a fresh one-use recovery receipt because v2's receipt was already correctly consumed on the failed live drill. It returns solely to original restricted 3032 and re-enrolls V14 to its new PID. It never calls legacy 8092/8093, grants SQL rights, unblocks 8094/8095, moves WOLO, alters validator or adds a third Next process.

**Functional acceptance is strengthened:** /api/bets must return 200 in the repaired process. A financial HOLD 503 is safe but is NOT accepted as a working bet board; its observation triggers the guarded restricted rollback. V16 health also explicitly refuses 503 and 500. Partially copied evidence or stale V16 directory blocks reactivation; a stale/missing policy, wrong unit, orphaned lease evidence or changed C03/C04 identity must fail closed in scheduled refresh.

Source-only targeted tests cover exact evidence scope, 0400 sandbox copies, missing/changed privileged source, denial on partial publication, finance socket masks, 503 disqualification, process recovery. **No current-source test alone proves production:** the live second cutover, signed-in Steam OpenID, ordinary/admin/AI-Scribe Chrome sessions, session persistence and nonce replay, all seven views, images, sustained RSS/heap, recurring Steam rotation, and real C02 HEL1 8094 POST/GET remain separate physical requirements. C03_APP_HANDOFF=HOLD and C02_APP_TRANSPORT=HOLD until those are met.


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
