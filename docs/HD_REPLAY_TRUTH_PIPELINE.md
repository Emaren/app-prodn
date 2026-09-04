---
id: "aoe2war.app-prodn.docs-hd-replay-truth-pipeline"
title: "HD Replay Truth Pipeline and Operator Runbook"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-09-04"
review_interval_days: 30
sensitivity: "restricted"
---

# HD Replay Truth Pipeline and Operator Runbook

## Scope and ownership

AoE2HDBets owns HD replay ingestion, parsing, player/team/result presentation,
human adjudication, and app-side betting eligibility. Raw replay evidence and
game-domain truth stay here. WoloChain remains authoritative for signed wallet
movement and final chain settlement; replay processing must not rewrite that
history.

This pipeline is designed for repeatable future passes over the same immutable
HD corpus. New parser versions may add observations or supersede an effective
projection, but they must never erase the original artifact, parser output, or
review history.

The additive private data contract for those passes is documented in
`docs/PARSER_ENGINE_ROOM.md`. Its first migration records artifacts,
submissions, completed parse runs, candidate observations, evidence, private
promotions, and bounded resumable job history. The API-side worker appends only
to that private lane and immutable mounted-volume output; neither the migration
nor the worker mutates `game_stats`/public aggregates.

## Lifecycle contract

Treat each state as a separate fact. Do not collapse them into one “success.”

| Operator lifecycle | API evidence | Meaning | Public posture |
|---|---|---|---|
| Uploaded | `final_submission_received` or live receipt | Bytes reached the API | No parser internals |
| Archived | `raw_replay_archived`, `artifact_archived`, `artifact_accepted` | Content-addressed source bytes are durable | Battle/replay filed |
| Parsed | `parse_completed` | A parser pass completed, even if some fields were absent | Show extracted battle facts |
| Stats-ready | `statistics_available`, `stats_eligible` | A final parsed replay contains real statistics; zero is valid evidence | Show/aggregate only present facts, even if the result is unresolved |
| Result-ready | `result_resolved`, `result_trusted` | A coherent winner projection exists | Show the full winning player/team set |
| Review-routed | `final_recorded*` with no trusted automatic result | Artifact/candidate is preserved for authorized correction | Present the battle, not parser uncertainty |
| Betting-eligible | `result_trusted`, `betting_eligible`, `should_settle` | Direct result proof plus team integrity allow settlement | Existing betting lifecycle applies |

`final_accepted` and `should_settle` remain settlement signals. They are not
upload-durability signals. `final_recorded`, `final_recorded_duplicate`, and
`final_recorded_refreshed` are successful preservation outcomes and must not be
counted as failed uploads or trusted finals.

### Single, watcher, and package upload parity

`/api/replay/upload` and `/api/replay/upload-package` now classify the same
independent storage, parser, team, result, statistics, and financial stages.
Their post-ingest coordinator derives a stable SHA-256 receipt identity, so a
transport retry can be correlated without treating filename or upload order as
game identity.

Package ingestion reconciles tournament proof and markets at most once per
batch. Market reconciliation runs only when at least one receipt is a trusted,
settlement-ready result. An archived or parsed unknown-result replay is routed
to review and cannot open the financial rail. Single/watcher ingestion retains
its existing tournament-proof refresh behavior, but uses the same trusted-result
gate for markets.

Tournament and market stages fail independently after accepted bytes have been
preserved. Their error receipts must be shown to operators and retried through
the idempotent reconciler; a downstream reconciliation failure must not be
reported as loss of the uploaded replay.

Trusted team settlement requires exactly two complete explicit replay teams, a
coherent complete winning team, and direct result evidence such as postgame or
scoreboard truth or resignation by every member of the losing team. The legacy
scalar `winner` field is never sufficient team settlement truth.

