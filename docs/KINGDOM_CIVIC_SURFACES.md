---
id: "aoe2war.app-prodn.docs-kingdom-civic-surfaces"
title: "Kingdom Civic Surfaces"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-and-implementation-contract"
reviewed_at: "2026-08-08"
review_interval_days: 30
sensitivity: "internal"
---

# Kingdom Civic Surfaces

## Purpose

AoE2WAR owns three connected public products:

- `/round-chamber` is the citizen proposal, deliberation, and civic-ballot surface;
- `/kingdom-forge` turns stake above the Kingdom reward lane into explicit project-support signals and records Feature Deed provenance;
- `/oracle` and `/oracle/[slug]` are exact-rule forecasting markets using non-transferable Oracle Marks.

These products share the signed AoE2WAR identity and a durable event record, but
they do not share ledgers with replay-backed `BetMarket` wagers. Each domain has
its own tables, lifecycle, and authority boundary.

## Route and API contract

### Round Chamber

`GET /api/round-chamber` returns the chamber snapshot and may be read without a
session. `POST /api/round-chamber` requires a signed account with a linked Steam
identity and supports:

- `create_proposal`;
- `cast_vote` with `support` or `oppose`;
- `add_comment`.

There is one current ballot per user and proposal. Casting again updates that
ballot and appends a `ballot_changed` event; it does not create a second vote.
Voting is accepted only while the proposal is open and before its published
close. `PATCH /api/round-chamber` is admin-only and may `adopt`, `decline`, or
`reopen` a proposal with a stewardship note.

The governance mode is `app_civic_one_account_one_ballot`. Round Chamber votes
are AoE2WAR civic decisions, not stake-weighted WoloChain `x/gov` votes, and
they do not execute chain changes.

### Kingdom Forge

`GET /api/kingdom-forge` returns public project, milestone, deed-supply, support,
and chronicle state plus a private viewer projection when signed in.
`POST /api/kingdom-forge` requires a signed account and supports:

- `commit` and `withdraw` for a citizen's Forge Power signal;
- admin-only `set_project_status` and `set_milestone_status`;
- admin-only `grant_deeds`, with a unique source reference and a transactionally
  enforced class-supply ceiling.

Commitment writes use an actor-scoped Postgres advisory lock so concurrent
requests cannot over-allocate one identity's Forge capacity. The mutation path
reconciles the complete mainnet transfer/event ledger again inside that lock and
fails closed if canonical and derived principal disagree. The snapshot exposes
the ledger source and health instead of silently substituting another stake
source. A new or recast commitment is stored with
`settlement_mode = app_signal`. It does not transfer, lock, unbond, or custody
WOLO. A funded or otherwise settlement-controlled commitment cannot be recast or
withdrawn through the app-signal path; its chain proof remains immutable and a
verified settlement/refund rail must handle it. Project lifecycle, milestone,
and deed-grant controls are available in the admin Operator Foundry.

### Oracle

`GET /api/oracle` returns the market board, exact rules, live context, proposals,
viewer balance, and recent chronicle. `GET /api/oracle/markets/[slug]` returns
the same truth for one market. Both are dynamic, private/no-store responses.

Signed users receive a 1,000 Oracle Mark allocation across active markets.
`POST /api/oracle` supports:

- `position` to open, update, switch, or clear one YES/NO position per user and
  market;
- `proposal` to submit a binary market with close and resolution times, a named
  source metric, an exact YES rule, a void rule, and a future WOLO pool ceiling.

Oracle Mark allocation is protected by a user-scoped advisory lock. Available
Marks equal 1,000 minus positions in active markets. Settled and voided markets
leave the active allocation, making those Marks available again. Displayed
probability is the share of YES Marks in the total YES/NO pool, including the
market's seed Marks.

Live pulse values are current context only. If an adjacent metric source is
unavailable, the Oracle floor degrades those values to zero without taking down
the market ledger. The exact published source, resolution rule, and Chronicle
remain authoritative.

`PATCH /api/oracle` is admin-only. `review_proposal` approves or rejects a
citizen proposal; approval opens a market with balanced seed liquidity.
`market_status` enforces the published lifecycle:

`draft -> review -> approved -> trading -> locked -> resolving -> challenge -> settled`

The allowed branches also support pause/resume and terminal voiding where the
implementation permits them. A market cannot reopen after its published close.
Oracle Marks are non-transferable forecast units, not WOLO, and have no chain
custody or payout. The proposal's 100 WOLO bond and future pool ceiling are
explicit design metadata; `bond_status = not_funded` is the truthful initial
state.

## Reward-cap and Forge Power rule

The AoE2WAR daily staking-reward calculation caps reward-bearing principal at
`1,000,000 WOLO` per linked AoE2WAR identity across its wallets. The app first
aggregates stake to the linked user, then applies the cap to reward weight.

The cap does not change delegation, unbond funds, hide total stake, or alter
WoloChain distribution. Principal above 1,000,000 is exposed as Forge Power:

