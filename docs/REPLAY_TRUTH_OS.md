---
id: "aoe2war.app-prodn.docs-replay-truth-os"
title: "AoE2WAR Replay Truth OS"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-09-27"
review_interval_days: 30
sensitivity: "restricted"
---

# AoE2WAR Replay Truth OS

Replay Truth OS turns recurring replay-corpus forensic work into a governed,
read-only operator control plane.

Its north star is zero unexplained unknown replay truth. It does not weaken
evidence rules merely to reduce an unknown counter.

## Commands

`aoe2war truth status`

Shows local Replay Truth OS state without querying production. It preserves the
newest corpus census and newest contract audit even when later target-forensic
commands have written newer receipts.

`aoe2war truth census`

Runs the current production replay resolvers across every final GameStats row
and reports topology coverage, canonical two-team coverage, result coverage,
unknown participant results, recovery routing, parse-reason debt,
player-count debt, and the cross-layer contract state.

`aoe2war truth audit`

Runs the high-level replay-truth versus participant-result contract over the
entire final corpus.

The required invariants are:

- zero high-level statistics / participant W-L contract mismatches;
- zero incoherent scalar-authority rows.

`aoe2war truth target GAME_ID`

Shows a single replay's raw stored winner, effective truth, topology
classification, canonical two-team resolution, participant W/L, parse
provenance, current accepted normalized-stat projection, effective accepted
adjudication, exact routing class, and current blocker.

## Production safety

Census, audit and target are read-only production commands.

They:

1. connect through the protected root SSH operator boundary;
2. require the production Git worktree to be clean;
3. require the web service active;
4. require Wolo listeners 8092 and 8093 present before execution;
5. load the root-protected production environment without printing secrets;
6. export `AOE2WAR_PROD_DB_PREVIEW=true`;
7. require PostgreSQL itself to report both transaction and default transaction
   read-only mode;
8. run only read queries;
9. prove production source, service and Wolo listener state are unchanged
   afterward.

No Replay Truth OS V1.1 command performs database, projection,
adjudication, betting, settlement, claim, payout or Wolo mutation.

## Receipts

Successful live commands write local receipts under:

`.aoe2war-release/truth-receipts/`

The receipt records the production source, generated time, command, read-only
proof and result payload. It never records production credentials. Target
receipt filenames include the GameStats ID so independent target commands
cannot collide merely because they execute during the same UTC second.

## Coverage dimensions

Topology, canonical two-team resolution and result truth are separate
dimensions.

Replay Truth OS V1.1 reports:

- topology known;
- topology unresolved;
- unexplained topology debt;
- canonical/legacy two-team resolver coverage;
- result resolved;
- result unknown;
- unknown participant-results.

Topology means the replay's observed side structure, not winner authority.
Known topology may include balanced two-team games, uneven team games, FFA,
multi-side games and exact single-group observations.

Exact immutable parser-candidate evidence may establish topology through
`game.diplomacy` or complete direct-header `player.team_id` observations even
when the normalized public GameStats roster is incomplete or the canonical
balanced-team resolver correctly refuses the proposition.

Candidate-file reads are bounded to the immutable parser-output root and occur
only after the canonical team projection fails to establish topology.

An unresolved topology receives an operational recovery disposition. Missing
canonical source bytes route to `SOURCE_ARTIFACT_REQUIRED`; a replay with an
existing parser run whose evidence still cannot establish topology routes to
`PARSER_RESEARCH_REQUIRED`; an archived but not-yet-parsed source may route to
`REPARSE_REQUIRED`.

Current-parser exhaustion is scoped to immutable source bytes, not to the
historical `GameStats` row that happened to request a run. If the exact live
parser contract has already attempted the exact `replay_hash`, every
`GameStats` row bound to that SHA is considered parser-attempted even when the
append-only `ReplayParseRun.gameStatsId` points to a different historical row
or is absent. Deterministic `failed` runs also exhaust that exact parser
identity: rerunning identical bytes through identical parser/pass/schema
versions is not recovery work. Those cases route to parser research while the
source artifact remains available; they never grant result, statistics,
betting, settlement or Wolo authority.

A game is result-resolved only when the participant resolver produces a
complete coherent proposition containing at least one winner, at least one
loser and no unknown participant result.

Topology evidence never grants winner, statistics, betting, settlement,
financial or Wolo authority. Those authority lanes remain independently
governed.

## Workflow routing

V1.1 routes unresolved work into operator workflow classes including:

- `SOURCE_ARTIFACT_REQUIRED`;
- `PARSER_RESEARCH_REQUIRED`;
- `TEAM_EVIDENCE_REQUIRED`;
- `REPARSE_REQUIRED`;
- `RESULT_EVIDENCE_REQUIRED`;
- `HUMAN_REVIEW_REQUIRED`;
- `NON_BATTLE_CANDIDATE`.

These are workflow recommendations only. They never create replay truth.

Future versions may add candidate-confidence and artifact-availability evidence
to support `AUTO_RECOVERABLE`, external-evidence and irrecoverable queues.

## Cross-layer contract

A replay-truth source change is not complete merely because focused tests pass.

Production must preserve agreement between:

1. high-level `statsEligible` replay authority; and
2. complete coherent participant W/L projection.

`aoe2war truth audit` makes that production-wide proof repeatable.

## Historical repair boundary

