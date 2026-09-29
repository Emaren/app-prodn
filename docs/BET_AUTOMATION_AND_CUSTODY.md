---
id: "aoe2war.app-prodn.docs-bet-automation-and-custody"
title: "Bet Automation and Wolo Custody Boundary"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "financial-domain-contract"
reviewed_at: "2026-09-29"
review_interval_days: 30
sensitivity: "internal"
---

# Bet Automation and Wolo Custody Boundary

## Public financial activity projection

Grouped public activity is a typed read model. `lib/betLifecycleActivity.ts`
loads bounded rows from markets, stake intents, wagers, Founder bonuses, and
pending claims. `lib/betLifecycleProjection.ts` then emits the versioned
`bet-lifecycle-v1` projection. Presentation labels are consumers of that
projection; labels and memo text never decide lifecycle identity.

The projection guarantees:

- a verified wager supersedes its matching stake intent, so one economic stake
  is counted once;
- `app_only` wagers remain explicitly **app-side stake records**;
- a wager is called a verified on-chain stake only when its execution mode is
  `onchain_escrow`, it has a stake transaction hash, and `stakeLockedAt` proves
  the app accepted the chain movement;
- participant and winner Founder bonuses aggregate independently, once each;
- one canonical result is derived from market truth;
- payout, refund, and winner-bounty claims aggregate by semantic kind, with
  wallet, awaiting-wallet-link, settlement-queue, failed, or rescinded
  destination metadata;
- market groups sort newest first while each lifecycle sorts oldest first, with
  deterministic identifiers and tie-breaking;
- a bounded-source overflow fails closed instead of silently presenting a
  partial financial story.

`/api/staking/activity?mode=grouped` serves this projection. Ledger mode remains
the lower-level forensic transfer/activity view. The two modes intentionally do
not share a string-inference grouping function.

## Data-driven staker profiles

An individual Staking Hall profile is admitted by canonical active position
truth, not by a source-code name registry. `lib/stakerProfileResolver.ts` joins
active positive staking positions to app identity and produces a neutral
profile, stable `-u<id>` slug, verified wallet, rank, and totals. The page and
ledger API use the same resolver. Canonical user-ID slugs use a bounded direct
query; legacy human-readable aliases remain compatible only when they resolve
uniquely.

Special Jim, Julio, and Emaren presentation is optional enrichment keyed by
stable account UID. Matching somebody else's display name cannot grant a
featured title. Any new eligible staker appears without a TypeScript edit, and
ambiguous aliases fail closed instead of selecting the wrong financial ledger.

## Manual bet wallet custody invariant

Manual betting may open Keplr before the app knows the wallet balance; absence
of a connected address must never be represented as a verified `0 WOLO` balance.
The UI can keep a bounded provisional input ceiling only to let the wallet
connection flow start. Before creating a manual stake intent or multi-leg ticket,
and before broadcasting any transfer to Bet Escrow, the app must refresh the
exact connected address through the authoritative Wolo balance endpoint and
enforce the resulting verified stake cap. A failed or malformed balance read
fails closed and no WOLO moves.

This ordering is a custody boundary, not presentation policy: `connect -> fresh
verified balance -> amount validation -> intent/ticket -> chain transfer`.

## Core market retry custody invariant

A core market claim is funded by the same Bet Escrow custody rail that accepted
the wager stake. Normal settlement and later operator/admin recovery therefore
share one source-of-funds invariant:

- `bet_payout`, `bet_refund`, and `winner_bounty` retries use
  `signer_role=escrow`; they must never fall back to the generic payout/staking
  distribution signer;
- before a retry can mutate chain state, the exact deterministic grouped run is
  dry-run against WoloChain and must return `ok=true`, signer role `escrow`,
  and the exact escrow signer address configured by the app;
- the stored winning-wager/refund entitlement, matched wallet, request ID,
  recipient, amount, and source market remain part of the existing retry truth
  gate and distinct-send proof;
- an `onchain_escrow` label or historical transaction hash is not sufficient
  custody authority for recovery. Before any retry dry-run or execution, the
  original funding must be re-proven against the current WoloChain escrow
  verifier by transaction hash, bettor sender, exact funded amount, and exact
  canonical stake memo. Direct wagers use the market stake memo; ticket-funded
  wagers prove the ticket's single total transfer and ticket memo;
