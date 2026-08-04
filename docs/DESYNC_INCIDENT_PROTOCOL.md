---
id: "aoe2war.app-prodn.docs-desync-incident-protocol"
title: "Human-Confirmed Desync Protocol"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "domain-contract"
reviewed_at: "2026-08-04"
review_interval_days: 60
sensitivity: "internal"
---

# Human-Confirmed Desync Protocol

## The three independent facts

AoE2WAR records a replay desync independently from both the competitive result
and money/custody settlement:

| Axis | Human-confirmed desync value |
|---|---|
| Incident truth | `desyncOccurred = true` |
| Competitive result | `competitiveResultStatus = unresolved` |
| Settlement disposition | `commissioner_review`, later `rematch` or `void_refund` |

A desync never creates a winner. `rematch` means a distinct later `GameStats`
record may establish competitive truth; it does not rewrite the original replay.
`void_refund` means the commissioner requested the existing authenticated
settlement rail. It is not evidence that any refund was paid.

## Provenance contract

`ReplayDesyncIncident` is an append-only human ground-truth ledger. Each row
stores the `GameStats` association, linked `ScheduledMatch` when one can be
proved, reviewer user/UID/display-name snapshots, source replay hash and parse
iteration, timestamp, optional note, parser candidate snapshot, and all three
axes above.

- The first true row must enter `commissioner_review`.
- A rematch or void/refund decision appends a superseding true row.
- A mistaken confirmation appends `false + not_applicable + not_applicable`.
- PostgreSQL rejects update, delete, and truncate operations on this ledger.
- Stable idempotency keys return the original append; a conflicting reuse or a
  stale `supersedesId` is rejected.

The raw parser run, screenshot/evidence chain, result adjudication, and desync
incident remain separately attributable in the Verdict Trail. Machine evidence
such as `disconnect_detected`, desync/disconnect parse reasons, or replay events
is only `parserDesyncCandidate`; it never becomes human truth automatically.


<!-- AOE2WAR:TERMINAL_RESULT_DESYNC_BOUNDARY_V3:START -->
## Automatic terminal-result boundary

The homepage/lobby `DESYNCED` headline is controlled by the latest effective
append-only human incident, not by `disconnect_detected` alone. Parser
disconnect/desync fields remain candidate evidence and may still keep an
unresolved parser projection out of ordinary trusted-result handling.

The automatic final-1v1 action-tail policy independently checks the effective
human incident state. `desyncOccurred = true` is a hard blocker. When no current
human-confirmed incident exists, generic disconnect metadata may coexist with a
stats-only action-tail result if every roster, finality, activity, receipt, and
failure fence passes. That result does not erase or relabel the original parser
candidate evidence and never creates financial authority.
<!-- AOE2WAR:TERMINAL_RESULT_DESYNC_BOUNDARY_V3:END -->

## Challenge projection

When a confirmed incident has a proven `ScheduledMatch` link, the app projects
the immutable incident into the mutable Challenge workflow:

1. Append `desync_human_confirmed` to the exact Match # action chronology.
2. Put the match, unresolved title challenges, and safe linked winner market in
   commissioner review without manufacturing a winner.
3. Deliver a reserved Challenge Protocol card to both duelists and notify the
   commissioner. Ordinary chat authors cannot forge the reserved card shape.
4. Block scheduled-match winner transfers, ordinary left/right BetMarket
   payouts, and title/belt/artifact custody effects at their server call sites.
5. Offer admin-only **Rematch** and **Void & Refund** actions in the exact room.

Rematch preserves existing participant funding, clears stale check-in/session
and winner projections, schedules a new time, and requires a distinct later
replay before winner-dependent effects are allowed. Void/refund moves the match
to the canceled refund path and invokes only the existing idempotent scheduled
settlement executor. UI and notifications say queued until persisted execution
and chain/payment proof say otherwise.

The append-only incident is the authority; Challenge rows are a retryable
projection. Replaying an identical request may repair an incomplete projection
without duplicating the incident, action row, participant cards, or settlement
request.

## Parser evaluation and future side market

The current parser already emits candidate signals including
`disconnect_detected`, parse reason, event types, and key-event flags. A future
offline evaluation should join the latest effective human incident per
`gameStatsId` to immutable parser-run evidence, then report candidate true/false
positives and false negatives by parser version and parse iteration. Corrections
must be respected by selecting the latest append while retaining historical
labels for audit.

TODO(desync-side-market): later create a separate binary proposition, **Will
Match #X desync? YES / NO**, whose settlement evidence consumes effective human
desync truth. It must not share or rewrite the ordinary match-winner proposition
or use a commissioner rematch/refund disposition as a proxy for YES/NO truth.

## Deployment

Before application code that queries this ledger is restarted in production:

1. deploy migration `20260722203000_add_replay_desync_incidents` with
   `npx prisma migrate deploy`;
2. verify `replay_desync_incidents`, its indexes/constraints, and append-only
   triggers exist in production PostgreSQL;
3. build and restart the web service;
4. verify public provenance GET, admin-only append, a linked Challenge review
   projection, and settlement/title dry-run blockers before using the control on
   a live funded match.
