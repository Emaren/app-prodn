---
id: "aoe2war.app-prodn.docs-parser-engine-room"
title: "Parser Engine Room: Durable Data Foundation"
type: "explanation"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "architecture-explanation"
reviewed_at: "2026-07-26"
review_interval_days: 60
sensitivity: "restricted"
---

# Parser Engine Room: Durable Data Foundation

## Status

The additive database foundation, private admin observatory, bounded resumable
candidate worker, job reporter, saved-checkpoint decoder, and separately
authorized effective-result projector are present. The worker and reporter do
not alter `game_stats`. Public projection is a distinct reviewed command with a
stricter gate and its own immutable receipt.

The foundation lives in:

- `prisma/schema.prisma`
- `prisma/migrations/20260714190000_add_replay_engine_room_foundation/migration.sql`
- `lib/replayEngineRoom.ts`

The operator cockpit is `/admin/parser-lab`. Its Replay Operations Command
Center keeps inventory, candidate planning, result/financial review, and job
receipts as visibly separate actions. Worker implementation and exact commands
live in `api-prodn/docs/REPLAY_ENGINE_ROOM_WORKER.md`.

## Web command-center boundary

The admin web controls are bounded operator rails. The web process does not
parse replay bytes itself; an explicit candidate launch delegates a frozen
one-replay manifest to the private API-host worker:

| Endpoint | Mode | Bound |
|---|---|---|
| `GET /api/admin/replay-operations/inventory` | Read-only | Indexed database counts; never walks the mounted archive |
| `POST /api/admin/replay-operations/candidate-plan` | Dry-run only | Explicit cohort, 1–100 artifacts |
| `POST /api/admin/replay-operations/run-candidates` | Candidate-only | Explicit confirmation, at most 3 game-linked artifacts, serial execution |
| `GET /api/admin/replay-operations/review-queue` | Read-only | 1–100 returned review cases |
| `GET /api/admin/replay-operations/job-receipts` | Read-only | 1–50 recent immutable job receipts |

Every response carries an explicit safety envelope: no public aggregate,
winner, wager, claim, settlement, or chain write. Candidate planning rejects
requests that do not send `dryRun: true`; it previews catalog rows but does not
create a job or invoke Python. Candidate execution separately requires
`candidateOnly: true` plus the exact server-defined confirmation string. It
re-verifies canonical archive bytes, runs serially, and writes only private
candidate receipts/observations.

A full archive inventory must still be generated on the API host with
`scripts/reconcile_replay_corpus.py`. Candidate execution remains a later,
separately authorized invocation of `run_replay_engine_room_job.py` against a
reviewed frozen manifest. The three-game button is an operator canary, not a
replacement for the full-corpus worker. Opening a replay review case likewise
does not authorize settlement.

## Data contract

| Record | Purpose | Mutation rule |
|---|---|---|
| `ReplayArtifact` | SHA-256 identity and durable location of original replay bytes | Immutable |
| `ReplaySubmission` | One uploader/watcher receipt for an artifact | Immutable and transport-idempotent |
| `ReplayParseRun` | One completed versioned parser/pass execution | Immutable, candidate-only |
| `ReplayObservation` | One field/event/stat candidate from a run | Immutable, never public by itself |
| `ReplayObservationPromotion` | Private acceptance/supersession decision for a candidate | Append-only, no public write |
| `ReplayEvidenceArtifact` | Content-addressed screenshot, OCR capture, or parser trace | Immutable |
| `ReplayEvidenceLink` | Provenance edge to a run, observation, or adjudication | Immutable |
| `ReplayReprocessJob` | Bounded parser/scope manifest | Immutable |
| `ReplayReprocessJobEvent` | Gapless status, counters, and resume checkpoint | Append-only |

All tables have an `UPDATE OR DELETE` blocker. A correction is a new submission,
run, observation, evidence link, promotion that supersedes a prior promotion, or
job event. Production code must never disable these triggers to make an edit.

