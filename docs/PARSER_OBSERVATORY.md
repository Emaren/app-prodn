---
id: "aoe2war.app-prodn.docs-parser-observatory"
title: "Parser Observatory"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-07-28"
review_interval_days: 60
sensitivity: "internal"
---

# Parser Observatory

## Current corpus census — 2026-07-28

The current production metrics use several deliberate denominators:

| Metric | Count | Grain |
| --- | ---: | --- |
| Final replay records | **3,011** | final watcher/upload `GameStats` rows |
| Public battle records | **2,784** | final rows accepted by the War Vault public filter |
| Unique logical public battles | **2,778** | public rows deduplicated by `publicReplayIdentity` |
| Indexed parser artifacts | **2,093** | unique content-addressed Engine Room artifacts |
| Recorded-game candidates | **1,891** | indexed artifacts excluding saved checkpoints |
| Saved checkpoints | **202** | parseable non-final `.aoe2mpgame` artifacts |
| Latest parser failures | **0** | failed latest indexed candidate dispositions |
| Confirmed irrecoverable artifacts | **0** | explicit terminal irrecoverable dispositions |

The equation `3,011 - 227 = 2,784` explains the two public “game” counts.
All 202 saved checkpoints are already inside the 227 excluded final records;
they are not an additional subtraction. The equation
`2,784 - 6 = 2,778` applies the app’s public replay presentation identity.

The physical archive contains 7,990 file paths. Only 2,093 unique artifacts are
currently indexed, leaving 5,897 physical files unindexed or unclassified.
That remainder is not confirmed junk.

The public page obtains the physical-file census from a bounded recursive scan
of the immutable archive and caches it for one hour. Database metrics refresh
every five minutes. The page prints both generation and archive-scan times so
operators can distinguish a real zero from unavailable or stale storage
telemetry.

See [Replay Corpus and Public Metric Contract](REPLAY_CORPUS_METRICS.md) for
the complete definitions, parser-mode census, identity denominators, equations,
and irrecoverable-evidence rule. These values are a dated runtime snapshot and
must be read dynamically by public surfaces.

## Public surface

`/game-stats` is the public Parser Observatory and battle archive. It reports
live effective result/team coverage separately from private Engine Room
candidate coverage. The page is read-only: it cannot promote candidates,
adjudicate games, settle markets, or change chain history.

## Historical Campaign III production checkpoint

The frozen 2,025-artifact cohort was fully accounted as of July 17, 2026. This
section preserves that campaign receipt; it is not the current corpus total:

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
schema: 2026-07-25.1
pass: hd_deterministic_evidence
pass version: 8
```

The isolated `mgz 1.8.27` lane remains compatibility evidence. It never became
the production parser. The Observatory pins its contract tile to
`HD_REPLAY_PARSER_CONTRACT`, rather than whichever run finished most recently.

Pass 8 adds exact queryable per-player recorded-action observations while
retaining the complete candidate action stream. Numeric zero remains an
observation; unavailable evidence remains absent. Statistic eligibility is
separate from result and betting eligibility, so an unresolved final may still
display accepted result-independent metrics without becoming winner or money
truth.

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

<!-- AOE2WAR:PUBLIC_VERDICT_TRAIL_20260722:START -->
## Public Verdict Trail and Evidence Passes — 2026-07-22

The Parser Observatory now has two connected public surfaces:

- `/game-stats/[id]` — public battle record with one collapsed Verdict Trail.
- `/game-stats/[id]/review` — full public read-only Parser Observatory.

Both surfaces use the canonical `ReplayVerdictTrail` presentation.

The newest immutable assessment may be:

- a replay-only parser pass;
- a screenshot Evidence Pass;
- or an explicit human adjudication in the provenance history.

These sources remain distinct.

### Battle #18714 production proof

The current newest immutable assessment for battle `#18714` is:

- Evidence Pass `#2391`
- parser `aoe2war.screenshot_vision`
- parser version `1.0.0`
- pass `postgame_evidence`
- pass version `1`
- status `completed`
- 73 observations
- six human-supplied screenshots
- eight of eight assessment categories observed
- `candidateOnly = true`
- `affectsPublicAggregates = false`

Assessment confidence:

- Team Composition: 96.5%
- Winner / Loser: 96%
- Score: 99%
- Military: 99%
- Economy: 99%
- Technology: 99%
- Society: 99%
- Timeline: 98.6%

### Public inspection contract

Anonymous visitors may inspect:

- battle result context;
- replay parser history;
- screenshot Evidence Passes;
- category confidence;
- screenshot evidence;
- full provenance history.

Anonymous visitors cannot:

- assign teams;
- choose a winner;
- write decision notes;
- lock or correct a result;
- upload screenshots;
- run screenshot analysis;
- run the replay parser.

Public visibility does not confer authority.

### Human participation marker

The small human marker reports provenance participation:

- `Human verdict`
- `Human-supplied evidence`
- `Human verdict and human-supplied evidence`

Uploading screenshots does not create a human adjudication.

Battle `#18714` currently has six human-supplied evidence artifacts and no requirement to mislabel them as a human verdict.
<!-- AOE2WAR:PUBLIC_VERDICT_TRAIL_20260722:END -->
