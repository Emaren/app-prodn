---
id: "aoe2war.app-prodn.session-b-c04-steam-sandbox-v11-20261109"
title: "Session B — C04 Steam Sandbox V11"
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

# Session B — C04 Steam Sandbox V11

> **November 25, 2026 — documentation disposition (source only).** Historical disposition: preserve the original November incident record and its subsequent source review verbatim. Prior authority label: steam-source-bound-readonly. All process IDs, receipts, commands, source pins and deployment claims below refer to their original observation only. Do not execute old controllers or treat this record as current admission; use the current Factory and separate financial authority. No renewed operational approval or physical attestation.


**Scope:** nonfinancial Steam destination-refresh repair, not Chain custody or C03/05/09 funding approval.

## Physical V10 failure and original rollback

The original C04 legacy unit backups live inside /root/aoe2war-c04-legacy-settlement-quarantine-20261109 (0700, root). V10's protected listener guard checked those originals every minute from Steam's oneshot service. The source-pinned Steam service retained ProtectHome=yes, which prevents the service from accessing /root, correctly producing a PermissionError at 2026-11-09 08:51:51 UTC. The exact V10 controller returned HOLD_COMMAND_FAILED_systemctl, automatically restored the original V9 service SHA256 0fddaf791d3c147766c5df108b34c761da9a3d07759043348671fa222eda0557 and original timer SHA256 d3f4ce6fbbf6b2aad826a57e10e62859b82ce6e175b0ac99e6c5aa6f776413fc. Both C04 legacy settlement units remain masked and all financial ports 8092–8095 closed. The failed V10 receipts remain root-private for audit.

## V11 safe split

The V11 **root-only installer** reads the true original two C04 unit definitions under /root and verifies their UID, mode and exact SHA256 against the accepted PR #227 / merge b250461c45b3d74d5202e14d74df8a345e484add. It then writes a deterministic **digest-only** manifest into /etc/aoe2war/web-prod-v11 (0500), file mode 0444, SHA256 874df3a5164bf1e8299ce6ed261909f3b2a9bfae3ba3a681a48a9255c73fa3df. It NEVER copies the actual original financial unit definitions into the web-readable sandbox or grants new SQL permissions.

The V11 Steam service, still under ProtectHome=yes, ProtectSystem=strict and bounded capabilities, verifies the digest-only manifest, masked original unit symlinks, systemd inactive/zero-PID/no-reload states, 8092–8095 closed, 3030/3032 unchanged, validator and website PID identities, and the original source-pinned C03 V1 snapshot and completed oneshot normalization. It accepts only C04's two intentional closed legacy listeners, rejects a third, and preserves all other V1/C03 guard denials. The original C03 observer remains source-identical.

The exact Steam service unit's ONLY authorized change is the script name v9 to v11, resulting in SHA256 07d95f1079d33b18274fafab912d9ab0af9a0ea22d19b8fcecf64c0af589e653. The original V9 service is backed up before the first live mutation. On any failed V11 activation it is restored; legacy 8092/8093 are never restarted. Release policy root and source IDs are distinct from V9/V10.

This repairs the sandbox conflict without changing C04 Chain authorization or pretending a completed V10 release. V11 is accepted only after exact Git-head CI and physical V11 authenticated Steam timer/refresh, with C03 fingerprint and C04 mask continuity verified again.

**C03 remains HOLD** until independent restricted 3033 rollback, legitimate admin/nonadmin Chrome sessions, five missing nonfinancial reads, and the actual R25 V8 heap OOM are addressed. No customer balances touched or financial release granted.


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
