---
id: "aoe2war.app-prodn.docs-codex-campaign-iii-handoff"
title: "AoE2WAR Campaign III Final Handoff"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["operators","auditors","ai-agents"]
source_of_truth: "historical-evidence"
authority: "historical-evidence"
reviewed_at: "2026-07-26"
review_interval_days: 0
sensitivity: "internal"
---

# AoE2WAR Campaign III Final Handoff

> **Lifecycle:** Historical evidence. This document records a past state and must not be treated as current operational truth.


## Scope and seal rule

Campaign III is complete. This handoff records the production state verified on
July 17, 2026 between `01:11Z` and `01:36Z`. It does not implement Campaign IV.

Frozen corpus numbers are stable. Live product numbers are timestamped because
watcher uploads can advance them while a handoff is being written. Never merge
these three scoreboards:

1. frozen Engine Room artifacts and their latest candidate dispositions;
2. immutable parser-run and observation history;
3. live final watcher/upload records projected through public truth rules.

## Code, build, and release identities

| Component | Branch / release | Exact identity | Production posture |
|---|---|---|---|
| AoE2WAR web | `main` | `72ad12c424323183b9f4850cdd791d386d2936e9` | Runtime feature seal |
| AoE2WAR API | `main` | `17200a0d3dcc178aa474a6a615275d3a74f3babb` | Source/docs seal; runtime code unchanged from its parent |
| HD Watcher source | `main` | `cf88421c9dc04931972a09879a3d710b07b5a1af` | Source package `1.5.4` |
| HD Watcher public release | updater manifest | `1.5.3` | Intentional current downloadable release |
| Wolo mainnet runtime repo | `wolo-1-mainnet-prep` | `d5dea8d6f1a2b0b57489a5e468dd21e34246891e` | Node/runtime checkout |
| General WoloChain repo | `main` | `a2fba6bfd98d7b28fb113badbadf23ec9096a4af` | MBP/origin/VPS aligned |

The deployed Next build reports:

```text
public build version: 20260717012821-875ca6ba8c
Next BUILD_ID: W2unWGsO-r5Kl9JU21bf7
runtime web source: 72ad12c424323183b9f4850cdd791d386d2936e9
```

This handoff is a later documentation-only seal. The final operational receipt
records both the runtime source and the clean documentation checkout head.

## Services and chain rails

All five units were enabled and active after the final deploy:

| Unit | Role | Listener |
|---|---|---:|
| `aoe2hdbets-web.service` | Next public/admin app | `127.0.0.1:3030` |
| `aoe2hdbets-api.service` | FastAPI replay ingestion/parser API | `127.0.0.1:3330` |
| `wolochaind-mainnet.service` | canonical `wolo-1` node | RPC `27657`, REST `1318`, P2P `27656` |
| `wolochain-mainnet-settlement.service` | normal payout and escrow rail | `127.0.0.1:8092` |
| `wolochain-founder-rewards-settlement.service` | founder-only payout rail | `127.0.0.1:8093` |

The legacy `8091` listener is not mainnet and was absent. API health returned
`{"status":"ok"}`. Both settlement services returned `ok=true`,
`chain_id=wolo-1`, `runtime_chain_id=wolo-1`, loopback-only, with authentication
configured. Public Wolo status was healthy and advancing.

## Database and migration state

- Prisma: 63 repository migrations, all applied. Two older resolved/rolled-back
  failure rows remain honestly preserved in the Prisma ledger.
- Alembic: `b7c5c7c4f2de`, matching the sole repository head.
- The Alembic replay-parse-attempt migration was physically present before the
  seal; the normal idempotent upgrade advanced its version marker without a
  backfill.
- `replay_result_adjudications` and `bounty_events` now reject update, delete,
  and truncate. The new statement triggers were verified from
  `pg_get_triggerdef` in production.
- Production database size at `01:36Z`: 2,864,061,463 bytes.
- `game_stats`: 16,175 total rows, of which 2,928 were marked final.
- `replay_parse_attempts`: populated and physically aligned with both ORM
  expectations.

