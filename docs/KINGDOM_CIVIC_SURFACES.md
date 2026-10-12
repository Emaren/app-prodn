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
reviewed_at: "2026-10-06"
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

## Kingdom summary truth

`/kingdom` does not maintain a separate handwritten current-state ledger.

Its top summary and right-side Ledger project from `lib/kingdomSummary.ts`:

- Chronicles are the live count of War Room threads in the canonical `wolo-chronicles` channel.
- Latest Bounty is derived from the same canonical numbered on-chain bounty-transfer rail used by the Staking bounty view.
- Citizens and Joined The Quest are the current signed-account population after exact internal-system UIDs are excluded; the visible citizen roll uses that same human-account projection.
- Watchers is the all-time proven Watcher operator roster: distinct human accounts that have at least one final replay accepted through a `watcher*` parse source. A citizen stays on this roster even if their Watcher is not running today. Multiple replays and multiple Watcher sessions for one citizen do not inflate the count. The Kingdom renders the same proven roster by name beside Citizens.
- Kingdom Wealth is the current summed WoloChain balance of an explicit unencumbered community-reserve allowlist: Community Treasury, DEX Liquidity Reserve, Faucet Growth Reserve, Faucet Hot Wallet, Validator Ops, Ecosystem Bounties, Workshop Sponsorships, and Wolo-Osmosis relayer gas. It explicitly excludes founder cold/operating wallets, Founder Rewards, player wallets, staking principal and Staking Distribution Reserve, bet/IBC escrow, network module accounts, and retired wallets.
- Live Wolo balances are cached briefly and fail closed: if the current Kingdom-wealth read cannot be completed and no last-good value exists, the page says the wealth is unavailable instead of substituting max supply or a hand-entered number.

These values are source-derived presentation facts. They do not redefine
WoloChain ownership or make custody balances spendable merely because they are
presented in the Kingdom ledger.

## Kingdom Treasury — public read-only financial instrument

The `/kingdom-treasury` page is a public, read-only instrument panel. The
Kingdom dropdown places it beside Kingdom Intelligence. It is not a bank
ledger, a fund transfer interface, an authorized audit, a payout trigger,
or a self-reported profitability statement.

### Three independent monetary rails

1. **WoloChain ledger (WOLO, not dollars).** The public
   `/api/wolo/holders` view is the authority for the **current funded holder
   census**, including eligible active-stake addresses. It never includes a
   historical zero-balance address merely to satisfy a claimed target count.
   Registered system and module accounts are displayed separately from
   `/api/wolo/network`; those registry rows do **not** inflate the
   current-holder count. Public non-user network-account bank balances may
   be displayed, but player balance amounts remain hidden under the existing
   `protocol_system_only` holder privacy policy. No newly invented
   balance-disclosure rule.
2. **Osmosis liquidity (USDC-derived USD estimate).** The source is
   `/api/wolo/osmosis-pulse` for the configured WOLO/USDC pool. It shows
   source pool ID, timestamp, reserves and reported `liquidityUsd`.
   The pool estimate equals twice the USDC reserve as defined by the existing
   feed; this is *not* audited treasury NAV, realized market revenue, or
   additive spendable cash in the community reserve. A failed pool request
   displays unavailable rather than $0 or a manually estimated $44.
3. **Founder-reported operating expenses (unconfirmed $ currency).** Oct 12
   estimates: ChatGPT $24.99/month, Hetzner VPS $31.95/month and
   Microsoft/Azure signing $14.95/month; baseline $71.89 per month.
   Apple developer program $99 is planned/unpaid with cadence unconfirmed,
   excluded from the monthly subtotal. Neither CAD/USD currency nor any
   invoice/payment timestamp is verified. Without verified revenue, actual
   net profit or loss is **unavailable**; `$71.89` is only the
   reported monthly break-even floor before other expenses.

The headline **unencumbered Kingdom Wealth** reserves only the eight
community accounts from `lib/kingdomSummary.ts`. Other registered module,
staking, bet escrow, founder, and player accounts cannot silently augment
spendable community wealth. Balance reporting is non-authoritative for
settlements; this is only a visual projection.

### Transaction flow / payout classification

The page reads the existing public `/api/wolo/mainnet-transfers?limit=25`
index, which supplies a *bounded sample of 25 indexed successful MsgSend
rows*, not a complete financial history. A transfer is displayed in the
kingdom-origin stream only if its sender is an eligible network system account.
The public rail also excludes faucet hot-wallet disbursements and
`senderKind=faucet` transfer evidence, keeping small claims in internal
operational logs rather than mislabeling them as kingdom payouts.
A bank-send event is **not** automatically claimed to be a champion bounty,
founder bonus, marketplace purchase, or bet payout. Such payment categories
remain explicitly awaiting dedicated purpose-bound settlement receipts.
The page sends no transaction, touches no betting or escrow state and uses no
admin operator API from public clients.

### Historic wallet identities and internal incident provenance