## Existing-record bridges

The Engine Room reuses current truth rather than replacing it:

- submissions may link to `ReplayParseAttempt`;
- parse runs may link to `ReplayParseAttempt` and `GameStats`;
- private promotions may link to `GameStats` and
  `ReplayResultAdjudication`;
- evidence may link directly to a parser run, observation, or human result
  adjudication.

These are provenance links only. Foreign keys are restrictive and the migration
contains no `INSERT`, `UPDATE`, or `DELETE` against `game_stats`.

## Current deterministic HD parser contract

The first producer contract is fixed as:

```text
parser: aoe2war.mgz_hd
mgz: 1.8.51
schema: 2026-07-25.1
pass: hd_deterministic_evidence
pass version: 8
```

Its candidate document contains sorted field observations plus the complete
normalized action stream. That document can be large, so it must not be placed
inline in the hot relational tables. A completed `ReplayParseRun` stores only:

- the SHA-256 of the exact candidate-output bytes;
- a private volume/object-store provider and durable locator;
- byte size;
- observation count;
- normalized action count.

The private locator must never point into the public web tree. The output bytes
are immutable and content-verified before a run row is inserted. Failed/skipped
runs may omit an output; completed runs cannot.

`ReplayEvidenceArtifact` may name a `source_parse_run_id` together with the exact
`source_candidate_output_hash`. A database insert guard rejects a mismatched
hash, so screenshots, OCR, excerpts, differential traces, and later evidence can
retain an unambiguous link to the candidate output they were derived from.

### Pass 8 exact action observations

Schema `2026-07-25.1` / pass `8` exposes the action evidence already preserved
in the candidate document as queryable per-player observations:

- recorded packet total and recorded type/command-family counts;
- first and last recorded command time;
- active recorded minutes, peak recorded packets in one minute, and largest
  recorded command gap;
- age-up research, market, and tribute command counts.

Exact count lanes preserve numeric zero. If an action stream or field is not
available, its observation is absent/null-provenance; consumers must not display
or aggregate that absence as `0`. Packet-rate and first-resignation derivatives
remain diagnostic and are not automatically accepted as exact career metrics.

## Normalized statistics projection

Replay observations are evidence candidates, not a stable public analytics
contract. The normalized layer adds append-only, versioned records:

| Record | Purpose |
|---|---|
| `ReplayStatProjection` | One content-addressed receipt for a game/source/parser/policy state |
| `ReplayPlayerSnapshot` | Stable player identity, slot/team, and result scope for that projection |
| `ReplayPlayerMetric` | Typed per-player fact with metric dictionary version, source path, exactness, and provenance |
| `ReplayGameMetric` | Typed replay-level fact with the same provenance contract |
| `ReplayPlayerMetricAggregate` | Versioned career aggregate over accepted projections, with coverage counts |

All five tables are append-only. Corrections append a projection that
supersedes an earlier accepted projection; historical metric rows are not
rewritten. Candidate projections never affect public aggregates. An accepted
projection may affect public statistics only, while database constraints force
`affects_results = false`, `affects_bets = false`, and
`settlement_authority = false`.

The v1 dictionary normalizes available postgame score, military, economy,
technology, and society achievements; exact pass-8 action metrics; and selected
game-level duration/action/chat/map metrics. It does not manufacture missing
postgame tables. Experimental identity-normalized rate fields remain outside
the accepted exact dictionary.

Statistic eligibility, result eligibility, and betting eligibility are
independent. A final, parsed replay with real stat evidence may contribute
statistics while its winner remains unresolved. Result-dependent aggregates
must use resolved-result scope; result-independent aggregates may use every
accepted statistically eligible projection.

The projection CLI does not rebuild career aggregates implicitly. Aggregate
builders accept only the current accepted projection set and reject duplicate
active projections for one game; a separate reviewed aggregate job/admin action
must call the build/persist helpers with a versioned build key.

## Idempotency

