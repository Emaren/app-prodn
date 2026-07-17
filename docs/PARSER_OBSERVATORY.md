# Parser Observatory

## Public surface

`/game-stats` is the public Parser Observatory and battle archive. It reports
live effective result/team coverage separately from private Engine Room
candidate coverage. The page is read-only: it cannot promote candidates,
adjudicate games, settle markets, or change chain history.

## Campaign III production checkpoint

The frozen 2,025-artifact cohort is fully accounted as of July 17, 2026:

- latest candidate dispositions: `2,025 completed / 0 failed`;
- immutable history: 2,389 parse runs and 247,630 material observations;
- candidate-output byte counter across all run history: 1,073,943,609 bytes
  (1,068,199,389 bytes for the latest 2,025 candidates alone);
- recorded-game candidate dispositions: 1,823;
- saved-game checkpoint dispositions: 202, all explicitly non-final;
- reviewed effective result corrections in this pass: 12;
- private observation-promotion facts for those corrections: 24;
- linked markets, pending claims, financial mutations, and chain transactions
  for those 12 corrections: zero.

The latest candidate mode equation is:

| Latest candidate mode | Artifacts |
|---|---:|
| Full recorded-game summary | 1,681 |
| Saved checkpoint decoded completely | 196 |
| Header fragment plus body recovery | 118 |
| Live parse-match fallback | 11 |
| Header-only evidence | 8 |
| Saved checkpoint initial-state prefix | 5 |
| Metadata fragment plus body recovery | 4 |
| Saved checkpoint map/roster prefix | 1 |
| Trailing body-stream recovery | 1 |
| **Total** | **2,025** |

This is why the public page says the 329 frontier is broken. Historical failed
runs remain immutable and visible as historical failure signatures; only the
latest disposition per artifact drives the current frontier.

Candidate completion is not effective truth. The 202 `.aoe2mpgame` files are
decoded checkpoint evidence, not completed battles. They have zero duration,
no winner, `final_battle_eligible = false`, and
`settlement_evidence_eligible = false` in their candidate contract.

## Canonical and compatibility parsers

The canonical contract is:

```text
parser: aoe2war.mgz_hd
mgz: 1.8.51
schema: 2026-07-16.4
pass: hd_deterministic_evidence
pass version: 6
```

The isolated `mgz 1.8.27` lane remains compatibility evidence. It never became
the production parser. The Observatory pins its contract tile to
`HD_REPLAY_PARSER_CONTRACT`, rather than whichever run finished most recently.

## Effective result projection

The 12 Campaign III corrections crossed into `GameStats` only after the strict
projector verified all of the following:

- immutable candidate bytes, compressed hash, semantic hash, and run identity;
- complete unique roster and explicit resolved teams;
- trusted allowlisted result provenance;
- current effective result still unknown;
- no accepted human adjudication;
- no linked market and no pending WOLO claim;
- completed recorded game, never a saved checkpoint.

Each write has a mode-`0600`, content-addressed private receipt plus an
`effective_projection_receipt` evidence row. The projector preserves replay
ingress provenance, removes stale parse-failure markers, writes a compact source
marker, and is idempotent. A second apply reused all 12 receipts and performed
zero new writes. Candidate observation promotions remain private by schema;
the separate receipt explicitly records that the reviewed projection affects
public stats and does not affect financial history.

The public winner resolver accepts a multi-player winning side only when the
complete set of true player flags exactly matches the trusted structured winner
names and resolved high-confidence teams. That makes the row stats-eligible but
not standalone betting-eligible; market settlement still requires its separate
frozen-roster integrity rail.

The Observatory denominator is not a deduplicated count of logical battles.
It is the timestamped set of `GameStats` rows marked `is_final = true`, after
append-only adjudications are projected. Replay hashes are distinct within the
current set, but a final watcher/upload record can still be a saved/rehosted,
aborted, checkpoint-only, or otherwise unprovable session. These records remain
visible in the fog and excluded from resolved-result statistics. Campaign IV
must classify that lifecycle evidence before treating the remaining count as a
recovery queue; the target is zero *unexplained viable finals*, not zero honest
unknowns.

At the repeatable-read production audit ending `2026-07-17T01:14Z`, the live
equation was `1,910 resolved + 1,017 fog = 2,927 final replay records`.
Team truth was `1,475 resolved + 1,452 unknown = 2,927`, and 1,557 records
needed result or team review. All 202 saved-checkpoint rows were inside the fog;
removing only that known checkpoint cohort leaves 815 unknown recorded-file
rows, which still require save/rehost, abort, and evidence-viability
classification before they can be called recoverable battles.

The exact 1,017-fog reason snapshot was: 538 inferred incomplete 1v1 records,
338 `watcher_final_unparsed`, 83 recorded-resignation finals, 17 sub-60-second
early exits, 17 incomplete team resignations, 9 watcher final submissions,
8 HD parse-match fallbacks, 3 manual overrides, 2 header-only fallbacks,
1 manual recovery, and 1 repaired parse-match fallback. These are routing
labels, not winner proof.

## Advanced evidence front

The Observatory now publishes field-path readiness without presenting
experimental evidence as a player stat:

- age/research commands: captured, experimental and unscored;
- command activity and recorded eAPM: structured, experimental and unscored;
- resignation chronology: captured with a smaller confidence-scored subset;
- tribute and market commands: validated extraction facts, not resource totals;
- terrain/elevation/map hashes: validated map structure, not map-control claims;
- production/build orders: command-family foundation only; ordered semantic
  build orders remain future work.

The same aggregate readiness can be supplied to the AI Council as a structured
context object when a replay/stat question is asked. Raw candidate objects and
private storage keys are never sent. The prompt contract states that coverage
is extraction readiness, saved checkpoints are non-final, and only effective
recent-match context may support battle claims.

## Truth and confidence

Public result resolution uses `resolveReplayWinnerTruth` plus effective
commissioner adjudications. Team resolution reads explicit replay evidence and
preserves team ID `0` as valid. Player order and aliases never create teams.
Missing fields remain missing; they never become zeroes.

Intentional save/rehost sessions remain a separate public disposition when an
actual replay `save` event exists without postgame, resignations, or a trusted
result. They are not parser failures. Saved-game containers are likewise
checkpoint artifacts, not finals.

## Storage and ownership

`api-prodn` owns parse execution, source receipts, manifests, candidate objects,
failure classification, reports, and the reviewed projection utility.
`app-prodn` owns the public/admin presentation and effective truth policy.

- source archive: `/mnt/HC_Volume_105319120/aoe2-replay-archive`;
- Engine Room jobs/reports/fixtures/backups/receipts:
  `/mnt/HC_Volume_105319120/aoe2-parser-engine`.

Next work is no longer “make 329 parse.” The exact saved-checkpoint identity
rail now accounts for 113 checkpoints linked to 98 recorded candidates while 89
remain unlinked. The frontier is safe reconciliation of remaining candidate
improvements, confidence scoring for experimental action fields, and semantic
advanced-stat derivation; continuation identity itself is never result truth.
