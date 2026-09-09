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
reviewed_at: "2026-09-06"
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

Recovery OS V2 closes the prior configuration-only verification loophole.
`enabled=true`, a non-empty authority, and a restore-proof string can no longer
produce `VERIFIED` by themselves. Full recovery verification now requires a
schema-2 hashed proof beneath the independent recovery vault, exact authority
binding, hashed proof files for every required recovery class, a hashed isolated
restore-drill proof, an explicit no-secrets boundary, and zero declared
remaining recovery scope. Doctor and Host OS consume this same verifier.

The 2026-09-04 schema-1 `PILOT_VERIFIED` bundle remains valid pilot evidence
but is structurally incapable of satisfying full Recovery OS verification.

Recovery campaign planning is now a first-class read-only OS operation. The
planner inventories the live recovery classes, resolves Wolo home from the
running process rather than templated systemd text, preserves all parser
top-level evidence except disposable `tmp/`, keeps Wolo key custody outside the
general vault, computes Mac capacity/headroom, and declares when streaming
restore verification is required. Planning performs no backup or service
mutation.

The first Recovery campaign write lane is deliberately narrower than the full
plan. `recovery campaign start --authorize-ordinary-capture` may capture only
managed media, direct-message attachments, Radio WOLO media, parser evidence and
the replay archive. It streams each class over SSH directly into Mac-side CMS
encryption, hashes plaintext and ciphertext, writes a hashed
`CAPTURED_PENDING_RESTORE` proof, and never stages plaintext on the Mac.
Settlement state, Wolo quiescence and key custody remain separately authorized
future seams. Cooperative pause is between classes only; an interruption inside
a class is ambiguous and resume must fail closed rather than overwrite partial
evidence.

The canonical Recovery OS Mac key authority is
`~/Library/Application Support/AoE2WAR Recovery/keys`. The current V1 private
key is `recovery-v1-private.pem` at mode 0600 and the matching public
certificate is `recovery-v1-recipient.pem`. The certificate SHA-256
fingerprint is
`7A31A5E8D552DF043EA5D4AB96562A257D9397C50A78781292C5FF85AF28B2C0`.
A live 2026-09-06 proof confirmed both certificate fingerprint continuity and
private-key/public-certificate keypair equality. Recovery preflight must verify
those conditions itself before encrypting any new ordinary recovery payload.
Private key contents and hashes must never be printed or transmitted.

## Kingdom Intelligence agent-memory model

Kingdom Intelligence must show work as evidence-backed activity, not decorative
animation. The canonical operating array is eight OS agents plus System Doctor:
Release, Documentation, Storage, Host, Recovery, Workspace, Speed, Replay Truth,
and Doctor. Brain/Council coordinate that array but are not counted as another OS.

Public activity uses one beacon language: cyan pulse for proven active work,
green solid for healthy/complete/certified, amber pulse for attention/waiting,
red for failed/blocked/unsafe, and slate for idle. External workers such as
ChatGPT and Codex are separate from OS agents and appear only when Workspace OS
or an authenticated heartbeat proves their activity.

Chronology and memory are different layers. The War Pulse shows recent active
or completed operating/source events. The Victory Ledger points to sealed Git
changes. The Memory Vault points to Engineering Memory commits. A failed attempt
must never be rewritten as success; instead, a parent campaign may later close
successfully while the failed attempt remains immutable provenance underneath it.

Commit trailers may identify future agent-authored source work:

- `AoE2WAR-Agent: <agent>`;
- `AoE2WAR-System: <OS domain>`.

These trailers are attribution evidence only. They do not prove deployment,
runtime success, financial authority, or continuous agent activity.

## Storage estate lesson

Do not mirror the entire VPS or all durable rollback generations to the Mac.

The unique mutable-state inventory was approximately 33.91 GiB, while durable
web rollback generations alone were approximately 76.5 GiB and are largely
rebuildable from Git/release evidence.

Recovery selection must preserve irreplaceable mutable truth, not blindly clone
regenerable runtime generations.

## Betting Fairness V1.2 and Betting Phase Books V2