Content identity is always the lowercase SHA-256 of bytes. Filename, uploader,
timestamp, and watcher identity never define an artifact.

- artifact bytes: unique `sha256` and canonical `storage_key`;
- submission retry: unique transport `idempotency_key`; callers must supply an
  explicit key or stable client submission ID;
- parser run: unique artifact plus `run_identity_hash`, derived from parser,
  parser version/build, pass, schema, input, and config;
- observation: unique run plus stable `observation_key`;
- evidence: unique content SHA and storage key;
- promotion and job event: unique idempotency key;
- job event: additionally unique `(job_id, sequence)`;
- job manifest: unique deterministic identity hash.

The pure builders in `lib/replayEngineRoom.ts` canonicalize JSON key order before
hashing so the same semantic config produces the same identity.

## Candidate and promotion boundary

Parser runs and observations are constrained to:

```text
candidate_only = true
affects_public_aggregates = false
```

A promotion is a separate immutable row and is also constrained to
`affects_public_aggregates = false`. In this first foundation, “promoted” means
accepted into the private Engine Room catalog. It does not mean published.

The effective-result projector is explicit and separately authorized. It
re-verifies source hashes, requires a placeholder effective roster, complete
unique candidate roster, explicit teams, trusted allowlisted result provenance,
and a completed recorded game. Accepted adjudications, saved checkpoints,
known/conflicting results, markets, and pending claims block application.

The projector writes a content-addressed mode-`0600` receipt, links it as an
`effective_projection_receipt`, appends private observation-promotion facts,
and updates only the reviewed `GameStats` projection. It has no market, wager,
claim, settlement, refund, or chain write path. Re-running an applied cohort
must reuse the existing receipt and write nothing.

Campaign III applied this rail to 12 eight-player games. All 12 had zero linked
markets, claims, or adjudications. The second apply reused 12 receipts with zero
new writes. The pre-apply database backup is recorded in the server storage map.

## Saved-game checkpoint lane

`.aoe2mpgame` files use a candidate-only raw-DEFLATE decoder. The public replay
parser continues to reject this suffix. The lane recovered:

- 196 complete saved snapshots;
- 5 complete initial-state prefixes;
- 1 map/roster prefix.

All 202 candidates carry the saved-checkpoint role and remain non-final,
result-unknown, and settlement-ineligible. The decoder caps inflated output at
64 MiB. Three private golden fixtures cover the complete, initial-prefix, and
map-prefix shapes without committing private replay bytes to Git.

The continuation identity audit is a separate read-only rail. Exact HD
`platform_match_id` plus exact normalized name and non-zero Steam-ID rosters
linked 113 checkpoints to 98 recorded candidates across 98 match IDs. All 113
pairs matched; 90 IDs were one-to-one and 8 contained multiple checkpoints.
The remaining 89 saves remain deliberately unlinked. A continuation identity
never makes the checkpoint final and never promotes result or settlement truth.

## Bounded resumable jobs

Each job fixes its scope and parser configuration at creation:

- `batch_size`: 1 through 500;
- `max_artifacts`: 1 through 100,000;
- `max_attempts_per_artifact`: 1 through 10;
- default mode: dry-run;
- all results: candidate-only.

The scope must describe an immutable cohort boundary (for example an explicit
artifact manifest/hash or a maximum artifact ID/creation cutoff). A live query
such as “all of Jim's files” is not a resumable identity until its cutoff is
captured. A later corpus pass uses a new scope boundary and therefore a new job
identity.

Runtime state is derived from ordered events. The database insert guard:

1. locks the immutable job manifest;
2. requires `queued` at sequence `0`;
3. requires every later sequence to advance by exactly one;
4. rejects regressing counters;
5. rejects counts above the job's artifact bound;
6. rejects attempts above the per-artifact bound;
7. rejects every event after `completed`, `failed`, or `cancelled`.

