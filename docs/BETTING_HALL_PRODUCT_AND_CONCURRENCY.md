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
reviewed_at: "2026-09-29"
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

Tony and Paulie are operator-configurable deterministic counter-bettors. Both
identities still ship disabled. When an operator explicitly enables a bot in
`shadow`, an already-committed human `BetWager` can trigger one append-only
counter-decision for that bot/policy/market/wager/proposition identity. Policy,
not an LLM, chooses the opposite side and enforces the 10 WOLO action cap plus
configured per-market and daily shadow exposure.

The shadow evaluator runs only after the human wager transaction commits. Its
failure is best-effort and can never roll back or invalidate the bettor's wager.
Duplicate/recovery paths may replay the evaluator because the decision key is
idempotent. All reserved internal-system UIDs are excluded as source bettors, so
Tony, Paulie, AI personas, protocol accounts, Moose, and clan scribes cannot
recursively manufacture counter-actions.

Shadow exposure is simulated policy evidence, not custody. The worker does not
query or claim a spendable bot balance: `availableBalanceWolo` remains null,
`custodyVerified=false`, committed amount/reservation/transaction fields stay
null, and a labeled internal planning envelope only exercises the deterministic
balance-floor math. Bot-policy edits and decisions share one per-bot PostgreSQL
advisory lock so an action snapshot is cleanly before or after a config update.
The append-only admin audit shows source wager/market, side flip, proposed WOLO,
and exposure-before without claiming a counter-wager was placed.

The public Betting Hall may project those zero-custody `shadow_proposal`
actions as **Preview Liquidity**. This is presentation evidence only. It lives on
a separate `previewLiquidity` field after the real market card has calculated
user pools, total pot, slip counts, crowd split and projected return. Preview
amounts must never be added to those financial fields.

The public projection fails closed. It accepts only effective `shadow` actions
with a positive proposed amount and no committed counterstake, available-balance
claim, custody verification, custody reservation or stake transaction hash.
Each displayed row is explicitly marked `financiallyCommitted=false`, and the
Hall labels the rail “Shadow only · not in pot or odds.” Winner and Desync
markets each retain their own Preview Liquidity evidence.

A separate **Your Auto Bet Preview** rail is private to the signed-in viewer.
It reads only that user's own preset-linked `BetAutoExecution` evidence through
the private/no-store Betting Hall snapshot. The Hall never derives this row by
re-running today's preset against an old market; it presents the immutable
decision version and timestamp recorded by the shadow worker.

Only one exact pristine `shadow_ready` row may project for a winner market.
The presenter rechecks the frozen identity evidence and requires all financial
consumer fields to remain untouched. Ambiguous duplicate rows, missing identity
proof, proposition mismatch, malformed Desync linkage, or any ticket,
reservation, attempt, lease, retry time or acceptance marker suppress the
preview. The optional Desync leg is shown inside the parent winner preview and
is not repeated on the Desync child card.

This viewer rail is independent from public house **Preview Liquidity** and from
`viewerWager`. It is presentation-only and must not enter seed/wager pools,
total pot, crowd percentages, return math, War Tape financial proof, settlement,
or War Chest accounting.

The viewer may explicitly copy a still-valid private Preview into the ordinary
manual Bet Slip. The copy action is local state only. Before loading, a pure
planner requires the winner book to remain open with no existing real viewer
wager, preserves the exact recorded winner side/amount, requires any recorded
Desync leg to point at the same currently attached open child with no existing
viewer wager, and rejects any leg or combined total outside the current
wallet/app stake cap. A stale preview is rejected rather than clamped or
silently adapted.

Loading the Preview is not a wager and is not financial acceptance. It performs
no fetch, wallet connection, ticket preparation, stake intent, escrow
reservation, signature, transaction, or Auto Bet outbox mutation. The user must
still review the populated slip and explicitly use the existing Lock WOLO flow.
That manual rail remains the sole authority that can enter financial state.

Live execution remains impossible until dedicated operator custody,
reservation proof, and an idempotent executor exist. The existing database
constraint additionally requires real custody verification, reservation, and
stake transaction proof before a committed counterstake can exist.

The profile Auto Bet Reserve is Preview only. It stores self-only winner and
optional Desync settings, finite games or Until Out, and a 10,000 WOLO plan
envelope. The durable shadow worker now evaluates exact eligible live Watcher
winner markets after canonical market reconciliation and records one
`shadow_ready` evidence row per preset/canonical game. Admission requires exact
Steam roster-side proof plus uploader UID proof; an optional Desync leg must
match the exact live child proposition. It still neither moves nor reserves
funds, creates no wager/ticket, and never decrements a finite plan. See
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

## Betting Constitution V1 — ratification candidate

The future economic law for phase-book matching, fees, grandfathering, and
chain-proof settlement is defined in `docs/BETTING_CONSTITUTION.md`.

The September 9 Jim audit is the first frozen precedent: current-mainnet winning
payouts fully reconciled to both the production settlement formula and indexed
WoloChain receipts, so no corrective payment was due. A strict 1:1 FIFO
counterfactual would have paid Jim less than the historical pooled rule, so
settled markets remain grandfathered and are never silently clawed back.

The constitution is documentation-only until a separately reviewed financial
implementation, migration, tests, and certified release activate it.

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

### Foundation implementation status — 2026-09-29

Phase Books V2 now has both its additive data/authority foundation and a
durable **shadow materializer**:

- `BetMarket.bookPhase` defaults every existing financial market to `legacy`;
- nullable unique `phaseBookKey` gives each future independent book durable
  identity without backfilling or reinterpreting historical rows;