Current production uses the Betting Fairness V1.2 compatibility bridge.

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

### September 9 betting entitlement audit and constitution precedent

A read-only audit of Jim's canonical current-mainnet wager history proved 64
winning wagers and 4,118,681 WOLO of winning payouts with zero current-contract
math mismatches and exact indexed WoloChain receipt parity. No corrective
payment was due.

The same settled corpus showed that the pooled settlement rule had allocated
242,581 more gross opposing WOLO to Jim than a strict 1:1 FIFO counterfactual.
Do not retroactively recompute or claw back settled books.

Future economic changes belong in `docs/BETTING_CONSTITUTION.md`. The
ratification candidate defines three isolated phase books and a one-winning-
WOLO-to-one-opposing-WOLO FIFO ceiling. It is documentation only until a
separately reviewed financial implementation is certified.

### September 9 staking custody incident and chain-backed compound rule

A read-only production reconciliation proved that current direct staking
principal is essentially chain-backed while the historical auto-compound layer
is not. The frozen incident contained **92,285 WOLO** of confirmed compounded
liability across 109 synthetic `COMPOUND-*` events with zero indexed
WoloChain transaction matches. Staking custody was **13,774.265 WOLO** below
confirmed liability and **23,774.265 WOLO** below liability plus the 10,000-WOLO
operating reserve target.

The durable rule is: **app accounting must never turn an earned reward into
confirmed staking liability before equivalent custody is proven on WoloChain**.
Future mainnet auto-compound therefore follows
`COMPOUND_PENDING -> escrow-funded transfer -> staking custody proof -> COMPOUNDED`.
Bet Escrow is the economic source rail for the staker share of betting fees;
the staking custody wallet is the destination. Dry-run and execution must prove
the escrow signer, exact recipient, exact minimal-denom amount, and real tx hash.
Finalization must be atomic and retry-safe.

The September 9 containment release keeps stake, unstake, and reward
distribution fail-closed. The new source state machine does not authorize
activation by itself. Historical compound liability, custody deficit, and
reserve must be reconciled before any reward timer or application reward gate
is re-enabled.

### Premium betting composer implementation status

The E4 horizontal `InstrumentStakeRail` has been removed and replaced with
`PremiumStakeComposer` in certified production.

The composer consumes the canonical projected `market.bettingOpen` authority
and does not invent financial eligibility in the browser.

Betting Fairness V1.1 first restored fresh winner betting for unscheduled
Watcher markets while canonical status is `open` or `live`. Betting Fairness
V1.2 extends the same active-window admission to Watcher-born Desync.
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

V1.2 permits fresh winner bets and Watcher-born Desync bets while their
canonical market remains `open` or `live`.

Scheduled/challenge winner markets retain their strict pre-game cutoff.
Closing, final-proof, review, settled, and voided states fail closed for both
winner and Desync fresh commitments.

Never repair this only in the frontend. The public `bettingOpen` projection and
the transactional `buildFreshBetMarketWriteWhere()` fence must remain aligned.

The direct Node test runner must use
`scripts/aoe2-alias-loader.mjs` for tests that transitively import `@/...`
modules. A raw `node --test` failure with `ERR_MODULE_NOT_FOUND` for `@/lib`
is a test-harness invocation error, not evidence that the financial patch
failed.

### Watcher-live Desync admission boundary

Watcher-born Desync is a live proposition, not a pre-game book.

Fresh Desync bets are allowed only while canonical Watcher truth keeps the
child market in `open` or `live`.

The cutoff is **not settlement completion**. The cutoff is the first
authoritative lifecycle transition out of active battle truth, including
`closing`, `awaiting_final_proof`, `under_review`, `settled`, or `voided`.

This matches winner-live admission and guarantees that a stale browser cannot
continue admitting money after Watcher/parser/finality has detected that the
battle is no longer active.

Detached/manual Desync rows fail closed. Post-broadcast recovery remains a
separate proof rail and cannot reopen Desync after the active window closes.

Public `bettingOpen` and the transactional
`buildFreshBetMarketWriteWhere()` guard must always change together.

