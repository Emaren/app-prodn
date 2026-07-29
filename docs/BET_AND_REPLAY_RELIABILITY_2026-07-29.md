---
id: "aoe2war.app-prodn.docs-bet-and-replay-reliability-2026-07-29"
title: "Bet and Replay Reliability Release — 2026-07-29"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "release-evidence"
reviewed_at: "2026-07-29"
review_interval_days: 0
sensitivity: "restricted"
---

# Bet and Replay Reliability Release — 2026-07-29

## Why Jim's bets stopped

The incident contained two different result classes:

- trusted 1v1 resignation results were blocked because the app-side structured
  winner adapter required at least two winning players, a condition that is
  valid for team winners but impossible for a duel;
- other final replay files were real archived battles but contained no trusted
  decisive result. Those books entered `under_review` and were excluded from
  automatic reconciliation, leaving signed stakes pending indefinitely.

A third ingestion problem amplified the backlog. The replay API authenticated a
watcher and then held that database transaction while CPU-bound binary parsing
ran in a worker thread. Concurrent upload bursts exhausted the async SQLAlchemy
pool and produced HTTP 500 responses before later uploads could be identified.

## Released contracts

### Winner and settlement lifecycle

- A trusted structured 1v1 result may contain exactly one winning player.
- A trusted final still has to match the frozen roster, side assignment, and
  proposition before the winner book can settle.
- An otherwise compatible final with no trusted coherent winner is not a team
  integrity contradiction. It enters the bounded final-proof grace rail.
- An expired proof grace voids the market and returns each original accepted
  stake exactly, with no fee, winner bonus, or fabricated result.
- Legacy automated review reasons are normalized before classification, so old
  books can recover onto the same lifecycle, including the historical
  120-character truncated `final_winning_team_…` evidence code.
- Detached watcher finals load the latest accepted replay adjudication. Only an
  adjudication that independently carries betting authority may override the
  preserved older parser result contract.
- A deterministic roster/proposition conflict remains visible in
  `/admin/market-integrity`; it is never converted into a guessed winner.
- Desync side books continue to follow their parent winner book. A voided parent
  voids the desync proposition; a proven parent opens the independent desync
  review window before `NO` can settle.

`/bets` now keeps three truths separate:

- **Payout proof** contains only markets whose settlement rail reports an
  executed payout/refund;
- **Settlement queue** contains known outcomes whose send is pending, partial,
  failed, or represented only by a financial correction;
- **Resolution queue** contains outcomes still awaiting trusted game proof.

An `under_review` card is no longer presented under a `Settled` heading, a
failed send is never called payout proof, and a review-market slip is grouped
under `Awaiting Verdict` instead of open positions.

### Replay ingestion

Watcher identity lookup and `last_used_at` persistence now commit before binary
replay parsing starts. The session can release its connection while the parser
worker runs and reacquire one only for short persistence work. Upload bytes,
archive verification, parse evidence, and finality semantics are unchanged.

### Public stats and rivalries

`/matchups` and `/game-stats/[id]` use the same canonical rivalry builder over
the complete stored final-replay corpus. Their invariant is:

```text
opposing meetings = left wins + right wins + unresolved
```

Unresolved replays remain visible without being turned into losses. Public
player win/loss projection also requires canonical stats eligibility; a raw
legacy winner flag cannot bypass the replay truth resolver.

Production planning identified 538 current accepted projections created from
the rejected
`watcher_inferred_opponent_win_on_incomplete_1v1` path. The bounded repair mode
appends unresolved successors without editing history, changing betting
authority, or moving WOLO. Current public pages read these projections live, so
no aggregate-table rebuild is required.

### Time display

Timestamp instants are stored and transported as canonical ISO/UTC values.
User-facing rendering starts with the current browser timezone. UTC remains the
deterministic server/hydration fallback and the secondary inspection value.
Plain civil dates retain their own non-timezone semantics.

### WOLO supply

`/api/wolo/network` reads the canonical `uwolo` supply from WoloChain and
reports the known-address balance sum separately. The address map includes the
Workshop sponsorship recipient proven by two confirmed 100 WOLO transfers.
The fixed supply is not hard-coded from an app-side balance guess.

## Operational checks

After deployment:

1. Confirm web and replay API source parity, service health, and zero pending
   Prisma migrations.
2. Trigger the ordinary bet-board reconciliation and let the existing
   idempotent payout rail process winner payouts or exact void refunds.
3. Recheck active wager counts, `awaiting_final_proof`, `under_review`, payout
   failures, and tx hashes. A terminal app row is not chain proof until its
   settlement attempt succeeds.
4. Confirm replay API logs no longer show connection-pool exhaustion during an
   upload burst.
5. Verify Jim's grouped-bet ledger, `/bets`, the named matchup/game detail, and
   browser-local timestamps in a real browser.
6. Verify `/api/wolo/network?format=table` reports WoloChain supply and a
   reconciled known-address total.

## WoloChain upgrade decision

This release does not require a consensus upgrade. WoloChain remains healthy,
and the node's preserved pre-War-Trophy binary versus newer isolated settlement
binary is an intentional production boundary. Never rebuild the consensus node
merely to match the source checkout. A future chain-upgrade prompt is warranted
only by a separately proved chain/runtime defect and an explicit coordinated
upgrade plan.