- bettor payouts and refunds require every contributing funding source to pass
  that current-chain proof, and the stored per-user entitlement must exactly
  equal the claim amount. Winner bounties require at least one source-market
  wager with current-chain escrow proof. Missing, legacy-chain, stale-chain, or
  unverifiable funding fails closed before WOLO can move;
- the escrow recovery namespace is explicitly versioned as `escrow-v2` for both
  grouped `settlement_run_id` and per-payout `request_id`. Legacy failed
  payout-signer retry IDs remain immutable historical evidence; the escrow
  migration must never reinterpret one of those stored IDs with a different
  signer payload. Repeating the same `escrow-v2` retry remains deterministic
  and idempotent;
- a failed dry-run leaves the claim pending and records the failure. It never
  converts a reserve shortage or signer mismatch into a manual ad-hoc send;
- Founder rewards remain a separate payout domain and retain their dedicated
  founder settlement authority.

This prevents a fully funded Bet Escrow from stranding a bettor merely because a
separate payout or staking-distribution reserve is below its operating floor.

## Staking reward custody invariant

The staker share of betting fees is also economically born in Bet Escrow.
Mainnet reward distribution therefore must not create a second synthetic source
of funds or treat an app-side reward allocation as custody proof.

For new chain-backed reward distributions:

- auto-compound creates `COMPOUND_PENDING`; it does not immediately increase
  confirmed staking liability;
- the distribution freezes its settlement-policy version and explicit staking
  custody address so later configuration changes cannot alter retry payloads;
- both cash rewards and compound-funding transfers execute through the grouped
  **escrow** settlement rail, never the generic payout/staking-distribution
  signer;
- the dry-run and actual execution must prove the configured Bet Escrow signer,
  exact request ID, recipient, integer `uwolo` amount, and a real successful
  transaction;
- compound funding is sent to the staking custody wallet; only after that
  receipt is proven may `compoundedRewardsWolo` increase or a confirmed
  `COMPOUND` event be written;
- direct `currentStakedWolo` principal remains a separate user-deposit bucket;
- per-allocation state claims are conditional and atomic so concurrent retries
  cannot double-credit liability;
- v2 run/request IDs are deterministic and the full original positive-reward
  payout set is reconstructed on retry so grouped-run identity cannot drift;
- historical synthetic compounds are evidence to reconcile, not rows to
  silently rewrite.

Reward distribution remains safety-paused until historical compounded liability,
staking custody, and operating reserve are reconciled and activation is
separately certified.

## Current app capability

The profile Auto Bet Reserve is a preview-only automation surface.

It may:

- store a self-only winner stake;
- store an optional explicit Desync `NO` or `YES` leg and stake;
- store a finite game count or `Until Out`;
- enforce a maximum estimated plan of 10,000 WOLO;
- evaluate canonical live Watcher winner markets after market reconciliation;
- require a frozen proposition with resolved high-confidence teams and verified
  market integrity;
- prove the preset owner from both an exact roster Steam ID and an uploader UID
  on the exact canonical live session;
- require the exact live Desync child with the same proposition hash when a
  Desync leg is configured;
- materialize at most one durable `shadow_ready` `BetAutoExecution` row for
  each preset/canonical-game identity;
- show identity, Watcher, shadow-worker, runtime, and preview-history readiness.

It does not:

- hold, reserve, escrow, sign, or move WOLO;
- place `BetWager`, `BetStakeIntent`, or `BetStakeTicket` rows;
- consume raw watcher event telemetry as financial authority;
- decrement a finite game count;
- set `acceptedAt`, `reservationId`, or `ticketId` on shadow rows;
- expose a deposit or withdrawal control.

The app endpoints are:

- `GET /api/user/bet-automation`;
- `PATCH /api/user/bet-automation`;
- `GET /api/user/bet-automation/executions`.

All three use the signed-in app session and private, no-store responses. A
preset belongs to exactly one `User`. `BetAutoExecution` is now an active
preview audit/outbox model. The database uniqueness contract
`(presetId, gameIdentityKey)` makes one canonical game one-shot for a preset,
while `presetVersion`, proposition evidence, retry/lease fields, and the
optional future `BetStakeTicket` link preserve the evidence needed by a later
funded executor.

A `shadow_ready` row is historical preview evidence, not a funded queue item.
Editing a preset later does not rewrite that already-observed game decision.

