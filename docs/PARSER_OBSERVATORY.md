# Parser Observatory

## Public surface

`/game-stats` is the Parser Observatory and battle archive. It reports the live replay corpus, result/team coverage, unresolved ownership, parser versions, field observations, reprocess progress, failure signatures, recently decoded games, and battles still in the fog.

The public page is a read-only projection. It does not promote parser candidates or rewrite replay truth.

## Current corpus baseline

The production reconciliation completed on July 16, 2026:

- 2,025 archived replay artifacts;
- 2,050 parse runs across the initial sample and full v2 campaign;
- v2 job completed all 2,025 artifacts: 1,689 succeeded and 336 failed;
- 566,591 candidate observations and 1,022,487,954 bytes of candidate output;
- all candidate output remains excluded from public aggregates until an explicit promotion decision.

The page calculates current game counts and coverage from the live database at render time. It reports the bounded operational job state exactly rather than presenting an estimated progress bar.

## Truth and confidence

Public result resolution uses the existing `resolveReplayWinnerTruth` policy plus effective commissioner adjudications. Team resolution reads explicit replay evidence and preserves team ID `0` as valid. Player order and aliases never create teams.

Confidence labels mean:

- **direct / verified**: decisive replay or accepted adjudication evidence under current public policy;
- **inferred / partial**: useful candidate evidence that is insufficient for automatic public promotion;
- **unknown / review**: the record lacks the required final or roster evidence.

Unknowns are shown by public owner/uploader, roster player, game type, and parse reason. Missing postgame fields remain missing; they never become zeroes. The newest unresolved records also state the evidence still needed.

## Parser engine separation

`api-prodn` and the replay engine own parse execution, archive receipts, job manifests, raw candidate outputs, and failure classification. `app-prodn` owns this public/admin projection and the truth-policy presentation. Candidate observations, even at high confidence, do not affect leaderboards, settlements, or public aggregates without a separate promotion or adjudication fact.

The production archive remains immutable-by-convention at `/mnt/HC_Volume_105319120/aoe2-replay-archive`. Parser manifests, candidate outputs, reports, fixtures, and backups remain under `/mnt/HC_Volume_105319120/aoe2-parser-engine`.

## Roadmap

Next parser work should prioritize deterministic regression fixtures for the dominant truncated/range failure signatures, promotion policy for safely supported v2 fields, deeper economy timelines, build-order events, combat/resource efficiency, and map-control observations. New statistics must publish their field path, provenance, confidence, and unknown policy before entering player or leaderboard truth.
