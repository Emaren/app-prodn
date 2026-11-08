---
id: "aoe2war.app.session-b-r25-3bc9-parallel-admission"
title: "R25 3bc9 Parallel Canary and C03 Nonfinancial Rollback Boundary"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "read-only-proposal-no-production-installation-or-financial-release"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 3bc9 Parallel Canary and C03 Nonfinancial Rollback Boundary

This is a **source-only proposal**, not service-installation authority.
Session B owns the R25 website, avatars, navigation, Traffic interface and
nonfinancial rollback design. Session A retains all effective C03 financial
database/producer containment, C04–C09, reserve and transaction authorities.

## The actual sequential rollback defect

HEL1 currently serves the old R25 source 1a380cdf76ff773aa1d094abd161523500b32b4a
on port 3032 as PID 2206791, preserving original 3030 PID 2625090.
The installed v5z Steam admission is immutable and pins the specific 3032 PID,
source, build and 57-unit protected snapshot. A sequential replacement STOPs
that PID. Rolling back to old systemd unit bytes starts a *new PID*, so old
v5z Steam will fail closed. Restoring unit bytes alone is therefore not proof
of functional authenticated Steam rollback. Do not replay an older admission.

Separately, Chain Session A proved the legacy original port 3030 retains
owner-capable financial PostgreSQL connections. Its UID1000 firewall rule on
8092/8093 is incomplete C03 writer containment. Do not stop, conceal or
certify 3030 as a finance-safe rollback without actual negative DML and
existing-session/reconnect proofs owned by Session A.

## Exact accepted frozen artifact (already on HEL1, not activated)

- App source: 3bc9c3be73210552f1b344c188b1665407b83fee.
- GitHub CI: https://github.com/Emaren/app-prodn/actions/runs/42435296376
  (three jobs passed, including production build, DocsV2, isolated PG).
- Genuine Q17 Chrome: https://github.com/Emaren/app-prodn/actions/runs/42435296440
  (39 original Kingdom links ordered at 375, 768, 1440px; authenticated Q09).
- GitHub artifact ID 13598969304, ZIP SHA256
  25079fe2582630e2e3a85c09900a6d98f1eb62372e0b50b4620948d232461da0.
- Runtime SHA256
  d37f940d163613d329ec345e1c11ea1688ae7c5045eafca2242644158dbfdc5b.
- BUILD_ID W5WS0btc500n7GGUjWXSx; version 20261108014417-3c746c69db.
- Inert verified stage: /var/lib/aoe2war-web-prod-3bc9c3be7321;
  44,924 SHA/manifest-verified files; 17 critical runtime file checks.
- Root0600 stage acceptance SHA256
  f6502fac75d4fc7ce2eba23152a21d27e97190c9e5cb28dca2f32956ac077ac8.

## Source-only candidate unit with isolated 3033

Source: scripts/r25_3bc9_parallel_release_admission.py.
The source-controlled fixture is an exact SHA256 copy of the already-loaded
systemd unit, without private environment-file contents:
tests/fixtures/r25_3bc9_deployed_web_unit.fixture
SHA256 1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3.

The pure transform changes precisely four stage paths and two local port
references, isolates the Next cache to aoe2war-web-prod-candidate-3bc9,
retains UID990 and the restricted original env-file path, production guard
preloader, empty capabilities, NoNewPrivileges, ProtectSystem=strict,
ProtectHome=yes, PrivateTmp, PrivateDevices and Postgres inaccessible path.
To limit contention the proposed 3033 process has a 1024MiB Node heap,
MemoryHigh 1400M, MemoryMax 1800M, CPUQuota 100%, Restart=no.

The proposed unit has SHA256
54787f58b89daa3c29fe22cad4948fd7c76447c08beb04468c248094b9cb2171.

A second **source-pinned guard** is required: the original
r25_b_guard_production_v1.cjs pins PORT 3032 and the exact listener, so a
unit-only port change would fail closed. The new
scripts/r25_3bc9_guard_candidate_3033.cjs is a deterministic, exact-byte
derivative of the deployed guard SHA256
5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3.
It changes only its absolute guard file path, PORT 3033, local listener 3033
and isolated cache directory. It leaves Postgres role/port, original Steam
OpenID restrictions, TLS CA/SNI, DNS and networking denylist unchanged.
Candidate guard SHA256
a2b6183a4a08873cf0551ad632aaf9b92d18e76da41fe81732b4f4b31a17ce0f.
A reviewed exact guard must first be installed in its own root-protected
path by a future separate one-use native controller, **not** by this runner.


The available CLI phases are SELFTEST, RENDER and root-only AUDIT. There
is intentionally **no INSTALL, EXECUTE, START or COMMIT phase**. Output is
review evidence only. The preflight refuses source/receipt drift, altered
loaded Nginx and Steam units, missing old 3030/3032 PIDs, occupied 3033,
newly listening funded 8094/8095, an already-loaded candidate unit, or a
changed candidate sandbox. It does not read actual secret env values.

## Current physical capacity HOLD

At November 8 approximately 02:15 UTC, HEL1 had 7.6GiB total RAM,
only **1.8GiB MemAvailable**, and **6GiB swap in use**. Root storage is
around 94% used. The source admission preflight deliberately requires
**3GiB MemAvailable or more AND 4GiB used swap or less**.
These conservative limits do not prove a candidate will fit; they prevent
unreviewed launch under obvious host pressure. Never discard process state,
stop Chain, reboot validator or delete original rollback evidence to pass.

New candidate systemd units could also change Session A's protected 57-unit
topology; that observer cannot be silently overridden. In particular, do
not work around this by running an unsandboxed Node process via runuser.

## Unmet physical admission gates

1. Independently recheck real memory/swap/storage and exact process health.
2. Session A must review C03 protected-unit topology and actual restricted
   database role negative DML plus existing/reconnected session behavior.
3. Separately source-review a one-use controller for installing the candidate
   and real bounded rollback; the current script cannot install or start it.
4. Actually prove authenticated and guest Chrome, Steam, managed WebP/PNG
   portraits, Clan Halls, 39 Kingdom links, Traffic canonical warning,
   HTTP method denials and denied financial DML on the canary service.
5. A distinct Nginx/public cutover must pin exact preimages and selectors,
   have an automatic rollback, keep existing 3032 and 3030 processes healthy,
   and produce sealed physical acceptance. No implicit public route change.
6. Steam authorization for 3033 needs a distinct reviewed scoped CA/SNI/TTL
   policy; the current PID-bound v5z cannot be reused as 3033 approval.
7. C03-safe restricted functional replacement for original owner-capable
   3030 rollback must be physically accepted before C03 can fence/retire it.
8. Funded 8094/8095 remain absent; every C01–C09 financial gate stays HOLD.

## Independent Traffic publication limitation

The certified Total/Potential/Confirmed Human Traffic archive remains
131 published completed days ending 2026-10-19. Separate provisional GET/IP
counts and browser observations are recent, but have different semantics.
The old full-history public-audience timer was deliberately disabled after
its October 15 two-hour, 18-million-event timeout. Do not re-enable it.
Future certified-day publishing requires offhost source/lateness provenance,
cross-UTC-boundary canonical parity, append-only atomic publish and reviewed
time-zone-aware scheduling under Emaren/traffic-api issue #31.

**Accepted here:** reviewed static candidate-unit generation and negative
tests only. NO website, unit, timer, Nginx, database, Chain or financial
production mutation.
