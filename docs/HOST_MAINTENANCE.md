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
reviewed_at: "2026-10-13"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Host Maintenance

## Current protected host state — 2026-11-13 UTC

B's [read-only HEL1 evidence](https://github.com/Emaren/app-prodn/pull/1343#issuecomment-6842562063) confirms
the protected public website at **3032** served source
`9f7b56f536ba51b4678ac43baebfae140ada6479` with no restarts,
the original **3030** remains only a preserved legacy rollback (do not route
the public there without its separate financial-risk proof), and Steam/Nginx
must be qualified with any source-pinned release. The original Wolo
settlement services remain **masked and inactive**, and ports **8092–8095
have zero listeners** under the current C04 quarantine. Historical host
package/reboot acceptance requiring **one verified 8092/8093 listener each**
is therefore **NOT satisfied today** and must not be bypassed or
misrepresented as healthy. Ordinary public website release has a separate
nonfinancial 3032+Steam source/rollback protocol; it does not authorize
protected host maintenance, restart or settlement. Fresh operator approval,
recovery state, memory/headroom and W1 protected prerequisites are still
required before any actual host package/reboot action.

## Scope and current posture

This runbook owns explicitly approved VPS package and reboot maintenance. It is
separate from application release engineering.

At this review, Doctor reports that host maintenance is pending, including a
reboot-required marker and available package updates. The exact package count
and reboot state are live facts: read them from `aoe2war doctor --json` and the
host package manager rather than copying a number into documentation.

Host update truth distinguishes **actionable** packages from distro-policy
deferrals. `apt list --upgradable` is the total visible candidate set; a
read-only `apt-get --simulate upgrade` determines what Ubuntu would actually
apply now. A visible package omitted solely because Ubuntu phased rollout is
not actionable maintenance debt: Host OS and Doctor report it as informational
phased deferral and remain healthy when no other host work is pending. A
non-phased deferral or failed classification remains attention-worthy. Never
override Ubuntu phasing merely to clear a dashboard warning.

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
then atomically replaces `/usr/local/sbin/aoe2war-maintenance-run`. Its
historical W1 acceptance required Wolo active, exactly one listener on each
protected 8092/8093 port, unchanged validator PID/restart counter and chain
advancement. **That future W1-specific acceptance is NOT today's C04 state**:
both legacy settlement units remain masked, all four legacy
bet-reconciliation/staking-reward timer/service units are now also masked, and
8092–8095 have zero listeners. Do not start or unmask any of them to satisfy
an obsolete preflight. Current HEL1 host maintenance remains on HOLD pending
separate operator and W1 authorization. Every admitted NOOP or UPDATED
reconciliation must seal an immutable root-owned receipt under the AoE2WAR
control store.

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
- the required W1-specific maintenance admission is absent; under the current
  C04 quarantine 8092–8095 must have **zero listeners**, and the four
  bet-reconciliation/staking-reward timer/service units and both legacy
  settlement services must stay **masked and inactive**. Never unmask financial
  units to meet the historical one-listener-per-port W1 condition;
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

## Locally verified encrypted database checkpoint (read-only)

The operator can verify a finished off-host PostgreSQL checkpoint without
opening the private CMS key, contacting the VPS, changing files, or invoking an
OS package operation:

```bash
./bin/aoe2war host maintenance-checkpoint \
  --dir "$HOME/aoe2war-recovery/20261016T153508Z-host-maintenance-db"
./bin/aoe2war host maintenance-checkpoint --dir "$CHECKPOINT" --json
```

The bounded SHA-256 manifest reader requires exactly `database.cms`,
`database.cms.sha256`, `checkpoint.txt`, and `checkpoint.txt.sha256`
under an explicitly selected local directory. It uses descriptor-based regular
file reads with symlink refusal, hashes the **actual complete encrypted archive**,
and checks that the human checkpoint's declared ciphertext SHA matches the
verified manifest. It checks a trusted target database identifier, chronological
UTC timestamps, a 40-character operator Git SHA, and recorded
capture/encryption/decryption/SQL archive decode results.

The command's default **24-hour** freshness window is only a *pre-maintenance
checkpoint age policy*, not proof of an isolated restore or Recovery OS coverage.
It reports `FRESH` (exit 0), `STALE` (exit 1), or `STOP` (exit 2). Operators can
select a narrower/higher bounded window with `--max-age-hours` (0–720).
The original archive and its manifests are never modified. Output includes
only a bounded integrity/freshness summary and the original operator source
SHA, not secrets or Mac absolute paths.

**Authority boundary:** this checksum proof establishes *ciphertext integrity*.
The recorded `Full archive decode: PASS` is an operator attestation—not a
fresh re-execution of CMS decryption, an actual restored database, a fresh
Wolo snapshot, or protected host upgrade authorization. Do not present this
as full disaster recovery freshness or a completed full maintenance receipt.
The independently authorized live Wolo capture/separate key custody and
immutable Host Maintenance OS transaction receipt writer remain open under
#624. For full release and host changes, preserve the prior authorization,
simulation, service/provenance, console recovery and postflight gates below.

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
   list. Stop on newly introduced packages or removals. Treat Ubuntu-phased
   candidates omitted by the simulation as intentionally deferred; do not force
   them into the transaction. Any other deferral requires review before mutation.
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

1. verify no protected mutation is running and that independent W1/host
   authorization exists; current C04 quarantine alone is **not** reboot approval;
