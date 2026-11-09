---
id: "aoe2war.app-prodn.session-b-c04-steam-v14-recvq-20261109"
title: "Steam V14 C04 identity-only receive queue normalization"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "steam-source-bound-readonly-c04-masks-not-financial-release"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# Steam V14 C04 identity-only receive queue normalization

Scope: the pre-existing Steam timer C04 immutable original guard admits exactly two previously masked/closed financial listeners (8092 and 8093). This is NOT C03 writer authorization, a C04 quarantine change or a funded C09 permit.

## Physical evidence of the actual volatility

At 13:54–13:56 UTC 2026-11-09 the installed HEL1 original ss -H -ltnpe command was sampled 260 times, 78.6 seconds. Of the seven C04-protected ports 3030/3032/5432/8092–8095, the ONLY changed full socket rows were four legitimate PostgreSQL 127.0.0.1:5432 receive-backlog transitions: Recv-Q 0→2→0 and Recv-Q 0→5→0. No listener count changed. Original V1 r25_c_start_root.py production_socket_identity excludes the first three ss fields (LISTEN, Recv-Q, Send-Q) and retains bound addresses, inode, sk, cgroup, user and process identity via separate systemd unit assertions. The later V11 C04 helper compared full original ss rows before == after, including dynamic Recv-Q, making normal connections a demonstrable potential cause of C04_PROTECTED_SOCKET_TOCTOU_DRIFT.

The raw evidence shows a real volatile field, NOT proof that every past scheduled Steam HOLD had this precise cause. PROTECTED_FINANCE_TOPOLOGY_DRIFT is a distinct unresolved condition and must NOT be waived or reported solved.

## Minimal in-memory source-pinned normalization

V14 imports original root-owned C04 V11 SHA256-pinned helper as before without changing its file, SHA, mask rules, unit files, original C03/V1 source, or original finance evidence. It wraps ONLY the helper's in-memory read callback for listening-socket output. Each row is parsed under strict recognizers: LISTEN, decimal Recv-Q, decimal Send-Q (1–4096), full metadata including exact ino, sk and cgroup; Recv-Q must be <= Send-Q + 1. Only volatile Recv-Q is canonicalized to 0; Send-Q and every address, peer, UID, inode, sk, user, cgroup and identity byte remain untouched. This matches original V1 identity semantics while preserving all C04 listener-count and mask checks. Malformed/over-capacity queues, any new/missing financial or site listener, changed inode/address/owner/cgroup, unexpected key or unit fingerprint remain HOLD.

The one-use V13→V14 installation is reversible: old unit SHA256 a6795c7c840234fd9c590c17bd590bdeb5a8cbab244adb7989aaa79e4faf33f6, expected V14 unit SHA256 17d640fde690e4e780dfd7370bd9d99122ccde7d567c0a043c8060739e6181f4. Retain ProtectHome=yes, the two C04 original unit masks and digest-only root evidence, active V13 identity and original C03 finance SHA256 064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c.

## November 9 14:10 UTC R25 crash changed process-bound release identity

The actual 3032 Next.js PID 3750280 aborted with V8 2048-MiB heap OOM on 2026-11-09 14:10:46 UTC and systemd restarted it at 14:10:55 UTC as PID 4183890, NRestarts=3. This invalidates V13 signed Steam process continuity even though a **new native read-only V13 inspect physically proved the original C03/C04 fingerprint remains unchanged**. All V14 admission tests performed before the crash are stale for process identity, not for static source.

The new V14 one-use controller pins only the independently rechecked R25 successor PID=4183890, /proc start_ticks=207599263, systemd ExecMainStartTimestampMonotonic=2075992636073, NRestarts=3, reviewed existing production unit SHA, and original 4ab96cc7 staged source directory. It additionally requires MemoryMax 3355443200 and current cgroup memory under 2684354560 bytes. Any subsequent crash/restart or changed identity fails before the controller consumes a release. A fresh V14 candidate enrolment must be written under a **new V14 policy directory**; V13 receipt and previous activation remain preserved. No re-use of a consumed V13 controller and no change to the financial C03/C04 fingerprint.

**Important:** The R25 V8 heap defect is confirmed and unresolved. Successful V14 Steam refresh recovery would restore the old signed Steam-only egress scope for the current R25 process, NOT qualify R25 long-run stability, signed-in roles, or C03_APP_HANDOFF.

## Qualification and handoff

Require source tests that prove queue-only changes normalize and malformed queues/port/inode/address/metadata changes are denied, V12/V13 source regression, DocsV2 and exact CI. Before production activation, root-only SHA-pinned inert staging and actual HEL1 read-only V14 native_snapshot() exercise are required. Perform only a separately versioned one-use root controller after accepted CI; it must produce immutable physical receipt for success or rollback, preserve 8092/8093 masks and 8092–8095 closed, R25/validator original PIDs, and demonstrate actual scheduled V14 refreshes across queue fluctuations. A single successful activation does not qualify uninterrupted Steam durability.

C03_APP_HANDOFF remains HOLD until independent functional authenticated R25 rollback, admin/nonadmin/AI Scribe real-session acceptance, narrow SQL reads, R25 heap and all Steam genuine scheduled holds close.
