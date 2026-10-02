---
id: "aoe2war.app-prodn.docs-championship-belt-constitution"
title: "Championship Belt Constitution V1"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-09-30"
review_interval_days: 60
sensitivity: "internal"
---

# Championship Belt Constitution V1

Contract identity: `championship_belt_v1`. This document governs new championship
Challenges. Historical Challenges retain their original protocol, clocks,
financial terms, and immutable evidence. Presentation V1/V2 is independent of
Basic/Advanced/Extreme and independent of the Challenge's persisted protocol.
Selecting a renderer cannot change an issued Challenge.

## I. Championship custody

Trophy remains the title identity and economic ledger. Solo titles have one
holder; team titles have one exact roster represented by stable seats. A
custody change ends the entire previous reign and begins one new reign at a
single server timestamp. Reassigning the exact same roster is metadata refresh.
Guardian/dispute custody never silently names a contender champion. App custody
is separate from chain ownership and WOLO transfer proof.

## II. Challenger eligibility

Ordinary challengers pass the canonical title registry's nationality/region,
gender division, rating lane/tier, and title policy. World is open. A holder
assigned through a Commissioner eligibility bypass does not waive challenger
eligibility. A challenger bypass must be explicit, reasoned, authenticated, and
sealed into the receipt. Missing authority fails closed. Future titles require
an explicit centralized transfer/eligibility policy.

## III. Solo defense priority

The selected warrior's current held solo titles are sorted centrally: ELO
Rising, Challenger, Veteran, Elite, Legend, DM before RM in each tier; DM crown;
RM crown; eligible national/regional titles; explicitly governed special solo
classes; World last. The first ordinarily eligible match-winner title is the
automatic stake. Protected higher titles remain visible. One Challenge attacks
one solo title; one replay cannot strip several titles through competing
Challenges. Canonical RM ELO registry IDs are `elo-rising`, `elo-challenger`,
`elo-veteran`, `elo-elite`, and `elo-legend`; canonical DM identities remain
independent, including the retained `dm-contender` alias for the displayed
Challenger division.

## IV. Team championship custody

Six identities exist: 2v2/3v3/4v4, each RM/DM. Their 18 physical belt seats do
not create 18 independent championships. A 4v4 transition atomically replaces
all four app holders of that one title. Other sizes, modes, and solo titles are
untouched. Active and former rosters, reign time, seat order, wallet snapshots,
transfer grouping, and chain intent history remain durable.

## V. Team challenge formation

Team actions appear only for titles held by the selected rival's current
roster. That title fixes mode and exact size. The creator invites size-minus-one
registered warriors; champion members derive from locked current custody.
Both sides are sealed, disjoint, complete rosters with current AoE2WAR/Steam
identity. Every participant receives the parent Challenge and confirms their
own participation. Funding binds each person to their own wallet. Ordinary
substitution after issuance is forbidden; exceptional correction requires
Commissioner disposition and immutable history.

## VI. Challenge clock

The server creates one deadline: creation plus 24 hours. Acceptance, funding,
refresh, reconnect, renderer choice, and device changes never reset it. There
is no V2 duration or appointment selector. Every surface renders the same
projection, using a live seconds countdown and accessible final-hour urgency.
Acceptance and funding remain distinct states with a clear next action.

At hour 24, a title with no qualifying start enters Commissioner grace. Grace
ends at the original deadline plus one hour, even if a delayed worker observes
it later. A Commissioner action prevents unattended automatic disposition.
Non-title V2 expiry refunds proven liability through the existing rail.

## VII. Watcher/replay proof

Watcher witnesses battles; the app judges title rights. Start proof and winner
proof are separate. A trusted defending observation may preserve a defense
only when exact full Steam roster, opposing teams, RM/DM mode, required size,
unique Challenge identity, and start within the original window are established.
Heartbeat connectivity alone is never match proof. Roster/time similarity,
player order, or guessed teams cannot stop the clock. Team ID zero is valid.

Durable qualifying start changes the projection to `TITLE IS BEING DEFENDED`.
The battle may finish after 24 hours. Final capture requires canonical final
replay/result authority, exact opposing roster, lane, winner side, strong
Watcher coverage, no blocking human-confirmed desync, and unchanged locked
custody. Weak, contradictory, ambiguous, or missing final proof enters review.
No inferred winner is allowed. A late result cannot reopen a disposed title.

## VIII. WOLO funding

Every obligated warrior signs an actual bank transfer from their sealed linked
wallet to the existing Bet Escrow wallet. Chain verification binds sender,
recipient, transaction, CID/SID, left/right side, wager and guarantee buckets,
and amount. Each transaction is used once. Acceptance is not funding.

The existing chain contract accepts two sides only. Team funding therefore
uses stable paired ScheduledMatch financial legs under one parent title
Challenge. Each warrior signs their own leg and side. Legs are financial
implementation records, excluded from ordinary public Challenge/betting and
legacy lifecycle handling. They share aggregate title proof and deadline.
Each winning seat receives its paired wager purse; proven refunds return each
original deposit. No app-created pooled balance or new escrow wallet exists.
V2 uses positive per-warrior wager for title challenges and zero Match Guarantee;
historical guarantees retain their original meaning.

## IX. Championship Reward Tribute

Trophy owns the configured title-level amount. Only explicitly enabled paying
title economics create obligations; assignment alone does not activate future
catalog inflation. Custody transitions and daily UTC tribute use the same
Trophy money lock. Future tribute belongs to current custody. An unexecuted,
transaction-free outgoing same-day obligation is reconciled; paid, executing,
or transaction-backed obligations cannot be replaced or duplicated. UTC day
is a business boundary, while public timestamps render browser-local first.

