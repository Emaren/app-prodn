---
id: "aoe2war.app-prodn.docs-engineering-memory"
title: "AoE2WAR Engineering Memory and Learned Invariants"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "repository-entrypoint"
reviewed_at: "2026-09-04"
review_interval_days: 14
sensitivity: "internal"
---

# AoE2WAR Engineering Memory and Learned Invariants

## Purpose

This is the durable anti-relearning layer for AoE2WAR engineering.

A fresh operator or AI session still asks live commands for mutable runtime
truth. This document records expensive durable lessons, architectural
invariants, completed investigations, and consciously deferred work so future
sessions do not spend hours proving the same thing again.

Chat history is never the source of truth. When a stable lesson changes
behavior, authority, architecture, financial policy, recovery, release
procedure, or debugging strategy, update the owning living contract and this
memory before closing the work.

## Mandatory operating rhythm

1. Begin with `aoe2war status`, `aoe2war facts`, and the current context.
2. Read this memory before reopening a previously investigated infrastructure
   or financial question.
3. For infrastructure, watcher, replay-truth, financial, or database
   implementation changes, Documentation OS requires semantic documentation
   plus an Engineering Memory update.
4. `aoe2war finish` remains the canonical end-of-work transaction and owns
   documentation federation, context refresh, release proof, and certification.
5. Never treat a prior chat statement as newer than live OS/Git/receipt truth.

## Certified application and Replay Durability V1

The 2026-09-04 certified web release is rooted at
`cff90db92ae0277eed377ae712dac2b13b5bb03f`, active build
`oxpcO4HInq1bdFaC_3OJG`, public version
`20260904004612-a932fbf1df`.

Replay Durability V1 / historical Gate 6 is closed.

Durable invariants:

- hot replay parsing executes in a spawned parser process rather than the API
  event-loop/GIL path;
- production replay upload admission remains exactly one concurrent upload;
- the API parser-worker default remains one;
- Watcher 1.5.9 honors `Retry-After`, uses bounded jitter, shares replay
  backoff, coalesces stale work, and reuses immutable retry snapshots;
- a real production replay was parsed in a child process while API health
  remained responsive;
- a controlled production overload returned HTTP 429 directly and through the
  deployed public web proxy;
- direct and proxied responses both preserved `Retry-After: 5` exactly;
- no admission increase is required merely because the gate is closed.

Do not reopen Gate 6 without new contradictory production evidence.

## Watcher 1.5.9

Watcher 1.5.9 source is
`3546b86d3cdc1203baa563ae74f9d5a5e82557d7`.

Windows installer and portable builds were Azure Trusted Signed. The complete
nine-artifact production release was SHA-256 sealed. Windows, macOS, and Linux
update manifests advertise 1.5.9. The previous 1.5.8 control files remain in a
durable rollback directory.

Do not rebuild or re-sign 1.5.9 merely to reproduce already sealed evidence.

## Production PostgreSQL index canonicalization

The three emergency `game_stats` indexes installed during the 2026-08-11
incident are already canonical. The read-only 2026-09-04 audit proved all three
exist, are valid and ready, and match their migration-bound normalized
`pg_indexes.indexdef` SHA-256 values exactly:

- `ix_gs_final_original_filename_recency`;
- `ix_gs_final_replay_file_recency`;
- `ix_gs_final_platform_match_recency`.

Migration
`20260824040000_canonicalize_game_stats_final_identity_indexes` has exactly one
finished, non-rolled-back Prisma migration row. Production had zero unfinished
migrations.

Classification: `CANONICAL_ALREADY`.

No CREATE INDEX, DROP INDEX, migration resolution, or database repair is
required unless future live evidence changes.

## Recovery OS V1

Full Recovery OS remains intentionally NOT_VERIFIED.

A real off-host database/operator-evidence pilot is verified on the independent
Mac authority.

Pilot bundle:
`20260904T021657Z-db-pilot-cff90db92ae0`.

