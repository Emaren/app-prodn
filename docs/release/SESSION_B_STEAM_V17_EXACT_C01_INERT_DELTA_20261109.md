---
id: "aoe2war.app-prodn.session-b-steam-v17-exact-c01-inert-delta-20261109"
title: "Steam V17 exact pre-C01 topology reconstruction and restricted 3032 recovery"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only reviewed App release with physical production acceptance required"
reviewed_at: "2026-11-17"
review_interval_days: 7
sensitivity: "restricted"
---

# Steam V17 exact pre-C01 topology reconstruction and restricted 3032 recovery

Source of the genuine fail-closed V14 Steam HOLD is proven, not assumed. V14 passed at 17:24:49 UTC; at 17:25:02 UTC Chain Session A installed two inactive C01 executable drop-ins (Satchel and reviewer). V14 held at 17:25:27 UTC because its source-pinned C03/C04 protected fingerprint remained pre-C01 064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c, while live systemd returned 6bef38a7bbd89f4041e832eeebfa7c2213fa627633299b8d0ad45135b3018999.

Read-only physical reconstruction on HEL1 on November 9 proved that reversing exactly three fields for each of two unit records entirely in memory, and no other service/socket/nft material, yields the original accepted SHA-256 byte-for-byte: unit_config_sha256 from authentic original systemctl cat base; DropInPaths empty; and ExecStart_sha256 of original unmodified VCS executable. The exact source bytes, effective systemd command representation, two drop-ins, binary fingerprints, root ownership, inode count and ACL are checked. C01 sentinel /run/wolo-c01-maintenance-hold-approved must remain absent; both C01 units must remain inactive, MainPID0, no restarts or pending daemon reload. Installed binaries must retain 0555 root ownership and exact hashes. Any other protected unit/socket/nft/legacy 3030/validator change fails the unmodified V5z/C03 V1/C04 original guard or exact preimage comparison. The helper does not replace or weaken original guard binaries.

V17 retains only (a) exact original finance-restricted R25 source 4ab96cc7c1c0ba43a0403795485d3f410a6ba07f on bound original 3032 four-path unit and (b) unchanged CI-staged repaired source dd00367a9d648e66ebbe9f56e17f323efbdaca6f, not arbitrary source/PID. Only old restricted runtime may be admitted through the initial original-only recovery controller; repaired release still requires a fresh guarded process switch and functional /api/bets HTTP200. Steam V17 retains ProtectHome=yes, ProtectSystem=strict, NoNewPrivileges=yes, strict C04 finance masks, UID990 nft final DROP, TLS/SNI allowlisting, and bounded lease-expiry fail-closed behavior.

The one-use original-only Steam recovery controller does NOT restart a Next server or change Nginx or financial SQL. It verifies root source hashes, unchanged live original web PID/build/unit, original V8 2048MiB and 3355443200-byte systemd MemoryMax, protected C01 old/new exact provenance, validator PID1009, legacy PID2625090, legacy payout masks, and closed ports8092–8095. It stops only the Steam refresh timer while replacing exact Steam service source and one-field script-unit path, enrolls V17 for current original 3032 PID, invokes one real Steam refresh, then resumes the timer. Failure restores exact V14 unit with negative receipt (V14 still fails old fingerprint; restoring timer is NOT accepted Steam functionality).

First successful V17 refresh is NOT recurring lease-crossing acceptance. Require multiple scheduled refreshes crossing lease boundaries and listener substitution negatives, authenticated Steam OpenID ordinary/admin/AI-Scribe Chrome receipts, seven protected views, memory slopes, and continuous C04 safeguards before C03_APP_HANDOFF=YES. C02_APP_TRANSPORT remains HOLD until real native 8094 production wire acceptance under Session A authority.

Non-negotiable boundaries: no Chain keys, owner DB mutations, financial grants, 8092/8093 fallback, third Next runtime, increased heap, changed finance role, new funding authority, wallet movement or native C01 activation. No Chain C03/C06/C07 gate closure by Session B.

## HEL1 physical in-memory adversarial receipt (source-only)

An independent physical check imported the original installed V14 > V5z > C03 V1 > C04 guards without modifying any systemd unit, key, financial table, socket, nft set or wallet. The source-staged exact C01 delta guard confirmed the authentic original fingerprint. Five adversarial variations were all rejected: synthetic active reviewer PID, unrelated protected-unit PID change, legacy 3030 socket substitution, present maintenance-approval sentinel and modified reviewer executable bytes. The test changed only in-memory snapshot copies and mocked reads. Physical six-result receipt under root-private staging is SHA256 370ab38312d0aa8f5cf6eecce3f7d5ad046ec8761a9d3fdd7e019ea55cec2714; status PASS_EXACT_C01_DELTA_ADVERSARIAL_READONLY. This is a source/host proof, NOT a completed scheduled Steam enrollment or a C03 financial acceptance.


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