### Betting-domain release risk classification

Financial risk classification must follow the domain boundary, not one historical
filename.

Betting implementation paths such as `lib/bet*`, `lib/desync*`, Betting Hall
routes, and betting/desync regression tests are `FINANCIAL` release scope.

This lesson was captured after the V1.2 live-Desync change was incorrectly
reported by Documentation OS as `APPLICATION` even though it changed fresh-money
admission.

A financial betting change must therefore automatically trigger the high-risk
Documentation OS semantic-review and Engineering Memory requirements.

Do not rely on an operator or AI remembering that a newly named betting file is
financial.

### Historical replay uploads are not current-rating observations

A replay arriving now may have been played years ago.

Never use upload time, `created_at`, parser execution time, or a generic
presentation fallback clock to decide which embedded Steam RM/DM rating is
current.

The current-rating clock is trustworthy replay `played_on`. Undated historical
observations may remain historical evidence, but they may neither establish nor
overwrite current rating.

Keep historical-match truth and current-rating truth separate:

- old uploads may extend match history;
- old uploads may alter reconstructed Site Elo when historically appropriate;
- old uploads must not replace a newer displayed Steam rating simply because
  their bytes were ingested later.

This invariant applies equally to browser single upload, batch/package upload,
Watcher import, and recovery paths.

Profile presentation must not bypass the shared chronology-aware rating
projection by reading whichever replay row happens to appear first.

Current exact-Steam account state has its own projection boundary:

- historical W/L, replay counts, accepted result evidence, and historical name
  evidence remain on the accepted final replay corpus;
- current name and current RM/DM may consume both `watcher_live` and
  `watcher_final`;
- current-state observations require an exact SteamID64 and a real
  `played_on`;
- never broaden the historical final-only corpus merely to recover a newer
  current rating;
- never substitute upload time, parser time, acceptance time, or `created_at`
  for missing current-state chronology.

A test double exercising the public player directory must model the
current-Watcher-state query explicitly, even when that model is simply an empty
`$queryRaw` result. Do not weaken production provenance rules to accommodate an
older mock shape.

### Current state must have a stronger source than historical evidence

Replay history and current operational truth are different products.

For current Steam rating, exact Watcher observation outranks generic replay
availability, and actual replay `played_on` outranks upload/parse recency.

For War Chest accounting, economic gain outranks gross money movement, and
period-specific displays must carry period-specific counters all the way from
the server accumulator to the rendered row.

General rule: preserve broad historical evidence, but require the strongest
available provenance before that evidence can redefine a current-state number.

### Parser stability is not the legacy iteration integer

`GameStats.parse_iteration >= 2` is a legacy stability proxy, not winner
authority.

For automatic Watcher terminal statistics recovery, a lower legacy iteration
may be superseded as a stability signal by exact immutable Engine Room
evidence: matching replay SHA, reviewed `aoe2war.mgz_hd` deterministic pass 8,
completed/recovered candidate run, and exact raw-activity observation.

Never mutate `game_stats.parse_iteration` merely to satisfy a result-policy
gate. Never treat parser stability itself as winner evidence. Result authority,
desync protection, financial authority, and parser stability remain separate
gates.

When deterministic Engine Room stability is used, preserve its provenance in
the append-only adjudication evidence. Automatic terminal recovery remains
statistics-only and must keep `affectsBets = false`.

<!-- AOE2WAR:REPLAY_TRUTH_SCALAR_AUTHORITY_CLOSURE_20260904:START -->
## Replay truth scalar-authority closure — 2026-09-04

The replay-result authority investigation completed on 2026-09-04 and is
closed at certified source
`f50cb7ec6a6bcf256eee4d56ae4e2d667c76e59e`, implementation
`bb58c70d312a435d7950d53e34b936f7852d684f`, active build
`GS6jfsCxQcPnAykQ2ezbI`, public version
`20260904185439-fed8d215d0`.

### Durable scalar-winner law

A legacy stored scalar replay winner is not sufficient authority merely because
a non-placeholder name exists.

