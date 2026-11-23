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
reviewed_at: "2026-11-23"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B R25 Steam-Only Restart Review

Scope: **nonfinancial, Steam-only UID 990 nft sets**. The original production A05 commit and its v4b controller, policy, 3030 rollback, six Nginx selectors, financial services and PostgreSQL are untouched.

## Why a new protocol is needed

On 2026-11-07, live R25 on 3032 retained build `20261106065241-f085ab2094` and exact source `1c4ffe0ce31e085bd1e287da6659ec72338c2f87`, but its current systemd main PID was `1766058`; immutable A05 COMMIT and v4b steam policy bind `1032308`. Live Steam refresh timer returned `HOLD:R25_PUBLIC_RUNTIME_CHANGED`. A separate read-only snapshot of protected units/listeners returned SHA256 `3afe22014c16c6ea219a77fd04887fbde0ba426e0f0c4c87dd34078d31b70611`, different from the v4b reviewed `3498b628b80294814d783b17974d56555a766bd62cdfd34a9921dcd70b1c04ce`. This may reflect parallel C03 containment; *do not infer why without comparing signed live receipt and operator-approved unit inventory*. The web logs also contained PostgreSQL error 42501 during that period; this branch never touches database roles.

## v5r guarded procedure

This source-only code proposes an explicit, owner-delegated, nonfinancial reviewed restart admission, **not an automatic PID rollover**:

1. Review current exact source/build, systemd unit SHA, original COMMIT receipt, root controller, root-only v4b profile, six selectors, 3030 rollback and complete protected unit/listener inventory. Use `--phase diagnose` without any network-policy change.
2. Review the current protected snapshot separately from C03 formal acceptance; C03 writer containment remains HOLD. Renew any nonfinancial admission after a change to protected state. Do not create a new approval merely because a SHA differs. Confirm what changed and what still requires hard HOLD.
3. Bind a fresh **root-owned mode 0400** JSON admission in `/etc/aoe2war/web-prod-v5r/runtime-restart-admission.json` with exactly these fields: `schema` = `aoe2war.app.steam-runtime-readmission.v5r`; `old_public_pid` (immutable COMMIT PID); `current_public_pid`; `start_ticks` (actual Linux proc identity); `source_sha`, `build_version`; `reviewed_protected_snapshot_sha256` (reviewed, *not automatically accepted*); `public_release_receipt_sha256`; `approval_scope` = `STEAM_ONLY_EXISTING_UID990_NFT_SETS`; `finance_authorized` = false; and a fresh 16-byte hex `nonce`. No keys, passwords or auth tokens.
4. Run v5r `--phase plan`, compare its exact expected policy digest and all fields, and stage the **separate root-owned 0400 v5r policy** at `/etc/aoe2war/web-prod-v5r/steam-refresh-policy.json`. It includes `runtime_restart_admission_sha256`, current PID and the authenticated reviewed snapshot. Do not overwrite v4b or the original signed policy.
5. A separate reviewed systemd service change (same CAP_NET_ADMIN/CAP_SETUID/CAP_SETGID, NoNewPrivileges, ProtectSystem=strict, UID990, Steam validated DNS/TLS/SNI and 300 s TTL) may point only to the exact staged v5 file SHA. Recheck runtime identity, source, policy and protected snapshot directly before and after refresh; test rollback to preserved original v4b unit.
6. Verify live status, listener and auth continuity without recording cookies. Observe C03 financial containment, old validator/8092/8093 and inactive 8094/8095. If **any** review, source, PID, start ticks, snapshot, root mode or policy digest differs: **HOLD** with zero nft changes.

The PR itself confers no runtime authority. A separate exact-source v5 policy was physically staged as root0400 on HEL1, then the first native service attempt failed and the original App service unit was restored. This is neither Steam operational acceptance nor funded admission.

## November 7 physical attempt and v5r correction

