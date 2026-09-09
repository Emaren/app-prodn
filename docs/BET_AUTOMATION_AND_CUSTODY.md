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
reviewed_at: "2026-09-09"
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

The profile Auto Bet Reserve is a preview-only configuration surface.

It may:

- store a self-only winner stake;
- store an optional explicit Desync `NO` or `YES` leg and stake;
- store a finite game count or `Until Out`;
- enforce a maximum estimated plan of 10,000 WOLO;
- expose a durable future execution/outbox schema;
- show identity, Watcher, runtime, and preview-history readiness.

It does not:

- hold, reserve, escrow, sign, or move WOLO;
- place `BetWager` or `BetStakeTicket` rows;
- evaluate watcher telemetry as financial authority;
- decrement a finite game count;
- expose a deposit or withdrawal control.

The app endpoints are:

- `GET /api/user/bet-automation`;
- `PATCH /api/user/bet-automation`;
- `GET /api/user/bet-automation/executions`.

All three use the signed-in app session and private, no-store responses. A
preset belongs to exactly one `User`. `BetAutoExecution` is a dormant durable
audit/outbox model with a unique preset/game identity, immutable proposition
evidence, retry/lease fields, and an optional future `BetStakeTicket` link.

## Runtime gate

`BET_AUTOMATION_MODE` is server-owned:

- `disabled`: a plan may be saved, but no evaluation is active;
- `shadow`: safe default; rules are stored and no financial action occurs;
- `live`: fails closed unless the exact `bet-custody-v1` capability, a valid
  custody URL, and the server settlement token exist.

This app revision has no durable executor, so even a complete future custody
configuration falls back to `shadow`. Environment configuration alone can
never activate a money path.

## Why watcher telemetry is not the hook

`POST /api/watcher/events` is telemetry. It does not prove a frozen market,
player side, proposition, stake availability, or chain custody.

Future evaluation must consume a durable market outbox after:

1. watchers for one game converge on one canonical game identity;
2. the winner market has explicit, high-confidence teams;
3. the proposition hash is frozen;
4. the preset owner matches an exact roster Steam ID and an uploader UID;
5. a database uniqueness guard creates at most one execution for that preset
   and game;
6. Wolo atomically accepts an available-to-reserved transition.

Finite counts decrement only after that final acceptance. Display order on
`/bets` never determines financial processing order.

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

1. deploy and verify the Wolo service contract without touching consensus;
2. back up and verify settlement state;
3. add app custody account/deposit/withdrawal projections;
4. add a durable database-leased market evaluator;
5. test duplicate watchers, concurrent games, insufficient balance, roster
   change, void, restart, and withdrawal races;
6. enable shadow evaluation and reconcile its decisions;
7. enable live execution only in a separate reviewed release.
