---
id: "aoe2war.app-prodn.docs-championship-implementation-handoff"
title: "Championship Challenge V1 Implementation and Release Handoff"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "engineering-handoff"
reviewed_at: "2026-09-30"
review_interval_days: 30
sensitivity: "internal"
---

# Championship Challenge V1 Implementation and Release Handoff

This campaign implements the app-owned Championship Belt Constitution V1 and
new `championship_v2` Challenge protocol. It does not deploy, mutate production
data, restart services, send chain transactions, or upgrade WoloChain. App
custody and money obligations are durable; belt NFT execution is explicitly
blocked until the chain capability handoff is implemented.

## Delivered behavior

| Area | Contract |
| --- | --- |
| Display | Persisted V1/V2 dimension, default V2, independent Basic/Advanced/Extreme rails at the bottom of hub/detail. Existing V1 remains selectable. Display changes cannot change a persisted protocol or clock. |
| Challenge formation | V2 removes duration/appointment controls, shows the selected rival's complete held title stack, selects the weakest eligible solo title, and exposes only held team-title actions. Admin title selection/bypass is explicit and audited. |
| Solo policy | Central ELO Rising through Legend, DM before RM within each tier, DM/RM crowns, eligible national/regional and explicit special titles, World last. World is open; unknown policy fails closed; Chaos requires popular vote or Commissioner authority. |
| Team custody | Six independent RM/DM size identities, 18 stable physical seats, atomic full-roster reigns. A team title does not become independent per-member titles or affect another lane/size. |
| Participants | Exact disjoint registered rosters, current Steam identities and sealed wallet snapshots. Everyone receives the parent card and accepts/funds individually. Ordinary roster substitution is forbidden. |
| Money | Existing signed left/right WOLO verifier reused through hidden paired financial legs. Positive title wager per warrior, zero new Match Guarantee. One parent defense; winning seats receive paired purses; refunds return proven original deposits. |
| Clock | Server creation plus 24h, then one Commissioner hour for title default. Acceptance/funding never renew it. The live seconds countdown uses a server anchor; final-hour urgency includes text and accessible status. |
| Start | Authenticated parsed live Watcher evidence, exact roster/mode/size/opposing teams and timely server observation. Start proof is durable and stops default; final may arrive later. |
| Final | Exact full roster, opposing teams including team ID zero, lane, trusted full Watcher coverage, canonical winner, desync safety, unique replay/session and unchanged custody. Weak/contradictory proof remains review. Late final cannot reopen disposition. |
| Default | One valid accepted/funded claimant may take custody after grace; both-ready ambiguous fault remains review. Multiple valid sides create durable disputed custody and freeze bounty once. Default never invents an unplayed purse winner. |
| Economics | Trophy locks and existing ledger reconcile outgoing same-day unexecuted Tribute, protect paid/partial/tx-backed obligations, freeze one outgoing bounty, reset base and start incoming accrual. Team amounts are one title total, equally split in integer uwolo with stable-seat remainder. |
| Commissioner | Assignment/correction/restoration, exact team roster, explicit eligibility bypass, protection/veto/review, audited extension, objective default evaluation, exceptional-evidence audit and dispute resolution. All share custody/money truth. |
| NFT | One durable group and every expected-owner/recipient/token seat. No fake ownership. Executor absent is blocked. All seats require success proof; confirmed/tx-backed seats are excluded from unsafe retry. |
| Public cards | Shared state/proof component in Challenge detail, hub cards and conversation cards; parent participant counts, deadline, title, acceptance/funding, defense/result/default/payment/bounty/NFT state and next action derive from the server projection. |
| Legacy | Old Challenge rows retain their clocks and guarantees. Hidden team legs are excluded from ordinary public/bet seeds and legacy reconciliation, and their payments require the parent's verified result and parent desync authority. Historical scalar ELO result handling cannot silently bypass explicit new custody. |

## Owning files

| Layer | Main files |
| --- | --- |
| Central title policy | `lib/champions/beltPolicy.ts`, `lib/champions/eloTrophy.ts` (existing authority), `lib/champions/titleState.ts`, `lib/champions/titles.ts` |
| Custody/economics | `lib/trophies/championship.ts`, `lib/trophies/allocatedFounderPayout.ts`, `lib/trophies/actions.ts`, `lib/trophies/service.ts`, `lib/trophies/types.ts` |
| Protocol/state machine | `lib/challengeChampionshipProtocol.ts`, `lib/championshipChallenges.ts`, `lib/challengeReconciler.ts`, `lib/challenges.ts`, `lib/scheduledMatchSettlements.ts` |
| Watcher/replay boundary | `lib/liveSessionSnapshot.ts`, the existing `/api/replay/upload`, `/upload-package`, `/post-ingest` routes |
| APIs | `/api/challenges`, `/api/challenges/[id]`, `/api/championships/held`, `/api/admin/trophies`, `/api/admin/championship-challenges`, `/api/admin/championship-transfers` |
| Public UI | `ChallengeWorkspace`, `ChallengeHeldTitles`, `ChallengeChampionshipState`, `ChallengeDisplayRail`, `ChallengeDetailDisplay`, `ChallengeRoomControls`, `ChallengeRoomConversation`, `ScheduledMatchCard`, `useChallengeClock`, `lib/challengePresentation.ts`, Challenge detail route |
| Public custody adapters | `lib/champions/championsV2.ts`, `components/champions/ChampionsV2Experience.tsx`, `components/players/PlayerProfilePage.tsx`, `lib/lobbySnapshot.ts` and Trophy profile projection in `lib/trophies/service.ts` |
| Admin | `ChampionshipCommissionerCockpit` and `TrophyCommandCenter` in `components/admin/trophies/` |

## Additive database frontier

The two new migrations create nine tables only:

