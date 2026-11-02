---
id: "aoe2war.app-prodn.docs-championship-commissioner-runbook"
title: "Championship Commissioner V1 Runbook"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-31"
review_interval_days: 30
sensitivity: "internal"
---

# Championship Commissioner V1 Runbook

Use the Championship Commissioner cockpit in `/admin/trophies`. Admin session
authorization is required at every API boundary. The contract is the
[Belt Constitution](./CHAMPIONSHIP_BELT_CONSTITUTION.md). This runbook describes
source behavior; production deployment and live truth are separate.

## Default hour

At creation plus 24h, a title without a qualifying defense start enters
`default_grace`. The cockpit highlights `TITLE DEFENSE DEFAULT` and counts down
to the recorded deadline plus one hour. Inspect every participant's accepted,
funding-verified and card-delivered state, sealed title epoch, and replay/start
evidence before acting. A fresh Watcher heartbeat is insufficient.

The existing reconciliation worker processes this state; replay upload hooks
also reconcile evidence. A delayed worker does not grant a fresh grace hour.
Default evaluation considers every valid challenger side against the same
custody epoch. It does not award the first processed Challenge.

Available reasoned actions:

| Control | Durable effect |
| --- | --- |
| Protect champion | Hold the Challenge for Commissioner review; prevent unattended default. |
| Veto defense | Hold for review with `COMMISSIONER_VETO`; preserve deposits and evidence. |
| Extend / rematch | Record an explicit replacement deadline and grace, preserve the original receipt and prior deadline in audit, and retain participants/funding. A started defense cannot be extended. |
| Evaluate default | Apply the same objective eligibility, acceptance, funding, notification, custody, start and desync checks. This is not an arbitrary winner override. |
| Hold for review | Record Commissioner authority and stop automatic disposition. |
| Record exceptional evidence | Record the operator's reason and hold for review. This does not manufacture automatic Watcher or chain proof. |

A reason is mandatory. An automatic default with both sides ready but no
provable fault remains review. A claimant missing acceptance/funding cannot
win. Ordinary declined champion participation does not cancel a valid title
claim. Default and cancellation queue exact proven refunds through the
existing financial rail; only confirmed execution is described as refunded.

## Assignment, restoration and disputes

The custody form selects a title and every required champion seat. Solo
requires one registered warrior; a 2v2/3v3/4v4 title requires exactly that many
distinct registered warriors. One submission replaces the whole roster.
An explicit eligibility bypass plus concrete reason permits Commissioner
placement outside ordinary restrictions. Ordinary challengers still pass
their own eligibility gates.

Several valid default claimant sides create a durable dispute. No contender
becomes champion. The cockpit shows every sealed contender Challenge/Steam
roster, the previous custody epoch, and the frozen title bounty. Choose the
exact resulting roster and record a resolution reason. This is V1 manual
resolution; no playoff/bracket engine is implied. Restoring a former holder or
correcting a roster uses the same reasoned assignment operation and creates
new history rather than editing old reigns.

Guardian, vacancy, forfeiture and pause/status controls remain in Trophy
Command. They reconcile explicit reigns and economics instead of leaving a
hidden current team roster behind. An empty/disputed custody state cannot
silently produce a champion. Same-roster metadata refresh preserves seat
order, reign start and economic/chain history.

## October 31, 2026 — independent financial source review (Session B)

This is a substantive source review against the F/D website-controller integration
`b13a4a91d37a93ac2300dab7927544f374469101`, **not** a live HEL1
escrow, balance, payout or signer attestation. Financial settlement remains
release-HELD until the independent 8092/8093 identities, complete writer
inventory, source/HEAD/prewarm side effects and real producer receipts pass.

The `championship_v2` contract is **0 or 100 WOLO wager per warrior, with
zero Match Guarantee**; zero is the default and requires no escrow deposit to
issue/play a Challenge. Do not interpret a zero-funded defense as an unpaid
chain debt. Real nonzero deposits must have authenticated sender, challenge
leg/side, escrow destination and proof before the game's Watcher-confirmed
start to become a matched winner-payout wager. An unmatched or late deposit
is still a refund liability, **not** winner-purse authority. No title default
creates a played winner or authorizes a winner payout.