The signed-in Betting Hall may project exactly one pristine `shadow_ready`
row for the viewer's own preset and winner market as **Your Auto Bet Preview**.
That projection is private/no-store viewer state, not public liquidity and not a
recalculation from the current preset. It displays the frozen
`presetVersion`, winner side/stake, optional Desync side/stake, and decision
timestamp recorded when the worker observed the game.

The viewer projector independently revalidates the frozen shadow evidence before
display. It requires the original exact Steam-roster match, exact uploader-UID
match, verified market integrity, resolved/high team authority, matching frozen
proposition hash, and non-empty canonical session/user identity evidence. It
also requires every future-funded marker to remain untouched: no ticket,
reservation, attempt, retry time, lease, lease expiry, or `acceptedAt`.
Malformed winner/Desync amounts or relationships fail closed.

If more than one shadow execution for the viewer's preset references the same
winner market, the Hall displays neither rather than choosing a newest row.
The private preview is attached to the parent winner market only; an optional
Desync leg remains nested inside that frozen plan instead of becoming a second
private card. The DTO carries `financiallyCommitted=false` and never affects
pools, pot, crowd split, odds, projected return, settlement, War Chest, or the
public house **Preview Liquidity** rail.

The Betting Hall may offer an explicit **Load Preview into Bet Slip** action for
that private frozen preview. This is a manual convenience bridge, not Auto Bet
acceptance. A pure client planner re-checks the current winner book, absence of
an existing real viewer wager, exact current Desync child identity/open state,
absence of an existing Desync wager, whole-WOLO amounts, and the current
verified wallet/app cap including the combined Winner + Desync total. It never
clamps or rewrites the frozen preview. If any current condition has drifted, the
button fails closed with a concrete blocker.

A successful load copies the frozen winner/optional Desync side and amounts only
into the existing local manual Bet Slip `SelectionState`. It does not call a
ticket/stake-intent API, connect Keplr, reserve WOLO, sign, broadcast, mutate the
`BetAutoExecution`, set `acceptedAt`, or decrement a finite Auto Bet count.
Financial authority still begins only when the user separately chooses the
existing manual Lock/Wallet action, whose server/chain rail revalidates current
market and stake authority again.

Watcher identity promotion also fails closed around preview evidence. If two
`BetAutoExecution` rows for the same preset would collapse onto one canonical
game identity, promotion is blocked with `auto_execution_preset_collision`
and the exact market family is moved to operator review. The reconciler never
silently merges those preview rows or guesses which one should survive.

## Runtime gate

`BET_AUTOMATION_MODE` is server-owned:

- `disabled`: a plan may be saved, but no shadow evaluation or financial
  execution is active;
- `shadow`: safe default; exact eligible games are evaluated and durable
  preview evidence is recorded, but no financial action occurs;
- `live`: fails closed unless the exact `bet-custody-v1` capability, a valid
  custody URL, and the server settlement token exist.

The durable shadow producer exists. The funded consumer does not. If complete
custody configuration is advertised while the live consumer is still absent,
runtime falls back to `shadow`; if live mode is requested without complete
custody capability, it fails closed to `disabled`. Environment configuration
alone can never activate a money path.

## Why watcher telemetry is not the hook

`POST /api/watcher/events` is telemetry. It does not prove a frozen market,
player side, proposition, stake availability, or chain custody.

The shadow evaluator runs only after the existing market reconciler has consumed
the canonical live-session snapshot and persisted the market proposition. Its
admission chain is:

1. watchers for one game converge on one canonical game identity;
2. the unscheduled winner market is still `live`;
3. team resolution is `resolved` / `high` and market integrity is
   `verified`;
4. the proposition hash is frozen;
5. the preset owner matches an exact roster Steam ID on exactly one side;
6. that same user's UID is an uploader on the exact canonical session or one of
   its proven identity aliases;
7. an optional Desync leg resolves only through the exact live child market with
   the same proposition hash;
8. database uniqueness creates at most one `shadow_ready` row for that preset
   and canonical game.

The worker reuses the same active-session snapshot already loaded by market
reconciliation; it does not trigger a second estate-wide session scan.

A future funded consumer adds the next authority boundary: Wolo must atomically
accept an available-to-reserved transition and the app must durably accept the
corresponding stake ticket. Finite counts decrement only after that financial
acceptance. Shadow evaluation never decrements them. Display order on `/bets`
never determines financial processing order.

