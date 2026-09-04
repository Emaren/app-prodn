---
id: "aoe2war.app-prodn.docs-betting-hall-product-and-concurrency"
title: "Betting Hall Product and Concurrency Contract"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "aoe2-watcher", "wolochain"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "product-and-concurrency-contract"
reviewed_at: "2026-09-04"
review_interval_days: 30
sensitivity: "internal"
---
# Betting Hall Product and Concurrency Contract

## View lineage

The Betting Hall hero remains the shared entrance for every view.

- `B` is the complete heritage view. It merges the former A and B surfaces so
  no historical component disappears.
- `A` preserves the former E layout.
- `E` is the new command deck: live-first hierarchy, compact market telemetry,
  a pinned active ticket, and a visible arena switcher for concurrent battles.

`E` is the reset default. The view preference uses
`aoe2hdbets.betsView.v4`, so every visitor lands on E once after this release;
later B, A, or E choices continue to persist locally. Settlement Proof, the
real bettor Settlement Queue, and Resolution Queue remain separate in all
expanded views. Founder rewards never make an otherwise settled core wager
look pending.

## One-signature manual ticket

A bettor chooses a winner, enters the winner amount, and may add Desync `NO` or
`YES` plus its amount inside the same composer. The wallet signs the exact
combined amount once. Winner and Desync remain independent propositions and
settle independently. See `BET_STAKE_TICKETS.md` for custody, API, memo,
idempotency, and recovery rules.

The `WOLO` suffix is an explicit label for its amount input, so clicking the
word focuses the field. Founder controls default to 2 WOLO per participant and
1,000 WOLO for Founders Win. Each deliberate modal opening creates one request
ID; retries reuse it and cannot duplicate an award.

## Canonical battle numbers

`BattleIdentity` is the persistent public identity for a streamed battle.
`identity_key` is exact: platform match ID first, otherwise the normalized
watcher session key. It is not derived from fuzzy player-name matching.

The production archive contained 2,819 filed battles when this rail launched,
so `battle_public_number_seq` starts at 2,820. Public numbers are unique and
immutable. A PostgreSQL transaction advisory lock serializes allocation for
the same identity before sequence insertion; duplicate watcher reports reuse
one row without consuming another number. Different games use different locks
and may allocate concurrently.

Historical proof, review, and completed sessions do not consume new numbers
during the first reconciliation. A new number is created only while a current
battle is genuinely live, then stays attached as that existing identity moves
through proof, review, and terminal states. Winner and Desync propositions
share the same battle number.

## Multiple Watcher 1.5.7 sessions

Persisted `key_events.watcher_upload` metadata supplies watcher ID, watcher
session ID, replay fingerprint, and watcher version. Active dedupe prefers an
exact platform match identity, then replay fingerprint, then the normalized
file/player/map identity. A watcher ID is coverage evidence; it is never the
game identity by itself.

The live arena switcher sorts higher battle numbers first. When a second or
third battle arrives it appears at the top and triggers a notice, but it does
not steal the bettor's focused game or in-progress selection. The user chooses
when to switch. Every open winner book remains reachable.

## AI and automation boundaries

`/admin/ai` exposes the effective site-side prompt layers separately from
read-only provider metadata. Public lobby AI never reads or mirrors private DM
history, and a disabled persona never falls through to another model.

Tony and Paulie are dormant operator-configurable counter-bettor foundations.
Policy, not an LLM, chooses the opposite side and enforces the 10 WOLO action
cap. Live execution remains impossible until dedicated operator custody,
reservation proof, and an idempotent executor exist.

The profile Auto Bet Reserve is Preview only. It stores self-only winner and
optional Desync settings, finite games or Until Out, and a 10,000 WOLO plan
envelope. It neither moves nor reserves funds. See
`BET_AUTOMATION_AND_CUSTODY.md` for the Wolo settlement-service upgrade prompt.

## Deployment and rollback

Apply migrations in timestamp order before restarting the web service:

1. `20260801184500_harden_bet_tickets_and_desync_parents`
2. `20260801193000_add_bet_auto_preview_foundation`
3. `20260801201500_add_counter_betting_bot_foundation`
4. `20260801203000_add_canonical_battle_numbers`
5. `20260801204500_add_ai_agent_optimistic_version`

`BET_STAKE_TICKETS_ENABLED=false` disables the additive combined-ticket API.
Auto-bet and counter-bettor modes remain server-gated and fail closed. No
WoloChain consensus upgrade is part of this release; never replace the pinned
consensus binary. Future reusable auto-bet custody belongs in the Wolo
settlement service and requires a separate reviewed deployment.

## Betting Phase Books V2 — accepted design, not yet live

Current production uses the Betting Fairness V1.2 compatibility bridge:

- scheduled/challenge winner books remain pre-game only and close at their
  authoritative cutoff;
- an unscheduled Watcher-discovered winner book accepts fresh bets while its
  canonical market remains `open` or `live`;
- a Watcher-born Desync proposition uses the same authoritative active window;
- the first transition into closing, final-proof, review, settled, or voided
  state rejects fresh winner and Desync commitments.

This restores practical live winner and Desync betting for Watcher-discovered
games, but it remains one live economic window and is not the final phase-book
architecture.

The accepted next architecture remains Betting Phase Books V2 with independent
Pre-Game, Opening Minute, and Late books.

One canonical battle may own three independent winner books:

