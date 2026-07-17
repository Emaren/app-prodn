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

The operator cockpit is `/admin/parser-lab`. Worker implementation and exact
commands live in `api-prodn/docs/REPLAY_ENGINE_ROOM_WORKER.md`.

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
schema: 2026-07-16.4
pass: hd_deterministic_evidence
pass version: 6
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