The replay adjudication ledger remains empty. One legacy commissioner correction
for game `10252` is still a hard-coded public overlay. Campaign IV should migrate
it only through an explicitly sourced durable verdict, never by inventing an
actor or reason.

## Frozen Engine Room equation

The frozen cohort is completely accounted:

```text
2,025 artifacts = 1,823 recorded-game candidates + 202 saved checkpoints
2,025 latest candidates = 2,025 completed + 0 failed
```

| Latest mode | Count |
|---|---:|
| `mgz_full_summary` | 1,681 |
| `mgz_hd_saved_game_snapshot` | 196 |
| `mgz_hd_fragment_header_body_fallback` | 118 |
| `mgz_parse_match_fallback` | 11 |
| `mgz_header_only_fallback` | 8 |
| `mgz_hd_saved_game_initial_prefix` | 5 |
| `mgz_hd_metadata_fragment_body_fallback` | 4 |
| `mgz_hd_saved_game_map_prefix` | 1 |
| `mgz_hd_trailing_header_body_fallback` | 1 |
| **Total** | **2,025** |

Immutable history remains:

```text
2,389 runs = 2,048 completed + 341 historical failed
247,630 material observation rows
24 private observation-promotion facts
8 bounded jobs / 2,639 job events
```

The stored run-level `observation_count` sum and candidate-output byte counters
are diagnostic counters, not material-ledger row counts. Across all historical
runs the candidate-output byte counter is 1,073,943,609; latest candidates alone
account for 1,068,199,389 bytes.

Canonical parser truth is:

```text
aoe2war.mgz_hd / mgz 1.8.51
schema 2026-07-16.4
pass hd_deterministic_evidence v6
```

The isolated `mgz 1.8.27` lane remains compatibility evidence only.

## Live public projection grain

`/game-stats` loads every `GameStats` row where `is_final = true`, overlays
effective adjudications, and calls `resolveReplayWinnerTruth`. It does not join
the 2,025-artifact cohort and does not deduplicate lifecycle records into logical
battles.

The repeatable-read audit at `01:14Z` was:

```text
1,910 resolved + 1,017 fog = 2,927 final replay records
1,475 team-resolved + 1,452 team-unknown = 2,927
1,557 needed result or team review
```

By rendered production QA near `01:31Z`, one more final watcher record had
arrived:

```text
1,910 resolved + 1,018 fog = 2,928 final replay records
1,476 team-resolved + 1,452 team-unknown = 2,928
1,558 needed result or team review
```

The live fog reason snapshot then was:

| Result routing reason | Count |
|---|---:|
| inferred opponent win on incomplete 1v1 | 538 |
| `watcher_final_unparsed` | 338 |
| recorded-resignation final | 83 |
| incomplete team resignation | 18 |
| HD early exit under 60 seconds | 17 |
| watcher final submission | 9 |
| HD parse-match fallback | 8 |
| manual override | 3 |
| header-only fallback | 2 |
| manual recovery | 1 |
| repaired parse-match fallback | 1 |
| **Total** | **1,018** |

These are routing labels, not proof that every row should acquire a winner.
Campaign IV should drive *unexplained viable finals* toward zero after lifecycle
classification, not force honest save/rehost, abort, checkpoint, or unprovable
records into fake results.

## Saved checkpoints and continuations

All 202 `.aoe2mpgame` candidates are checkpoint evidence, not completed battles.
They have zero duration, no winner, `final_battle_eligible=false`, and
`settlement_evidence_eligible=false`.

The deterministic continuation equation is:

```text
202 saved checkpoints / 185 saved platform match IDs
113 checkpoints -> 98 recorded candidates across 98 exact shared match IDs
90 one-save-to-one-recording IDs
8 multi-checkpoint-to-one-recording IDs; maximum 7 saves on one ID
89 checkpoints across 87 IDs remain unlinked
0 normalized-name or non-zero Steam-roster mismatches among the 113 links
```