The scalar winner may receive statistics authority only when it maps to exactly
one side of a canonical high-confidence two-team proposition.

For the legacy automatic scalar path:

- exact 1v1 is eligible when the winner maps to exactly one participant;
- larger automatic team forms require 4, 6, or 8 players;
- larger forms require explicit team IDs for every player;
- exactly two teams must exist;
- the teams must be equal-sized;
- canonical player identities must be unique;
- the stored winner must map to exactly one canonical side.

Unsupported 3-, 5-, and 7-player scalar rows fail closed. Do not infer FFA,
2v1, or another proposition merely from player count.

Fail-closed scalar state preserves evidence without granting authority:

- effective winner: `null`;
- candidate winner: preserved stored scalar winner;
- confidence: `unresolved`;
- `statsEligible = false`;
- `bettingEligible = false`;
- truth reason: `stored_winner_not_canonical_team`;
- participant W/L remains unknown.

Production games `1541` and `1571` were the corpus counterexamples that exposed
this defect. They remain intentionally unresolved unless new lawful evidence is
added.

### Full-corpus closure proof

A production read-only audit at `2026-09-04T19:18:41Z` checked **4,428 final
GameStats rows** under the certified release.

Results:

- replay truth / participant-result contract mismatches: **0**;
- scalar-authority rows at that snapshot: **411**;
- incoherent scalar-authority rows: **0**;
- game `1541`: fail-closed, 0 wins / 0 losses / 3 unknown;
- game `1571`: fail-closed, 0 wins / 0 losses / 3 unknown.

Audit receipt:

`/tmp/aoe2war-post-release-truth-contract-20260904T191839Z.json`

The durable cross-layer regression law is:

> A final replay must never have high-level statistics authority when the
> participant resolver cannot produce a complete coherent W/L projection for
> the represented proposition.

The post-release proof also confirmed production source remained unchanged, the
web service remained active, and Wolo listeners `8092` and `8093` remained
untouched.

### Client/server dependency lesson

The first correct scalar-authority implementation reused
`lib/teamResolution.ts` from `lib/unresolvedWatcherResult.ts`.

That was architecturally invalid because `unresolvedWatcherResult.ts` is shared
with client code through `components/game-stats/LiveReplayDetail.tsx`, while
`teamResolution.ts` legitimately imports `node:crypto` for canonical hashing.
The isolated production Webpack build correctly rejected the resulting browser
dependency chain.

Do not solve this by weakening or browser-reimplementing canonical hash
authority.

The final architecture keeps the narrow scalar structural check browser-safe
inside `unresolvedWatcherResult.ts` while server-side canonical team hashing
remains in `teamResolution.ts`.

A permanent regression test requires the client-shared replay-truth module to
remain free of:

- `from "./teamResolution.ts"`; and
- `node:crypto`.

General lesson: when a domain module is shared with `"use client"` consumers,
review its transitive runtime dependencies before importing server-only domain
helpers.

### Production read-only audit lesson

The production web environment file is root-protected:

`/etc/aoe2hdbets/aoe2hdbets-web.env`

The ordinary SSH operator account cannot source it and must not be granted
broader secret-file permissions merely to run an audit.

For protected production database audits:

1. use the authorized root operator boundary;
2. load the existing production environment without printing secrets;
3. export `AOE2WAR_PROD_DB_PREVIEW=true`;
4. independently query PostgreSQL and require
   `current_setting('default_transaction_read_only') = 'on'`;
5. prove production Git/service/Wolo boundaries before and after the audit.

The environment flag is intent; PostgreSQL's own read-only state is the proof.

### Unknown-debt north star

The objective is **zero unexplained unknowns**, not zero rows containing the
word `unknown` at any cost.

Every final replay should eventually have an explicit disposition:

1. `AUTOMATICALLY_RESOLVED` — canonical teams/result proven from machine
   evidence;
2. `ADJUDICATED_STATS_ONLY` — lawful human/external evidence supplies the
   result without granting financial authority;