## Counter-bettor shadow decisions

Tony and Paulie use the same Preview-first safety philosophy but a different
trigger. Auto Bet begins from canonical Watcher/player identity; counter-bettor
Preview begins only from an already-committed human `BetWager`.

When a counter-bettor is explicitly enabled in effective `shadow` mode:

1. the human wager commits first on the existing financial rail;
2. a best-effort post-commit hook passes that exact wager ID to the shadow
   evaluator;
3. the evaluator acquires a transaction-scoped per-bot advisory lock and
   re-reads the current bot policy plus source wager;
4. reserved internal-system identities are rejected;
5. only active wagers on an `open` or `live`, integrity-verified market with
   a frozen proposition are admitted;
6. the deterministic `opposite-counter` policy chooses the opposite side and
   caps the proposal by source amount, configured default/max, the immutable
   10-WOLO hard cap, and remaining per-market/daily shadow exposure;
7. one append-only `BetCounterAction` is written under a policy/bot/market/
   source-wager/proposition idempotency key.

The action is evidence only. `committedCounterstakeWolo`,
`availableBalanceWolo`, custody verification/reservation fields, and
`stakeTxHash` remain null/false. Shadow mode uses a labeled policy-planning
balance envelope only to exercise the pure balance-floor guard; it is not a
wallet lookup or a custody claim. Database constraints independently prevent a
committed counterstake from existing without verified custody, reservation and
transaction proof.

A shadow decision happens once at the source wager's commit context. If daily or
market exposure blocks that action, the skip is not retried the next day as a
late counter to an old human wager. Duplicate client recovery may rerun the same
decision safely because the append-only idempotency key deduplicates it.

Bot configuration updates take the same advisory lock as shadow decisions. A
decision therefore snapshots either the policy before the save or the policy
after it, never a race between both.

No LLM has money authority. Commentary remains optional flavour after the
deterministic decision and cannot choose market, side, amount, exposure,
custody, transaction or wager.

### Betting Hall Preview Liquidity

A counter-bettor shadow proposal may be visible on its current Betting Hall
market as **Preview Liquidity**. The visible row is deliberately not a wager,
standing offer, reserve, pool contribution or quoted executable balance. It
records that deterministic policy would have countered the already-committed
human action in that historical decision context.

The public board reads only zero-custody `shadow_proposal` evidence and exposes
a small display DTO: bot label, counter side, proposed WOLO, recorded time and
`financiallyCommitted=false`. Rows carrying any committed counterstake,
available-balance value, verified custody, reservation or stake transaction are
excluded from this Preview surface. Real pot/odds/return math continues to read
only canonical seeds and countable committed human wagers.

## Required Wolo architecture

One signed 10,000 WOLO deposit funding future games is chain-backed custodial
prefunding, not per-game on-chain escrow. WoloChain remains authoritative for
accounts, deposits, balances, reservations, settlement, releases, and
withdrawals. AoE2HDBets stores projections and product state only.

No consensus upgrade is required for the recommended design. Extend the Wolo
settlement service on port `8092`; do not rebuild or replace the deliberately
pinned consensus binary. Prefer a dedicated prefunded-betting custody signer
instead of mixing reusable customer liabilities with payout, faucet, Founder,
or legacy manual-bet funds.

## Copy-paste prompt for the WoloChain thread

