# Commissioner Replay Result Review

## Purpose and product posture

Replay review keeps the public HD battle record moving without turning a parser
guess into settlement truth. The public product should lead with the battle,
players, teams, map, timing, and a confirmed winner whenever one exists. Raw
parser failures, confidence internals, and evidence conflicts belong in private
review and operator surfaces rather than public cards.

This is not permission to manufacture a winner. When automatic evidence is not
strong enough, the game is preserved and routed quickly to an authorized human.
An accepted review verdict then becomes the effective public/stats result while
the original parser row remains intact.

See [HD Replay Truth Pipeline](./HD_REPLAY_TRUTH_PIPELINE.md) for ingestion,
archive, parser, backfill, and deployment operations.

## Surfaces and access

- `/game-stats/[id]/review` is the neutral per-game result editor. **Review
  Result** links should point here from game details, battle feeds, and private
  review queues.
- `/admin/replay-review` remains Emaren's triage queue for parser evidence,
  watcher timing, linked markets, slips, claims, and settlement breadcrumbs.
- `GET /api/replay-results/[id]/adjudications` loads authorized review state and
  the immutable verdict history.
- `POST /api/replay-results/[id]/adjudications` appends a verdict or correction.

Server authorization is capability- and submission-based:

- a site admin may review every game;
- a non-admin must have `User.canReviewOwnReplayResults = true` **and** exact
  ownership evidence: either `GameStats.userUid` or a linked
  `ReplayParseAttempt(gameStatsId, userUid)` proving that account submitted the
  game;
- Jim and Julio receive that capability in the initial migration;
- uploader display names and mutable `GameStats.userUid` are not sufficient
  authorization by themselves.

Do not hardcode reviewer names or UIDs in route logic. Future trusted uploaders
must be enabled through the same capability plus exact per-game ownership evidence.

## Four truth layers

Keep these layers separate in code, operator language, and incident reports.

1. **Raw parser evidence**
   - `game_stats`, canonical players, key events, parse source/reason, replay
     hash, parse iteration, and parse attempts.
   - Immutable historical evidence even when a later parser or human finds a
     better answer.
2. **Replay adjudication ledger**
   - Append-only human decisions in `replay_result_adjudications`.
   - Stores exact teams, complete winning team, actor snapshots, reason,
     evidence, source hashes, raw parser snapshot, and money snapshot.
3. **Effective public/stats result**
   - The accepted result projected into profiles, battle details, rivalry
     records, and public archives.
   - May prefer the newest valid accepted adjudication over raw parser flags.
4. **Betting and settlement history**
   - Frozen proposition, stakes, slips, payout attempts, claims, refunds,
     integrity incidents, and chain breadcrumbs.
   - Never rewritten by the replay-adjudication ledger.

## Append-only verdict contract

`ReplayResultAdjudication` records:

- the reviewed `gameStatsId` and actor identity/role snapshots;
- exact canonical `teamAssignments`, `winningTeamKey`, and
  `winningPlayerKeys`;
- reason and optional structured evidence;
- replay hash, parse iteration, roster hash, and proposition hash;
- raw parser and point-in-time market/financial snapshots;
- `decisionStatus`, `financialDisposition`, `affectsStats`, and `affectsBets`;
- an idempotency key and optional `supersedesId`.

Database constraints and a trigger reject `UPDATE` and `DELETE`. A correction
is a new row naming the verdict it supersedes. The route also rejects stale
replay, parser iteration, roster, or proposition hashes so an old browser
cannot overwrite newer evidence.

Every verdict must assign every canonical player exactly once, preserve valid
team ID `0`, and name one complete team as the winner. Player order and aliases
never assign teams. A single named winner is not valid team-game truth.

## Acceptance and approval behavior

| Reviewer | Linked market | Stored decision | Public/stats effect | Betting effect |
|---|---|---|---|---|
| Site admin | No | `accepted` | Immediate effective projection | None |
| Site admin | Yes | `accepted` | Immediate effective projection | None; separate operator rail |
| Verified submitter | No | `accepted` | Immediate effective projection | None |
| Verified submitter | Yes | `pending_admin_approval` | None until admin review | None |