2. record public HTTPS, Nginx upstream, protected 3032 and preserved 3030/3033
   internal web health (plus 3330 API where applicable);
3. record **zero listeners on 8092–8095** and masks/inactivity for both legacy
   settlement services and all four legacy financial timer/service units;
   the historical 8092/8093 one-listener prerequisite applies only after a
   separate W1 authorization and is **not** a reason to unmask today;
4. record protected `aoe2hdbets-web-prod.service` 3032 PID/restarts, the
   active source SHA, Next `BUILD_ID`, build version, approved release receipt
   and rollback identity; record Steam egress-refresh timer/service, Nginx
   config/upstream, other timers, failed units and capacity;
5. confirm provider console/recovery access and the abort/escalation contact;
6. obtain explicit approval for the exact UTC window.

Only the approved operator executes the host reboot. Do not combine it with a
deploy, migration, Wolo upgrade, filesystem cleanup, or configuration rewrite.

After SSH returns, allow declared services their documented startup time, then
verify:

```bash
systemctl is-system-running
systemctl --failed
systemctl is-active aoe2hdbets-web-prod.service
systemctl is-active aoe2war-steam-egress-refresh.timer
systemctl is-active nginx.service
systemctl show -p MainPID -p NRestarts -p FragmentPath aoe2hdbets-web-prod.service
systemctl cat aoe2hdbets-web-prod.service
systemctl show -p LoadState -p UnitFileState -p ActiveState \
  aoe2hdbets-bet-stake-reconcile.timer aoe2hdbets-bet-stake-reconcile.service \
  aoe2hdbets-staking-rewards.timer aoe2hdbets-staking-rewards.service \
  wolochain-mainnet-settlement.service wolochain-founder-rewards-settlement.service
ss -ltn
aoe2war status
aoe2war audit
aoe2war doctor
```

Fail closed unless **all six named financial units remain masked/inactive**
and 8092–8095 retain **zero listeners**, matching the current dated C04
quarantine receipts; do not start/restart/unmask financial units for this
check. Separately prove 3032 internal HTTP and public HTTPS/PWA through
Nginx's **3032 upstream**, matching the active 3032 service PID and release
root's source SHA, `BUILD_ID`, build version and source-pinned Steam
helper to the **approved release receipt**. Verify Steam timer's latest
actual refresh result, Nginx config, expected service identities, session
continuity and protected finance-denial endpoints; a merely active timer
is not proof of a qualified Steam refresh. Preserve 3030 as the **legacy
financial-risk rollback only**, and 3033 as emergency; neither is a
substitute for 3032 public routing. Check 3330 API if expected, database
migration state, critical nonfinancial timers and root/volume capacity.
An unexpected identity, mask, listener, public route or rollback drift is
a STOP requiring independent review, never an invitation to repair by
restarting Wolo or routing traffic to 3030.

## Completion criteria

Maintenance is complete only when:

- approved package/kernel/reboot scope matches what actually changed;
- protected 3032 web, Steam refresh, Nginx/public HTTPS, replay API,
  public routes, database connectivity and required nonfinancial timers
  pass their source-pinned identity/health checks;
- the active 3032 source SHA, `BUILD_ID`, build version, Steam helper,
  release receipt and preserved 3030/3033 rollback/emergency identities
  did not drift;
- current C04 financial masks/inactivity and zero 8092–8095 listeners
  are unchanged, with no attempt to meet historical active Wolo conditions;
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

`aoe2war host maintenance-plan` remains read-only and fail-closed until
Recovery OS itself returns `VERIFIED` from its cryptographically checked
schema-2 proof contract. Configuration strings alone cannot make host
maintenance READY. Package upgrades and reboot stay explicit maintenance
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

## VPSSentry security telemetry is a host-health authority

Doctor must not report a healthy host while the canonical VPSSentry status
artifact reports an active critical threat indicator. Doctor therefore reads
`/var/lib/vps-sentry/public/status.json` through the normal production SSH
authority and records the observation timestamp, age, critical-indicator count,
and critical IDs.

VPSSentry normally scans every five minutes with bounded jitter. Doctor treats
telemetry older than twelve minutes as stale and warns fail-safe; missing or
unparseable telemetry also prevents a clean HEALTHY result. A fresh critical
indicator is a Host BLOCKER. Fresh non-critical VPSSentry warnings remain
visible through VPSSentry itself but do not become Doctor blockers automatically.

This rule exists because ordinary service, package, release, and capacity health
can all be green while a security IOC is active. Never weaken or bypass this
security authority merely to restore a 100/100 score.


### Tidy failure visibility

`aoe2war host tidy --apply` already records bounded remote command output in
its receipt. The human terminal view now also prints the final non-empty failure
line, bounded to 500 characters, when the operation returns `FAILED`. This
does not retry, bypass, or weaken any host, service, timer, listener, recovery or
Wolo proof; it only makes the existing fail-closed reason immediately visible.

## Dated source-contract review — 2026-10-13

Review checkpoint 2026-10-13: The operator-maintenance boundaries were checked against scripts/aoe2_maintenance_run.sh. Its transient work remains lower priority than the validator, including OOMScoreAdjust=800. Application Finish still grants no package upgrade/reboot authority. Live Ubuntu package counts, effective Wolo listener state and active recovery evidence must always be measured at execution time.