```text
Work in /Users/tonyblum/projects/WoloChain-wolo-1.

Read that repo's AGENTS.md, /Users/tonyblum/projects/VPSSentry/context/SYSTEM_MAP.md, and
/Users/tonyblum/projects/VPSSentry/context/SERVER_STORAGE_MAP.md. Inspect settlement.go,
settlement_test.go, settlement_challenge.go, the settlement contracts and
runbook, env/systemd examples, and backup/restore/verify scripts.

Implement a versioned prefunded AoE2 betting-custody rail in the Wolo
settlement service so one signed user deposit, capped at 10,000 WOLO, can fund
multiple future winner/desync ticket legs.

Critical boundary:
- This is a settlement-service feature, not a consensus upgrade.
- Do not alter, rebuild, replace, restart, or deploy the preserved wolo-1
  consensus binary.
- Do not mutate live state, rotate/create live keys, or deploy in this task.
- Preserve every existing payout, grouped-run, escrow, and challenge contract.
- Never expose secrets or commit production values.

Implement:

1. An optionally configured dedicated prefunded-betting custody signer/address
   and protected state directory. New endpoints fail closed when unconfigured;
   existing settlement behavior remains unchanged.

2. Opaque betting accounts bound to the source wallet proven by the first valid
   deposit. Users keep their Keplr wallet; no per-user chain wallet is needed.

3. One-time deposit intents using a canonical memo such as:
   wolo.bet.reserve.v1:app=aoe2hdbets&acct=<opaque>&dep=<uuid>&amt=<uwolo>
   Verify the exact field set, chain ID, uwolo denom, recipient, sender, amount,
   successful final transaction, and memo. Credit a tx once only. Enforce a
   configurable default maximum credited balance of 10,000 WOLO.

4. A service-authoritative append-only ledger with materialized account
   snapshots for available, reserved, settlement debit/credit, withdrawal
   pending/executed, refund, and explicit operator-capital/subsidy entries.

5. Atomic idempotent order reservations containing a winner leg and optional
   Desync YES/NO leg. Each request carries account, request/order ID, canonical
   game identity, proposition hash, market identity/type, side, and integer
   amount_uwolo. Hold the combined total, but settle/release legs independently.

6. Bearer-authenticated loopback APIs under /settlement/v1/bet-custody:
   POST /accounts
   GET /accounts/{id}
   POST /deposit-intents
   POST /deposits/credit
   POST /reservations
   GET /reservations/{id}
   POST /reservation-legs/{id}/release
   POST /settlement-runs/validate
   POST /settlement-runs
   POST /withdrawals
   GET /accounts/{id}/ledger
   GET /liabilities
   POST /reconcile
   Return stable failure codes, retryability, ledger sequence, and idempotent
   replay results. All amounts are canonical integer uwolo strings.

7. Settlement consumes each reservation leg once. Voids release exact stake.
   Credits cannot exceed reserved/debited funds plus an explicit operator
   allocation. Synthetic seed liquidity must never create an unbacked liability.

8. Withdraw available funds only and only to the proven source wallet unless a
   separately signed wallet-rotation flow exists. Recover safely when restart
   occurs after chain broadcast but before response persistence.

9. Add a signer-wide cross-request lock/queue. Current per-request and per-run
   locks do not prevent different IDs racing one signer account sequence.

10. Persist beneath the protected settlement volume with append-only journal,
    versioned snapshots, atomic rename plus fsync, integrity checking, restart
    recovery, reconciliation, backup/restore, and alert coverage. Never silently
    repair or discard corrupt state.

11. Keep user liabilities and operator/AI capital explicitly separated. AI
    counter-bettor stakes are operator-funded, capped, and cannot consume user
    liabilities.

Add exhaustive tests for duplicate deposits; malformed/wrong chain, denom,
sender, recipient, memo or amount; the 10,000 cap; concurrent reservations;
insufficient balance; multi-leg settlement/release; proposition mismatch;
conflicting idempotency; withdrawal/reservation races; signer serialization;
restart recovery; liability reconciliation; corruption detection; operator
subsidy conservation; and regression of every existing settlement route.

Run the repo's real formatting and Go test commands. Update contracts,
runbooks, env examples, and backup/restore/verify tooling. Return exact API
examples, the failure-code table, state layout/invariants, the AoE2HDBets
integration checklist, and production migration/deploy/rollback plan.

Implement and verify locally, then stop before production deployment or any
live-state/key mutation.
```

## Activation checklist

Before changing the app from Preview:

1. **Done in app:** durable canonical-market shadow evaluation with exact
   Steam/uploader identity proof, preset/game uniqueness, and no money path.
2. Run the shadow worker long enough in production to reconcile its decisions
   against actual live Watcher games, identity promotion, Desync siblings, and
   concurrent market refreshes.
3. Deploy and verify the Wolo service contract without touching consensus.
4. Back up and verify settlement state.
5. Add app custody account/deposit/withdrawal projections.
6. Add a separately reviewed funded consumer with database leasing,
   reservation idempotency, stake-ticket acceptance, and restart recovery.
7. Test duplicate watchers, concurrent games, insufficient balance, roster
   change, proposition promotion, void, restart, and withdrawal races across
   both the app and custody service.
8. Decrement finite game counts only after durable financial acceptance.
9. Enable live execution only in a separate reviewed release.