Fresh production PostgreSQL custom-format dump:

- bytes: `403984404`;
- SHA-256:
  `6ba16607ae02af02be36be36dca38274c0348ea3725caa3dbf80f18f846dd654`;
- production migration state at capture: 99 applied, 0 unfinished, 2 rolled
  back.

The dump was encrypted on the VPS before transmission using a public recipient
certificate. The recovery private key remained mode 0600 on the Mac and never
entered the VPS.

The Mac decrypted the archive to an isolated restore workspace and reproduced
the exact production plaintext SHA-256 and byte size. PostgreSQL 17.5
`pg_restore` successfully parsed the PostgreSQL-16-created archive and exposed
the expected critical tables.

The first Mac attempt with PostgreSQL 14.18 failed with custom-archive header
version 1.15. That was a client-tool compatibility failure, not backup
corruption. Future restore drills must use PostgreSQL restore tooling new enough
to understand the producer archive version.

The complete Mac `.aoe2war-release` operator evidence tree was also encrypted,
decrypted, and restored hash-exact.

Restore proof SHA-256:
`f4bb2c5dd5de29d739ee5623bb67a94579f13212704659a814d04a1963ddb62b`.

Temporary plaintext restore workspaces were removed after proof.

Remaining Recovery OS scope includes replay/archive evidence, selected Parser
Engine evidence, managed/private media, Radio WOLO media, legacy direct-message
attachments, Wolo settlement state, consistency-safe Wolo consensus recovery,
and separate Wolo/recovery-key custody proof.

Never flip `offsite_evidence.enabled=true` merely because the database pilot is
green.

## Storage estate lesson

Do not mirror the entire VPS or all durable rollback generations to the Mac.

The unique mutable-state inventory was approximately 33.91 GiB, while durable
web rollback generations alone were approximately 76.5 GiB and are largely
rebuildable from Git/release evidence.

Recovery selection must preserve irreplaceable mutable truth, not blindly clone
regenerable runtime generations.

## Betting Fairness V1.1 and Betting Phase Books V2

Current production uses the Betting Fairness V1.1 compatibility bridge.

Scheduled/challenge winner books remain pre-game only. Unscheduled
Watcher-discovered winner books admit fresh winner bets while their canonical
market status remains `open` or `live`.

The accepted next product architecture is Betting Phase Books V2. This is a
new financial model, not merely a UI relabel.

One canonical Battle may own three independent winner books:

1. PRE-GAME / CHALLENGE BOOK — accepted scheduled challenge, open up to seven
   days before battle and locked by the authoritative start fence.
2. OPENING MINUTE / LIVE BOOK — opens at canonical watcher battle start and
   accepts fresh wagers for exactly 60 seconds.
3. LATE BOOK / IN-GAME — opens after the opening minute and remains available
   only while the battle remains authoritatively active.

These phases MUST have independent pools and payout economics. Late information
must never dilute or reprice money risked in the pre-game pool.

All phase books may remain visible for one battle simultaneously, but only the
current eligible phase accepts new commitments. Locked earlier books retain
their wagers, pools, and settlement identity.

Server timestamps and transactional write fences—not browser clocks—decide
financial admission.

The horizontal `InstrumentStakeRail` has been retired.
The current premium interaction is a large vertical composer with tactile 10,
25, 50, and 100 WOLO tiles, a full-width custom input, projected return, and a
large betting action. Future Phase Books V2 adds true phase identity/countdown
once those independent financial books exist.

Future Auto Bet Reserve evolves toward phase-specific presets backed by the
separately reviewed prefunded Wolo custody architecture. Watcher telemetry alone
never becomes financial authority.

## Current highest-value product queue

1. Betting Phase Books V2 + premium vertical betting composer.
2. Staking / financial-activity information architecture: Grouped Bets first,
   clear Founder reward / transfer / escrow / payout separation.