Admin approval of a submitter proposal is another accepted append-only verdict,
normally superseding the pending proposal. It is not an update to the proposal.

`affectsBets` is database-constrained to `false`. The review API never mutates a
market, wager, claim, refund, payout, or chain record. A money-linked correction
sets `financialDisposition = operator_review_required` and sends the operator
to the existing market-integrity or settlement rail.

## Public presentation versus private evidence

Public presentation should feel complete and confident without making false
claims:

- show a full winning team whenever parser evidence or an accepted verdict
  supports it;
- never reduce a team victory to one scalar winner name;
- lead with strong known facts: roster, teams, map, date, duration, civilization,
  and replay provenance;
- when a winner is not yet accepted, present the preserved battle record rather
  than public labels such as `unknown`, `unresolved`, `parser failed`, or a
  confidence percentage;
- keep parser codes, rejected inferences, conflict details, confidence/evidence
  breakdowns, stale-hash errors, and financial snapshots private;
- never convert a missing value into zero or a guess merely to fill space.

Recommended public phrases include **Battle filed**, **Replay preserved**, and
**Result confirmed**. Private operator surfaces may use precise states such as
`result_resolved`, `result_trusted`, `review_routed`,
`pending_admin_approval`, and `betting_eligible`.

## Betting and repair policy

The result editor corrects game truth; it does not settle or repair money.

- If no market is linked, an accepted verdict may update only the effective
  public/stats projection.
- If a market is linked, capture and inspect its frozen proposition, wagers,
  claims, integrity incidents, and terminal-money state.
- If corrected teams differ from a frozen proposition after the first stake,
  use `/admin/market-integrity`. Do not rewrite the original market sides.
- A team-integrity void returns exact original stakes with zero fee/bonus and
  preserves all chain and adjustment history.
- A paid, refunded, voided, claimed, or rescinded outcome remains terminal. A
  later public correction does not claw back, re-pay, or reopen it.
- A late final remains evidence only for a terminal void/refund and cannot
  resurrect the market.
- Retry failed/retryable payouts only from the existing settlement rail.

Use [Team Market Integrity](./MARKET_TEAM_INTEGRITY.md) for financial incidents.
One-time market repairs must retain their existing dry-run, exact-precondition,
backup, audit, and explicit-confirmation safeguards.

## Operator playbook

1. Open `/admin/replay-review`, or follow **Review Result** to
   `/game-stats/[id]/review`.
2. Confirm the replay hash, parse iteration, complete canonical roster, explicit
   team evidence, map, duration, uploader, and source file.
3. Review direct evidence before inference: postgame/scoreboard, full losing-team
   resignation, explicit lobby teams, event timeline, and watcher finality.
4. Assign every player exactly once and select one complete winning team.
5. Read the money snapshot before submitting. If Jim or Julio is correcting a
   money-linked game, expect `pending_admin_approval`.
6. Enter a concise reason and attach structured evidence when useful. Submit
   once with a stable idempotency key.
7. If history already exists, append a correction with `supersedesId`; never
   edit or delete an earlier verdict.
8. Confirm that the accepted public projection shows every winning teammate and
   that the raw parser row remains unchanged.
9. If money action is required, leave the adjudication ledger and follow the
   appropriate market-integrity/refund/settlement workflow.

## Watcher evidence language

Watcher HTTP success proves only that a request succeeded. The API now separates
archive, parse, result, and settlement facts. In particular,
`final_recorded*` means final bytes and candidate data were preserved but the
result was not authorized for automatic settlement. Only `trusted_final*` or
`reviewed_match*` with `should_settle = true` may enter the settlement path.

Useful private diagnostics include:

- `final_candidate_deferred` — file cooling or result proof not ready;
- `parse_pending` — parser work has not completed;
- `parse_result_unknown_fields` — candidate stored with incomplete result
  evidence;
- `final_candidate_accepted` — artifact/candidate accepted, not automatically a
  trusted winner;
- `replay_detected_ignored` — duplicate watcher event.

These details support review. They do not establish public or betting truth by
themselves.
