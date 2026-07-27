---
id: "aoe2war.app-prodn.docs-production-parity-2026-07-26"
title: "AoE2WAR Production Parity Seal — 2026-07-26"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["operators","auditors","ai-agents"]
source_of_truth: "historical-evidence"
authority: "historical-evidence"
reviewed_at: "2026-07-26"
review_interval_days: 0
sensitivity: "restricted"
---

# AoE2WAR Production Parity Seal — 2026-07-26

## Verdict

Source/release parity is confirmed for the AoE2WAR web app, replay API, active WoloChain checkout, Wolo settlement services, Watcher 1.5.6 release artifacts, and live Prisma schema.

Production health is not fully green. One replay auto-recovery timer was enabled but no longer scheduled, root storage was at 94%, credential rotation is required, and several services need systemd hardening.

## Exact identities

| Layer | Identity |
|---|---|
| Web checkout | `/var/www/AoE2HDBets/app-prodn` · `main` · `22232a0bcc038a567acd052f432883e70482a3f9` · clean · remote-equal |
| Web build | `20260726054351-9b5a6fcd0b` · `aoe2hdbets-web.service` · `127.0.0.1:3030` |
| Replay API | `/var/www/AoE2HDBets/api-prodn` · `main` · `d2d68646b1aff3ffb9e647ee0fe4deaa143b2c6e` · clean · `127.0.0.1:3330` |
| Wolo source | `/var/www/WoloChain-wolo-1` · `wolo-1-mainnet-prep` · `d5dea8d6f1a2b0b57489a5e468dd21e34246891e` · clean · remote-equal |
| Consensus binary | `/usr/local/bin/wolochaind-mainnet-node-prewartrophy` · `d3bd62414a047a492a3814b7d3baa2717d64db2e` |
| Settlement binary | `/usr/local/bin/wolochaind-mainnet` · `d5dea8d6f1a2b0b57489a5e468dd21e34246891e` |
| Watcher | `1.5.6` platform artifacts and manifests |
| Database | PostgreSQL 16.14 · 71 applied source migrations · 0 incomplete |

## Authority boundaries

The live Wolo binary split is intentional:

- the mainnet node remains on the preserved pre-War-Trophy binary;
- Bet settlement and Founder Rewards settlement use the newer isolated-market binary;
- the source checkout records the current settlement implementation and upgrade history;
- no app deploy may replace the node binary without a separate chain upgrade plan.

Replay truth is layered:

1. raw immutable replay evidence;
2. parser candidate runs and observations;
3. normalized stat projections;
4. explicit roster/public promotions;
5. result adjudication;
6. explicit financial disposition/authority;
7. WoloChain settlement execution.

Presence in an earlier layer never grants authority from a later layer.

## Database gate

Migration history at inspection:

- total records: 73;
- successfully applied: 71;
- incomplete: 0;
- historical rolled back: 2.

Required July 22–26 migrations were all applied:

- `20260722183000_add_replay_evidence_game_target`;
- `20260722203000_add_replay_desync_incidents`;
- `20260724163500_add_public_replay_roster_promotions`;
- `20260725200000_add_normalized_replay_stats`;
- `20260725213000_allow_replay_financial_authority`;
- `20260726025500_fence_post_broadcast_bet_recovery`.

## Operational inventory

| Table | Rows |
|---|---:|
| `game_stats` | 19,129 |
| `replay_artifacts` | 2,064 |
| `replay_submissions` | 2,065 |
| `replay_parse_runs` | 4,746 |
| `replay_parse_attempts` | 43,925 |
| `replay_observations` | 678,804 |
| `replay_stat_projections` | 5,964 |
| `replay_player_snapshots` | 28,076 |
| `replay_player_metrics` | 141,561 |
| `replay_game_metrics` | 24,125 |
| `replay_roster_promotions` | 111 |
| `replay_result_adjudications` | 31 |
| `replay_desync_incidents` | 3 |
| `bet_stake_intents` | 463 |

## Health evidence

At inspection:

- local and public web returned HTTP 200;
- deployment-version endpoints agreed on `20260726054351-9b5a6fcd0b`;
- local replay API health, chain ID, and docs returned HTTP 200;
- Wolo RPC and REST returned HTTP 200 and `catching_up=false`;
- Bet settlement `8092` and Founder Rewards settlement `8093` returned `ok=true`, `chain_id=wolo-1`, loopback-only, auth configured, and balances above configured floors;
- challenge reconciliation, staking rewards, trophy tribute queue, transfer heartbeat, prewarm, and Wolo health checks completed successfully;
- no seven-day kernel OOM, no-space, or filesystem-corruption event was found.

## Durable storage

- root filesystem: about 2.4 GB free / 94% used;
- mounted volume: about 22 GB free / 78% used;
- replay archive: about 8.0 GB / 7,925 files;
- parser-engine root: about 4.9 GB / 4,946 files;
- watcher downloads: about 2.5 GB / 69 files;
- current settlement state is under `/mnt/HC_Volume_105319120/wolochain-mainnet/`;
- July 26 bet-recovery deployment dumps, hashes, authority snapshots, and receipts are preserved under the parser-engine backup root.

## Known operations debt

### P0 — credentials

- rotate the database password exposed in an operator transcript;
- rotate the deploy-hook credential embedded in tracked API source;
- remove tracked secrets, clean reachable history where practical, and add automated secret scanning.

### Closed post-seal — replay auto-recovery timer

The timer defect was repaired after the read-only seal. It now schedules one minute after activation and one minute after the prior oneshot becomes inactive. Root cleanup reclaimed 1.00 GiB, raising free space from 2.33 GiB to 3.33 GiB. The previously blocked eligible replay candidate (`game_stats` 19794) recovered successfully as candidate-only parser run 4747 under schema `2026-07-25.1`, pass 8. The recovery created no public aggregate, market, betting, or settlement authority. A subsequent timer invocation completed with `Result=success`, and the timer returned to `active (waiting)` with a finite next trigger.

### P1 — root storage

Reclaim root capacity while preserving immutable replay evidence, parser evidence, database backups, settlement state, release artifacts, and incident/deployment receipts.

### P2 — service hardening

The web service is strongly sandboxed. The replay API, Traffic API, Bet settlement, and Founder settlement services need tested containment drop-ins with explicit writable/keyring paths.

### P2 — warnings and shutdown behavior

- clean duplicate nginx protocol-option declarations;
- investigate Traffic API/web shutdown timeout warnings;
- document and intentionally clear unrelated failed systemd units rather than treating them as AoE2WAR failures.

## Historical-document rule

Do not rewrite dated campaign seals, immutable Engine Room reports, deployment receipts, prior audit snapshots, or incident evidence. Living docs may reference them; they remain historical truth at the time they were generated.