Team tribute is one title obligation split in integer `uwolo` across current
seats, equally, with the remainder assigned in stable seat order. It is never
multiplied by roster size. Member allocations remain subordinate to the
existing TrophyPayout ledger and use deterministic request identities.

## X. Dethrone bounty

A custody exit freezes the outgoing reign's projected bounty once, under the
same money lock. A successful incoming champion side receives one title-level
obligation, split across team seats when applicable. The title's base resets
under existing canonical semantics; the new reign begins accruing at transfer
time. Dispute freezes the outgoing bounty for eventual Commissioner resolution
without paying an arbitrary contender. Bounty obligations are not reserved
chain pools, public numbered Bounty Board entries, or Challenge wagers.

## XI. Belt/NFT transfer

App custody may complete while chain transfer is pending/blocked. One logical
transfer group contains every required stable title seat, expected old owner,
new wallet, request identity, status, attempt, and eventual transaction proof.
All required seats must be proven before aggregate chain completion. Partial
success remains partial; confirmed seats are never resent as an entire batch.

The supplied September 24 WoloChain reference describes authority-gated
`x/wartrophy` entitlement and no safe deployed holder-NFT executor. Standard
`cosmos.nft.v1beta1.MsgSend` would bypass Warbound restrictions. This campaign
does not upgrade WoloChain or claim current mainnet NFT ownership. Missing
capability is `NFT_EXECUTOR_UNAVAILABLE`, with exact durable desired operations.
See [chain follow-up contract](./CHAMPIONSHIP_CHAIN_HANDOFF.md).

## XII. Default

After one hour of Commissioner grace, exactly one valid claimant may receive
default custody only if identity, sealed eligibility, participant acceptance,
required verified funding, unchanged title custody, delivery state, and absence
of start/desync/authority contradiction are established. An incomplete or
unfunded team cannot win. If both sides were ready but failed to start, fault
is ambiguous and remains Commissioner review. Default never invents a match
winner or awards a WOLO purse on an unplayed match; funded stakes use proven
refund disposition.

## XIII. Commissioner authority

Authenticated admins may assign any title to any exact roster, deliberately
bypass holder/challenger eligibility, choose a title stake, protect/veto a
defense, acknowledge exceptional evidence, extend/rematch with an audited
deadline, default, restore/correct custody, create Guardian/dispute custody,
resolve contenders, and inspect/retry safe idempotent obligations.

Every mutation preserves operator, action, reason, title, Challenge, before/after
custody, bypass flags, timestamp, economics, and chain intent/proof. No mystery
database edits. Commissioner, default, and replay transitions share the same
custody/money primitive. Exceptional evidence is recorded as Commissioner
authority and cannot masquerade as automatic replay proof.

## XIV. Multiple challenger disputes

Default considers all valid claimant sides for the same sealed title custody,
not click order. Several valid solo challengers or full teams cause one durable
dispute, end the outgoing economic reign, freeze bounty once, preserve the exact
contender set, and assign no contender champion. Commissioner resolution is
V1. A future two-side eliminator or larger bracket engine is explicitly deferred.

## XV. Chaos Championship exception

Central policy distinguishes `MATCH_WINNER` from `POPULAR_VOTE`. Chaos never
moves on an ordinary match loss or automatic match/default winner rule. It may
reuse custody/history/economics/chain queues after separate vote authority or
an explicit Commissioner disposition. No new voting platform ships here.

## XVI. Telemetry/audit

ScheduledMatchActivity and TrophyEvent remain append-only audit authorities.
Creation receipts seal Constitution/protocol, title priority and policy,
participants and custody epoch, Steam/wallet identity, lane/size, eligibility
facts and reasons, bypass, required proof, server creation/deadline, and stake.
Profile changes never rewrite a receipt. Admin exposes precise codes such as
`TITLE_CUSTODY_CHANGED`, `MODE_MISMATCH`, `TEAM_ROSTER_MISMATCH`,
`WATCHER_PROOF_MISSING`, `MATCH_DESYNC`, `CHALLENGE_NOT_FUNDED`,
`MULTIPLE_CHALLENGERS_PLAYOFF_REQUIRED`, and `NFT_EXECUTOR_UNAVAILABLE`.
Public cards translate them into concise next actions.

## XVII. Failure/recovery semantics

Transactions lock Trophy money/custody and Challenge mutation consistently;
deterministic request IDs and database uniqueness protect replay claims,
funding transactions, economic obligations, and transfer groups. Re-read live
custody before disposition. Stale receipts fail closed. A defense cannot commit
the same title or replay twice. Timer/Commissioner/replay races cannot create a
second reign or payout. Failures preserve evidence and resumable state.

Chain payment is called paid/refunded only with successful transaction proof.
No refund label precedes execution. Blocking desync prevents automatic purse,
custody, NFT, and bounty winner mutation. Failed external execution is retried
through existing request identities; transaction-backed operations cannot be
rewritten. New tables are additive and old rows are never silently enrolled.
Team allocations require the protected Founder executor and exact committed
bank proof; they never fall back to app signing. A lost response is an uncertain
liability. Known hashes can reconcile read-only; unknown outcomes cannot be
broadcast again merely by changing an app status.
Production release is a separate `aoe2war finish` operation with protected
migration backup, digest, exactly-once receipt and verification. This campaign
does not deploy, migrate production, restart services, or mutate chain state.
