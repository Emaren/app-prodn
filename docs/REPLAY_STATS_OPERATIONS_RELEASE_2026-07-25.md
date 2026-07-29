---
id: "aoe2war.app-prodn.docs-replay-stats-operations-release-2026-07-25"
title: "Replay Statistics and Operations Release — 2026-07-25"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["operators","auditors","ai-agents"]
source_of_truth: "historical-evidence"
authority: "release-evidence"
reviewed_at: "2026-07-26"
review_interval_days: 0
sensitivity: "restricted"
---

# Replay Statistics and Operations Release — 2026-07-25

## Outcome

This release strengthens the full replay path instead of treating parsing as one
boolean:

```text
bytes -> archive -> parser candidate -> normalized statistics -> result review
      -> team-integrity gate -> market reconciliation -> chain settlement
```

Each arrow has its own evidence and authority. Later stages never become true
merely because an earlier stage succeeded.

The release includes:

- deterministic HD parser schema `2026-07-25.1`, pass `8`;
- exact per-player recorded-action observations;
- append-only normalized per-player/game metrics and versioned career
  aggregates;
- independent statistic, result, and betting eligibility;
- post-ingest parity for single, watcher, and package uploads;
- an admin Replay Operations Command Center for inventory, dry-run planning,
  bounded candidate execution, review exposure, and job receipts;
- guarded legacy Challenge terminal preparation;
- a plan/candidate/accept backfill rail for exact statistics.

## Authority matrix

| Stage | May append | May affect public stats | May affect result | May affect bets/claims | May call WoloChain |
|---|---|---:|---:|---:|---:|
| Corpus inventory / worker `plan` | Nothing | No | No | No | No |
| Parser `candidate` | Private artifact, submission, parse-run, observation, job receipts | No | No | No | No |
| Normalized-stat `candidate` | Private projection, snapshot, metric rows | No | No | No | No |
| Normalized-stat `accept` | Accepted exact-stat projection and metrics | Yes | No | No | No |
| Result adjudication | Append-only reviewed result facts | Only when accepted | Only under the result gate | No by default | No |
| Financial approval/reconciliation | Separate evidence-locked financial facts | No | No new result inference | Only under explicit approval and integrity gates | Only the existing settlement rail |
| Legacy Challenge preparation | One terminal state plus immutable activity | No | No | No funds moved | No |

The database constrains normalized-stat projections to
`affects_results = false`, `affects_bets = false`, and
`settlement_authority = false`. No UI label can override those constraints.

## Pass 8 recorded-action metrics

When recorded action evidence is available, pass 8 emits exact per-player
observations for:

- packet count;
- packet type counts;
- command-family counts;
- first and last recorded command time;
- active recorded minute count;
- peak recorded packets in one minute;
- largest recorded command gap;
- age-up research command count;
- market command count;
- tribute command count.

The contract is:

- numeric `0` is a real observed value and remains `0`;
- an unavailable stream/field is absent, not `0`;
- provenance and source path travel with every value;
- recorded packet rate and first resignation time remain diagnostic, not
  automatically accepted exact career statistics.

This distinction is mandatory on game/player pages and in aggregates. “No row”
means “not available,” not “the player did none.”

## Normalized statistics

The normalized layer is additive to raw `GameStats` JSON and private
`ReplayObservation` candidates:

- `ReplayStatProjection` is the content-addressed version/provenance receipt.
- `ReplayPlayerSnapshot` fixes player identity and per-game eligibility scope.
- `ReplayPlayerMetric` stores typed player facts.
- `ReplayGameMetric` stores typed replay facts.
- `ReplayPlayerMetricAggregate` stores a versioned aggregate build with source,
  game, eligibility, metric, and coverage counts.

Every table is append-only. A correction adds a superseding accepted projection;
it does not update or delete historical facts. Public readers select only the
current accepted projection.

The v1 metric dictionary covers available:

- total/military/economy/technology/society scores;
- units killed/lost, buildings razed/lost, conversions;
- food/wood/stone/gold, tribute, trade gold, relic gold;
- age times, explored/research values;
- castles, wonders, relics, villager high;
- exact pass-8 recorded-action metrics;
- selected game duration, action, chat, and map facts.

The projection does not manufacture postgame data that was not present in
replay evidence. Result-independent metrics may be accepted from an unresolved
final game. Result-dependent statistics still require resolved-result scope.
Aggregate rows record both denominator and metric coverage, so partial corpus
coverage is visible rather than silently averaged away.

Bounded projection campaigns quarantine a replay-local normalization contract
failure (for example, duplicate canonical player keys in one malformed legacy
roster) as an explicit `skipped_<code>` receipt and continue from the durable
game cursor. Infrastructure/database failures still stop the campaign. This
keeps one bad archive row visible without sacrificing the rest of the corpus.