A trusted duel has one winning player, not a two-player winning team. Shared
structured-result adapters must accept that cardinality only when the final
roster is exactly 1v1 and the same frozen proposition checks pass. Missing
decisive evidence still remains unresolved; the duel exception never licenses
uploader-opponent guessing.


<!-- AOE2WAR:AUTOMATIC_TERMINAL_ACTION_TAIL_V3:START -->
## Final 1v1 terminal action-tail evidence — diagnostic only

Policy `replay-terminal-action-tail-v3` remains the historical evidence
label for the terminal-action ordering experiment.

As of 2026-08-07, terminal action ordering is not automatic winner
authority. Production game `21811` supplied a decisive counterexample:
the known voluntary quitter was the later-active player in the replay
packet stream, while the opponent's final gameplay packet occurred
earlier. The same immutable parser candidate contained zero raw or
normalized resignation events.

Therefore:

- action-tail measurements may be preserved for diagnosis and review;
- action-tail measurements alone must not append an accepted 1v1 result;
- an exact Watcher terminal receipt proves replay/session provenance,
  not which AoE2 player won;
- missing Watcher terminal metadata must not increase result authority;
- explicit serialized resignation, trusted winner serialization, or
  authorized human adjudication remains result authority;
- historical `replay-terminal-action-tail-v3` adjudications remain
  immutable evidence and must be audited or superseded append-only,
  never silently edited or deleted.

`WATCHER_TERMINAL_ACTION_TAIL_RESULT_AUTHORITY = false` is the forward
code-level safety gate.

The existing evaluator may continue measuring terminal action ordering,
but the automatic reconciler returns `action_tail_diagnostic_only`
instead of creating a new accepted 1v1 adjudication.

Team terminal recovery remains separate because it requires explicit
serialized resignation evidence and exact resignation/team integrity
before terminal timing is considered.
<!-- AOE2WAR:AUTOMATIC_TERMINAL_ACTION_TAIL_V3:END -->

Watcher authentication and user lookup use a short database transaction that
commits before CPU-bound binary parsing starts. Do not move parser execution
back inside that transaction: concurrent uploads would hold connections for
the entire parse and can exhaust the async SQLAlchemy pool before later
watchers are identified.

### Replay durability rail — 2026-09-04

Replay upload durability now separates HTTP admission, transport retry behavior,
database identity work, and CPU-heavy MGZ parsing.

Production rules:

- replay upload admission remains bounded by
  `AOE2_REPLAY_UPLOAD_MAX_INFLIGHT=1`;
- the hot replay parse runs in a spawned parser process rather than the API
  event-loop process, with `AOE2_REPLAY_PARSER_WORKERS` defaulting to one;
- uploader/API-key identity is resolved and committed before parser CPU work,
  so the database connection is not held across MGZ parsing;
- overload responses return `429` with `Retry-After`, and the app replay proxy
  preserves that upstream retry guidance;
- the desktop watcher honors `Retry-After`, adds bounded retry jitter, and
  reuses one immutable replay snapshot across ordinary transport retries;
- parser-finalizing retries begin a new logical observation after the wait,
  allowing a still-growing replay to be captured again instead of indefinitely
  retrying stale bytes;
- parser process failure is recoverable through process-pool recreation, but a
  fake timeout that abandons a running parser process is not permitted.

The production canary on 2026-09-03 proved the spawned parser worker had a PID
distinct from the API process, preserved local `/health` responsiveness during
a real watcher upload, and kept replay admission at exactly one. This durability
rail changes transport and execution isolation only. It does not create result,
betting, settlement, payout, claim, or chain authority.

## Raw replay artifact invariant

Production source artifacts live at:

`/mnt/HC_Volume_105319120/aoe2-replay-archive`

`REPLAY_ARCHIVE_DIR` may override that root. The API stores approved replay
suffixes under a two-level SHA-256 fanout:

`<root>/<hash[0:2]>/<hash[2:4]>/<sha256><original-suffix>`

Rules:

- calculate identity from bytes, not filename, watcher, uploader, or database
  row;