Evidence: `lib/championshipChallenges.ts` (paired legs created with
`guaranteeAmountWolo: 0`, and proof-bound participant funding),
`lib/scheduledMatchSettlements.ts` (`championshipWagerMatchedAtStart`,
`buildRawTransfers` and persisted settlement proofs),
`lib/trophies/championship.ts` (`createAllocatedPayout` and
`transitionChampionshipCustody`), `lib/trophies/service.ts`
(Founder Rewards payout allocations and uncertain broadcast handling), and
`docs/CHAMPIONSHIP_BELT_CONSTITUTION.md` (V2 financial terms).
All refer to the exact integration SHA above; no money moved for this review.

## Payments and belt intents

The Payouts rail retains the title-level obligation and shows member allocation
counts. `partial_paid` is not fully paid. A queued or dry-run tribute/bounty is an obligation, not an executed transfer; even an app custody change and an accepted 8093 response do not prove a bank-committed payout. Retry remaining seats with the
existing deterministic request identities; proved/transaction-backed seats
must not be replaced or resent. Correct a failure only from payment proof and
the recorded error. Do not infer settlement from app title ownership.

Team allocations require the authenticated protected Founder listener on
`http://127.0.0.1:8093`; they never fall back to a mnemonic signer. Exact
integer uwolo, request identity, recipient and canonical chain/signer are
checked, followed by committed successful bank-transfer events. An accepted
response alone is not paid. An unknown broadcast is `uncertain` and prevents
rewriting the liability or automatic rebroadcast.

Use **Reconcile proofs** for an uncertain or interrupted allocation. It performs
read-only health/transaction lookup for stored hashes and records paid only
after exact success proof. It sends no new payout. An unknown outcome without
a stored hash remains blocked for chain-owned request inspection; do not
replace its request ID to make it execute again.

The belt transfer rail exposes group request, title, expected owners,
recipient wallets, stable NFT seats, app status, blocked/partial chain state,
transaction proof and failure code. V1 has no live belt executor and cannot
retry a blockchain action that does not exist. `NFT_EXECUTOR_UNAVAILABLE` is
the correct visible state. Follow the
[chain capability handoff](./CHAMPIONSHIP_CHAIN_HANDOFF.md); never type a hash
into admin to claim ownership, use unrestricted NFT MsgSend, or change the
running node binary to match a checkout.

## Evidence and recovery

Read `/api/admin/championship-challenges`, `/api/admin/championship-transfers`
and the existing Trophy Command snapshot. ScheduledMatchActivity and
TrophyEvent preserve creation, participant changes, start/result proof,
Commissioner reasons, custody transition, frozen bounty and obligation IDs.
New custody CAS and advisory/money locks fail closed on stale or conflicting
records. Reconcile an unknown broadcast outcome read-only before retrying.

Championship V2 does not use legacy player check-in timestamps as a match-start
gate. Once all required participants have accepted and funded, a qualifying
Watcher encounter is the start proof. The reconciler retains authenticated
participant watcher-live evidence for the complete 24-hour challenge plus the
one-hour Commissioner grace window, separately from the much shorter public
Live Games linger window. Historical evidence lookup is scoped to participants
in active championship protocols.

For HD mode matching, `TurboRandom<N>` is canonical RM title play. A completed
rated 1v1 whose replay lacks serialized winner truth may receive append-only
`title-authority:rating-delta-v1` result authority when a later Watcher
snapshot proves the exact same two Steam IDs moved by equal-and-opposite,
non-zero RM or DM rating. That authority affects result/stat projection and may
settle a championship; it never grants betting authority. An unrated or
otherwise ambiguous final remains unresolved until stronger replay evidence or
a reasoned Commissioner result adjudication exists.

For production, use `aoe2war status`, `aoe2war audit` and `aoe2war doctor` for
live truth. The separate authorized release uses `aoe2war finish` and its
protected additive migration lane. Never run an ad hoc migration or restart
to repair an operator page expecting the new tables.