3. Continue Recovery OS as a bounded infrastructure project without blocking
   ordinary feature development.
4. Wolo consensus/key custody remains a separately protected project.

## Do-not-repeat list

- Do not rerun the three-index canonicalization investigation without changed
  evidence.
- Do not rebuild Watcher 1.5.9.
- Do not increase replay admission merely to prove durability.
- Do not call the database Recovery OS pilot full disaster recovery.
- Do not copy Wolo keyrings/private validator material into the general
  Evidence Vault.
- Do not use an interactive outer `set -euo pipefail` wrapper around AoE2WAR
  release commands.
- Do not infer mutable production state from this document when `aoe2war
  status` can answer it live.

## zsh operator-shell invariant

In zsh, lowercase `path` is a special array tied directly to the scalar
`PATH`. Do not use `path` as a loop variable, scratch variable, `read`
destination, or temporary pathname in interactive AoE2WAR operator commands.

For example, this is unsafe in zsh:

    while IFS= read -r path; do
        ...
    done

Assigning to `path` can replace the executable search path and make later
commands such as `git`, `python3`, or `node` appear to vanish.

Use names such as `item`, `file`, `entry`, `candidate`, or `p` instead.

If this happens, the repository and executables are normally intact; restore
`PATH`, rehash the shell, prove the current Git state, and resume rather than
resetting or repeating completed work.

AoE2WAR pasteable interactive commands must also continue avoiding outer
`set -e`, `set -u`, `pipefail`, naked `exit`, and naked `return`. Individual
governed scripts may enforce their own internal fail-closed shell policy.

### Premium betting composer implementation status

The E4 horizontal `InstrumentStakeRail` has been removed and replaced with
`PremiumStakeComposer` in certified production.

The composer consumes the canonical projected `market.bettingOpen` authority
and does not invent financial eligibility in the browser.

Betting Fairness V1.1 subsequently restored fresh winner betting for
unscheduled Watcher markets while canonical status is `open` or `live`.
`buildFreshBetMarketWriteWhere()` independently mirrors that admission at the
transactional database-write boundary.

This still does **not** mean Opening Minute and Late Book phase isolation is
live. Independent Pre-Game, Opening Minute, and Late books remain the accepted
Betting Phase Books V2 architecture to build next.

### Betting vocabulary: bet action vs stake accounting

Betting Hall presentation uses `bet` for the user's action and reserves `stake`
primarily for underlying wager amount / escrow / recovery terminology.

Canonical premium copy:

- `Bet your WOLO`
- `Backing <side>.`

Do not regress the primary CTA to `Stake your WOLO`.

### Team winner selection surface

The Betting V2 `Player pick` layer was removed because every player button
merely selected that player's Team A / Team B side.

For one settlement identity, expose one primary selection surface.

Roster players remain visible inside the team panels. Reintroduce player
buttons only for independently priced and settled player-level markets.

### Watcher-live winner compatibility admission

A production Watcher winner market is commonly born after battle detection with:

- `scheduledMatchId = null`;
- non-null `linkedSessionKey`;
- canonical status `live`;
- often no `closeAt`.

The old Betting Fairness V1 rule treated that market as permanently too late,
which disabled both Team A / Team B selection and real transactional wager
admission.

V1.1 permits fresh winner bets while such an unscheduled Watcher market is
`open` or `live`.

Scheduled/challenge markets retain their strict pre-game cutoff. Desync remains
closed to fresh post-start money. Closing/proof/review/terminal states fail
closed.

Never repair this only in the frontend. The public `bettingOpen` projection and
the transactional `buildFreshBetMarketWriteWhere()` fence must remain aligned.

The direct Node test runner must use
`scripts/aoe2-alias-loader.mjs` for tests that transitively import `@/...`
modules. A raw `node --test` failure with `ERR_MODULE_NOT_FOUND` for `@/lib`
is a test-harness invocation error, not evidence that the financial patch
failed.
