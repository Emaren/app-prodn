---
id: "aoe2war.app-prodn.docs-host-maintenance"
title: "AoE2WAR Host Maintenance"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","wolochain","vps"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "host-maintenance-procedure"
reviewed_at: "2026-08-18"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Host Maintenance

## Scope and current posture

This runbook owns explicitly approved VPS package and reboot maintenance. It is
separate from application release engineering.

At this review, Doctor reports that host maintenance is pending, including a
reboot-required marker and available package updates. The exact package count
and reboot state are live facts: read them from `aoe2war doctor --json` and the
host package manager rather than copying a number into documentation.

`aoe2war finish` does not reboot the host, install or upgrade packages, change
kernel state, enable unattended upgrades, run a distribution upgrade, apply a
database migration, or mutate Wolo. A warning is a maintenance signal, not
authorization. Each material host mutation requires Tony's explicit approval,
an announced window, and a reviewed rollback/recovery plan.

## Critical-workload isolation

WoloChain is currently the sole validator for `wolo-1`; ordinary infrastructure
maintenance must therefore fail before the validator can be sacrificed by host
resource pressure.

The canonical safety rails are:

- source-controlled Wolo systemd drop-in:
  `ops/systemd/wolochaind-mainnet.service.d/20-oom-protection.conf`;
- installed drop-in:
  `/etc/systemd/system/wolochaind-mainnet.service.d/20-oom-protection.conf`;
- source-controlled maintenance runner:
  `scripts/aoe2_maintenance_run.sh`;
- installed runner:
  `/usr/local/sbin/aoe2war-maintenance-run`;
- Wolo `OOMScoreAdjust=-900`;
- maintenance always keeps `OOMScoreAdjust=800` and remains subordinate to Wolo;
- adaptive resource profiles are chosen independently for each bounded stage:
  - **CONSERVATIVE**: the proven `CPUQuota=20%`, `IOWeight=1`,
    `MemoryHigh=256M`, `MemoryMax=384M` lane;
  - **BALANCED**: up to 50% CPU quota per vCPU (cap 200%), low best-effort
    I/O weight, `MemoryHigh=384M`, `MemoryMax=512M`;
  - **BURST**: up to 75% CPU quota per vCPU (cap 300%), still-low best-effort
    I/O weight, `MemoryHigh=512M`, `MemoryMax=768M`;
- BURST requires at least 3 GiB MemAvailable and low host load;
- BALANCED requires at least 2.5 GiB MemAvailable and bounded host load;
- preflight minimum `MemAvailable=2 GiB`;
- soft pressure at 1.5 GiB, Wolo block age above 13 seconds, or Wolo
  no-progress above 9 seconds immediately demotes an active fast profile to
  CONSERVATIVE;
- emergency abort floor `MemAvailable=1 GiB`;
- Wolo block age must remain at most 20 seconds;
- Wolo height must not stop progressing for more than 15 seconds.

The runner continuously observes Wolo while each bounded transient systemd unit
executes. Healthy host headroom is leased to maintenance instead of being
permanently stranded behind a 20% ceiling. The lease is revocable: soft Wolo or
memory pressure immediately collapses the active unit back to the proven
conservative resource lane, while RPC loss, stale blocks, stopped consensus, or
the emergency memory floor still terminate maintenance fail-closed.

These rails were introduced after an August 18, 2026 storage-compression proof
created global host memory pressure and Linux selected the sole validator as the
OOM victim. Systemd restarted the validator cleanly and CometBFT replayed the
last block, but maintenance is no longer permitted to rely on `nice`, `ionice`,
or single-threading alone. Those controls influence scheduling; they are not a
memory-isolation boundary.


### Managed maintenance-runner handoff

`aoe2war finish` owns the source-to-host handoff for the maintenance runner.
Before the pre-mutation Doctor, Finish acquires the canonical release,
storage-retention, and rollback-archive locks in that order. If any storage or
release transaction still owns the seam, reconciliation fails closed instead
of replacing a runner beneath an active transaction.

At an idle seam, Finish validates the source runner with `bash -n`, copies it
to a root-owned partial path, verifies the exact SHA-256, mode and ownership,
then atomically replaces `/usr/local/sbin/aoe2war-maintenance-run`. Wolo
must be active, have exactly one listener on both protected ports, keep the same
PID and restart counter, and advance before and after the replacement. Every
NOOP or UPDATED reconciliation seals an immutable root-owned receipt under the
AoE2WAR control store.

This is a managed code-authority synchronization, not a package upgrade, reboot,
or Wolo mutation.

`aoe2war doctor` must verify that the installed runner/drop-in are byte-identical
to their source authorities and that both the effective systemd OOM priority and
the live validator process OOM priority remain `-900`.

## Stop conditions

Do not begin package or reboot work while any of these are true:

- a finish, deploy, rollback, retention, backup, migration, or settlement run
  is active;
- source/runtime is not certified or the production checkout has unexplained
  changes;
- either protected Wolo port `8092` or `8093` does not have exactly one
  expected listener;
- database backup or migration truth is unknown for a schema-affecting change;
- root or mounted-volume health suggests the maintenance itself may exhaust
  storage;
- no usable console/recovery access exists if SSH does not return;
- the exact packages, expected restarts, outage, and rollback path have not
  been reviewed;
- the requested action would change Wolo binaries, keyrings, consensus, or
  settlement behavior without a separate Wolo upgrade plan.

## Required authorization record

Before mutation, record:

- operator, UTC start/window, reason, and exact host;
- exact command class: package refresh, named package upgrade, kernel upgrade,
  or reboot;