Continuation identity requires exact HD platform match ID plus exact normalized
name and non-zero Steam-ID rosters. It never imports a later winner, creates
settlement proof, or makes the checkpoint final.

## Strict effective projection

The reviewed Campaign III cohort contains games:

```text
11478 11603 11819 11837 12488 12492
12622 12817 12847 12857 12874 13431
```

The projector produced 12 unique mode-`0600` content-addressed receipts and
24 private facts: 12 `result.winning_player_keys` and 12 `teams.resolution`.
Every one of the 12 rows has eight players, four winner flags, trusted structured
result provenance, resolved high-confidence teams, and a compact projection
marker. Reclassification returned `12/12 matches_effective_truth` and a second
apply wrote nothing.

There were zero linked markets, claims, adjudications, settlement rows, financial
mutations, or chain writes. Candidate observations and promotions remain
private/candidate-only; the separate receipt is the only evidence declaring the
reviewed public-stat effect.

## Advanced evidence readiness

| Lane | Maturity | Primary observations | Confidence-scored |
|---|---|---:|---:|
| Age and research timing | experimental | 1,837 | 0 |
| Commands and eAPM | experimental | 1,814 | 0 |
| Resignation chronology | mixed | 1,837 | 23 |
| Tribute and market commands | validated extraction | 1,837 | 1,837 |
| Map intelligence | validated structure | 1,704 | 1,704 |
| Production and build orders | foundation | 1,837 | 1,837 |

Supporting coverage includes 10,887 unscored `player.recorded_eapm` observations,
1,814 scored raw resignation timelines, 1,814 unique packet-identity counts,
and 1,704 scored terrain, elevation, and tile-hash observations. Captured is not
the same as proven; ordered build semantics, resource totals, age completion,
and player-level intelligence remain future work.

## Campaign III product surfaces

- Workshop: open, `quiet_work`, not live, seven published/public entries, no
  live public stream, pinned milestone **The 329 frontier falls**.
- AI Council: three enabled/public agents. The pre-deploy audit had zero traces;
  by `01:36Z` two successful public-lobby traces existed, one Scribe and one
  Grimer request at 9,359 ms and 1,608 ms. That sample is too small to identify a
  production bottleneck. The gateway still returns completed JSON, so
  `firstTokenMs` is a first-visible-response proxy rather than streamed-token
  latency.
- Bounty Board: 18 opportunity definitions, zero append-only bounty events.
- Radio WOLO: zero creator submissions.
- Candidate readiness may ground AI only as aggregate metadata. Raw candidates,
  private storage keys, and checkpoint winners never enter house-voice prompts.

## Treasury and settlement invariants

- Bet Escrow is the custody signer for eligible signed wager/challenge funding
  and exact void entitlements: `wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p`.
- The normal payout / Staking Distribution Reserve signer is
  `wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu` on settlement port 8092.
- Community Treasury is
  `wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2`.
- Founder rewards use the separate signer
  `wolo1tg04m57e52evgzjkn9ruwwkz626pfv9qfv27wy` on port 8093.
- Escrow auto-top-up is explicitly `false` in both production settlement envs.
- At verification, normal payout held 500,000 WOLO, Bet Escrow held 465,399.75
  WOLO, and Founder Rewards held 365,280.241424 WOLO.
- The staking wallet held 1,342,573 WOLO against 1,320,941 confirmed stake,
  leaving 21,632 WOLO operating reserve: 11,632 above the 10,000 target, with
  zero top-up needed.

App-side wager recording is not on-chain escrow unless the user signed and the
route verified the chain transfer. WoloChain remains denom, custody, balance,
settlement, and supply truth.

## Storage and restore points

After ownership normalization, the private Engine Room tree is consistently
`tony:tony` while retaining restrictive modes.

```text
Replay archive: 6,038,560,768 allocated bytes / 4,971 files
Parser Engine Room: 2,101,993,472 allocated bytes / 2,507 files
VPS root free: 7,167,623,168 bytes (82% used)
HC volume free: 5,716,766,720 bytes (93% used)
```