3. `NON_COMPETITIVE_OR_NON_FINAL` — saved checkpoint, aborted session,
   continuation/rehost, or otherwise not a completed competitive battle;
4. `IRRECOVERABLE_RESULT_EVIDENCE` — preserved real evidence exists but no
   lawful result can currently be established.

A literal 100% historical W/L corpus is permissible only if the final category
is eliminated through new evidence. Never weaken truth gates to satisfy a
coverage counter.

### Replay truth campaign discipline

Future historical repair campaigns operate cohort-by-cohort:

`fresh census -> counterfactual -> exact safe set -> candidate -> forensic proof
-> append-only acceptance -> public canary -> current-DM invariant ->
financial/Wolo invariant -> full-corpus truth audit -> durable receipt`

Do not reuse stale corpus totals as current truth. The Watcher is live and may
change the denominator between campaigns.
<!-- AOE2WAR:REPLAY_TRUTH_SCALAR_AUTHORITY_CLOSURE_20260904:END -->

<!-- AOE2WAR:REPLAY_TRUTH_OS_V1_20260904:START -->
## Replay Truth OS V1 — 2026-09-04

The recurring production replay-truth forensic workflow is now promoted into
the AoE2WAR operator OS.

The first read-only command family is:

- `aoe2war truth status`;
- `aoe2war truth census`;
- `aoe2war truth audit`;
- `aoe2war truth target GAME_ID`.

Census, audit and target run through the protected root production boundary,
force `AOE2WAR_PROD_DB_PREVIEW=true`, require PostgreSQL itself to confirm
transaction read-only mode, and prove production Git/service/Wolo boundaries
unchanged afterward.

Successful live commands write durable local receipts under
`.aoe2war-release/truth-receipts/`.

The OS tracks team debt and result debt independently and makes the
high-level-statistics versus coherent-participant-W/L corpus contract a
repeatable operator command instead of a one-off shell forensic.

Replay Truth OS V1 is read-only. It has no projection, adjudication, betting,
settlement, claim, payout or Wolo mutation command.
<!-- AOE2WAR:REPLAY_TRUTH_OS_V1_20260904:END -->


<!-- AOE2WAR:REPLAY_TRUTH_TOPOLOGY_V1_1_20260904 -->

## Replay Truth topology semantics

Replay Truth OS V1.1 separates observed replay topology from canonical
two-team result authority. Exact FFA, uneven TG, multi-side and single-group
parser evidence may establish diagnostic topology while winner/statistics
authority remains unresolved.

Missing canonical source bytes and parser-evidence insufficiency are explicit
recovery dispositions. They never justify fabricated team assignments,
winner inference, betting authority or financial mutation.

## Code Health OS refactor invariant

AoE2WAR treats refactoring as a measured structural campaign, not a rewrite impulse.

`aoe2war code-health` captures the current source-file census, exact duplicate
source groups, TODO/FIXME/HACK markers, giant-file hotspots, working-tree
cleanliness, and remote-branch authority. Its receipts are durable comparison
evidence for later refactors.

A large file is a prioritization signal, never deletion or rewrite authority.
Behavior-preserving tests, release proof, and unchanged product semantics remain
the acceptance boundary. Branch cleanup follows the same rule: a branch is safe
to remove only after its wanted commits are proven represented elsewhere; age or
name alone is not authority.


## 2026-09-05 — Kingdom Intelligence closure and latency lesson

A release transaction can successfully activate and certify production, then
fail in a later Finish phase. Preserve both truths: certified runtime provenance
remains valid, while the Finish transaction remains incomplete until its failed
closure phase is repaired. Kingdom Intelligence must surface the latest Finish
status/phase and generated control-state reason instead of presenting source
parity alone as complete operating closure.

The first `aoe2war brain` implementation also took roughly one minute because
independent Doctor, Storage, Host, Recovery and Workspace probes were executed
serially. Independent read-only probes should run concurrently when safe. An AI
or operator should spend context on engineering, not waiting for the sum of
unrelated diagnostics.

A Speed OS campaign is current-state evidence only when its recorded release SHA
matches currently certified production. Replay Truth certainty closure follows
the same source-identity rule. Recency or completeness without matching source
identity is not enough.