Workers resume from the latest non-null `checkpoint_cursor`. A cursor is opaque
to the database; the worker owns deterministic ordering for its scope. The
worker should query candidates strictly after that cursor and call
`planReplayReprocessBatch` to apply the remaining job and batch bounds.

## Worker runbook

Do not begin with a live query. Freeze a CSV manifest, record its SHA-256, and
run the zero-write plan against the immutable archive first:

```bash
cd /var/www/AoE2HDBets/api-prodn
source .venv/bin/activate
python scripts/run_replay_engine_room_job.py \
  --mode plan \
  --manifest /mnt/HC_Volume_105319120/aoe2-parser-engine/reports/<manifest>.csv \
  --archive-root /mnt/HC_Volume_105319120/aoe2-replay-archive
```

Plan mode reads and hashes every named replay but writes neither the database
nor the filesystem. Candidate mode is authorized only after that equation is
clean, the migration below is verified, and the HC volume is a separate mounted
filesystem with the configured reserve available:

```bash
python scripts/run_replay_engine_room_job.py \
  --mode candidate \
  --manifest /mnt/HC_Volume_105319120/aoe2-parser-engine/reports/<manifest>.csv \
  --archive-root /mnt/HC_Volume_105319120/aoe2-replay-archive \
  --jobs-root /mnt/HC_Volume_105319120/aoe2-parser-engine/jobs \
  --batch-size 25 \
  --concurrency 1 \
  --max-artifacts-this-run 25 \
  --database-root-reserve-gib 3
```

The first invocation is deliberately a 25-artifact canary. It records one
resumable pause after those rows so table, index, WAL, root-disk, and mounted
volume growth can be measured before the invocation limit is removed. The
database/root and mounted-volume reserves are independent safety rails.

The worker verifies each artifact hash again, stores canonical deterministic
gzip output at mode `0600`, appends material observations and an
`artifact_completed` event transactionally, and checkpoints every bounded
batch. Re-run the identical command after exit `75` or another resumable pause.
The job identity includes the manifest, parser/options, and batch size; changing
one creates a different immutable job.

The Jim pass reconciled exactly 2,025 manifest rows. The latest immutable
candidate disposition now accounts for all 2,025 artifacts with zero current
candidate failures. Continue to inspect candidates, existing human
adjudications, and market links in `/admin/parser-lab`; that completion equation
does not make every candidate effective public truth.

Generate the private, byte-verified reconciliation equation with the API
reporter before any public projector is considered:

```bash
python scripts/report_replay_engine_room_job.py \
  --job-id <job-id> \
  --report-root /mnt/HC_Volume_105319120/aoe2-parser-engine/reports \
  --label jim-2025-candidate-reconciliation
```

## Migration verification

After `npx prisma migrate deploy`, verify before enabling any worker:

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'replay_%'
ORDER BY tablename;

SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name LIKE 'replay_%append_only'
ORDER BY event_object_table;

