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

## Lifecycle contract

Treat each state as a separate fact. Do not collapse them into one “success.”

| Operator lifecycle | API evidence | Meaning | Public posture |
|---|---|---|---|
| Uploaded | `final_submission_received` or live receipt | Bytes reached the API | No parser internals |
| Archived | `raw_replay_archived`, `artifact_archived`, `artifact_accepted` | Content-addressed source bytes are durable | Battle/replay filed |
| Parsed | `parse_completed` | A parser pass completed, even if some fields were absent | Show extracted battle facts |
| Result-ready | `result_resolved`, `stats_eligible` | A coherent winner projection exists | Show the full winning player/team set |
| Review-routed | `final_recorded*` with no trusted automatic result | Artifact/candidate is preserved for authorized correction | Present the battle, not parser uncertainty |
| Betting-eligible | `result_trusted`, `betting_eligible`, `should_settle` | Direct result proof plus team integrity allow settlement | Existing betting lifecycle applies |

`final_accepted` and `should_settle` remain settlement signals. They are not
upload-durability signals. `final_recorded`, `final_recorded_duplicate`, and
`final_recorded_refreshed` are successful preservation outcomes and must not be
counted as failed uploads or trusted finals.

Trusted team settlement requires exactly two complete explicit replay teams, a
coherent complete winning team, and direct result evidence such as postgame or
scoreboard truth or resignation by every member of the losing team. The legacy
scalar `winner` field is never sufficient team settlement truth.

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

## Backfill order

Backfill in risk and value order, never by overwriting the active corpus:

1. Snapshot counts and hashes; verify every target database row has an archived
   artifact.
2. Revalidate games already showing a winner against complete-team and trusted
   evidence rules. Prioritize games with markets or settlement history.
3. Reprocess parsed games whose public result still needs review.
4. Classify parser misses by exact container/extension/failure signature before
   retrying them. Keep `.aoe2record` and `.aoe2mpgame` cohorts separate.
5. Route remaining result decisions to Emaren and the verified submitter.
6. Promote accepted candidates in bounded cohorts and recompute affected player,
   rivalry, leaderboard, and archive projections.
7. Reconcile totals, hashes, effective results, and money-linked exceptions
   before starting the next cohort.

Initial execution order is Jim's full submitted archive first, followed by the
complete War Vault. Within Jim's cohort: betting-linked rows, currently resolved
team games, parsed review-routed games, then classified parser misses. No cohort
is complete until every input is accounted for as promoted, review-routed,
unsupported, or corrupt while its raw artifact remains preserved.

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

1. Run a no-write/dry-run candidate pass.
2. Compare roster, teams, winner set, evidence, map, duration, and advanced stats
   field by field.
3. Flag proposition or terminal-money differences before promotion.
4. Promote the smallest verified cohort.
5. Smoke public projections and private operator history.
6. Record before/after counts and preserve the run manifest.

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