Readiness coverage denominators must come from the current governed Speed OS
route cohort, not a historical baseline receipt or hand-coded fallback. The
current cohort is the authority for how many public benchmark representatives
exist.

An older analyzed Speed campaign may remain intentionally unverified. That
historical campaign must not block freezing a baseline for a newer certified
release; same-release replacement still requires an explicit override.

The first live Brain also exposed null storage byte fields even though Storage OS
had exact available-byte evidence, and showed dirty/unmerged worktree counts
without ranking them. KI should preserve the strongest exact field available,
and dirty/unmerged workspace evidence must become an explicit review action
rather than passive telemetry.

## 2026-09-06 — Browser Ready and independent-upstream scheduling lesson

A real-user Speed Observatory session exposed three dominant readiness samples:
`/wolo` at about 10.5 s explicit Ready, `/staking` at about 5.71 s explicit
Ready, and `/kingdom-intelligence` at about 10.9 s route-paint Ready. The same
session still showed an initial `/` TTFB around 0.19 s and a live browser round
trip around 0.72 s, proving that the slowdown was not one uniform origin-TTFB
failure.

The WOLO result came from an over-broad readiness contract. Its primary
interface already rendered usable fallback/refreshing states, but its explicit
Ready marker waited for chain-id refresh, stored Keplr restoration, and wallet
balance resolution. Keplr restoration itself carries an 8-second timeout.
Durable rule: primary-page Ready must not wait on secondary wallet/chain proof
when the page remains safely usable while that proof resolves.

The staking route contained a separate scheduling smell: one independent
Postgres economy/profile batch completed before the page even started its Wolo
trust-wallet/chain batch. Those evidence families have no authority dependency
and must run concurrently, while preserving their existing error/fallback
semantics.

The Kingdom Intelligence sample exposed a third class: the entire flagship
read-only page was one `"use client"` island. Same-document navigation could not
commit the real route until that large client module and icon/UI dependency graph
loaded and executed, even though the page's bounded sanitized authority was
already available through a server-safe loader. Durable rule: read-only
observability surfaces should server-render their primary authoritative state
when possible, isolate only true interactivity into small client islands, and
use an App Router loading boundary for immediate honest feedback. The loading
shell must never emit the authoritative Ready marker; the real board publishes
explicit Ready only after its server snapshot resolves.

Also distinguish `explicit` Ready from `route_paint`. Session median and p75
use fresh authoritative explicit samples only; a slow route-paint sample remains
valuable diagnosis but must not be described as the same kind of proof.

Never improve the chart by merely moving a marker earlier than actual usability.
Change the readiness boundary only when the interface is genuinely operable, and
then verify the source change against a fresh same-release browser campaign.

## 2026-09-06 — Release provenance observation retry lesson

A pre-mutation Finish Doctor failed immediately after `aoe2war status` had
proved the same active runtime `CERTIFIED` with public/internal build-version
parity. No deployment occurred between those observations. The release collector
used one public `/api/deployment-version` request; one empty, failed, or malformed
response therefore made parity false and caused the otherwise matching activation
receipt to fall back to `legacy-unmanifested`.

Durable rule: a safety decision may retry a transient observation, but must never
relax the underlying invariant. Public build-version probes may retry only
transport/empty/malformed results within a small bound. A valid mismatched build
version remains immediate mismatch evidence, and exhausting the bounded retries
still fails closed.

## 2026-09-05 — First 77-route speed campaign hot-path lesson

Certified source `31f883e4d8ce9a8835e34e46e7387247aae3b4f6`
established the first current 77-route before-optimization baseline at 400.0 ms
TTFB p50 and 587.2 ms total p50. The highest total-time routes included
`/academy` at about 2.98 s and `/rivalries` at about 2.43 s.

Source inspection showed two repeatable design smells:

1. a complete historical replay projection was correctly required for truth but
   unnecessarily rebuilt on every request even when the replay generation had
   not changed;
