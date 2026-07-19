# Challenge System

## Ownership

AoE2HDBets owns the Challenge aggregate, its lifecycle, presentation, notifications,
and the decision to request a refund or settlement. WoloChain owns WOLO custody and
transfer truth. Replay/API proof owns match finality. A Challenge record must never
claim that money moved merely because the app expected it to move.

## Current model before the July 2026 lifecycle pass

The existing lifecycle is driven by one required `scheduledAt` value:

`proposed -> creator_funded -> accepted -> funded -> check-in -> live -> completed`

with terminal branches for `declined`, `canceled`, and the three no-show states.
That timestamp currently means all of the following at once:

- the opponent response deadline;
- the exact match start;
- the check-in/no-show deadline;
- the replay matching anchor;
- the spectator market close time.

The old system has no acceptance expiry, no accepted-but-unfunded expiry, and no
automatic refund worker. Read requests can also perform lifecycle reconciliation.
Settlement transfers are safely idempotent, but the collapsed user-facing state is
derived from the match status instead of confirmed settlement rows. This can leave
`Refund due` visible after a refund has actually executed.

## Canonical model

`ScheduledMatch` remains the aggregate root and is presented as one Challenge
Record. The name is retained for database compatibility. It has three independent
time concepts:

- `acceptanceExpiresAt`: how long the invitation may be accepted;
- `fundingExpiresAt`: the short deadline after acceptance to finish funding;
- `scheduledAt`: an optional, mutually understood exact match time.

An open, fully funded challenge also receives `playExpiresAt`. The default play-anytime
window is 30 days so funded records cannot become permanent zombies. Both players may
still propose and confirm an exact time during that window.

All timestamps are stored in UTC. Human Challenge surfaces show browser-local time
first and UTC second.

### Lifecycle axis

```text
proposed
  | accept                    | decline             | acceptance deadline
  v                           v                     v
accepted -----------------> declined              expired
  | both deposits             |                     |
  |                           +----------+----------+
  | opponent funding deadline           |
  v                                      v
funded / ready                   funding_expired
  | exact time confirmed                |
  v                                     |
scheduled                               |
  | replay/watch proof                  |
  v                                     |
live -> result_pending -> completed      |
  |                                     |
  +---- cancellation / play deadline ---+--> terminal resolution
```

Existing no-show states remain available only for a confirmed exact schedule. An
open challenge can never enter check-in or no-show merely because its invitation
deadline passed.

Terminal lifecycle states do not reopen automatically:

- `declined`
- `expired`
- `funding_expired`
- `play_expired`
- `canceled`
- `completed`
- `no_show_left`
- `no_show_right`
- `double_no_show`

### Financial axis

Financial state is projected independently from verified deposits and
`ScheduledMatchSettlement` rows:

```text
unfunded -> creator_locked -> fully_locked
                         \-> refund_due -> refund_processing
                                           | success
                                           v
                                        refunded
                                           ^
                                           | retry
                                      refund_failed
```

`refunded` requires every required transfer row to be `executed` with a transaction
hash. A terminal lifecycle status alone can only produce `refund_due`. Game result
truth and financial settlement truth are deliberately separate.

The existing no-show settlement rail is canonical: wager deposits are returned, the
checked-in player's own guarantee is returned, and the missed player's guarantee is
awarded to the checked-in opponent. Double no-show sends both guarantees to the
Community Treasury. UI copy must match these executable rules.

## Invariants

1. Acceptance expiry and exact match time are never the same field.
2. No check-in, no-show, or spectator-market close is derived without an exact time.
3. Both verified deposits are required for Match Ready.
4. Funding proof is based on a confirmed WoloChain transfer with the exact Challenge
   memo, side, sender, escrow recipient, and amount.
5. One funding transaction cannot fund more than one Challenge side.
6. A funded exact-time change requires proposal and confirmation by the other player.
7. Terminal lifecycle states cannot reopen automatically.
8. Executed transfers cannot exceed verified Challenge deposits.
9. Refund retries use stable request IDs and cannot create a second transfer.
10. Lifecycle event retries use stable event keys and cannot create duplicate events.
11. Active/history classification uses canonical lifecycle and financial state, not
    proximity to a timestamp.
12. Basic, Advanced, and Extreme consume the same aggregate and state machine. They
    change disclosure and presentation only.
13. RAW output exposes sanitized audit evidence, never secrets or internal server
    configuration.

## Expiry and reconciliation

Expiry runs in a protected worker, never as a side effect of a page GET. Each due
record is claimed under a database advisory lock and compare-and-swap lifecycle
version. The worker:

1. transitions the record to `expired`, `funding_expired`, or `play_expired`;
2. appends one keyed lifecycle event;
3. marks funded records settlement-ready;
4. builds the existing deterministic full-refund plan;
5. optionally executes it when production auto-refund execution is explicitly
   enabled and the Bet Escrow dry-run proves the signer, source, recipient, and amount;
6. records confirmed tx hashes or an honest retryable failure.

The protected endpoint may be called repeatedly. Advisory locks, lifecycle versions,
unique event keys, unique transfer keys, and deterministic WoloChain request IDs make
the run idempotent.

## Challenge Record projection

The collapsed card is the default human story and includes:

- participants and title stakes;
- wager, guarantee, and each player's total lock;
- the current lifecycle headline and the viewer's one best action;
- acceptance, funding, play, or exact-time context;
- real refund/payout state derived from settlement proof;
- event and chain-transaction counts.

Expansion lazily requests one record's chronological human timeline. RAW is a second,
explicit disclosure containing persisted event IDs/types, safe metadata, deposit and
settlement transaction hashes, request IDs, amounts, recipients, and failure state.
Synthetic display hints are never presented as RAW evidence.

The Hall loads active summaries and a small first history page. History uses cursor
pagination. It does not preload every event for every historical record and it does
not run one countdown interval per card.

## Product modes

- Basic: rival, stakes, three-day window, optional callout, send.
- Advanced: window choices, optional exact scheduling, and custom terms.
- Extreme: the same flow with title stakes, invitation theatre, and richer record/RAW
  disclosure.

There is one URL-driven mode. The composer and record cards may not maintain a second
contradictory B/A/E selection.

## Legacy rollout

Existing rows are backfilled as `scheduleMode=exact` and preserve their exact
`scheduledAt`. No historical acceptance deadline is invented. New rows default to an
open 72-hour invitation and nullable exact time. Historical financial state is
reconciled from deposits, settlement rows, and chain proof before any repair.

Production schema changes use `prisma migrate deploy`. Database and WoloChain
settlement-state backups are taken and verified before migration or money movement.