```text
reward-eligible principal = min(identity stake, 1,000,000 WOLO)
Forge Power               = max(identity stake - 1,000,000 WOLO, 0)
```

Only the staking reward job passes this cap into the shared staking derivation.
Other staking views may continue to derive the full chain principal.

## Feature Deeds

Every Forge project has exactly 10,000 Feature Deeds:

| Class | Supply | Meaning |
|---|---:|---|
| Patron | 7,000 | Citizen patron provenance |
| Builder | 2,000 | Builder/contributor provenance |
| Kingdom | 1,000 | Kingdom reserve |

`ForgeDeedHolding` is an app provenance and governance ledger. The default
`rights_mode` is `provenance_governance`; a row is not a transferable chain
asset, a wallet balance, or a promise of revenue. The migration and admin grant
path enforce class and total supply. Every grant requires an idempotent external
`source_ref` and appends a `deeds_issued` event.

## Durable data model

Migration `20260808170000_add_kingdom_civic_surfaces` creates and seeds the
three domains:

- Chamber: `RoundProposal`, `RoundVote`, `RoundComment`, `RoundEvent`;
- Forge: `ForgeProject`, `ForgeMilestone`, `ForgeCommitment`,
  `ForgeDeedHolding`, `ForgeEvent`;
- Oracle: `OracleMarket`, `OraclePaperPosition`, `OracleMarketProposal`,
  `OracleEvent`.

The SQL tables are `round_*`, `forge_*`, and `oracle_*`. The migration seeds the
founding Chamber proposals, initial Forge projects and milestones, and the
first Oracle markets. Seed records obey the same product lifecycles as records
created through the APIs.

`round_events`, `forge_events`, and `oracle_events` are append-only at the
database layer: triggers reject `UPDATE`, `DELETE`, and `TRUNCATE`. Corrections
are new superseding events. Domain records such as a current ballot, commitment,
milestone, or market status remain mutable through their validated application
actions; the event chronicle preserves how they changed.

## Source ownership

| Concern | Owning source |
|---|---|
| Chamber snapshot, validation, civic mode | `lib/roundChamber.ts` |
| Chamber mutations | `app/api/round-chamber/route.ts` |
| Reward principal and Forge Power math | `lib/stakingRewardCap.ts` |
| Daily capped reward distribution | `lib/staking.ts` |
| Forge projection and policy | `lib/kingdomForge.ts` |
| Forge mutations | `app/api/kingdom-forge/route.ts` |
| Oracle allocation, probability, proposal, and lifecycle | `lib/oracle.ts` |
| Oracle mutations and market reads | `app/api/oracle/route.ts`, `app/api/oracle/markets/[slug]/route.ts` |
| Durable schema | `prisma/schema.prisma` and migration `20260808170000_add_kingdom_civic_surfaces` |

## AoE2WAR and WoloChain boundary

AoE2WAR is authoritative for citizen identity, Chamber rules and ballots,
staking reward-weight policy, Forge projects and support signals, Feature Deed
provenance, Oracle questions/rules/Marks/probabilities, and each app lifecycle.

WoloChain is authoritative for `wolo-1`, `uwolo`, addresses, balances, signed
bank transfers, custody proofs, and executed settlement. An app row may claim
`chain_verified` only after the exact transaction and purpose-bound proof have
been validated. Never describe an `app_signal`, Oracle Mark, proposed bond, or
future pool ceiling as moved, locked, escrowed, or settled WOLO.

Round Chamber civic votes remain distinct from chain governance. The
1,000,000-WOLO reward cap remains distinct from chain staking. Oracle and Forge
must use separate purpose-specific custody and signer state if chain funding is
added; neither may reuse the existing Bet or Founder settlement liabilities.

## Deployment and verification

Before release:

```bash
npx prisma generate
npx tsc --noEmit --pretty false
npm run build
```

On production, deploy code and schema in this order:

1. Confirm the VPS checkout is clean and root-volume headroom is sufficient.
2. Pull the released `main` commit with `git pull --ff-only`.
3. Run `npx prisma migrate deploy` before restarting the web service.
4. Verify all thirteen new tables exist, the three append-only triggers are
   enabled, seed rows exist once, and Prisma reports no pending migrations.
5. Build, restart `aoe2hdbets-web.service`, and require it to be active with no
   new route, Prisma, or migration errors in its journal.
6. Require HTTP 200 from `/round-chamber`, `/kingdom-forge`, `/oracle`, and a
   seeded `/oracle/[slug]`; read each GET API and confirm `no-store` behavior.
7. Verify one authenticated read for viewer-specific Chamber, Forge, and Oracle
   state without performing a production mutation.
8. Verify the next staking reward dry-run/log records
   `rewardWeightPolicy = linked_identity_cap_v1` and
   `rewardWeightCapWolo = 1000000` while preserving the full stake projection.
9. Read Wolo node and settlement health as a boundary check. Do not restart or
   replace the intentionally pinned consensus binary as part of this app deploy.
