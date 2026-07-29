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

- **Settlement proof** contains resolved books with complete bettor-liability
  proof, including paid winners, exact refunds, loss-only books where no bettor
  payout was due, and completed financial corrections;
- **Settlement queue** contains known outcomes whose send is pending, partial,
  or failed for a real bettor payout/refund;
- **Resolution queue** contains outcomes still awaiting trusted game proof.

An `under_review` card is no longer presented under a `Settled` heading, a
failed send is never called payout proof, and a review-market slip is grouped
under `Awaiting Verdict` instead of open positions.

Optional `founders_bonus`, `founders_win`, and `winner_bounty` rewards are
separate from bettor liability. An unlinked reward recipient remains visible
to operators, but it cannot make an otherwise paid, refunded, or loss-only bet
look unsettled on `/bets`. Proof classification also verifies paid WOLO
coverage; a claimed transaction row whose amount is smaller than the bettor
liability remains in the settlement queue.

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

## Production receipt

### Deployed identities

- web implementation: `32be8b7b34d8ff60f8f0873c9f5762506a550228`;
- replay API implementation:
  `e4d1960eb26540c40193787aa8894db5e7d2d326`;
- web build version: `20260729210111-0f1bb6c20a`;
- Next build ID: `IE_S62e0zvc7NoYqIn-z0`;
- live Prisma state: 72 source migrations applied, none pending;
- `aoe2hdbets-web.service` and `aoe2hdbets-api.service`: active after the
  release;
- pre-mutation database backup:
  `/mnt/HC_Volume_105319120/aoe2-parser-engine/backups/aoe2-bet-reliability-20260729T200754Z/database.dump`,
  249,548,506 bytes, SHA-256
  `de2237d7ac2463ca682b2754af36c7208c4e7215bf378476059c55e185e15b34`.

### Jim and the wager pipeline

Jim's six historical active wagers are terminal:

- markets `433336` (250 WOLO) and `431392` (100 WOLO) are replay-proven
  losses;
- markets `429439` (250 WOLO), `399810` (1,000 WOLO), `385527` (100 WOLO),
  and `378260` (100 WOLO) are exact stake refunds with chain proof.

The last remaining wager backlog market, `420893`,
(`RandomGame [AI 2] vs Jim`), carried a scalar `Unknown` placeholder but a
trusted high-confidence structured final proving that the AI resigned and Jim
won. The structured proof now settles the book while real named/team conflicts
remain fail-closed. Both opposing 100 WOLO slips are losses.

Two stale core refund claims were reconciled idempotently:

- claim `8477`, 100 WOLO, recovered confirmed tx
  `D5B4CFAA5E9063F8342EA9E2B6119FCFF28DEE20B2E1DD6803944933B237D699`;
- claim `8478`, 25 WOLO, retried and confirmed as
  `CD593A25477CA9A0F1AEBFA86FC3DE8B1FE4C04E852FD37FD6B7ED01B908AB3A`.

The production gate after reconciliation was:

```text
active wagers                         0
active WOLO                           0
awaiting_final_proof markets          0
under_review markets                  0
active wagers on terminal markets     0
pending bet_payout claims             0
pending bet_refund claims             0
pending bet_corrective_refund claims  0
```

Optional unlinked Founder rewards or winner bounties may remain pending as
reward entitlements. They are not pending bets and no longer enter the public
settlement queue. The live `/bets` verification showed zero settlement-queue
rows, zero resolution-queue rows, and four recent settlement-proof rows.
Jim's public staking ledger also showed zero pending bets and five explicit
`refunded · exact stake returned` rows, including the older 50,000 WOLO
corrective refund.

### Projection and rivalry integrity

The append-only result-policy repair created 538 unresolved successor
projections. The production invariant query returned:

```text
rejected-reason games                  539
current public projections             538
remaining false-resolved projections     0
current unresolved projections         538
duplicate current projections            0
invalid repair shape                     0
result-eligible repaired players         0
coverage regressions                     0
invalid lineage                          0
```

The one rejected-reason game without a current projection is pre-existing game
`14195`; it was not one of the 538 repaired targets. Seven repairs increased
metric coverage through newer source runs, with zero non-forward source
advances or receipt count mismatches.

The verified Emaren–Sechma surfaces now agree: 13 opposing meetings, 9–0
decided score, and four preserved unresolved battles. `/game-stats/19947` and
the canonical matchup use the same full-corpus builder.

### Time and WOLO verification

The signed-in browser verification showed browser-local `MDT` as the primary
time and `UTC` as the secondary inspection value on `/bets`, Jim's staking
ledger, the matchup, and `/game-stats/19947`.

`/api/wolo/network?format=table` reported 35 known addresses,
100,000,000.000000 WOLO canonical WoloChain supply, and
100,000,000.000000 WOLO across known bank balances. Emaren #2's 200 WOLO was
already present. The newly mapped address is the Workshop sponsorship
recipient proven by two 100 WOLO transfers.

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

The production check found `wolochaind-mainnet.service`,
`wolochain-mainnet-settlement.service`, and
`wolochain-founder-rewards-settlement.service` active; REST reported
`syncing=false`; and settlement listeners `8092` and `8093` were healthy.
Accordingly, no WoloChain upgrade prompt accompanies this release.
