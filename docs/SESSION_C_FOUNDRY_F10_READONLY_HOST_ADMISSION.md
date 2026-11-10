---
id: "aoe2war.app-prodn.foundry-f10-readonly-host-admission"
title: "Foundry F10 — Fixed read-only host observations and untrusted source admission"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "kingdom-foundry"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "product-only-session-c-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Foundry F10 — Fixed read-only host observations and untrusted source admission

## Exact ancestry and Session C ownership

F10 implementation SHA:
1913dd73c4b1aeaf74ad46164c378d64096664e9.

Direct parent Foundry F9 DRAFT App PR #1301:
8d193184bfea91332fe7e50fa2c9f2456d3a86a4.
F9 independent GitHub workflows and GitGuardian PASS.
F0–F8 ancestry remains reviewed and separate from App frontend
PR #1281/#1288. Do not force source history consolidation.

Branch: session-c/foundry-f10-host-probes-20261110
PRODUCT checkout: kingdom-foundry-f10.
Source-owned paths are one small new read-only probe module,
a one-shot manual CLI, 18 focused adversarial tests, a backward-
compatible F8 local-unattested envelope mode, the dedicated Foundry
GitHub CI step, Foundry README, and this exact-source handoff.

No Session B checkout or public R25 release changes; no FINANCIAL
root, native signer, SQL, custody, reserves, Intel recovery archives,
Steam sessions, machine credentials, PAPER account keys, trading
API, 3032/3030 Nginx selector or 9447 service modification.

## Real working source and deliberate limits

The new nightforge_host_probes.py provides two restricted
**local observation probes**, not a general command broker:

1. Systemd STATUS is a single short-lived, fixed subprocess argv:
   /usr/bin/systemctl --no-pager --no-legend show
   --property=Id,ActiveState,LoadState -- <one of six literal
   nonfinancial allowlisted services/timers>. shell=False,
   two-second timeout, no arbitrary unit, report, command, key,
   environment, path or extension accepted. Only the three
   expected ASCII property values are parsed, with duplicate/
   extra/unknown/inconsistent properties refused. A currently
   active unit NEVER certifies health, timer freshness or correct
   functional service behavior. The systemd command is not
   invoked on Mac; CI uses deterministic typed stubs.
2. Storage OS free-space uses OS statvfs for exactly the M1
   /System/Volumes/Data volume on darwin, or the root / volume
   on Linux ONLY AFTER a separately provided 64-hex SHA256 of
   that Linux host's /etc/machine-id matches a bounded, read-only
   locally gathered ID. There is no arbitrary mount/path
   parameter. An unpinned GitHub Ubuntu runner cannot silently
   masquerade as HEL1. The HEL1 volume and Intel recovery
   disks remain unaddressable until separate exact-source owner
   admission. Free disk bytes never certify that an encrypted
   off-host recovery or C06/C07 proof is complete.

An OS device ID SHA can be locally re-read or copied by a
privileged operator; it is NOT a signed remote attestation,
proof of approved HEL1 host identity, source independence,
genuine Steam session or market price. Production host
identity/pinning and read-only service admission still require
B/Central review.

The new one-shot nightforge_readonly_probe_cli.py can be
manually invoked with exactly --mac-storage, --hel1-root plus
an operator-supplied pinned Linux ID, or --systemd-unit from
the fixed allowlist. It produces a **bounded JSON receipt on
stdout only**, no private path, command output, log text,
credentials or stored file; no network and no persistent process.
On any failure, it emits only a generic HOLD and exits code 2.
No terminal prompt automation or scheduled continuation exists.

The F8 collector source ABI gains only one additional mode:
LOCAL_HOST_READONLY_UNATTESTED. A local probe produces a SHA
content seal and fixed typed fields, but the F8/F1 source SHA
is ALWAYS "unknown". No source proof, independently authenticated
time, provider oracle or release admission is granted.
F1 events are stored HOLD. F2 refuses enqueuing them.
F9's all-HOLD read-only PRIVATE 0600 HTML retains its
UNSEALED warning. There is NO authenticated app route
or capability to turn a report into a scheduled job.