Fresh pre-seal restore point:

```text
/mnt/HC_Volume_105319120/aoe2-parser-engine/backups/
aoe2hdbets-before-campaign3-seal-20260717T012537Z.dump
110,528,103 bytes / mode 0600 / tony:tony
SHA-256 efb01cf96d354e03ce1ea682b4ab642259c5d1e0a0e41a867dfbc92c74d3e621
pg_restore --list: 1,142 catalog lines
```

Final post-migration restore point:

```text
/mnt/HC_Volume_105319120/aoe2-parser-engine/backups/
aoe2hdbets-campaign3-final-seal-20260717T013451Z.dump
110,550,760 bytes / mode 0600 / tony:tony
SHA-256 88fd88186a67b7ff59e06a7bf568522bcd25d1a9c38ad7bc156bd026e0d6f31f
pg_restore --list: 1,144 catalog lines
```

The two extra catalog items are the new append-only truncate triggers.

## Verification matrix

Passed locally:

- `npx prisma generate`
- `npx prisma validate`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npm run test:kingdom-expansion` — 12 passed
- `npm run test:replay-truth` — 15 passed
- replay adjudication and Engine Room targeted tests — 17 passed

The build retained existing lint warnings in unrelated media/profile/shared
components; it introduced no lint or type failure.

Passed in production:

- clean fast-forward pull and clean Git status for web/API;
- Prisma migrate deploy and Alembic upgrade to head;
- trigger-definition and ledger-row verification;
- production Next build and web restart;
- API, Wolo node, mainnet settlement, and founder settlement health;
- rendered desktop/mobile Observatory and Workshop QA with clean fresh-tab
  console logs;
- public route smoke for home, live games, AI, bounties, Radio, submit, staking,
  players, and Jim's profile;
- anonymous HTTP 307 redirect away from `/admin/ai`, `/admin/workshop`,
  `/admin/bounties`, `/admin/radio`, and `/admin/parser-lab`.

## Known debt carried honestly

1. Live final-replay counts move as watcher records arrive. Always timestamp
   them and recompute through the production resolver.
2. Game `10252` still uses the legacy static commissioner overlay rather than a
   durable adjudication row.
3. Public Watcher `1.5.3` intentionally trails source `1.5.4`; release promotion
   remains its own signed packaging decision.
4. HC storage has only about 5.7 GB free. Preserve evidence, but start the next
   campaign with a guided retention/capacity check.
5. Two AI traces are not a latency diagnosis.

## Campaign IV requirements — not built here

1. **Workshop Chronicle:** newest-first curated chronicle, lazy/infinite history,
   day dividers, celebratory balloons, and curated history since May 21 while
   retaining deeper project lanes.
2. **Sponsor a Feature:** real 100 WOLO Keplr transaction, durable
   `FeatureRequest` system of record, chat notification mirror, requester/value/
   tx/status/refund evidence, and explicit non-guarantee wording.
3. **Personal bounty pages:** earned podium, WOLO-versus-count filter, next
   unlocked work, and a clear path through the kingdom.
4. **Versioned valuations:** definition version, valuation, claim snapshot, and
   payout proof with minimal public copy.
5. **Public truth frontier:** classify the live fog, separate all 202 checkpoints
   immediately, and drive the remaining unexplained viable-final subset toward
   zero without forcing winners onto honest unknowns.
6. **Saved continuations:** investigate the 89 unlinked checkpoints and any new
   exact identities without relaxing roster gates.
7. **Advanced statistics:** turn captured research, commands, resign chronology,
   economy, map, and production evidence into confidence-scored semantics.
8. **AoE2AI evidence:** consume only effective battle truth and versioned,
   scored advanced fields; preserve unknowns and never expose raw candidates.

Start Campaign IV from this handoff, the final operational receipt, the two
system maps, and the immutable Engine Room reports. Do not rerun the frozen
2,025-artifact corpus merely to rediscover the completed frontier.
