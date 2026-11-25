---
id: "aoe2war.app-prodn.session-b-c04-masked-steam-v10-20261109"
title: "Session B — Versioned C04-Masked Steam V10"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "historical-evidence"
authority: "dated incident evidence only; no current operational authority"
reviewed_at: "2026-11-25"
review_interval_days: 0
sensitivity: "internal"
---

# Session B — Versioned C04-Masked Steam V10

> **November 25, 2026 — documentation disposition (source only).** Historical disposition: preserve the original November incident record and its subsequent source review verbatim. Prior authority label: steam-source-bound-readonly. All process IDs, receipts, commands, source pins and deployment claims below refer to their original observation only. Do not execute old controllers or treat this record as current admission; use the current Factory and separate financial authority. No renewed operational approval or physical attestation.


Scope: nonfinancial R25 website Steam-only egress admission. Not a C03/C04/C09 approval.

## Source of the failure

On November 9, Chain C04 PR #227 merged at b250461c45b3d74d5202e14d74df8a345e484add and the two historic financial services (8092 and 8093) were persistently masked and stopped. C04 receipt cae4f19416436a0fd5598cc1a08ae011d458ed97e562b23e2154c2b2ef5298b4. V9 legitimately returned HOLD:PROTECTED_LISTENER_NOT_UNIQUE: original V1 production_protected insists that 3030, 8092, and 8093 each have one socket. These financial listeners must never be resurrected to satisfy Steam.

## Accepted topology transition

The original V1 source, original C03 V1 service/timer/command and pinned C03 completed-oneshot normalization remain untouched and fully attested. A separate root-owned V10 helper enforces:

- Both historical settlement units are LoadState=masked, UnitFileState=masked, ActiveState=inactive, MainPID=0, NeedDaemonReload=no, and exact /dev/null masks.
- Both original unit definitions are preserved within the root 0700 C04 quarantine, with 0644 original file permissions and SHA-256 pins.
- There are zero listening TCP sockets on 8092, 8093, 8094 and 8095.
- 3030 and 3032 each have one listener, the original web PID and Wolo validator PID are checked, and PostgreSQL listens on loopback 5432. The unchanged V1 source continues validating protected socket inode/cgroup identities and all other protected units.
- V1's immutable production_protected() is executed in full, temporarily accepting exactly two otherwise-fatal PROTECTED_LISTENER_NOT_UNIQUE outcomes. Any third exception, additional mutated service, added protected socket, changed C03 command, absent completion, checksum drift, or before/after socket change fails closed. The original error handler is restored on both success and failure.
- V10 has its own source, enrollment profile and policy root. It does not overwrite V9's trusted snapshot or source. The expected pre-switch C04 masked topology SHA-256 is 064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c as observed on HEL1 with V9's currently installed Steam unit.
- The only exact permitted Steam service update is a single script-path replacement in the root 0644 unit, from SHA256 0fddaf791d3c147766c5df108b34c761da9a3d07759043348671fa222eda0557 to f5d08beebca0912e8271fddf891983ac80b60d148e7e2242cd34832bb0a55176. The Steam timer file and C03 observer are unchanged.
- Any proposed Steam unit/timer transition from V9 to V10 is a separate controlled config change, with an exact precomputed post-switch topology fingerprint and explicit backout; never reuse the pre-switch hash as a dynamic approval or rotate it blindly.

## Physical proof on HEL1

- V9 on HEL1: HOLD:PROTECTED_LISTENER_NOT_UNIQUE while both C04 services are masked and all four financial TCP ports closed.
- Isolated V10, byte-pinned, with the original V1/C03 guard loaded: three consecutive full HEL1 protected topology acquisitions PASS, same 064a16... SHA; each ~2.7–3.0 s.
- Python tests/test_r25_steam_c04_masked_v10.py: 12 positive/negative tests PASS. Includes third-listener bypass denial, original C03 command denial, TOCTOU denial, changed 3030 / resurrected 8092 denial and finally restored original need() function.
- No live timer, C03 observer, source-pinned V9, Chain financial service, custody, database ownership or funded listener changed by this preflight.

## Source-bound physical switch

The only executable activation path is scripts/release/r25_steam_masked_c04_switch_v10.py, installed under its reviewed SHA. It checks original service/timer/website SHAs and masks, saves a root-0600 V9 unit backup, installs exact two V10 scripts root-0644, and makes exactly one source-controlled Steam ExecStart replacement. It stops the Steam timer only during switch, reloads, runs V10 selftest/inspect/enroll, runs the actual Steam oneshot and confirms success, then restores the timer and repeats protected inspection. On any failed physical predicate after the unit change it restores the exact original V9 unit bytes and the original Steam timer. No Chain service/financial roles are ever changed.

This is an explicitly versioned V10 policy, not a silently redefined original V9 signature. An operator MUST verify exact-head CI and the existing HEL1 C04 closed state before invoking the one-use --activate procedure.

## Remaining acceptance

The new V10 must be deployed under a separately reviewed exact Steam unit/config SHA and source-bound post-transition fingerprint. Physical Steam refresh and negative test must pass with C04 masks intact. Then independently verify genuine owner and non-admin Chrome/Steam sessions and the finance-safe 3033 rollback before C03 live coordination.

C04/C08 CLOSED; C01/C02/C03/C05/C06/C07/C09 OPEN. No WOLO moved or authorized.


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