- never edit, normalize, or replace an archived artifact in place;
- duplicates may point to the same content hash;
- parser jobs read the artifact and write new observations/runs elsewhere;
- keep the archive private, durable, backed up, and writable only by the API
  service account and operators;
- do not place it in the web public tree or treat it as disposable build output;
- a database row without its archived bytes is incomplete preservation and must
  be visible to operators.

## Versioned parser passes

Use explicit passes rather than one destructive parse:

1. **Artifact classification** — extension, hash, size, header/container shape,
   truncation/failure signature, and duplicate identity.
2. **Primary HD parse** — canonical roster, explicit team IDs (including `0`),
   map/settings, timing, actions, resignation evidence, and structured result.
3. **Differential parser pass** — run a newer `mgz` or an AoE2HD-specific fork
   beside the pinned production parser; compare field-level output before any
   promotion.
4. **Event enrichment** — derive build/research/train timelines, activity, map
   context, tribute/market behavior, and other stats supported by actual bytes.
5. **Human adjudication** — append exact teams/result when authorized review is
   needed; preserve parser evidence and provenance.
6. **Future playback/OCR** — for data not present in replay bytes, use controlled
   HD playback and confirmed postgame captures as new evidence, never as a silent
   rewrite.

Every future parse run should record artifact hash, parser package/build,
schema/pass version, start/end, status, structured failure signature, emitted
observations, and promotion decision. Re-running the same artifact and parser
version must be idempotent.

Do not upgrade `mgz` in place solely because a newer version exists. Run it as a
differential cohort, keep regressions visible, add golden fixtures, and promote
only field-level improvements that pass the truth contract.

### Current parser promotion

On 2026-07-14, the five supplied HD 5.8 fixtures were parsed side by side with
`mgz` 1.8.27 and 1.8.51. Team composition, winner set, resignation evidence,
duration, and player identity were identical across both versions. Production is
therefore pinned to 1.8.51 while retaining the HD `game_type_id=9`
compatibility shim. Future promotions must repeat the same differential gate.

Campaign III retained that canonical `mgz 1.8.51` identity. The current parser
contract advances the evidence schema to `2026-07-25.1` / pass `8`. Targeted canonical recovery lanes
now cover header fragments, metadata fragments, one trailing body stream, and
HD saved-game checkpoints. The latest candidate disposition is complete for
all 2,025 frozen artifacts; older failed runs remain immutable history.

Pass 8 also emits exact per-player recorded-action observations for packet
counts, type and command-family counts, first/last command time, active minutes,
peak packets per minute, largest command gap, and age-up/market/tribute command
counts. It preserves a real `0`; an unavailable field stays absent. Derived
packet-rate and resignation-time observations remain diagnostic until their
semantics are explicitly promoted.

Saved checkpoints are not parser failures and are not final battles. Even when
roster/map/initial state is decoded, they remain result-unknown and
settlement-ineligible. The read-only continuation report now links 113 saved
checkpoints to 98 recorded-game candidates across 98 exact HD platform match
IDs. Every linked pair also has identical normalized name and non-zero Steam-ID
rosters; 90 IDs are one-to-one and 8 contain multiple checkpoints. The other 89
saved checkpoints stay unlinked. These identity links do not import a later
winner into the saved checkpoint, create settlement evidence, or affect public
aggregates; name/time similarity alone remains insufficient.

The Campaign III strict projector reviewed 12 completed recorded games and
created 12 immutable effective-projection receipts plus 24 private observation
promotion facts. It changed no market, claim, financial, settlement, or chain
record. Reapplying the same cohort produced zero new writes.

Public coverage uses final replay-record grain: every `GameStats` row with
`is_final = true`, after append-only adjudication projection. It must not be
described as a deduplicated logical-battle total. Saved/rehosted, aborted,
checkpoint-only, and otherwise unprovable sessions can correctly remain in that
denominator while staying excluded from resolved-result statistics.