2. a lightweight public card loaded the complete player command-center profile,
   including unrelated WOLO, watcher, stream, community, metrics and rivalry
   work.

The durable rule is to preserve complete truth while caching deterministic
derived computation by its authoritative generation, and to give small public
surfaces narrow data loaders that perform only the work they actually render.

Cache invalidation remains tied to truth generation. A cache may save
computation; it never becomes replay authority.

## 2026-09-05 — Certified Wave 1 verification and storage-blocker lesson

Performance Wave 1 certified successfully at
`908e4103a037a434924f751002b12ba2914f9906`, with Wolo untouched, but the
larger Finish transaction later failed in `final_doctor` because the mounted
evidence volume reached the critical operating band. Runtime certification
remained valid.

The Brain initially recommended rerunning Finish even though that would simply
repeat the same storage prerequisite failure. Durable rule: rank the actionable
prerequisite above the enclosing transaction. Storage pressure that blocks
Doctor means plan/remediate Storage OS first, then rerun Finish.

The first exact 77-route verification attempt also timed out on `/game-stats`
after 15 seconds. A single failed sample must not disappear because an operator
reruns the whole benchmark. Preserve the failed attempt, allow at most one
bounded retry, and mark an otherwise successful verification WARN when a retry
was needed.

An analyzed campaign from the previous certified release is a frozen Before
waiting for verification against the new release. Do not mistake that source
mismatch for a request to start a second baseline.
## 2026-09-06 — Frozen performance cohort verification lesson

A Speed campaign baseline was frozen at 77 routes. Before verification, the
public route universe legitimately grew by one route (`/kingdom-intelligence`).
The verifier benchmarked the current 78-route cohort and only afterward compared
cohort identity, causing a completed After measurement to be rejected as a
mismatch.

Durable rule: before/after verification must replay the baseline receipt's exact
route list. Current page-universe drift is separate evidence: record additions or
removals in the source-inventory delta, warn when scope changed, and admit new
routes into the next campaign baseline. Never let a growing product silently
rewrite a frozen experiment.

## 2026-09-06 — Post-Finish intelligence freshness lesson

A certified Finish was followed by Kingdom Intelligence recommending “Relieve
storage pressure before rerunning Finish,” even though Finish had already
completed. The same snapshot also carried an open Speed campaign whose frozen
Before release was old. Once that campaign verified successfully against current
production, Brain would still have treated performance as stale because it keyed
freshness only to the Before release SHA.

Durable rule: recommendation semantics must be phase-aware. Storage can block a
Finish retry only while Finish closure is incomplete; after certification it is
maintenance. For a verified before/after performance campaign, current evidence
identity is the verification After release/build, while the baseline release
remains historical comparison truth. Preserve both identities and never confuse
“what the experiment started from” with “what production was just measured.”

## 2026-09-06 — Recovery CMS must be truly streaming

The first ordinary Recovery campaign reached `RUNNING_CAPTURE` for
`managed_user_media`, but its CMS command used `openssl cms -encrypt` without
`-stream`. OpenSSL documents streaming as off by default for this operation;
without it, large payloads may require whole-message buffering before output.
That is unacceptable for parser/replay recovery classes measured in many GiB.

Durable rule: every ordinary Recovery CMS encryption command must include
`-stream`, and tests must assert that invariant. The resulting CMS encoding is
indefinite-length BER while remaining parseable/decryptable by OpenSSL's CMS
reader. Capture proofs record streaming and encoding explicitly. If this defect
is discovered during a live campaign, request a pause and let the current class
finish; never kill a class mid-stream unless accepting that the campaign must be
superseded because partial artifacts cannot be resumed safely.

## 2026-09-06 — Recovery pause requests must be out-of-band

During the first ordinary Recovery campaign, the operator requested pause while
`managed_user_media` was in flight. The controller held a stale in-memory copy
of campaign JSON with `pause_requested=false`. When the class completed it
saved that stale state, erasing the operator's pause request, and immediately
started `legacy_direct_message_attachments`.