- nullable `phaseOpensAt` / `phaseClosesAt` store server-owned phase fences;
- the pure planner defines Pre-Game, exact 60-second Opening Minute, and Late
  windows from authoritative server time;
- `BET_PHASE_BOOKS_V2_MODE=shadow` may materialize isolated phase evidence
  rows after canonical market reconciliation;
- `BET_PHASE_BOOKS_V2_MODE=live` still fails closed because financial
  activation is intentionally not installed.

Shadow phase rows are intentionally quarantined from current financial rails.
They use:

- `status = phase_shadow`, which is not a production `BetStatus`;
- `marketType = phase_shadow_winner`, so winner/Desync reconciliation,
  settlement, Auto Bet, stale-market cleanup, and public board queries do not
  accidentally consume them;
- zero seeded WOLO;
- no wager, stake intent, stake ticket, wallet-lock, escrow, payout, or
  settlement mutation;
- one transaction-scoped advisory lock per deterministic `phaseBookKey`.

If a row with that `phaseBookKey` ever stops being an untouched shadow row,
the materializer leaves it alone. A future financial activation must therefore
be an explicit reviewed promotion path, not an environment-variable side
effect.

Pre-Game shadow identity is derived from the accepted scheduled Challenge. The
current source model proves the authoritative scheduled cutoff, so the shadow
book stores that as `phaseClosesAt`. It does **not** fabricate a
`phaseOpensAt` merely from the “up to seven days” product ceiling; an actual
opening/acceptance timestamp belongs to a later financial activation contract.

Opening Minute and Late are stricter. They materialize only after canonical
Watcher evidence has produced:

- a real public Battle identity;
- the immutable public Battle number;
- a stabilized Watcher `BattleIdentity.startedAt`;
- verified proposition integrity.

Opening Minute starts exactly at that Watcher battle-start fence and has a
maximum 60-second window. Trusted terminal truth may close it sooner. Late opens
at the +60-second boundary only if the battle actually survives into Late; a
battle that becomes terminal during Opening Minute gets no Late shadow row. A
trusted terminal `settledAt` closes Late once it exists; a transient Watcher
snapshot gap does not manufacture a terminal phase fence.

The live phase key uses immutable `BattleIdentity.publicNumber`, not mutable
database row id or transient fallback/platform session identity. Watcher
identity promotion may repoint `BetMarket.battleId`, but it preserves the
public Battle number, so promotion cannot create a duplicate Opening Minute or
Late shadow book.

This shadow materialization does **not** split any live money pool, admit phase
wagers, alter stake tickets, change recovery/settlement, migrate historical
wagers, or change the current Betting Fairness V1.2 compatibility bridge.
Transactional phase write fences, ticket/escrow validation, recovery,
settlement, and financial UI activation remain separately reviewed work.

### Accepted-slip phase provenance — presentation only

`Your Book` may now label an already-accepted slip by timing provenance without
claiming the underlying V1 pool was economically phase-isolated.

Classification uses server evidence only:

- an explicit non-legacy `BetMarket.bookPhase` is authoritative for that future
  phase row;
- otherwise a scheduled Challenge market is **Pre-Game** because current
  production admits that book before play only;
- otherwise the accepted timestamp is compared with canonical
  `BattleIdentity.startedAt`;
- `stakeLockedAt` outranks the later wager-row `createdAt` when chain-backed
  stake proof exists;
- before start is **Pre-Game**;
- start through `< start + 60s` is **Opening Minute**;
- `>= start + 60s` is **Late**;
- missing authoritative start evidence remains **Legacy timing** rather than
  being guessed from browser time, market status, or a schedule.

When one current V1 market contains several viewer slips, the presentation may
show a phase breakdown across those slips. That breakdown describes information
age only. The slips still share the existing V1 economic pool until Phase Books
V2 financial activation is separately certified.


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

The existing Auto Bet Reserve remains preview-only today, but Preview now has a
durable evaluator. After canonical live-market reconciliation, the shadow worker
can record an exact self-match decision without reserving WOLO or creating a
wager. Raw Watcher telemetry is never the authority boundary.

Future automation may add independent phase presets, but funded execution must
use the reviewed prefunded Wolo custody/reservation architecture and a separate
durable consumer. Shadow evidence must not be treated as accepted financial
work.

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
future cutoff. A Watcher-born Desync proposition shares the same authoritative
`open` / `live` admission window as its unscheduled Watcher winner book; it
does not create a separate longer-lived money window.

Terminal, proof, review, settled, and voided states fail closed.

This compatibility bridge restores live betting immediately. It does not yet
provide economic isolation between Opening Minute and Late Book wagers.

## War Chest Take, Settled, Earned, and period truth

War Chest `Take` is the gross payout cashflow from genuine winning wagers,
plus eligible non-bet reward earnings. For a winning wager:

`Take = payoutWolo`

That means Take includes the winner's returned principal as well as profit.
`Earned` is the narrower economic-gain view:

`Earned = max(payoutWolo - amountWolo, 0)`

Voids, losses, refunds, corrective refunds, unmatched-principal refunds, and
duplicate bet-settlement payment claims create neither Take nor Earned.
Eligible non-bet reward claims have no bettor principal component, so their
settled amount is also their earned amount.

Weekly and All-Time rankings are ordered by Take. The public War Chest shows
`Settled` by default as gross settled Take and reveals `Earned` on hover as
net economic gain. `Wagered` remains matched wager exposure only; unmatched
principal does not inflate the wagered rail.

`Claimable` remains current claimable cashflow and may include returned
capital. Only claim kinds admitted by the Take policy may increase ranked Take.
