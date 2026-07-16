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

The original 336 failures were fully classified without changing their candidate status:

- 202 `.aoe2mpgame` saved-game containers require a format-specific or controlled-playback lane;
- 126 `.aoe2record` files hit header range-compatibility signatures and are candidates for an alternate/version-aware parser lane;
- 8 `.aoe2record` files reached the same HD body-stream termination signature and entered an isolated older-model compatibility lane.

The first bounded compatibility pass ran only those 8 exact hashes with an isolated `mgz==1.8.27` runtime. It completed 7 private candidates and left 1 structured failure, with the balanced equation `8 = 7 + 1 + 0`. It emitted 2,402 candidate observations and 103,170 raw actions, promoted zero observations, and changed no public or financial aggregate.

The latest immutable run per artifact now yields 1,696 candidate completions and 329 current failures across the 2,025-artifact frozen cohort. The remaining frontier is:

- 202 saved-game `.aoe2mpgame` containers in a controlled-playback/format-specific lane;
- 126 `.aoe2record` header-range failures in a version-aware parser lane;
- 1 `.aoe2record` body-stream termination artifact still requiring deeper compatibility or corruption proof.

The public recovery map uses the latest immutable run per artifact. Historical failures remain preserved and visible as historical signatures; a later compatibility success retires a current failure without rewriting the earlier run.

## Truth and confidence

Public result resolution uses the existing `resolveReplayWinnerTruth` policy plus effective commissioner adjudications. Team resolution reads explicit replay evidence and preserves team ID `0` as valid. Player order and aliases never create teams.

Confidence labels mean:

- **direct / verified**: decisive replay or accepted adjudication evidence under current public policy;
- **inferred / partial**: useful candidate evidence that is insufficient for automatic public promotion;
- **unknown / review**: the record lacks the required final or roster evidence.

Unknowns are shown by public owner/uploader, roster player, game type, and parse reason. Missing postgame fields remain missing; they never become zeroes. The newest unresolved records also state the evidence still needed.

Intentional save/rehost sessions are a separate presentation disposition when an actual replay `save` event exists without postgame, resignations, or a trusted result. They are not described as parser failures and are not sent to result review merely because the session was short.

## Parser engine separation

`api-prodn` and the replay engine own parse execution, archive receipts, job manifests, raw candidate outputs, and failure classification. `app-prodn` owns this public/admin projection and the truth-policy presentation. Candidate observations, even at high confidence, do not affect leaderboards, settlements, or public aggregates without a separate promotion or adjudication fact.

The production archive remains immutable-by-convention at `/mnt/HC_Volume_105319120/aoe2-replay-archive`. Parser manifests, candidate outputs, reports, fixtures, and backups remain under `/mnt/HC_Volume_105319120/aoe2-parser-engine`.

## Roadmap

Next parser work should prioritize a bounded alternate header/version lane for the 126 range failures, controlled playback research for the 202 saved-game containers, and deeper compatibility/corruption proof for the single remaining body-stream artifact. Promotion policy for safely supported v2 fields, deeper economy timelines, build-order events, combat/resource efficiency, and map-control observations follow. New statistics must publish their field path, provenance, confidence, and unknown policy before entering player or leaderboard truth.