Historical repair may improve W/L, records, streaks and Site Elo.

It must not directly redefine Watcher-owned current Steam DM rating.

Statistics authority remains independent from betting and Wolo authority.

## Targeted roster-only recovery

The internal `/api/admin/replay-roster-recovery` rail closes a narrower gap
than result adjudication: an exact current canonical parser run may contain
complete direct Steam/team/player-number evidence while the stored
`GameStats.players` roster remains too incomplete for later result policies to
consume.

The sealed historical `public_replay_roster_v2` campaign remains bound to its original Pass-8 parser identity. Current targeted recovery does not reuse or rewrite that frozen campaign contract; it consumes the live `HD_REPLAY_PARSER_CONTRACT` instead. Pass 9 added candidate-only terminal observations and Pass 10 added `terminal.saved_chapters`; both were additive to the roster-bearing observation paths used here.

The sealed historical campaign remains `public_replay_roster_v2`. Current
targeted recovery uses `public_replay_roster_v3`, which extends only the
topology envelope: an exact resolved two-team roster may be asymmetric
(`2v1`, `3v1`, `3v2`, `4v1`, `4v2`, or `4v3`) when each side has
1-4 players, the declared format/player count agrees with the two explicit
teams, and those teams cover the complete exact Steam roster. Odd player count
alone is never team evidence; FFA, missing-team, incomplete, conflicting, and
three-team shapes remain blocked.

The rail remains deliberately **roster-only**:

- source must be the exact current replay hash and canonical current parser contract (Pass 10 as of this release);
- only candidate observations with no public-aggregate authority are consumed;
- direct Steam identity and explicit replay/final team-ID provenance are
  required;
- finality, disconnect/desync, linked-market, linked-claim,
  accepted-adjudication and prior promotion boundaries are rechecked;
- every projected player winner flag must remain `null`;
- the complete public result-authority snapshot before and after roster
  projection must be identical;
- apply runs under a per-game advisory lock inside a SERIALIZABLE transaction;
- the only permitted mutations are one append-only `ReplayRosterPromotion`
  row and replacement of that GameStats row's `players` JSON;
- `affectsResults=false`, `affectsBets=false` and
  `settlementAuthority=false` are explicit ledger facts.

The append-only `replay_roster_promotions` ledger carries the same bounded V3
format envelope at the database layer. Its format CHECK permits exactly two-team
`1v2` through `4v4` combinations whose total roster size is 3-8, including
asymmetric `2v1`; ordinary `1v1` remains outside roster recovery. A source-level
format expansion is incomplete until this persistent CHECK contract advances through
the production-proven CHECK-replacement migration rail.

Dry-run is the default. Mutation requires `apply=1`, the protected internal
API key and the configured admin recovery actor.

Roster recovery never declares a winner. After an eligible roster repair, the
automatic terminal-result reconciler independently re-evaluates the game under
`replay-team-terminal-action-tail-v4`. V4 removes only the stale balanced-team
assumption: it still requires exactly two teams covering the exact roster,
exact Steam/player-number/team identity, exact parser resignation counts,
per-player action evidence, the existing resignation advantage and terminal
activity gaps, and no conflicting serialized result. It does not add a new
winner heuristic; an asymmetric game that cannot satisfy those existing proof
requirements remains under review.

V4 may consume the exact topology observation already bound to a
`public_replay_roster_v3` promotion when the historical
`GameStats.key_events.team_resolution` is stale. That substitution is permitted only after
re-validating the promotion against the current game, replay hash, persisted projected-roster
hash, candidate-only observation and exact current parser contract. The topology observation
is identified by canonical `fieldPath = "teams.resolution"`; producer-specific
`observationKind` labels are informational and do not grant or revoke authority.

If V4 then fails specifically at `parser_resignation_counts_missing`, it may consume only
`teams.resolution.result_evidence.resignation_counts_by_team` from that same exact promoted
observation. The bridge requires exactly two unique count rows whose team IDs and
`player_count` values match the promoted canonical topology; invalid or absent rows are not
derived or synthesized. No other promoted result metadata is copied. Historical result trust,
winner flags, candidate winner/team fields, resignation conclusion fields and sources remain
unchanged, and V4 independently cross-checks the counts against the serialized resignation
roster and raw player activity before applying its existing action-tail thresholds. A broken
binding or count mismatch remains fail-closed.


Historical sealed V2 campaign scripts remain immutable. The targeted rail does
not relax or reuse their campaign-specific manifest, plan or game-ID seals.

## Full-vault certainty closure

`aoe2war truth closure` complements the census by forcing every final game into
one explicit current-vault disposition. The closure distinguishes resolved
truth, reparse work, parser research, source-artifact absence, human
adjudication/evidence work, non-decisive rows, and candidate winners that are
not authoritative.

The closure target is **100% disposition accounting**, not manufactured winner
certainty. `UNPARSEABLE_FROM_CURRENT_VAULT` means the current vault does not
contain the source/candidate evidence needed for parser recovery; it does not
claim that missing bytes can be inferred. Candidate winners remain separate
from statistics/betting authority until the existing provenance rules permit
promotion.

The per-disposition game-ID manifests are the canonical handoff for bounded
parser/backfill campaigns. Parser work should target artifact-present reparse
and parser-research cohorts first; source-missing rows require evidence recovery,
not looser parsing.