- package/version list and services expected to restart;
- expected public impact and communication plan;
- pre-maintenance release SHA, BUILD_ID, build version, service state, database
  migration state, capacity, and Wolo listener counts;
- backup/snapshot identifiers and how to recover console access;
- explicit approval and abort criteria.

The eventual automation should persist a uniquely named, access-restricted,
append-only maintenance receipt under the AoE2WAR control/evidence store. That
receipt writer is not implemented by this documentation. Until it exists, do
not claim that host maintenance has automated or off-host evidence; retain the
approved incident/change record and command outputs without secrets.

## Read-only preflight

Run the read-only application and estate checks first:

```bash
aoe2war status
aoe2war audit
aoe2war doctor
aoe2war releases --limit 5
```

Then inspect host state without changing it:

```bash
systemctl --failed
df -h /
df -h /mnt/HC_Volume_105319120
test -f /var/run/reboot-required
apt list --upgradable
sudo apt-get --simulate upgrade
```

Review the simulated transaction in full. Confirm whether it changes Node,
PostgreSQL, nginx, systemd, OpenSSH, firewall tooling, the kernel, or libraries
used by the web/API/Wolo processes. Redact secrets and database URLs from any
captured output.

## Package-maintenance lane

1. Confirm the authorization record and recovery access.
2. Capture fresh read-only preflight truth and any required provider snapshot or
   protected backup. The mounted volume alone is not off-host recovery; see
   `docs/EVIDENCE_VAULT.md`.
3. Refresh package metadata only inside the approved window.
4. Re-run the simulated transaction and compare it with the approved package
   list. Stop on newly introduced packages or removals.
5. Apply only the approved upgrade class. Do not improvise `dist-upgrade`,
   release upgrades, package removals, autoremove, or unattended-upgrade policy
   changes.
6. Capture package-manager and `needrestart` results. Restart only the services
   required by the approved plan; do not restart Wolo merely because a generic
   tool recommends it.
7. If a reboot is now required, stop after package verification and enter the
   separately approved reboot lane below.
8. Run all post-maintenance proof before closing the change.

An application rollback does not undo an OS package or kernel change. Package
rollback must use the reviewed package versions/provider snapshot and must
account for database and on-disk format compatibility.

## Reboot lane

A reboot requires a fresh explicit approval after preflight. Do not treat an
old `/var/run/reboot-required` marker, a package-manager prompt, or a Doctor
warning as consent.

Immediately before reboot:

1. verify no protected mutation is running;
2. record public and internal web/API health;
3. record exactly one listener on Wolo ports `8092` and `8093`;
4. record active timers, failed units, capacity, and the current certified
   release identities;
5. confirm provider console/recovery access and the abort/escalation contact;
6. obtain explicit approval for the exact UTC window.

Only the approved operator executes the host reboot. Do not combine it with a
deploy, migration, Wolo upgrade, filesystem cleanup, or configuration rewrite.

After SSH returns, allow declared services their documented startup time, then
verify:

```bash
systemctl is-system-running
systemctl --failed
systemctl is-active aoe2hdbets-web.service
systemctl is-active aoe2hdbets-api.service
aoe2war status
aoe2war audit
aoe2war doctor
```

Also prove public HTTPS, internal binds `3030` and `3330`, database migration
state, critical timers, root/volume capacity, and exactly one listener on each
protected Wolo port. A temporarily slow Wolo startup is not permission to
replace its binary or force a chain upgrade. Inspect its owning runbook and
logs, preserve evidence, and escalate if expected identity or listener count
does not return.

## Completion criteria

Maintenance is complete only when:

- approved package/kernel/reboot scope matches what actually changed;
- web, replay API, public routes, database connectivity, and required timers
  are healthy;
- the certified application source/build/version identities did not drift;
- protected Wolo listener counts and expected identities are unchanged;
- no new failed unit, capacity blocker, or permission drift remains;
- `aoe2war audit` has no P0/P1 finding and Doctor has no blocker;
- outputs, deviations, rollback readiness, and any remaining warning are
  recorded in a new immutable change record.

Never rewrite an older maintenance or release receipt to represent the new
state. Append a superseding record and keep the original evidence.

## Host OS bounded hygiene and maintenance gate

`aoe2war host status` is read-only host hygiene. `aoe2war host tidy --apply`
may reset only failed `aoe2war-build@` / `aoe2war-deps@` transient instances
after their evidence has already been captured. The full tidy lane also runs a
systemd daemon reload and rearms the known AoE2WAR Traffic daily-rollup timer
when enabled. It does not upgrade packages and does not reboot the host.

Host OS uses the operations contract's explicit `root_maintenance_host`
authority for these bounded systemd operations rather than assuming the
ordinary production SSH user has maintenance privileges.

A successful `aoe2war finish` invokes only the transient-cleanup lane before the
final Doctor, preventing historical failed build instances from permanently
polluting current host health.

`aoe2war host maintenance-plan` remains read-only and fail-closed while the
independent mutable-state Recovery OS contract lacks a named authority and
verified restore proof. Package upgrades and reboot stay explicit maintenance
operations.

## Traffic rollup timer rearm proof

The Traffic daily-rollup timer uses `OnUnitActiveSec`. Immediately after a
daemon reload/restart it may trigger the rollup service and legitimately expose
no `NextElapseUSecRealtime` while that service remains active or activating.

Host OS therefore accepts either of two bounded rearm proofs:

1. the timer is active and has a concrete next-elapse timestamp; or
2. the timer is active, has a concrete last-trigger timestamp, and the linked
   rollup service is still active/activating from that trigger.

An empty next-elapse value by itself is not a failure while the triggered
service is still executing. Core web/API service state and Wolo listener counts
remain protected before and after host tidy.