At approximately 16:18 UTC, the source-pinned v5 App-only cutover passed its HEL1 plan, then its real systemd oneshot returned exit2: Permission denied on reading another UID's /proc/1766058/cwd. The unmodified service used root with NoNewPrivileges=yes and exactly CAP_NET_ADMIN, CAP_SETUID, CAP_SETGID; adding CAP_SYS_PTRACE would widen privilege and is **not** permitted. The physical rollback controller restored original v4b App unit SHA256 259e66073016193e26af76868a0f87a82d916f3f3a69a82d4e64824656ce1404, reactivated the original timer, and retained private rollback receipt SHA256 c9aa23643d94c6f1d0162311b01dfc2e153b8b14d598c0d624ba0f3bcfc111c1. Public R25 PID1766058, 3030 PID2625090, six Nginx routes and inactive financial ports were preserved.

A **separate, versioned v5r** source repairs only this probe. Real HEL1 setpriv testing under CapEff/CapBnd 00000000000010c0 and NoNewPrivs=1 proved /proc/PID/cwd inaccessible but /proc/PID/stat start ticks, /proc/PID/cmdline, /proc/PID/cgroup, UID and systemctl WorkingDirectory readable. The replacement binds the exact reviewed App systemd WorkingDirectory and root-owned web unit SHA, while retaining kernel process UID/start ticks/cmdline/cgroup, immutable A05 public receipt, signed source, original rollback, full protected finance snapshot, and the restricted Steam-only nft controls. It also returns exit3 for the read-only HOLD diagnostic instead of accidentally reporting success. No additional Linux capabilities, finance permissions, or network destinations are granted.

v5r script SHA256: 19ca77a3c8c2bd7cdd5210c5c1d10f38e00d0b48f5d0309fbb3490d1d624d873. Focused 19/19 adversarial tests and an actual restricted root read-only diagnostic passed. New root-owned mode0400 v5r admission/policy must be separately generated for the exact new script SHA, and a **new** App-only rollback-armed physical transaction is required before accepting Steam recovery. The old v5 policy remains nonoperative and must never be used as a shortcut. Current C03/C06/C07 and all funded release gates remain HOLD.

## Local qualification

`python3 -B -m unittest discover -s tests -p test_session_b_steam_runtime_v5r.py -v` checks genuine same-source restart acceptance and adversarial denials (drift, PID reuse, wrong UID/cgroup/cwd/command, source, authorization, invalid receipt or nonce). `python3 -B scripts/release/r25_steam_refresh_v5r.py --phase selftest` checks the static source shape. Exact-head GitHub CI and a separate physical readmission receipt are still required.


## Source and physical acceptance update (November 7, 16:34–16:40 UTC)

The versioned v5r controller completed the guarded live App-only cutover. Native restricted systemd returned PASS_STEAM_ONLY_REFRESH, with three individually TLS/SNI-validated Steam destinations in existing UID990 NFT sets (300-second TTL). Installed App unit SHA256: ad2082a35af364f37eb5aed9fd9b86e60922211ec25cbb256a2c60abb97376c4; original root-0600 unit preimage SHA256: 259e66073016193e26af76868a0f87a82d916f3f3a69a82d4e64824656ce1404. Root-0600 physical acceptance receipt /var/lib/aoe2war-steam-session-b-v5r/ACCEPT.json SHA256: 0597f4508450322b10508faeb91c23f71ebe35712a2a6db60ad101827887c19d. Native one-minute timer-triggered runs after 16:35 UTC through 16:40 UTC also PASS.

Public R25 3032 process/build, original 3030 rollback, Nginx selectors, validator and the legacy 8092/8093 services were unchanged. Session A C03/C06/C07 remained under its exclusive ownership. Funded 8094/8095 and C01 Satchel/reviewer services inactive, no WOLO moved. Public Steam OpenID initiation returned real 307 to Steam with the correct aoe2war.com realm; actual signed-in browser callback has NOT been freshly demonstrated. This is physical Steam egress acceptance, not financial C01–C09 gate acceptance or fresh human-session acceptance.

The earlier v5 implementation failed closed due to restricted-root cross-UID /proc/cwd permission and physically rolled back to the original App unit. The old source/test were removed from this held integration branch; their original implementation, native failure and rollback evidence remain in Git history and root-private receipts. Only the working v5r source should be used for subsequent App Steam re-admission. Later C03 snapshot changes MUST still require a fresh reviewed nonfinancial approval.


