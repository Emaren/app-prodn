---
id: "aoe2war.app.r25-bets-v5x-r2-graceful-quiesce"
title: "R25 Betting Hall v5x R2: Native Steam Quiesce Repair"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-nonfinancial-physical-release-not-yet-accepted"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Betting Hall v5x R2: Native Steam Quiesce Repair

## Fail-closed first release attempt

At 2026-11-07T22:06:20Z, the first guarded v5x physical cutover attempt returned HOLD_V5X_RELEASE_REASON Hold:STEAM_REFRESH_NOT_QUIESCED. The old source controller had called systemctl stop aoe2war-steam-egress-refresh.service when the existing restricted Steam service was already in a legitimate active timer cycle. Interrupting that oneshot can leave a Result=signal/failed state even when the underlying Steam allowlist and financial snapshot were correct.

Root-private rollback-witness.json confirmed the exact web/Steam service-unit preimages were restored. 3032 remained PID2120006 (the previous R25 build) and 3030 PID2625090 was never switched; ports8094/8095 remained OFF. No signed new public acceptance or funded transfer occurred. The original v5x one-use root release directory is spent and must never be silently reused.

## Exact R2 source repair

A distinct root-only release directory /root/aoe2war-r25-bets-history-v5x-r2-20261107 is required; it must begin absent with no physical acceptance and no rollback witness. The actual merged CI artifact, old/new unit preimages, database role, C03 kernel rule, root-owned Steam v5x policy identities, immutable original public receipt, and all five false financial flags remain unchanged.

The one intended logic change is quiesce_steam_after_timer_stop: after stopping only the next Steam timer triggers, inspect the existing ActiveState and Result without sending SIGTERM. A native restricted oneshot with Result=success is allowed at most 35 seconds to finish its own audited Steam-only work. Only inactive/success progresses. Failed, exit-code, signal, an unknown systemd state, or timeout returns HOLD. No reset-failed, bypass, normalization, broad process killing or permission expansion is allowed. The normal independent automatic rollback remains root-owned, timed and exact-source bound.

Seven new negative tests cover active and deactivating completion, fast inactive success, failed/unknown states, bounded timeout, source absence of a stop call, and unchanged rollback/financial hold. Full exact-head App GitHub CI, source hash verification and fresh HEL1 preflight must all pass before a second guarded physical try.

This source repair does not raise the public site's Node V8 2 GB heap cap, grant SELECT on financial tables, change the existing 8092/8093 partial firewall fence or authorize the nine Chain financial gates. A genuine native v5x Steam and public read-only historical market acceptance must be observed before declaring the website updated.