Projection does not rebuild aggregate rows implicitly. The aggregate
build/persist helpers require only the current accepted projection set, reject
duplicate active projections for one game, and must be invoked by a separate
reviewed job/admin action with a versioned build key.

## Upload/post-ingest parity

Single upload, watcher upload, and package upload share one receipt classifier.
Storage, parser, teams, result, statistics, and financial readiness are reported
independently.

The coordinator:

- derives a stable SHA-256 idempotency/correlation key from replay receipts;
- preserves existing single/watcher tournament-proof behavior;
- reconciles package tournament/market stages at most once per batch;
- calls the market reconciler only for a trusted settlement-ready result;
- records tournament and market failures independently after accepted replay
  bytes are already safe.

A package containing archived unknown-result games is successful preservation
and review work. It is not financial proof.

## Replay Operations Command Center

`/admin/parser-lab` exposes:

- indexed archive/database inventory;
- bounded, explicit-cohort candidate plans;
- one request-bounded candidate-only replay execution;
- review cases with result/financial exposure;
- immutable recent job receipts.

The plan endpoint requires `dryRun: true` and returns a content fingerprint over
the parser contract, cohort, exact ordered artifact set, full archive hashes,
linked game IDs, and current pass state. Candidate execution requires that
unchanged fingerprint, the same cohort/limit, a manually typed exact
confirmation, and `candidateOnly: true`. It accepts one linked game per request,
keeps each plan/candidate worker invocation under a 20-second admin-route bound,
and re-verifies canonical archive bytes before invoking the private worker. Its
response states:

```text
affectsPublicAggregates = false
affectsResults = false
affectsBets = false
affectsChain = false
```

The button is a canary/retry control, not a full-vault launcher. Full-corpus
passes remain frozen-manifest API-host jobs. Review queues and candidate
receipts are evidence, not adjudication or settlement authority.

## Evidence-gated financial bridge

Manual result review remains statistics-only by default. A linked winner market
can use the separate admin-only route
`/api/admin/replay-results/[id]/financial-authority` only after an accepted
complete adjudication exists.

The read-only plan rechecks the current final replay hash, parse iteration,
roster hash, active desync state, exact adjudicated teams/winner, every frozen
market roster/proposition, market integrity, wager/stake/payout state, seed
exposure, pending claims, and terminal money. It returns blockers, exact WOLO
exposure, and a SHA-256 fingerprint.

Approval requires that unchanged 64-character fingerprint and the exact phrase
`AUTHORIZE FINANCIAL RECONCILIATION`. Under an advisory lock, the server reruns
the plan and appends a superseding accepted site-admin adjudication with a
`financial-authority:` idempotency key and `affectsBets = true`. The additive
database constraint rejects that flag on ordinary verdicts.

Only after the immutable authority row exists does the route invoke the existing
`ensureBetMarkets` integrity/settlement path. It first waits out any
already-running process-wide pass and then requires a pass that started after
the authority commit, so joining an older pass cannot produce a false success.
A post-commit reconciliation failure is returned as retryable; the authorized
admin card preserves a retry control, and no retry rolls back or mutates the
authority history. Proposition conflicts, desyncs, terminal
payouts/refunds/claims, stale source truth, unsupported market types, or changed
exposure block approval.

## Legacy Challenge safety

Historical rows with no V2 `creation_request_id` remain excluded from automatic
expiry/refund. The operator must:

1. run `npm run challenge:legacy-prepare -- --id=<id>` read-only;
2. review status, participants, terms, funding proofs, exact liability, linked
   exposure, blockers, and funding fingerprint;
3. repeat every printed assertion plus the row-specific confirmation to apply;
4. review any tx-backed liability in `/admin/wolochain`;
5. run the ordinary scheduled-settlement dry-run and separately confirm exact
   execution.

Preparation changes no chain state and moves no funds. Changed source truth
invalidates the fingerprint and blocks apply. A repeated exact apply is
idempotent.

## Production deployment and backfill runbook

### 1. Code and additive schema

Before touching corpus state:

```bash
cd /var/www/AoE2HDBets/app-prodn
git status --short
git pull --ff-only origin main
npx prisma migrate deploy
npx prisma generate
npx tsc --noEmit --pretty false
npm run build
```

Verify the five normalized-stat tables, their foreign keys/checks, and all
append-only `UPDATE`/`DELETE`/`TRUNCATE` blockers in live Postgres before
starting projection. Restart/smoke the web and API services only after their
respective builds/tests pass.

### 2. Freeze corpus inventory

On the API host:

```bash
cd /var/www/AoE2HDBets/api-prodn
source .venv/bin/activate
python scripts/reconcile_replay_corpus.py \
  --archive-dir /mnt/HC_Volume_105319120/aoe2-replay-archive \
  --report-dir /mnt/HC_Volume_105319120/aoe2-parser-engine/reports \
  --snapshot-label <release-label>
```

Review the summary and SHA-256 of the generated full-vault manifest. Use
`--verify-content-hashes` when performing the deliberate full-byte archive
audit.

