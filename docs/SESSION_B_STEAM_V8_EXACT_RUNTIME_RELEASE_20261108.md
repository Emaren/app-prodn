---
id: "aoe2war.app-prodn.session-b-steam-v8-exact-runtime-release-20261108"
title: "Session B — Exact Linux Runtime and Steam V8 Release Contract"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "source-review-only"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B — Exact Linux Runtime and Steam V8 Release Contract

## Scope and ownership

Session B owns nonfinancial website source, the single-process R25 runtime on port 3032, reviewed Steam egress, and Traffic presentation. Session A exclusively owns all nine funded Chain release gates, PostgreSQL financial privileges, custody, settlement, reserve reconciliation and C03 live legacy financial-writer fencing. This controller cannot grant, revoke, mint, bridge, move WOLO, rewrite Traffic history or enable ports 8094/8095. The owner keeps the secondary AoE2 War Scribe Steam login standalone, unclaimed and non-admin. No AI persona linking or additional claimed-profile record is authorized.

## Exact Linux release

GitHub Actions CI artifact ID 13629226030 belongs to source 4ab96cc7c1c0ba43a0403795485d3f410a6ba07f, Next BUILD_ID YF_YxSAxc0izAfRG0ARsc, version 20261108182649-ca81f00609. ZIP bytes: 615809452, SHA-256: 72e856c3bebd0f91bcc66910016f47490e9c59ea2b13d58bd4a0500752489330. Inner tar.gz: 615808600 bytes, SHA-256 7be8e6f9401f7d29be176c0704339e9b2a38001ae0122b6353196fc23840f42f. Manifest SHA-256 ab1071cd5928591fe11a16eab25d9884d19eaa60ebadd43e23a73918cd86b2d4; tree digest ae328965e9db1dba2b3fc052195ea44b72528139c0030ffab45ca3d015cc3f9d; 44954 files.

The inert root-only verifier in scripts/release/r25_verified_ci_artifact_stage_v8.py requires exactly these digest and count pins and independently replays every file, mode and SHA-256. It rejects traversal, unsafe modes, symlink escape, overwrite, low root headroom, and changes to the current public systemd unit. On complete acceptance it issues a receipt with SHA-256 c41c7e2bffd7287e8637a620e84e12cc38e05bce4bc86081115cebf4621ba701. Inert staging does not activate the runtime or certify a public deployment.

## Exact two-profile Steam-only controller

V8 is a narrow adaptation of the installed Steam V7, not a new unrestricted egress design. It pins the two exact nonfinancial source profiles:

- Rollback: 0a7450f9c8c1d12cdf63e33d57e665ad1e3f5cb1, BUILD_ID AX78Oo6yfx4AmSCbDgemv, version 20261108140705-1d068e417c, unit SHA-256 be8165a050a3fa2c224d6a29c26dca2045a6599c7f18ab41e2e83bb85eacf6e6.
- Candidate: 4ab96cc7c1c0ba43a0403795485d3f410a6ba07f, BUILD_ID YF_YxSAxc0izAfRG0ARsc, version 20261108182649-ca81f00609, unit SHA-256 42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621.

The Steam refresh unit is whitelisted only to its exact V7 preimage SHA-256 77669f8c50b354beb7e0a8b5d665491cbb7e1422793e69027c038282cbb52381 and candidate V8 SHA-256 29276c662bbd0146938ae58194763848482f1c85df6f10698632499d089ef3a3. Existing v5z and FIN_SNAPSHOT 6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb remain immutable. The script does not widen Steam destinations, nft, users, finance or database privileges.

Admission requires bounded memory and disk, exact previous PID 3002734, prior staged identity and signing infrastructure, validator PID 1009 and legacy 3030 PID 2625090 unchanged, funded ports closed, complete HTTP bodies for /players and the one original /traffic chart, and an anonymous Steam initiation with a secure state cookie. The release controller uses a lock, briefly pauses the Steam refresh timer, atomically applies whitelisted web and Steam unit pairs, reenrolls the exact Steam permit, and restores the timer. A failure attempts a source-pinned rollback; an HTTP 200 header without the actual body is not an acceptance. No new AoE2 War Scribe registration is part of this test.

## Holds

This is SOURCE ONLY until exact-head CI, independent review, physical stage manifest receipt, installation of the reviewed script hashes, current C03 protected census and fully observed bounded live cutover. Old port 3031 is not accepted as a Steam rollback. The live legacy financial writer and the nine Chain gates remain Session A HARD HOLD. The Traffic archive still ends October 19: no new daily point until independently certified, no fabricated zeros, no GET/IP-as-human substitution. Traffic issue #31 separately tracks that work. The temporary Traffic insertion-time receipt flag remains OFF after the Steam protected-state interlock, with 202 genuine early receipts preserved.

## Auditable source

The three new scripts are scripts/release/r25_verified_ci_artifact_stage_v8.py, scripts/release/r25_steam_refresh_traffic_v8.py and scripts/release/r25_traffic_single_runtime_release_v8.py. The adversarial tests are tests/test_r25_verified_ci_artifact_stage_v8.py and tests/test_r25_steam_traffic_v8.py.
