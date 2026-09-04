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
and reports team coverage, result coverage, unknown participant results,
routing cohorts, parse-reason debt, player-count debt, and the cross-layer
contract state.

`aoe2war truth audit`

Runs the high-level replay-truth versus participant-result contract over the
entire final corpus.

The required invariants are:

- zero high-level statistics / participant W-L contract mismatches;
- zero incoherent scalar-authority rows.

`aoe2war truth target GAME_ID`

Shows a single replay's raw stored winner, effective truth, team resolution,
participant W/L, parse provenance, current accepted normalized-stat projection,
effective accepted adjudication, exact routing class, and current blocker.

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

No Replay Truth OS V1 command performs database, projection, adjudication,
betting, settlement, claim, payout or Wolo mutation.

## Receipts

Successful live commands write local receipts under:

`.aoe2war-release/truth-receipts/`

The receipt records the production source, generated time, command, read-only
proof and result payload. It never records production credentials. Target
receipt filenames include the GameStats ID so independent target commands
cannot collide merely because they execute during the same UTC second.

## Coverage dimensions

Team composition and result truth are tracked independently.

The census distinguishes:

- team resolved;
- team unknown;
- result resolved;
- result unknown;
- both resolved;
- both unknown;
- unknown participant-results.

A game is result-resolved only when the participant resolver produces a
complete coherent proposition containing at least one winner, at least one
loser and no unknown participant result.

Canonical balanced 1v1 through 4v4 team resolution is recognized.

Team-composition coverage is intentionally independent from result authority.
When a larger final roster has unique player identities, complete explicit team
IDs and exactly two observed teams, Replay Truth OS may count the composition as
known even when no result resolver can lawfully identify the winner.

This diagnostic composition state does not grant statistics or betting
authority. The stronger explicit uneven-team result lane remains separately
responsible for proving winner/loser truth.

## Workflow routing

V1 routes unresolved work into operator workflow classes including:

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
