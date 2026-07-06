# Commissioner Replay Review

The operator queue lives at `/admin/replay-review`. It is protected by the
shared `/admin` server layout and reads final replay evidence, parser reasons,
watcher timing, linked betting markets, slips, claims, and settlement
breadcrumbs in one place.

## Current safety mode

The current Prisma schema has no replay-adjudication table. The existing
`lib/replayAdjudications.ts` mechanism is a reviewed, in-code public/stats
overlay. It deliberately does not change `game_stats.winner`, markets, wagers,
claims, or settlement history.

For that reason the queue is read-only:

- Approve left side — disabled, storage pending
- Approve right side — disabled, storage pending
- Approve a named player — disabled, storage pending
- Void / Refund — disabled, storage pending
- Keep under review — disabled, storage pending

Do not turn these controls into API mutations until durable adjudication
storage and an audited authorization/event trail exist. In particular, do not
write a verdict into the raw parser row as a shortcut.

## Four truth layers

Keep these layers separate in code, operator language, and incident reports.

1. `parser_result`
   - Raw `game_stats` fields, player flags, key events, parse source/reason, and
     replay attempts.
   - Preserved even when incomplete or wrong.
2. `commissioner_verdict`
   - A reviewed result with actor, reason, evidence snapshot, and timestamp.
   - Currently represented only by the static overlay for exceptional recovered
     rows.
3. `public_result`
   - What profiles, game stats, live games, and public archives display.
   - May prefer a valid commissioner verdict over rejected parser inference.
4. `settlement_result`
   - What happened to slips and money: awaiting verdict, settled, paid,
     refunded, failed/retryable, or wallet-link pending.
   - Never silently rewritten because public truth changed later.

Wrong winner is worse than unresolved. Unsafe incomplete 1v1
uploader/opponent inference is a candidate, not proof.

## Betting lifecycle

The public and operator lifecycle is:

`Open → Slip locked → Final proof → Awaiting verdict → Settled → Paid / Refunded`

Rules:

- If the parser proves a winner before settlement, use the existing settlement
  path.
- If final proof cannot prove the winner and slips exist, show **Awaiting
  Verdict**. Do not manufacture a winner.
- A safely stored commissioner verdict may later make the result eligible for
  the existing settlement path. It must not bypass that path.
- A commissioner void may use an existing audited refund/void path only after
  durable storage exists. The review UI must not invent a new payout path.
- If a market is already refunded or voided, preserve that money state. A late
  public verdict does not claw back or re-pay funds.
- If a payout is already recorded, never alter it without a separate explicit,
  audited manual-override workflow.

The queue exposes:

- No market attached
- Market attached, no slips
- Slips attached, awaiting verdict
- Settlement waiting
- Refund recorded
- Paid
- Settlement failed / retryable
- Wallet link pending
- Payout reserve / funding issue

## Operator playbook

1. Open `/admin/replay-review`, or use **Review Result** on an admin
   `/live-games` Parser Review card.
2. Confirm the roster, teams, map, duration, uploader, and stable replay
   evidence.
3. Read the raw candidate and the reason it was rejected. A stored name is not
   automatically reliable.
4. Review parse attempts and watcher events:
   - `final_candidate_deferred` can mean the replay was still cooling down.
   - `parse_pending` means the final parser result had not landed.
   - `parse_result_unknown_fields` means parsing completed without enough
     roster/winner truth.
   - `final_candidate_accepted` confirms acceptance, not necessarily a winner.
   - `replay_detected_ignored` records a duplicate replay event.
5. Read the money-state card before considering a verdict. Paid/refunded state
   is a hard safety boundary.
6. Until storage is added, document the evidence and create a reviewed static
   overlay only through a separately reviewed code change. Do not edit the raw
   row.
7. Retry a payout only from the existing settlement/operator rail when its
   status explicitly says failed/retryable. Do not retry from replay review.
8. Do not rescind an auto-settled or already-paid outcome from this surface.

## Recovery diagnostics

The queue includes every recent `is_final` row whose winner truth is not
stats-eligible. For each row it reports whether the app can extract:

- roster and side candidates
- map
- duration
- a stored or flagged winner candidate
- decisive postgame, score, achievement, resignation, or completion signals
- stable replay/parse attempts
- final-candidate, cooldown, unknown-field, or duplicate watcher events
- linked market, slips, claims, and settlement state

Use the game-id filter (`/admin/replay-review?gameId=10252`) for a direct
operator handoff. The known Tell3z/Emaren case remains an example of a rejected
incomplete-uploader inference with a separate commissioner public/stats
overlay. The queue should likewise expose current MuppeT390, CN-强哥, and Jim
rows when their final records remain unresolved; it does not special-case
those names.

## Required storage before enabling actions

A future migration should be designed and reviewed separately. A minimum
append-only adjudication record needs:

- `game_stats_id`
- optional `market_id`
- verdict kind: winner side, winner player, keep-under-review, or void request
- selected side/player identity
- adjudicating admin user id/uid
- reason and evidence note
- raw parser winner/source/reason snapshot
- money-state snapshot
- created timestamp
- supersession/revocation reference rather than destructive updates

The write route must:

- require server admin authorization
- be idempotent and audited
- preserve raw replay rows
- never mutate money directly
- reject automatic changes to paid/refunded markets
- pass only eligible unsettled verdicts into the existing settlement service

No action should be enabled merely because the UI can render the candidate.

## Watcher timing follow-up

The current app can diagnose timing from `watcher_client_events` and
`replay_parse_attempts`, but it does not yet have one canonical final-proof
timeline object. A later watcher/API change should persist, per final
candidate:

- file hash and size at each stability check
- cooldown start/end
- accepted final copy/hash
- parse start/end
- parser outcome and unknown fields
- duplicate/alias decision
- accepted `game_stats_id`

That change belongs in a separate parser/watcher review and deployment. This
app-only queue does not change the watcher service.