SELECT conname
FROM pg_constraint
WHERE conname LIKE 'ck_replay_%'
ORDER BY conname;
```

Smoke the event guard with a disposable transaction: sequence zero must be
`queued`, a sequence gap must fail, decreasing counters must fail, and an event
after a terminal event must fail. Roll the transaction back.

## Rollback posture

- stop or interrupt the candidate process first; its last completed artifact
  remains committed and the same command resumes it;
- keep all Engine Room rows and archived bytes;
- roll application code only to a schema-compatible version;
- never drop history tables or triggers as an application rollback;
- never use Engine Room rollback to reverse a wager, payout, claim, refund, or
  chain transaction.

<!-- AOE2WAR:SCREENSHOT_EVIDENCE_PASS_20260722:START -->
## Screenshot Evidence Pass — 2026-07-22

The Engine Room now stores human-supplied postgame screenshots as immutable, content-addressed evidence.

### Evidence model

`ReplayEvidenceArtifact` stores immutable evidence bytes and metadata.

`ReplayEvidenceLink` is the append-only provenance edge.

A link may target:

- `gameStatsId`
- `parseRunId`
- `observationId`
- `resultAdjudicationId`

Migration:

`20260722183000_add_replay_evidence_game_target`

The direct `gameStatsId` relationship allows screenshot evidence to be attached to a battle before a screenshot-analysis run or human adjudication exists.

### Screenshot storage

Protected storage:

- `/mnt/HC_Volume_105319120/aoe2-parser-engine/evidence/review-screenshots`
- `/mnt/HC_Volume_105319120/aoe2-parser-engine/evidence/vision-analysis`

The web service systemd sandbox grants write access only to the Engine Room `jobs` and `evidence` trees.

### Screenshot parser pass

The evidence-assisted screenshot parser currently records:

- parser name: `aoe2war.screenshot_vision`
- parser version: `1.0.0`
- pass name: `postgame_evidence`
- pass version: `1`
- schema version: `2026-07-22.1`
- default model: `gpt-5.6`
- `candidateOnly = true`
- `affectsPublicAggregates = false`

The model may be overridden with:

`AOE2WAR_SCREENSHOT_VISION_MODEL`

The OpenAI secret is supplied through:

`OPENAI_API_KEY_FILE=/etc/aoe2hdbets/openai.key`

The secret itself must never be committed to Git or printed in diagnostics.

### Evidence-assisted run identity

The screenshot pass identity includes the relevant replay/base-run context, evidence hashes, model, and parser configuration.

Submitting the exact same evidence and configuration is idempotent and must not create a duplicate immutable pass.

### Independence from replay-only parsing

Screenshot-derived confidence is not merged into or represented as replay-only parser confidence.

The Evidence Pass may corroborate:

- teams;
- winner / loser;
- score;
- military;
- economy;
- technology;
- society;
- timeline.

It remains a separate evidence source and does not directly settle wagers, execute payouts, or mutate chain history.
<!-- AOE2WAR:SCREENSHOT_EVIDENCE_PASS_20260722:END -->

## Production parity seal — 2026-07-26

The live Parser Engine Room was verified against schema `2026-07-25.1`, deterministic evidence pass `8`.

Database and corpus facts at the seal:

- 71 source migrations applied, zero incomplete;
- `game_stats`: 19,129 rows;
- `replay_artifacts`: 2,064 rows;
- `replay_submissions`: 2,065 rows;
- `replay_parse_runs`: 4,746 rows;
- `replay_parse_attempts`: 43,925 rows;
- `replay_observations`: 678,804 rows;
- `replay_stat_projections`: 5,964 rows;
- `replay_player_snapshots`: 28,076 rows;
- `replay_player_metrics`: 141,561 rows;
- `replay_game_metrics`: 24,125 rows;
- `replay_roster_promotions`: 111 rows;
- `replay_result_adjudications`: 31 rows;
- `replay_desync_incidents`: 3 rows.

The mounted replay archive held approximately 8.0 GB / 7,925 files. The restricted parser-engine root held approximately 4.9 GB / 4,946 files. The latest protected backup set includes the July 26 post-broadcast bet-recovery deployment receipt, before-migration dump and checksums, and authority snapshots before/after migration and activation. Pass-8 candidate, accepted, cohort, duplicate-logical-game, and full-vault manifest reports are preserved under the protected reports root.

These counts prove that candidate and normalized-stat infrastructure is populated. They do not grant settlement authority. `affects_public_aggregates`, `affects_results`, `settlement_authority`, result eligibility, and explicit adjudication/financial-disposition fields remain separate gates.

### Post-seal recovery verification

After 1.00 GiB of regenerable root data was reclaimed, the automatic recovery rail processed the one eligible candidate successfully. `game_stats` 19794 produced parser run 4747 with `status=completed`, `candidateOnly=true`, and `affectsPublicAggregates=false`. The endpoint reported zero failed candidates, zero `game_stats` changes, zero market changes, and no betting or settlement authority. The next timer-fired invocation also completed successfully.
