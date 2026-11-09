---
id: "aoe2war.app-prodn.r25-c03-restricted-rollback-drill-v1"
title: "R25 C03 restricted 3032 rollback and restoration drill"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "postgresql", "steam"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-rollback-source-only-not-c03-gate-closure"
reviewed_at: "2026-11-08"
review_interval_days: 14
sensitivity: "internal"
---

# R25 C03 restricted 3032 rollback and restoration drill

## Why the existing 3030 fallback is not an accepted C03 rollback

The live public website is on the exact root-pinned R25 source
4ab96cc7c1c0ba43a0403795485d3f410a6ba07f. The currently approved
public rollback source is 0a7450f9c8c1d12cdf63e33d57e665ad1e3f5cb1,
**not the October 28 port 3030 legacy process**. That legacy process still
holds financial PostgreSQL ownership; routing financial or protected service
requests there after C03 owner migration is forbidden. Nginx continues to
pin 17 exceptional locations to 3030, including legacy clans, static assets,
profile/presence and Osmosis pulse. This script does not repoint or approve
those locations. They require a separate finance-safe route disposition.

## Original source and exact physical preflight

Source: scripts/release/r25_c03_restricted_rollback_drill_v1.py

Protected stage pair:

| Role | Source | Next BUILD_ID | systemd unit SHA256 |
| --- | --- | --- | --- |
| live candidate | 4ab96cc7c1c0 | YF_YxSAxc0izAfRG0ARsc | 42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621 |
| restricted rollback | 0a7450f9c8c1 | AX78Oo6yfx4AmSCbDgemv | be8165a050a3fa2c224d6a29c26dca2045a6599c7f18ab41e2e83bb85eacf6e6 |

The guard must match V9 Steam source
cb275a8ae8bc62c373ffe73063e60ff8ca7bd93661b899d887432ad6095cb07a
and protected C03 observer snapshot
6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb.
Its only authorized systemd unit mutations are the *restricted* web-prod
service and its existing Steam-refresh timer. It never writes Nginx,
pg_catalog, wallet, bank, Satchel or any financial balance. The legacy
aoe2hdbets-web.service is only compared against the original PID 2625090,
never restarted or selected as fallback.

As of November 9, the source-bound --phase plan was physically executed on
HEL1 through SSH stdin. It returned
PASS_R25_RESTRICTED_ROLLBACK_PREFLIGHT_NO_MUTATION with matching old/new
unit hashes, original V1 C03 observer fingerprint and exact V9 Steam source.
No web restart or financial mutation was performed.

## Controlled live procedure

**The live drill has not been executed as of this document revision.**
Session A is currently capturing the HD production database. Run a live
drill only after that capture ends, with an approved writer transition
window and enough RAM/disk headroom. The controller refuses to proceed
while a pg_dump, pg_restore or pg_basebackup process exists, and rechecks
after obtaining an exclusive lock and again after pausing the Steam timer.

Install only the exact reviewed GitHub source under
/usr/local/lib/aoe2war-web-prod/r25_c03_restricted_rollback_drill_v1.py,
root:root, mode 0644. Verify its SHA256 against the exact merged source
review and the root-controlled deployment admission receipt before any
live command. The script refuses execute from stdin or arbitrary paths.

Read-only plan:

    /usr/bin/python3 -I -B \
      /usr/local/lib/aoe2war-web-prod/r25_c03_restricted_rollback_drill_v1.py \
      --phase plan

After acceptance, nonfinancial bounded restart and automatic restoration:

    /usr/bin/python3 -I -B \
      /usr/local/lib/aoe2war-web-prod/r25_c03_restricted_rollback_drill_v1.py \
      --phase execute --admit-brief-public-restart

A single successful test requires actual restricted 3032 old build, original
V9 rollback Steam enrollment/refresh, then actual restricted 3032 new
build, candidate V9 re-enrollment/refresh, unchanged finance/Nginx/validator
identity and restored active Steam timer. Success receipt is written only
AFTER the timer is verified active. A partial failure attempts candidate
restoration under the same exclusive lock, never reroutes to 3030 and never
publishes a PASS. Critical failed restoration must be treated as an
operator intervention state, not permission to use the legacy finance owner.

The verified controller deliberately retries only
C03_OBSERVER_TEMPORARILY_ACTIVE after fresh entire V9 read-only proof.
Changed C03 units, command, timers, source, bank state, Nginx, validator,
funded ports, finance snapshot or fake receipts fail without retry.

## Remaining physical acceptance for C03

A successful old/new rollback drill is necessary but insufficient. Genuine
signed-in Steam administrator and ordinary-user session preservation,
protected admin and AI Scribe functions, browser-origin parity, current
Steam credentials and logout, all 17 old 3030 Nginx exception routes,
and Session A's C06/C07 same-capture financial writer transition must be
physically accepted separately before declaring C03 CLOSED.

This artifact does NOT activate 8094/8095 custody, transfer WOLO, authorize
C09, change the chain or adjudicate the 69 historical hashless liabilities.