## Actually executed test and receipt scope

At this exact F10 implementation source:
- Eighteen focused F10 adversarial tests PASS.
- Full F0–F10 local Python regression 134/134 PASS.
- Owner M1 physically read its current free-space counters
  through OS statvfs. The test passed that raw measured receipt
  through F8 normalization, authenticated-by-LOCAL-config F1
  journal in source-UNKNOWN/HOLD mode, F9's true read-only
  SQLite reader and 0600 private static HTML exporter.
  The test proved SHA byte consistency, no-overwrite and
  zero task/audit fabrication. It ran in disposable private
  PRODUCT directories; no production recording occurred.
- A second physical CLI invocation read the real M1 storage
  source and emitted a JSON HOLD receipt with sourceGitSHA
  unknown, zero network/file writes and all order/agent/
  finance flags false. It did not install a daemon or
  browse production.
- Fixed systemd command arguments and error parsing are
  verified with injected process stubs, NOT actual privileged
  HEL1 systemd execution.
- Adversarial tests reject a financial/service injection,
  failed/nonzero/overlong systemd outputs, forged HEAD,
  fake signed-production mode, incorrect mount identity,
  out-of-band Linux ID mismatch, untrusted UTF8 identifier,
  negative/impossible OS counters, stale/future reported
  time and unapproved/unbounded arguments.

No LLM weights were downloaded. No quantized local LLM
benchmark has been run in F10. The old 720/720 baseline
was the deterministic rule engine only, not inference.

## Proposed future unprivileged service (NOT approved/installed)

Future admission must be a separate Central and B change
with exact source and parent commit, manually pinned
target host identity, dedicated unprivileged PRODUCT user
with no wallet/signing/private key capabilities,
ProtectSystem=strict, PrivateTmp=yes, ProtectHome=yes,
NoNewPrivileges=yes, IPAddressDeny=any, no outbound
network, systemd unit properties allowlist, bounded
log levels, cap on journals, and MemoryMax/CPUQuota
admission matched to currently measured swap/RAM.
A conservative *planning* ceiling is 32 MiB memory and
5% of one vCPU for an eventual short-lived observer,
not measured or provisioned cgroup evidence.
This source does not contain a running service or unit
that could be accidentally enabled.

The private PAPER website seam must still physically
show 401 anonymous, 403 authenticated ordinary user,
503 missing or untrusted source, and 200 authenticated
admin read-only, with server-only credentials and
strict TLS. These are **future acceptance tests, NOT
current deployed HTTP receipts**. No public route was added.

Physical owner Mac disk capacity has fallen below the
30 GiB native Kraken capture floor. A source-only status
check does not justify a 24-hour capture, third heavy
website runtime, on-host model inference or archival
cleanup. Neither live exchange orders nor new PAPER
orders have been enabled. Original 100 historical
PAPER accounts and seven unpriced BTC positions, PnL
UNKNOWN, are not mutated by these probes.

## Reproducibility and rollback

Run in the dedicated C checkout:

    python3 -m unittest discover -s tools/kingdom-foundry/tests -v
    python3 scripts/docs_v2_check.py

For a manually approved M1-only observation (not a deployment):

    python3 tools/kingdom-foundry/nightforge_readonly_probe_cli.py --mac-storage

That returns a source-UNKNOWN/HOLD and cannot promote
an observed result into a trusted worker or financial action.

Rollback = keep the F10 PR draft/unmerged; installed
production services continue untouched. Earlier F9
read-only offline snapshot capability remains qualified.
No 3032/3030 or PAPER service rollback is required.

**Status: owner-M1 tests PASS, independent GitHub exact-head CI pending.**
**Foundry execution DISABLED; HEL1 inference HOLD; LIVE_TRADING HALT.**
**FINANCIAL UNCHANGED.**
