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
reviewed_at: "2026-09-04"
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