## November 7 17:24 UTC — hourly C03 observer fingerprint repair (v5s)

The already physically accepted v5r ran continuously from 16:34 through 17:23 UTC; at exactly 17:24:30, the independent `wolo-c03-observer.service` hourly `oneshot` ran, exited successfully, and recorded `HOLD_EXPECTED_UNCONTAINED` with its protected 57-unit topology unchanged. Steam's next automatic trigger at 17:24:35 returned `HOLD:PROTECTED_FINANCE_SNAPSHOT_CHANGED` and continued to HOLD. **Do not auto-reseal its v5r policy, disable the C03 watchdog, or allow additional finance writes.**

The original inspected immutable `r25_c_start_root.py` source tracks several reviewed timer-driven completed oneshots but omitted `wolo-c03-observer.service` from the particular v5r enrollment. Consequently its `ExecMainStartTimestampMonotonic` and last-`ExecStart` run timestamps changed the otherwise approved protected snapshot. Real root-native properties on HEL1: `Type=oneshot`, `TriggeredBy=wolo-c03-observer.timer`, `NeedDaemonReload=no`, `Result=success`, `ActiveState=inactive`, `MainPID=0`; reviewed unit config SHA256 `69673676c27f2d0f5924653916636307b15b8303596883f8f2ba8c5e60382749`, timer config SHA256 `568a19b49ed75120afd662c1e017dddbe284a1619f8c29e9d4ba7e088e26bb34`, effective static command digest `15b8b9d7c9a1a6d04ae420750b6f74339149ca9b5025090a26b06b87438c90ed`. No live unit or finance DB was altered by this attribution.

A direct **read-only HEL1 A/B snapshot test** using the exact v5r source and one additional in-memory exact timer mapping verified **zero difference in all other monitored units**, identical unit-name inventory, identical protected socket inventory, identical template config inventory and **unchanged observer unit-file SHA**. Raw current snapshot SHA256: `0efa93ec816c64dfbd7709716b93b7ff475362fc740f6a26c6e6352f637490d6`; normalized candidate SHA256: **`6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb`** at the test instant. The candidate fingerprint must be refreshed and re-reviewed at deployment; no earlier physical observation is an indefinite approval.

New **versioned v5s**, source `scripts/release/r25_steam_refresh_v5s.py`, maps only `wolo-c03-observer.service` to `wolo-c03-observer.timer` in the *immutable original controller's existing strict `unit_state` normalization logic*, in addition to the previously reviewed public relay timer pair. Only completed execution timestamps are normalized; checked `ExecStart` command SHA, `Result`, `TriggeredBy`, full unit file SHA, 57-unit inventory, protected ports, web PIDs, source receipt and no finance authorization remain pinned. Changed timer/command/config or persistent/failed/active service still changes the snapshot or hard-HOLDs. New `web-prod-v5s` admission and policy paths and separate schema prevent reusing the v5r root0400 admission; no in-place replacement of v5r source.

**Deployment remains separately guarded:** require green exact-head CI and reviewed normalized live snapshot, fresh root0400 admission with original signed public commit plus current PID/start ticks, exact expected root0400 policy, preserved v5r App unit preimage and reversible App-only unit cutover. Service capabilities and NFT scope must remain byte-identical; original 3030, R25 3032, financial PostgreSQL, C03/C06/C07 and 8094/8095 must not be changed. No native funded mainnet transfer. Until actual restricted systemd v5s timer passes and recurring post-hourly acceptance is documented, the operational Steam gate is still held.

Local qualification:
`python3 -B scripts/release/r25_steam_refresh_v5s.py --phase selftest`,
`python3 -B -m unittest discover -s tests -p test_session_b_steam_runtime_v5s.py -v`, and
`python3 -B -m unittest discover -s tests -p test_session_b_steam_v5s_c03_observer_timer.py -v`.

## November 15, 2026 — B-owner historical review and current PRODUCT reconciliation