## Backfill order

Backfill in risk and value order, never by overwriting the active corpus:

1. Snapshot counts and hashes; verify every target database row has an archived
   artifact.
2. Revalidate games already showing a winner against complete-team and trusted
   evidence rules. Prioritize games with markets or settlement history.
3. Reprocess parsed games whose public result still needs review.
4. Classify parser misses by exact container/extension/failure signature before
   retrying them. Keep `.aoe2record` and `.aoe2mpgame` cohorts separate.
5. Build normalized-stat projections in `plan` and then private `candidate`
   mode. Review metric coverage and reject regressions.
6. Accept exact, result-independent statistics in bounded cohorts. This changes
   no winner or financial state; unresolved results remain unresolved.
7. Route remaining result decisions to Emaren and the verified submitter.
8. Promote effective-result candidates only through their stricter,
   separately authorized projector, then recompute affected player, rivalry,
   leaderboard, and archive projections.
9. Reconcile totals, hashes, effective results, and money-linked exceptions
   before starting the next cohort.

Jim's full 2,025-artifact pass and the deterministic recovery frontier are
complete. The continuing order is: reconcile effective truth, preserve human
adjudications and money-linked rows, promote only strict no-financial-impact
improvements, investigate saved-checkpoint continuation evidence, then score
advanced-stat semantics. No cohort is public-truth complete until every input
is accounted for as effective, review-routed, checkpoint-only, unsupported, or
corrupt while its raw artifact remains preserved.

## Operator checks

For ingestion or watcher reports:

1. Check `artifact_accepted` before declaring the file preserved.
2. Check `parse_completed` separately from result readiness.
3. Use `winning_team_id`, `winning_player_keys`, result provenance/evidence, and
   canonical teams; do not trust the scalar winner for team games.
4. Treat `final_recorded*` as a successful archive/review handoff.
5. Route authorized corrections through `/game-stats/[id]/review`.
6. Keep market correction, refunds, payouts, and claims on their existing audited
   rails.

For a reparse/backfill:

1. Freeze the corpus manifest and run the API worker in no-write `plan` mode.
2. Run a small private candidate canary, measure database/WAL and candidate
   volume growth, then resume the same immutable job.
3. Compare roster, teams, winner set, evidence, map, duration, and advanced stats
   field by field.
4. Project normalized stats in `plan`, then private `candidate` mode. Accept
   only exact reviewed metrics and never treat result absence as stat absence.
5. Flag proposition or terminal-money differences before any result promotion.
6. Promote the smallest verified result cohort on its separate authority rail.
7. Smoke public projections and private operator history.
8. Record before/after counts and preserve the run manifest and receipts.

## Deployment and migration checklist

The adjudication first pass adds a schema migration and coordinated API, web,
and watcher semantics. A code-only deploy is incomplete.

Before deployment:

- inspect `git status --short` independently in `app-prodn`, `api-prodn`, and
  `aoe2-watcher`; do not include unrelated work;
- run the targeted API parser/finality tests and watcher tests;
- in `app-prodn`, run `npx prisma generate`, `npx tsc --noEmit --pretty false`,
  and `npm run build`;
- confirm the raw replay archive exists, is mounted, and is writable by the API
  service user;
- capture a production database backup appropriate for the migration.

The Parser Engine Room foundation is a separate additive migration. Deploying
its tables does not authorize a backfill: verify the append-only triggers and
job event guard first, then keep workers disabled until a bounded dry-run cohort
has operator approval.

Deploy in this order:

1. Pull the reviewed commits into their actual VPS checkouts.
2. Install `api-prodn` requirements into the production venv and verify
   `mgz 1.8.51` is active.
3. From `/var/www/AoE2HDBets/app-prodn`, run `npx prisma migrate deploy`.
4. Verify `users.can_review_own_replay_results`,
   `replay_result_adjudications`, its indexes/checks, and the append-only trigger
   exist in live Postgres.
