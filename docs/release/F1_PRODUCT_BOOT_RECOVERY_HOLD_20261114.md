# F1 PRODUCT BOOT RECOVERY — LIVE P0 HOLD

Observed at 2026-11-14 16:35–16:41 UTC. This is an owner-facing
nonfinancial operational acceptance item, not authority to change the host.

## Evidence

- HEL1 production `aoe2hdbets-web-prod.service`: ACTIVE, zero restarts,
  exact source `39a2d8b2eba9b5cc37d7351003d464554dc692f9`,
  BUILD_ID `4tBu8UVAzwIkIyVfR-hpD`, listening on localhost 3032.
- `systemctl show ... -p UnitFileState` returns **disabled**.
  `WantedBy=`, `RequiredBy=`, `TriggeredBy=` were empty and
  no reverse systemd boot dependency was observed.
- Nginx and old 3030 original web are enabled; that does not establish
  that public 3032 comes back automatically after an HEL1 reboot.
- Current 3032 unit has `Restart=on-failure`, which protects a started
  process, but does **not** start a disabled service after a reboot.
- Unit binds public downloads/media from
  `/mnt/HC_Volume_105319120` ext4. Its `RequiresMountsFor`
  currently lists runtime, /var/tmp and cache, not this data volume.
  The volume is mounted by fstab with `nofail`, so boot sequencing and
  absence-of-volume behavior require explicit review.
- `systemd-analyze verify` found no immediate syntax errors, not
  an end-to-end reboot survival proof.
- Finance 8092–8095 remain closed. Financial HOLD must survive reboot.

## Required separate trusted-root acceptance

1. Freeze the actual newly deployed exact source SHA, BUILD_ID,
   accepted T10 root seal, runtime path, unit SHA256, and old 3030 path.
2. Under the **existing trusted B root-install-only / owner permit
   mechanism**, review the boot-autostart/mount-readiness change.
   Do not simply `systemctl enable` without source pin and authority.
3. Verify dependency and mount ordering, with explicit safe behavior for
   absent/mismounted data volume (no silent root mount fallback).
4. Prove the approved source is enabled and remains pinned after
   `systemctl daemon-reload`; preserve 3030, emergency 3033 and
   PAPER 9447. Never open financial listeners.
5. During an owner-approved maintenance window, perform an actual HEL1
   reboot/startup witness: nginx+3032 public HTTPS source and BUILD_ID,
   Factory fresh publication, stable protected service/PIDs, original
   rollback availability, unchanged masks and FINANCIAL HOLD.
6. Test negative scenarios in isolated fixtures before real restart:
   missing mount, stale unit, unexpected source, failed listener,
   wrong seal, and startup-failure alert. Record irreversible actions
   as explicit HOLD pending review, not green.
7. Publish durable off-host evidence of startup success or failure and
   update the existing Factory documentation with the exact result.

## Strict distinctions

The F1 stopwatch, Factory panel and transport changes are source-only
until a separately approved exact SHA passes the Linux build, CI,
artifact verifier, physical release, rollback, reactivation and T10.
The pre-existing accepted 39a2d8 runtime remains the live baseline
until that ceremony succeeds.

This boot P0 is NOT resolved by successful code tests, HTTP 200 today,
or the current 3032 `Restart=on-failure` state. Leave it HOLD until
the physical maintenance witness is recorded. No FINANCIAL authority.
