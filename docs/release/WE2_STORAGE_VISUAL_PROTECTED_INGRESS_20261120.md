---
id: "aoe2war.we2.storage-visual-protected-ingress-20261120"
title: "Protected Storage OS ingress admission for deployed Explorer"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "vpssentry", "hel1"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-source-review-only"
reviewed_at: "2026-11-20"
review_interval_days: 14
sensitivity: "internal"
---

# Protected Storage OS ingress admission for deployed Explorer

## Exact live R25 Social guard preimage preserved

The real HEL1 installed R25 source has SHA-256
`e3ba88ce8fb4e699e3c8509e9024bee2c0d8ceaff57b5c0038b15e767aad201f`,
matching app-prodn PR #1424 source
`3c27ebe7eee7d92d6892857a687fd81bb3f8754c`. The earlier draft
accidentally used the *older* main branch guard, which would have removed
genuine Clan/Direct/Lobby Chat POST routes and the protected Social writer
socket. This corrected WE2 candidate starts with **all exact live PR #1424
guard bytes** and adds only a narrow bounded `storage_visual` request branch.
The Social socket, its signed-session header policy, existing appearance
and auth flows, and prohibited egress are unchanged. Tests assert positive
real Social routes and negative unauthorized paths after the new branch.

The public Next.js source `dbceb5df20f98ff783a2af1a83d79cf17abae035`,
BUILD_ID `RHE-s_XmtI5heC0JuZP7r` and T10 seal are **unchanged**.
This PR does not grant installation or permit a new Next.js runtime.
The current R25 production preloader and the generic Nginx /api/ route
independently block the existing source-owned bridge POST with HTTP 405.

## Mandatory actual HEL1 filesystem sandbox correction

Physical inspection at 2026-11-20 23:20 UTC showed the existing
`aoe2hdbets-web-prod.service` has `ProtectSystem=strict` **and**
`InaccessiblePaths=/mnt/HC_Volume_105319120`. The original proposed
`AOE2WAR_OS_STORE_DIR=/mnt/HC_Volume_105319120/aoe2war/os-control`
would therefore be inaccessible to UID 990 even after POST guard and
NGINX admission. The legacy `os-control/state` directory is also UID
1000/mode 0755, while the receiver requires UID 990/mode 0700. Do
not remove the data-volume deny or recursively chown the legacy state.

This reviewed proposal instead pins the *one durable*, non-cache,
source-independent receiver storage root
`/var/lib/aoe2war-storage-visual-web-v1` and installs exactly
`docs/release/artifacts/aoe2war_storage_visual_web_store_v1.conf`
as an independent, reversible service drop-in containing **only**
`ReadWritePaths=/var/lib/aoe2war-storage-visual-web-v1`. Under an
owner-signed, post-qualifications root ceremony, create this one
root filesystem directory (and `state` and `state/storage-visual-bridge-acks.v1`)
as UID 990/GID 984 with mode 0700. Verify systemd's *effective*
`InaccessiblePaths` and `ReadWritePaths` after reload. No general
write authorization, no mount exposure, no third Next.js process,
no existing OS controller permission changes.

**Read-only capacity is not release admission.** At 23:20 UTC
`findmnt` independently saw root `/dev/sda1` ext4 UUID
`64f6fb02-4fed-4836-a33b-86e8993afdfa`, mounted data
`/dev/sdb` ext4 UUID `a9a085d9-6c53-4d9f-8bb8-5aeb90bf0b42`,
and M1 APFS Data UUID `2B7670BF-6C76-4EC1-B874-31E1CE660EB4`.
These are genuine observed source identities but **not** a signed
approved C/G v2 website receipt. Keep the existing capacity thresholds
and report below-threshold values as HOLD rather than changing them.

## Proposed exact protected admission

- The *existing* 3032 preloader admits only the exact nonfinancial
  `POST /api/internal/aoe2war-os/bridge` with loopback peer, pinned Host,
  HTTPS-proxy provenance, proxy-owned `storage_visual` scope, bounded
  JSON Content-Length, and a bridge credential. No other added method/path.