This is a new source/operational review, not a rewrite of the November 7 v5/v5r/v5s incident receipts, independent root-signing act, or a release permit. Earlier PIDs, protected-snapshot hashes, v5r unit and C03 observer attribution describe their November 7 observation windows only. They are not current release pointers.

Reviewed current app main at f436d6f3c1a04308e33b17db4a69c25a2d925fcf, including docs/release/artifacts/r25_steam_refresh_product_v27.py and its source negative tests, against the [accepted PRODUCT Factory physical report](https://github.com/Emaren/app-prodn/pull/1358#issuecomment-6886458435). V27 source preserves only UID990 Steam HTTPS egress, pinned seven-rule NFT table shape, 300-second expiry, strict 16-address ceiling, bounded retries of only the expired-element read, atomic same-set renewal, unchanged sandbox/capabilities, six protected financial masks and closed 8092–8095. Source guards are not deployed-root proof.

Actual read-only HEL1 verification at 2026-11-15 15:43–15:45 UTC: public website service active/enabled, zero restarts, PID 1742; 3032 HTTP headers matched source 9c5fb786b06636a813235bc13cb2cdffaf51ffc4 and BUILD_ID tODeDszM3vE1kOKcQUQjZ. PRODUCT Steam NFT boot unit active/enabled, result success. Steam refresh timer active/enabled, with a real one-minute next firing. Steam refresh service last Result=success, ExecMainStatus=0, and actual ExecStart used /usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py --phase refresh. Listeners 3030, 3032, 3033, 9447 present; 8092–8095 absent; six restricted financial units masked. Public HTTPS root, /factory and /kingdom-traders returned 200, while /api/bets deliberately returned 503. No account cookies or financial operations were inspected.

Installed V27 root-owned script has mode 0700; the non-root session could not independently hash it, and no noninteractive root privilege was available. The original B-signed physical acceptance, two genuine boot witnesses and T10 remain separate provenance for installed source, NFT boot recovery and root lock. This documentation review does not re-sign, reopen or independently certify root-only bytes. See [root acceptance](https://github.com/Emaren/app-prodn/pull/1358#issuecomment-6886458435) and [Central reconciliation](https://github.com/Emaren/app-prodn/issues/1280#issuecomment-6887906213).

Current verdict: v5r/v5s incident analysis remains valid as dated evidence. Accepted production uses Factory source 9c5fb786... with separate V27 Steam maintenance and financial HOLD. Any next PRODUCT website source requires new exact-source CI, B-owned signing/permit, native preflight and rollback/T10. This review grants none of those permissions.

## 2026-11-23 substantive V5–V5S incident and V27 source reconciliation

Read the complete original Nov7 root service failure, `/proc/<PID>/cwd` privilege regression, rollback to original v4b unit, v5r physical restore, hourly C03 observer fingerprint and v5s-only normalization exception, plus the Nov15 review. The original immutable v5/v5r/v5s unit SHA, timer evidence and 57-unit inventory records must remain dated Nov7 historical proofs, not repeatable authority, and adding CAP_SYS_PTRACE or weakening the systemd sandbox remains forbidden. The tracked current Steam controller at PR #1486 `docs/release/artifacts/r25_steam_refresh_product_v27.py` blob **`d9bee82f972e8eba6cd219eda1f9e263ac0713a5`** remains byte-identical to the cited Nov15 `f436d6f3c1...`; it preserves Steam-only UID990 scope and independently inspected modern source checks. Fresh native HEL1 at **Nov23 17:14:56 UTC** found V27 refresh `Result=success`, `ExecMainStatus=0`, active/enabled timer and NFT boot, production 3032 active at source `890d9dcc22d0`/BUILD `0NEGtfP0ieSzETh1JHGhE`, with 3030/3033/9447 protected, 8092–8095 closed. No current root-only executable byte SHA or C03 watcher snapshot was forged or re-signed; older hourly race behavior must still fail closed when its actual protected source fingerprint changes. No legacy Steam v5 branch is reinstalled, no owner host approval or financial activation follows from a DocsV2 date.