### Pre-Game / Challenge Book

An accepted scheduled Challenge may expose a pre-game book up to seven days
before play.

The pre-game book locks at the authoritative start fence. Browser time never
decides admission.

### Opening Minute / Live Book

The canonical watcher battle-start identity opens a distinct book for exactly
60 seconds.

The server owns `opens_at` and `closes_at`. UI countdowns are projections only;
the transactional write fence independently rejects late commitments.

### Late Book / In-Game

After the opening minute, a separate late book may accept commitments while the
battle remains authoritatively active.

The first terminal/final observation closes fresh admission. A browser that has
not refreshed cannot override that server fence.

### Financial isolation invariant

Pregame, opening-minute, and late wagers MUST NOT share one economic pool.

Each phase has independent:

- wager rows / book identity;
- left and right pool totals;
- crowd split and implied return;
- open/close timestamps;
- financial admission fence;
- audit/settlement history.

All books resolve from the same canonical Battle/result truth, but late
information can never dilute, reprice, or subsidize money risked in an earlier
phase.

Locked earlier books remain visible while later books operate.

### Presentation direction

The horizontal `InstrumentStakeRail` has been retired.

The current premium composer is vertical and tactile:

- large 10 / 25 / 50 / 100 WOLO stake tiles;
- a large full-width custom amount field;
- phase identity and server-derived countdown;
- current pool and projected return;
- a large phase-colored final lock action.

Semantic presentation:

- Pre-Game: ember / antique gold / deep crimson;
- Opening Minute: electric cyan / cobalt;
- Late Book: violet / magenta / dangerous red.

The visual distinction communicates financial information age, not merely
decoration.

### Auto Bet direction

The existing Auto Bet Reserve remains preview-only today.

Future automation may add independent phase presets, but execution must use the
reviewed prefunded Wolo custody/reservation architecture. Watcher telemetry
detects game state; it never becomes money authority by itself.

## Premium betting composer implementation — V2 branch

The `feature/betting-phase-books-v2` implementation retires the E4
`InstrumentStakeRail` horizontal utility strip.

The replacement `PremiumStakeComposer` is a vertical betting interaction:

- large tactile 10 / 25 / 50 / 100 WOLO stake tiles;
- large full-width custom amount entry;
- explicit selected pick;
- explicit stake and projected return;
- large final lock action;
- phase/status shell treatment;
- Desync moved below the primary winner composer instead of sharing one
  spreadsheet-like horizontal row.

The premium-composer release originally retained the pre-game-only V1
financial fence. V1.1 first restored live admission for unscheduled Watcher
winner markets; V1.2 extends that same authoritative active window to the
attached Watcher-born Desync proposition while preserving the same authority
chain:

`freshBettingCloseReason()` -> board `bettingOpen` projection -> page
selection/composer eligibility.

`buildFreshBetMarketWriteWhere()` independently mirrors that rule at the
transactional database-write boundary.

Scheduled/challenge winner books remain pre-game only. Watcher winner and
Watcher-born Desync propositions accept fresh bets only while canonical status
is `open` or `live`.

Wallet signing, participant-side rules, proposition verification, recovery,
and settlement remain unchanged. Recovery never reopens a Desync book after
the active Watcher window has closed.

### Betting action language invariant

The Betting Hall uses **bet** for the player's primary action.

The premium interaction headline is:

`Bet your WOLO`

After a side is chosen, supporting copy is deliberately minimal:

`Backing <side>.`

Do not write `Stake your WOLO` as the primary Betting Hall call to action.
`Stake` remains valid as a technical noun for wager amount, escrow custody,
signed stake proofs, recovery records, and settlement accounting.

The product distinction is intentional:

- player action: **bet**;
- technical/custody amount: **stake**.

### Team winner selection surface invariant

A team-winner book has one primary side-selection surface.

The former `Player pick` section duplicated Team A / Team B without creating a
different pool, price, wager identity, or settlement outcome. It has therefore
been removed.

Roster names stay inside the Team A / Team B panels.

A player-specific control belongs on the page only when it represents a
genuinely independent player proposition with its own pricing and settlement.

### Watcher Live compatibility bridge

Production Watcher winner markets are normally created after battle detection
with no scheduled-match identity, a non-null watcher/platform session identity,
and canonical status `live`.

For that unscheduled Watcher winner lane, fresh winner bets are admitted while
the market remains `open` or `live`.

Admission is deliberately enforced twice:

1. `freshBettingCloseReason()` controls public `bettingOpen`;
2. `buildFreshBetMarketWriteWhere()` independently fences the transactional
   write.

Scheduled/challenge books still require an open market and an authoritative
future cutoff. Desync remains outside fresh live-money admission.

Terminal, proof, review, settled, and voided states fail closed.

This compatibility bridge restores live betting immediately. It does not yet
provide economic isolation between Opening Minute and Late Book wagers.

## War Chest earnings and period truth

War Chest `Take` is economic gain, not gross payout cashflow.

For a winning wager:

`Take = max(payoutWolo - amountWolo, 0)`

Returned principal, voids, refunds, corrective refunds, and duplicate
bet-settlement payment claims are not earnings.

Weekly mode presents weekly Take, weekly settled earnings, and weekly gross
wagered stake. All-Time mode presents the corresponding lifetime values.

`Claimable` remains current claimable cashflow and may include returned
capital; returned capital does not become Take.