- The separately reviewed exact Nginx location in
  `docs/release/artifacts/aoe2war_storage_visual_exact_ingress_v1.conf`
  **rejects inbound client-supplied scope headers** and replaces that
  header with `storage_visual`. It never allows `queue_finish`, `claim`,
  `complete`, an owner teaching write, finance or release control.
- The deployed app route still checks its existing bridge bearer
  credential, then strict signed source-plane envelopes and host identity;
  the durable receiver returns signed ACK only after fsynced readback.
- The existing operator CLI privileges are **not** expanded through
  this public path. Separate, unavailable protected operator access is
  not silently restored here.

## Hard P0 installation holds observed in production

The current `/etc/aoe2war/web-prod-v1/runtime.env` does **not** declare
any of these names (values were not read): `AOE2WAR_OS_BRIDGE_TOKEN`,
`AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY`,
`AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY`,
`AOE2WAR_STORAGE_VISUAL_HMAC_KEY`, or
`AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY`.

The legacy mounted OS state belongs to UID 1000 and cannot become
the UID 990 receiver state through permission relaxation; use the
separately reviewed **root-local non-cache** store described above.
The bridge ACK directory and production accepted visual receipt are
absent. Never chown legacy controller state or weaken its protection.

Mac Pulse source key UID501 mode0600 was physically enrolled on
2026-11-20, and genuine earlier Mac Pulse observation was signed
locally (source evidence SHA
`779d57d415e2be9e1749740be32ff2314e7c71967858d7eb99f556cc48ba2af6`).
Its claimed mount identity is still `UNVERIFIED_APFS_VOLUME_UUID` and
no production ACK exists; this is **not** a signed v2 capacity result
or proof of a naturally scheduled signer run. HEL1 observer has no
installed timer or source-signing key, and has no ACK. No synthetic
signing or owner browser session may substitute for actual admission.

Further, the current signed visual v1 path explicitly identifies the Mac
APFS volume and HEL1 mounts with *unverified placeholder* identities and
omits both capacity samples and per-item review transport. The deployed
reader discards such optional fields until the individually reviewed C/G
source transport is adopted. Source-qualified v2 producer/receiver
admission, including actual filesystem IDs, is necessary for requested
owner Explorer exact free-space and Level 2 item observations. This
protected guard change alone does not solve that missing source contract.

## Root installation ceremony — not authorized by this PR

1. Obtain independent WE1 acceptance of the exact protected route,
   Nginx preimage and inverse, installed R25 hash/source fingerprint,
   user/UID isolation, and separate C/G producer witness.
2. Obtain an exact, short-lived owner-signed **nonfinancial**
   `storage_visual` ingress enrollment permit, not a website Factory
   release permit or custody authorization.
3. Install under the established protected root executor in one
   reversible transaction; test Nginx config before reload and compare
   the installed preloader SHA against the reviewed source.
   Preserve 3030, 3033, 9447 and all financial 8092–8095 closures.
4. Enroll segregated, individually approved 0600 keys for Mac source,
   HEL1 source, server visual and bridge ACK, plus the existing bridge
   bearer. Admit a private 0700 storage store with no legacy controller
   regressions. No secret bytes in GitHub, PR or logs.
5. Prove current Mac/HEL1 source timestamps and actual mount identity,
   signed submission, durable source-specific signed ACK, reboot/reload
   persistence, private web readback, stale/replay/HMAC denial, header
   spoof 403, `queue_finish`/`claim`/`complete` denial, and
   ordinary-user/guest browser restrictions.
6. Source-governed teaching POST is a **separate** admission. The current
   ledger checks HMAC event chaining but does not independently pin an
   external latest sequence/tip to detect tail truncation. Do not open
   the existing owner POST until WE1 accepts a durable external tip
   witness and genuine owner session/Chrome tests.

No production config, service, wallet, source signer, CSS or product
BUILD_ID was changed in preparation of this source proposal.