5. Verify Jim and Julio have the reviewer capability and that per-game access
   still requires exact `GameStats.userUid` ownership or a linked submission attempt.
6. Generate Prisma and build the web app.
7. Restart `aoe2hdbets-api.service`, verify its local health routes, then restart
   `aoe2hdbets-web.service` and verify local/public web health.
8. Confirm both services are active and inspect their recent journals.

Production smoke:

- upload one intact final replay and confirm archived, parsed, and result fields
  are reported separately;
- confirm a review-routed final is counted as preserved rather than failed;
- confirm Emaren can review any game;
- confirm Jim/Julio can review an exact submitted game but cannot review another
  uploader's game;
- submit a no-market verdict and verify the public projection plus immutable
  history;
- submit a market-linked reviewer proposal and verify
  `pending_admin_approval`, `affectsStats = false`, and `affectsBets = false`;
- append an admin decision and verify the earlier row was not mutated;
- attempt no financial repair from the review API;
- verify a trusted team final exposes the entire winning team and remains subject
  to the frozen-proposition settlement gate.

Rollback posture:

- stop promotion/backfill jobs first;
- roll application code back only to a version compatible with the deployed
  additive schema;
- do not drop or edit adjudication rows to “undo” a verdict—append a superseding
  correction;
- do not delete raw replay artifacts;
- do not reverse payouts, claims, refunds, or chain history as part of an app
  rollback.

<!-- AOE2WAR:SCREENSHOT_EVIDENCE_LAYER_20260722:START -->
## Screenshot evidence layer — 2026-07-22

Postgame screenshots are now a first-class but independent evidence source in the AoE2WAR replay truth pipeline.

The evidence layers must not be silently collapsed into one confidence value.

Canonical conceptual order:

1. immutable raw replay bytes;
2. replay-only parser runs;
3. replay-only observations;
4. human-supplied screenshot evidence;
5. screenshot Evidence Pass observations;
6. explicit human adjudication when required;
7. effective public or financial truth under existing promotion and settlement rules.

### Screenshot evidence rules

A screenshot Evidence Pass may corroborate:

- Team Composition
- Winner / Loser
- Score
- Military
- Economy
- Technology
- Society
- Timeline

It remains:

- candidate-only;
- non-mutating to public aggregates;
- independent from replay-only confidence;
- non-authoritative for settlement by itself.

### Human participation

A human uploading screenshots establishes human participation in provenance.

It does not automatically establish:

- a human verdict;
- a commissioner adjudication;
- settlement authority;
- financial truth.

Human adjudication remains an explicit append-only decision.

### Public presentation

The public Verdict Trail may display replay parser passes, Evidence Passes, and human adjudications in one chronological provenance surface.

That unified presentation does not erase the source distinction between them.
<!-- AOE2WAR:SCREENSHOT_EVIDENCE_LAYER_20260722:END -->

## Live authority and migration seal — 2026-07-26

The live database directly confirmed the following migrations as applied:

- `20260722183000_add_replay_evidence_game_target`;
- `20260722203000_add_replay_desync_incidents`;
- `20260724163500_add_public_replay_roster_promotions`;
- `20260725200000_add_normalized_replay_stats`;
- `20260725213000_allow_replay_financial_authority`;
- `20260726025500_fence_post_broadcast_bet_recovery`.

Migration history contains 73 records: 71 applied, zero incomplete, and two historical rolled-back attempts. Prisma reports the 71 source migrations up to date.

The authority-sensitive schema remains fail-closed. Roster and stat promotions expose separate `affects_public_aggregates`, `affects_results`, and `settlement_authority` fields. Player snapshots preserve result eligibility/status; stat projections preserve result eligibility and reason; adjudications preserve explicit financial disposition. A parser pass, screenshot pass, normalized stat projection, or public roster promotion cannot become financial truth merely because it exists.