The August 2026 faucet incident remains an **internal security log**, not a
public Treasury statistic. No claim totals, losses, or suspect counts appear on
`/kingdom-treasury`. The operator's October 12 screenshot identifies eight exact,
checksum-valid public addresses. WoloChain displays those eight as
"August 2026 faucet hack" with a visible "Operator-reported · forensic
match pending" qualifier, not a claim of independently proven attack
ownership. The classification is address-bound, never rank-bound, and
requires the holder still be unclassified; source-chain verification of
their liquid balances is done by the existing public per-address read.
A future transaction-graph join must independently corroborate or
correct the incident cohort. Treasury does not publish the incident
or claim totals and excludes its faucet hot-wallet sends.
Do not assign an attacker identity to any particular address without a
sealed address-level incident membership proof. The canonical
`WOLO_MAINNET_NETWORK_ACCOUNTS` registry **already contains two historical
player addresses**: `[BDB]Pigman` at
`wolo1ntal93v8c5wryq2d9puhks8l25zedhepyv8n5k`, and `Ra 𓁛𓇳` at
`wolo198ajhn5atpw65u6z89z5hwfer2vx90u4ydxe7z`. “BDB” is part of
Pigman's registered tag; “Raw” is not proven to be a separately owned wallet.
Historical July observations showed both with zero WOLO, but their **present
membership must always be derived afresh from live holder data**. The
dashboard displays both with exact addresses and membership badges; they
never inflate current-funded counts merely because they are registered.
The WoloChain holders page now also displays those two historic records after
the current-live ranking (38 visible addresses when the chain currently has 36
funded/staked and neither historic identity is funded). Their row position is
directory index, not a claim of a globally exhaustive address universe; a live
`/api/wolo/balance/{address}` chain-bound response must confirm zero before
`0 WOLO` is shown. A failed read displays balance unavailable. It never
promotes historic zero records into the authoritative funded holder census.

### Design and performance

The design uses graphite, black iron, cold-copper gold, cyan liquidity and
restrained rust-colored expense components, with CSS-only decorative
mechanisms and `prefers-reduced-motion` support. Indicators show source
connection/aging only, not fabricated funds movement. The client polls public
read models in the foreground at a bounded cadence (no background polling).
Each source can fail independently without its amounts turning into fake zero.
The route participates in the mandatory SpeedOS public campaign.

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
requests cannot over-allocate one identity's Forge capacity. Public reads and
the cheap eligibility precheck use the current confirmed canonical snapshot;
accounts without excess principal cannot trigger a corpus scan. Eligible commit
requests then reconcile the complete mainnet transfer/event ledger, resolve only
the addresses present in that corpus without global identity limits, and fail
closed on an unexplained outbound or current canonical mismatch. Concurrent
strict scans coalesce behind a short-lived in-process reconciliation promise.
The transaction lock then rechecks current canonical principal and all active
commitments before writing. The snapshot exposes ledger source and health
instead of silently substituting another source. A new or recast commitment is stored with
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
Publishing `settled` requires a durable `YES` or `NO` result, at least 20
characters of evidence, resolver UID, and resolution timestamp. Publishing
`voided` requires `VOID` with the same evidence and resolver facts. The database
refuses terminal status without those facts and refuses terminal facts on a
nonterminal market. The optional observed resolution value and the full evidence
are rendered beside the market and preserved in its Chronicle.
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

Only the staking reward job passes this cap into the historical staking-event
derivation. Current public staking, execution limits, and Forge capacity use the
confirmed canonical position (`current_staked_wolo` plus finalized compounded
rewards) without applying the cap to displayed/withdrawable principal.

Daily finalization cursor-pages the complete confirmed `STAKE`, `UNSTAKE`, and
`COMPOUND` event ledger through the period boundary and applies the cap over
that exact interval. The logical event ledger spans retired and current custody
wallets, so a custody migration cannot silently omit an earlier unstake. It
does not compare a historical midnight snapshot to today's canonical position.
Strict current reconciliation compares the complete confirmed event ledger to
the canonical current positions and fails closed on disagreement. Raw indexed
bank sends remain transfer-audit evidence and cannot independently create
staking liability or reward weight.

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

## Round Chamber presentation contract

The `/round-chamber` civic surface uses the monumental Senate presentation
introduced on 2026-08-14. The visual language is ancient Roman/Greek/Spartan:
black stone, bronze, restrained gold, monumental serif typography, and the
circular chamber artwork at
`public/round-chamber/round-chamber-senate-hero.png`.

The presentation must never fabricate civic state. The hero docket, proposal
counts, ballot counts, support percentages, deliberation, public ballot ledger,
and Chamber Chronicle continue to render from the existing Round Chamber
snapshot/API and database records.

A presentation release must not seed, replace, delete, or rewrite existing
proposals, votes, comments, or chronicle events. Existing citizen activity stays
authoritative across visual redesigns.

The Round Chamber is also the first consumer of the versioned Kingdom page-change
notice contract. Browsers that have not visited the current Senate V2 route
version see a muted dot in the Kingdom navigation until they actually visit the
page.
