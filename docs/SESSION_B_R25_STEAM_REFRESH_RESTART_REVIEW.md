---
id: "aoe2war.app-prodn.docs-session-b-r25-steam-refresh-restart-review"
title: "Session B R25 Steam-Only Restart Review"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-source-and-physical-review-not-financial-permit"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B R25 Steam-Only Restart Review

Scope: **nonfinancial, Steam-only UID 990 nft sets**. The original production A05 commit and its v4b controller, policy, 3030 rollback, six Nginx selectors, financial services and PostgreSQL are untouched.

## Why a new protocol is needed

On 2026-11-07, live R25 on 3032 retained build \`20261106065241-f085ab2094\` and exact source \`1c4ffe0ce31e085bd1e287da6659ec72338c2f87\`, but its current systemd main PID was \`1766058\`; immutable A05 COMMIT and v4b steam policy bind \`1032308\`. Live Steam refresh timer returned \`HOLD:R25_PUBLIC_RUNTIME_CHANGED\`. A separate read-only snapshot of protected units/listeners returned SHA256 \`3afe22014c16c6ea219a77fd04887fbde0ba426e0f0c4c87dd34078d31b70611\`, different from the v4b reviewed \`3498b628b80294814d783b17974d56555a766bd62cdfd34a9921dcd70b1c04ce\`. This may reflect parallel C03 containment; *do not infer why without comparing signed live receipt and operator-approved unit inventory*. The web logs also contained PostgreSQL error 42501 during that period; this branch never touches database roles.

## v5 guarded procedure

This source-only code proposes an explicit, human-audited restart admission, **not an automatic PID rollover**:

1. Review current exact source/build, systemd unit SHA, original COMMIT receipt, root controller, root-only v4b profile, six selectors, 3030 rollback and complete protected unit/listener inventory. Use \`--phase diagnose\` without any network-policy change.
2. Only after the C03 owner finishes the protected maintenance baseline, inspect the new protected snapshot. Do not create a new approval merely because a SHA differs. Confirm what changed and what still requires hard HOLD.
3. Bind a fresh **root-owned mode 0400** JSON admission in \`/etc/aoe2war/web-prod-v5/runtime-restart-admission.json\` with exactly these fields: \`schema\` = \`aoe2war.app.steam-runtime-readmission.v5\`; \`old_public_pid\` (immutable COMMIT PID); \`current_public_pid\`; \`start_ticks\` (actual Linux proc identity); \`source_sha\`, \`build_version\`; \`reviewed_protected_snapshot_sha256\` (reviewed, *not automatically accepted*); \`public_release_receipt_sha256\`; \`approval_scope\` = \`STEAM_ONLY_EXISTING_UID990_NFT_SETS\`; \`finance_authorized\` = false; and a fresh 16-byte hex \`nonce\`. No keys, passwords or auth tokens.
4. Run v5 \`--phase plan\`, compare its exact expected policy digest and all fields, and stage the **separate root-owned 0400 v5 policy** at \`/etc/aoe2war/web-prod-v5/steam-refresh-policy.json\`. It includes \`runtime_restart_admission_sha256\`, current PID and the authenticated reviewed snapshot. Do not overwrite v4b or the original signed policy.
5. A separate reviewed systemd service change (same CAP_NET_ADMIN/CAP_SETUID/CAP_SETGID, NoNewPrivileges, ProtectSystem=strict, UID990, Steam validated DNS/TLS/SNI and 300 s TTL) may point only to the exact staged v5 file SHA. Recheck runtime identity, source, policy and protected snapshot directly before and after refresh; test rollback to preserved original v4b unit.
6. Verify live status, listener and auth continuity without recording cookies. Observe C03 financial containment, old validator/8092/8093 and inactive 8094/8095. If **any** review, source, PID, start ticks, snapshot, root mode or policy digest differs: **HOLD** with zero nft changes.

No root admission/policy is issued by this PR. It does not change a currently installed host. It cannot be called A05 or financial acceptance.

## Local qualification

\`python3 -B -m unittest discover -s tests -p test_session_b_steam_runtime_v5.py -v\` checks genuine same-source restart acceptance and adversarial denials (drift, PID reuse, wrong UID/cgroup/cwd/command, source, authorization, invalid receipt or nonce). \`python3 -B scripts/release/r25_steam_refresh_v5.py --phase selftest\` checks the static source shape. Exact-head GitHub CI and a separate physical readmission receipt are still required.