### 3. API parser plan and candidate canary

```bash
python scripts/run_replay_engine_room_job.py \
  --mode plan \
  --manifest /mnt/HC_Volume_105319120/aoe2-parser-engine/reports/<frozen-manifest>.csv \
  --archive-root /mnt/HC_Volume_105319120/aoe2-replay-archive
```

After a clean plan:

```bash
python scripts/run_replay_engine_room_job.py \
  --mode candidate \
  --manifest /mnt/HC_Volume_105319120/aoe2-parser-engine/reports/<frozen-manifest>.csv \
  --archive-root /mnt/HC_Volume_105319120/aoe2-replay-archive \
  --jobs-root /mnt/HC_Volume_105319120/aoe2-parser-engine/jobs \
  --batch-size 25 \
  --concurrency 1 \
  --max-artifacts-this-run 25 \
  --database-root-reserve-gib 3
```

Exit `75` is an intentional resumable pause. Inspect candidate and database/WAL
growth, job receipts, failures, and review exposure before resuming the same
immutable job.

### 4. Normalized-stat plan and private candidate

From `app-prodn`, begin with a small bounded cohort:

```bash
npm run replay:stats:project -- \
  --mode plan \
  --after-id 0 \
  --limit 25
```

Review source identity, result eligibility, metric counts, hash, and skipped
no-metric rows. Then append private candidates:

```bash
npm run replay:stats:project -- \
  --mode candidate \
  --after-id 0 \
  --limit 25
```

Candidate mode is not public. Repeat with the returned `nextAfterId` to walk the
cohort.

### 5. Accepted exact statistics

Only after candidate review:

```bash
npm run replay:stats:project -- \
  --mode accept \
  --after-id 0 \
  --limit 25 \
  --confirm ACCEPT-EXACT-REPLAY-STATS \
  --operator-uid <existing-admin-uid>
```

Accept mode persists exact metrics only, verifies that the operator UID belongs
to an existing admin, and blocks metric coverage regression by default. Do not use
`--allow-coverage-regression` without a documented field-level reason and a
reviewed supersession plan. After each batch, verify current accepted
projections, per-player/game metric counts, zero preservation, unavailable
omission, and representative player/game pages. Rebuild/version career
aggregates separately, then verify their denominator and coverage counts.

### 6. Repair rejected watcher-inference result projections

The result-policy repair is intentionally narrower than a normal projection
run. It selects only current, accepted, unsuperseded public projections whose
source replay was rejected with
`watcher_inferred_opponent_win_on_incomplete_1v1` but whose stored result
eligibility is still `resolved`. It appends an accepted unresolved successor;
it never mutates or deletes the historical projection.

Plan each bounded batch first:

```bash
npm run replay:stats:project -- \
  --mode plan \
  --repair-inferred-results \
  --after-id 0 \
  --limit 500 \
  --operator-uid <existing-admin-uid>
```

Review every `would_supersede` row and confirm the proposed result eligibility
is `unresolved`. If authorized, apply the exact reviewed batch:

```bash
npm run replay:stats:project -- \
  --mode accept \
  --repair-inferred-results \
  --after-id 0 \
  --limit 500 \
  --operator-uid <existing-admin-uid> \
  --confirm REPAIR-INFERRED-RESULT-PROJECTIONS
```

Use the returned `nextAfterId` for the next bounded batch. After applying,
rerun plan over the same range: repaired rows must no longer be selected
because their resolved projections are now superseded. Verify representative
game, player, rivalry, and betting pages before continuing. This mode repairs
public win/loss authority without allowing metric coverage to regress. Because
the immutable successor is projected with the current exact-stat policy, newly
available exact fields may increase coverage; compare the current and proposed
metric counts in the plan receipt. The mode does not adjudicate a game, settle
a bet, or initiate a chain transfer.

### 7. Result and financial work remain separate

Normalized acceptance does not resolve unknown winners. Candidate review may
lead to a separately authorized result adjudication, but a money-linked game
must still pass exact replay hash, roster/team, frozen proposition, desync, and
terminal-financial-history checks. Never infer a winner to clear a stale bet,
and never run a chain transfer from this statistics backfill.

## Release verification

At minimum:

```bash
# app-prodn
npx prisma generate
npx tsc --noEmit --pretty false
npm run test:replay-truth
npm run test:challenge
npm run build

# api-prodn
pytest -q \
  tests/test_hd_parser_engine.py \
  tests/test_replay_upload_metadata.py \
  tests/test_replay_engine_room_worker.py
```

Also run the focused normalized-stat, post-ingest, replay-operations, and legacy
Challenge tests directly when they are not included in the package scripts.
Production smoke must confirm one intact replay, one unknown-result final, one
package batch, parser-lab inventory/plan/candidate/review/receipts, representative
player/game statistic surfaces, and dry-run-only legacy Challenge inspection.