1. `20260930120000_championship_custody_v2`: `championship_custody_reigns`,
   `championship_custody_seats`, `championship_transfer_groups`,
   `championship_transfer_seats`, `trophy_payout_allocations`.
2. `20260930173000_championship_challenge_protocol`: `championship_challenges`,
   `championship_challenge_participants`, `championship_challenge_legs`,
   `championship_title_disputes`.

New indexes/foreign keys/check constraints belong to these new tables. No
existing column or historical record is converted. Existing TrophyPayout and
ScheduledMatch remain money authorities. A partial unique index permits only
one current explicit reign per title; unique request, participant/seat,
defense-session, dispute epoch and replay/funding claims preserve identities.

## Validation and release evidence

Final validation results and logical commit references are recorded here after
the implementation gate. Tests use the explicit isolated local database
`aoe2_championship_v1_qa_20260930`; fixture funding/transaction proof is
synthetic test evidence and is never represented as live-chain success.

## Chain dependency and limits

The supplied September 24 Wolo reference is a source snapshot, not a current
production capability audit. WoloChain owns supply, denom, chain identity,
signed transfers and NFT ownership. The app deliberately persists
`NFT_EXECUTOR_UNAVAILABLE` until a restricted authority executor proves exact
owner CAS, immutable request deduplication, group/seat transfer and chain
success plus owner readback. The
[chain capability handoff](./CHAMPIONSHIP_CHAIN_HANDOFF.md) contains its proposed
API/auth/class/token/proof/partial-retry contract and ready engineering prompt.

No new voting platform or automated playoff/bracket engine is included.
Exceptional evidence is audited Commissioner authority, never automatic
Watcher proof. Team Tribute requires explicit existing-title activation
(`championship_tribute_active:<trophyId>` setting plus positive configured
amount); assignment alone does not activate more paying titles.

Allocated payments use the existing authenticated protected Founder listener
on port 8093 with exact string uwolo. They verify request/signer/recipient/amount
binding and committed successful bank events before recording paid. Scalar
Trophy payouts retain the existing adapter. The new rail does not fall back to
an app mnemonic signer. Accepted/uncommitted or lost responses retain uncertain
liability and cannot be automatically broadcast again. Admin **Reconcile
proofs** may confirm stored transaction hashes with read-only chain proof.
No stored hash means chain-owned request inspection is required; liability is
preserved until that outcome is established.

## Separate deployment handoff

Only after separate release authorization:

1. Inspect `aoe2war status`, `aoe2war audit`, `aoe2war doctor` and
   `aoe2war finish --dry-run`. Reconcile live source/runtime authority; do not
   infer health from Git parity.
2. Gate the exact final candidate as `FINANCIAL` (it also changes database and
   replay custody behavior). Confirm the exact pending migration frontier
   includes the two additive migrations above and no unrelated SQL.
3. Use `aoe2war finish`. Require its durable pre-migration pg_dump and SHA-256,
   exact migration receipt, exactly-once `_prisma_migrations` proof, stopped
   activation transaction, certified receipt and protected Wolo listener
   continuity. Do not run ad hoc `prisma migrate deploy`, pull/build/restart,
   or mutate chain infrastructure.
4. Verify all nine new tables/constraints in live PostgreSQL, public and admin
   routes, participants/funding proof, existing reconciliation timer health,
   replay ingestion, and browser rendering. Verify unchanged legacy behavior
   and paused/retired title safety. Inspect NFT queues as blocked, not owned.
5. Confirm Founder Rewards/Bet Escrow settlement health independently of NFT
   capability. Payment retry requires its existing request proof, never title
   assignment alone. Preserve immutable rollback generations and receipts.

This handoff authorizes no deployment by itself. Runtime/migration identities
and availability must be read live when the separately authorized release runs.

Environment additions: none are required for this app feature. Keep the
existing `DATABASE_URL`, `WOLO_SETTLEMENT_URL`, `WOLO_SETTLEMENT_AUTH_TOKEN`,
`WOLO_FOUNDER_SETTLEMENT_URL`, `WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN`, and
`CHALLENGE_RECONCILE_TOKEN` (or existing `CRON_SECRET`) configured through the
existing production environment authority. Do not copy secrets into the repo.
No NFT executor URL is invented; its capability remains unavailable.

Services/timers: the web activation belongs to `aoe2hdbets-web.service`
(`127.0.0.1:3030`) inside `aoe2war finish`. The existing
`aoe2hdbets-challenge-reconcile.timer` invokes
`aoe2hdbets-challenge-reconcile.service` and `npm run challenge:reconcile`
every five minutes plus up to 30 seconds jitter. Verify that existing timer
and authenticated reconcile endpoint are enabled and healthy; there is no new
daemon or timer in this feature. Worker observation may occur after a boundary,
but stored hour-24/hour-25 deadlines never move. Replay API, Watcher binaries,
and protected Bet/Founder listeners are observed dependencies and are not
deployed or changed by this app release.

Build/restart: the protected finish lane gates/builds/stages the exact commit
and activates the app as one transaction; do not replace it with an in-place
build or direct restart. Its live database migration proof precedes activation.

## Canonical references

- [Belt Constitution](./CHAMPIONSHIP_BELT_CONSTITUTION.md)
- [Challenge protocols](./CHALLENGE_SYSTEM.md)
- [Title economy](./CHAMPIONS_TITLE_ECONOMY.md)
- [ScheduledMatch settlements](./SCHEDULED_MATCH_SETTLEMENTS.md)
- [Commissioner runbook](./CHAMPIONSHIP_COMMISSIONER_RUNBOOK.md)
- [Chain capability handoff](./CHAMPIONSHIP_CHAIN_HANDOFF.md)
- [Engineering memory](./ENGINEERING_MEMORY.md)
