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
- deterministic candidate output: 1,073,943,609 compressed bytes;
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

Next work is no longer “make 329 parse.” It is saved-checkpoint continuation
research, safe reconciliation of remaining candidate improvements, confidence
scoring for experimental action fields, and semantic advanced-stat derivation.