Durable rule: operator control signals must not share the same mutable state file
that a long-running controller rewrites. Recovery pause now uses a separate
per-campaign durable marker. The controller reloads state and checks the marker
only between classes; stale campaign-state writes cannot clear it. Resume
explicitly removes the marker at a clean boundary. If an older controller with
the race is already running, a deliberately dirty untracked sentinel may be used
as an emergency fail-closed interlock because the old controller re-validates a
clean authorized source before every new class.

## 2026-09-06 — Ordinary restore proof must remain streaming and scoped

Once ordinary Recovery capture became a real encrypted five-class write lane,
the next missing seam was not another backup copy but proof that those artifacts
could actually be decrypted and understood without staging another ~30 GiB of
plaintext on the Mac. The recovery verifier already knew how to judge a final
schema-2 proof, but no command produced the intermediate ordinary restore
evidence.

Durable rule: ordinary restore verification is a detached local read-only lane.
Each class must verify ciphertext hash/size before decryption, stream the
plaintext tar through exact hash/byte accounting and structural parsing, and
write immutable hashed restore evidence. A bounded representative file may be
materialized only inside a disposable isolated directory and must be removed
after inspection. Do not persist plaintext member names in proofs; hash the tar
member index instead. Successful five-class verification is
ORDINARY_RESTORE_VERIFIED, never RECOVERY_VERIFIED. Wolo settlement, consensus,
key custody and final schema-2 proof remain separate authority seams. Long
restore drills use the same out-of-band control principle as capture: pause is a
separate durable marker checked only between classes, and resume clears it
explicitly while refusing an interrupted class that already has immutable proof.

## 2026-09-06 — Watcher replay ownership must come from the key

Scavanger_Ab exposed a cross-surface contradiction: his claimed profile had
active Watcher keys and fresh Watcher telemetry, while the Kingdom's proven
Watcher-operator roster did not include him. Telemetry already resolved the
Watcher API key server-side, but the replay upload proxy accepted the client's
`x-user-uid` as replay ownership whenever both headers were present. A stale or
incorrect cached client UID could therefore disagree with the API-key owner and
break final replay attribution even while telemetry remained correctly linked.

Durable rule: a Watcher-formatted API key is the replay ownership authority. The
web proxy must resolve it against `api_keys`, reject unresolved/revoked keys,
and forward the server-resolved owner UID. Client-supplied Watcher UID is never
ownership authority. Keep the separate internal server-key upload path explicit
and keep browser uploads session-owned. Support tooling must pin known problem
accounts by stable UID rather than allowing missing telemetry or spelling drift
to make the diagnostic tile disappear.

## 2026-09-06 — Watcher validity, activity, and network priority are separate truths

Scavanger_Ab exposed two Watcher failure modes that can look healthy from a
single status field. First, a replay directory can be structurally valid while
being the wrong active directory: the monitor remains attached and the folder
looks like AoE2HD, but the current game is writing to another Documents,
OneDrive, or Steam-library SaveGame path. Second, optional native video can
consume upstream bandwidth while replay live/final bytes are trying to reach
AoE2WAR.

Durable rule: **valid folder != active folder**. A healthy monitor may
conservatively move from a valid-but-stale folder only when another proven HD
candidate has materially fresher replay writes. Never choose an old folder just
because it contains more historical replay files.

Durable rule: **replay truth outranks video**. On replay upload start, optional
video transport may be preempted: abort an in-flight video chunk, invalidate
stale queued slices, suppress new video slices and thumbnails, and pause video
encoding while replay bytes own the lane. Keep only the lightweight stream
heartbeat alive, then resume from fresh video after replay transfer clears.
Never flush stale video backlog into the same constrained upstream connection.

Replay ownership has the same authority principle: the server-resolved Watcher
API-key owner is authoritative. A client-supplied UID is not replay ownership
authority.

Release lesson: source version, signed artifacts, updater manifests, public
download metadata, and visible hero copy are separate publication surfaces. A
Watcher release is not production until all of them agree on the same certified
version and artifact hashes. Version text painted into artwork is release debt;
prefer dynamic release metadata for version-bearing UI.
