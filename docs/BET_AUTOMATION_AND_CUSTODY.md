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
reviewed_at: "2026-10-20"
review_interval_days: 30
sensitivity: "internal"
---

# Bet Automation and Wolo Custody Boundary

## October 20 — reviewer ED25519 role split (held source, NOT activation)

The independently controlled Wolo signer `Policy` binds three distinct
public keys: activation, **wager approval**, and **withdrawal approval**.
The original held HD app mistakenly loaded the withdrawal public key when
validating signed wager reviews at the private 8095 pickup, signer handoff,
financial proof verification and three serializable ledger boundaries.
That error would reject legitimate independent wager signatures and could
mislead operators into provisioning the wrong key.

The corrected wager-only reader is `readWagerReviewerKey`. It requires
a separately provisioned, absolute, nonsymlink private authority file
named by `WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE`, containing
**only** `{"wager_approval_public_key_hex":"<64 lowercase hex>"}`.
The existing `WAR_SATCHEL_VERIFIER_AUTHORITY_FILE` continues to contain
`approval_public_key_hex` for **withdrawals only**. A third, distinct,
privately pinned `WAR_SATCHEL_WAGER_PROOF_VERIFIER_AUTHORITY_FILE` supplies
the Wolo SDK offline verifier's exact financial trust-anchor/vault/escrow
configuration with `approval_public_key_hex` set to the independent **wager**
public key. That file must not be the withdrawal or wager-key-only file.
This is essential because the Go offline verifier's generic JSON field
name does not itself indicate the economic authorization role. The reader denies
a shared file, duplicate public keys, missing keys, symlinks and a
group/world-accessible wager key file. It fails closed without both
independent roles and never creates, stores or imports private signing
keys. The separate WoloChain vault signer config still must prove
`wager_approval_key_hex` matches the independently reviewed wagering
key, without using an app assertion as custody attestation.

Both financial features remain disabled behind
`SATCHEL_FINANCIAL_BRIDGE_READY=false`; no production keys should be
provisioned or activation flags changed until independent Comet bank
solvency, all HD/DE/external liabilities and pending fees, Watcher
witness issuer and Wolo issue #5 six-controls are complete and signed
off. The change is source-only and adds regression tests.


## October 19 — one original-debit rule for review, first send and refund

The held funded Satchel code now uses one pure, source-owned
`satchelReserveDebitIssue` predicate for all three money-sensitive
boundaries: independent wager-review preparation, immediately before
the first durable signing/submission attempt, and prebroadcast
full-principal refund. The callers obtain the immutable
`wager_reserve` journal inside their existing globally exclusive
serializable vault transaction. It must match the reservation source
key, owner, execution, exact positive amount, `-available/+reserved`
account deltas, zero committed/pending deltas and absence of any
deposit or claim-return foreign identity. First-send admission also
compares the journal row ID against the independently reviewed
authorization snapshot, blocking replacement between review and send.

Missing, wrong-owner, wrong-amount, wrong-execution, nonconserving or
substituted journal history now fails before a new wager broadcast
attempt is allowed. Pure regression tests cover these cases plus
source-order checks; the original no-send refund tests remain active.

**Scope:** checking an immutable *local* accounting journal is not
proof of custody bank solvency or independent signer authority. The
source HOLD remains `SATCHEL_FINANCIAL_BRIDGE_READY=false`.
No website production, WoloChain transfer, new signer, automatic
stale-hold refund, financial migration or consensus restart is
authorized by this hardening.


## October 19 — one-chain signed SDK transaction and gas solvency rehearsal

`tests/fixtures/satchel-v1-continuous-sdk_test.go` is injected **only**
into a disposable copy of the pinned Wolo SDK after the trusted verifier
binary was built and its reviewed checksum authenticated. The isolated
Cosmos SDK application executes four **sequential genuine bank MsgSends**,
signed by distinct disposable owner/vault/escrow keys on the *same chain*:

1. Player → vault, **100,000,000 uwolo** deposit.
2. Vault → escrow, **12,000,000 uwolo** signed wager (1 uwolo vault fee).
3. Escrow → vault, **12,000,000 uwolo** full principal return (escrow's
   1 uwolo fee comes from a separately prefunded escrow gas coin).
4. Vault → owner, **100,000,000 uwolo** full customer withdrawal
   (another 1 uwolo vault fee).

One case prefunds 2 uwolo of independent vault gas so both vault sends
leave **zero** customer liability and zero vault funds. The negative case
prefunds only 1 uwolo and **requires the final 100-WOLO withdrawal to
fail** rather than deducting a fee from the player's principal or
misrepresenting the vault as solvent. These test funds have no mainnet
value and use no real custody keys.

This is a stronger, one-chain SDK **bank accounting** test. The separate
actual SDK deposit/wager proofs remain in place. It is NOT yet a single
continuous independently authenticated Comet light-client proof with
Prisma owner-ledger writes, real Watcher events, Keplr consents,
independent signer/reviewer attestations, validated settlement claim
allocation, or final customer withdrawal proof. No live source HOLD
changes or mainnet financial actions are authorized.


## October 19 — first connected owner-liability PostgreSQL roundtrip

The dedicated isolated PostgreSQL 16 CI job now runs
`tests/war-satchel-owner-roundtrip-postgres.test.mts`, applying the
**existing** funded, receipt, financial authorization, immutable custody
and wager-authority SQL migrations in a new Unix-socket-only database.

It composes two owner paths using the real schema and triggers, with
100 WOLO starting credit in each, 12 WOLO reserve, and independently
distinguishable outcomes:

- Owner A: reserve 12 → unattempted/no-send full 12 refund with zero
  unmatched fee → reserve and finalize 100 withdrawal.
- Owner B: reserve 12 → review, durable attempt fence and committed escrow
  wager → 12 principal escrow claim-return credit → finalize 100 withdrawal.
- Crash rollback, duplicate refund/claim hash protection, immutable broadcast,
  terminal reservation status and withdrawal transitions, exact journal
  conservation and final zero aggregate vault liability are checked.
  The owner's historical 12-WOLO committed wager is **not** vault debt.

**Scope is critical:** this is a connected **SQL accounting fixture**.
The test deliberately uses synthetic transaction hashes and sample reviewer
JSON; it does not call the application Prisma financial writers, Keplr,
the sidecar signer, actual Watcher admission or an authenticated Comet
escrow payout. The existing genuine isolated 100/12 SDK transaction suite
runs separately in the same CI job. Green checks for these two suites are
**not** evidence of one cryptographically authenticated continuous session.

Activation still requires that continuous session, signer/reviewer
isolation, independent full vault solvency and payouts/refunds,
withdrawal finality, and protected WoloChain release controls. The literal
source hold `SATCHEL_FINANCIAL_BRIDGE_READY=false` remains unchanged;
no production migration or mainnet funds movement is authorized.


## October 19 — no-send refund now binds original durable journal debit

The held War Satchel refund path already required the *unattempted* execution,
unbroadcast reservation, canonical ticket and review/broadcast records to be
consistent. It now additionally reloads the ORIGINAL `wager_reserve` journal
under the **same serializable vault-wide transaction lock**, and refuses a
principal refund unless that immutable journal binds the exact owner, execution,
source reservation ID and amount. The original journal must debit available
WOLO and credit reserved WOLO by exactly the claimed amount, without touching
committed or pending-withdrawal balances and without being associated with
a deposit receipt or escrow claim return. A missing or inconsistent debit
quarantines the hold instead of issuing owner credit.

The regression suite covers missing, foreign-owner/execution, misclassified,
under/overstated and side-effectful original journal entries. The guard
precedes new refund-journal and owner balance writes. No fee is imposed on
a genuine unsent full-principal return.

This is financial defense in depth: the caller's no-broadcast Boolean is
NOT an independent chain, bank or signer attestation. No aged-hold auto-release,
live-money activation, custody migration or production release authority is
introduced. `SATCHEL_FINANCIAL_BRIDGE_READY=false` remains unchanged.
The continuous certified 100→12→settlement/refund→withdrawal rehearsal remains
incomplete.


## October 19 — exact-amount isolated SDK proof milestones

The existing `scripts/check-satchel-authenticated-credit.py` compiles the
unchanged, pinned WoloChain `99f32de6` verifier and modifies **only a
disposable Go test fixture** before signing the test transfers. The two
separately initialized genuine Cosmos SDK executions now prove exactly:

- **100 WOLO deposit** (`100000000uwolo`): authenticated Comet inclusion,
  correct transfer, receipt uniqueness, atomic funded-ledger credit, replay
  and crash rollback.
- **12 WOLO escrow wager** (`12000000uwolo`): signed reservation and exact
  ticket leg, real SDK fee identity, authenticated transaction and Comet
  proofs, forged evidence rejection, wrong-13-WOLO re-signing rejection.

Each standalone SDK test starts from its own isolated sender genesis balance,
with an unchanged one-`uwolo` fixture ante fee. They are **not a continuous
100 → 12 custody session**, not bank solvency, not an independently provisioned
signer/reviewer, and not live production approval. The same immutable source
`SATCHEL_FINANCIAL_BRIDGE_READY=false` remains binding. Full Watcher
admission, settlement/void, authenticated Satchel claim return, Keplr
withdrawal, fee/liability conservation and rollback across a *shared*
isolated PostgreSQL+SDK journey remain mandatory V1 acceptance gates.


## October 19 — certified owner-account display (presentation only)

The Mecha profile previously held the Satchel balance at an unconditional null.
Its display now reads `GET /api/user/war-satchel/balance` with a same-origin,
noncached request. That route uses the signed-in owner ID and refuses before
accessing financial tables while the immutable source HOLD remains active.
Malformed/unavailable/unapproved responses render **no amount**, not a fake
zero or an inferred deposit. Valid `uwolo` totals (available, reserved and
withdrawal pending) are formatted without unsafe floating-point conversions.

This **does not** prove independent vault solvency or authorize custody.
The main Satchel number identifies the *recorded available owner-ledger amount*
rather than a verified physical vault balance. Under the existing financial
source HOLD it continues to display an uncertified placeholder. Account
presentation must never be interpreted as signer readiness, Auto Bet
consent, chain finality, custody certification or deployment authorization.


## October 19 — fail closed on contradictory no-broadcast reservation evidence

The funded ledger's existing `releaseUnbroadcastSatchelReservation` transaction
still requires separately established no-broadcast authority. A caller-provided
`independentlyNoBroadcast: true` is NOT a signer, consensus, reviewer or bank
attestation, and must not be treated as sufficient in isolation.

Before any refund journal credit, the existing exclusive serializable vault
transaction now cross-checks the persisted execution (one first reservation,
still `funded_reserved`, no accepted ticket), reservation (no hash or ticket),
signed authorization (matching owner/reservation, no broadcast marker), and
canonical stake ticket (if prepared, still unsigned and `awaiting_signature`).
Contradictions refuse, retaining the hold for separately authenticated
operator reconciliation. Isolated tests exercise every rejection class and
assert the evidence checks precede money mutation.

This is a **defense-in-depth change, not an aged-reservation release worker**.
No signer is invoked; no timed automatic refunds, stale wagers, new spending
authority, production migration, chain transaction or release permit is added.
The existing source-level `SATCHEL_FINANCIAL_BRIDGE_READY=false` stays binding.
A future aged-release workflow still requires independent no-send attestation,
explicit permission and recovery/solvency review before any customer balance
can change.


## October 18 — bounded aged-Watcher approval backlog in operator preview

The shared funded Mecha selector admits only fresh Watcher executions
(created within four minutes). An already reserved owner balance awaiting
separately signed independent financial approval may outlive that freshness
window. Late review MUST NOT bypass eligibility and cause a stale wager,
but the reserved funds also cannot simply disappear from operational sight.

A new read-only inspection in `lib/warSatchelAgedReviewVisibility.ts`
selects at most 26 (25 + one truncation witness) **unattempted**, still
reserved, aged Watcher rows. It reports only aggregate sampled `uwolo`
liability, no-approval count, approved-but-unattempted count, and
contradictory recorded broadcast markers. The report explicitly marks
its limited sample as NOT the vault's total financial liabilities.
It reveals no owner, wallet, request ID or signer secret. The operator
Mecha CLI includes it only in its dry-run output and only after the
source-level financial bridge has been separately certified; under
`SATCHEL_FINANCIAL_BRIDGE_READY=false` it refuses before database I/O.

This is a **diagnostic**, not a release/retry/refund authority. It never
sends a transaction or changes a balance. Resolving aged reservations
requires separately authenticated no-broadcast evidence and a reviewed
compensating workflow; any UNKNOWN/attempted operation remains fenced
for proof-only reconciliation. Tests cover bounded truncation, privacy,
invalid liability amounts and zero database reads under HOLD.
The complete integrated custody→bet→refund/settlement→withdrawal
rehearsal, independent reserve solvency and WoloChain #5 remain open.

## October 18 — verified Watcher tick shares strict Mecha admission truth

The protected private Watcher tick previously used a third direct queue
query with verified live-winner-market, active signed consent and positive
funded-balance checks, but no four-minute stale-outbox cutoff. The operator
CLI and bounded scheduler were already unified by PR #692 but did not
include these additional early filters.

All three production-capable entrypoints now consume the one shared
`readEligibleFundedMechaIds` guarded selector, with four-minute upper/lower
Watcher age, `nextAttemptAt` deferral, live verified winner market,
unrevoked/unexpired signed auto-spend consent, verified owner wallet presence,
available or reserved funded Satchel balance, plan slots and approved
pre-broadcast reservation. No candidate is executed based solely on
queue selection: the downstream serializable executor must still authenticate
market, team, owner, exact signed mandate and ledger state.

No stale game is rescued by widening its betting window, no uncertain send
is retried from this path, and the source-level financial HOLD is checked
before any query. This is V1 queue-correctness preparation—not proof
of independent vault solvency or permission to turn on real money.
The protected release controller and `SATCHEL_FINANCIAL_BRIDGE_READY=false`
are unchanged. No live wallet, transaction or backend service was touched.

## October 18 — single admission authority for the held funded Mecha runner

The previously prepared operator `--execute` path and the bounded
Watcher outbox tick could select different rows. The tick limited candidates
to a fresh four-minute window and respected `nextAttemptAt`, owner wallet,
remaining plan slots and independently approved pre-broadcast reservations.
The CLI used a broader query and could hand stale or deferred Watcher rows
to the executor despite those shared entrypoint expectations.

Both now call `readEligibleFundedMechaIds` with one
`fundedMechaEligibleQuery` builder. That builder applies the same exact
25-row cap, stable age/id ordering, four-minute eligibility window,
next-attempt deadline, finite plan slots, owner-wallet identity, and
approved `funded_reserved` state. It excludes attempted/unknown holds.
A direct selector call also checks the immutable source financial HOLD
**before querying any financial table**, not merely at the outer caller.
The downstream funding executor remains responsible for independent
market, owner, mandate, signer and ledger revalidation.

Contract and executable query regressions cover source/HOLD ordering and
invalid batch/time bounds. **This is not a withdrawal, settlement or custody
certification**. The source-level `SATCHEL_FINANCIAL_BRIDGE_READY=false`
and protected WoloChain release HOLD remain unchanged. No real money,
production service or Keplr wallet is touched by this change.

## October 18 — balance reads obey the immutable financial HOLD

The owner-only `/api/user/war-satchel/balance` endpoint previously
determined ledger availability from mutable environment flags without
consulting the source-level custody hold. If an operator configured
flags ahead of certification, the endpoint could have queried
unapproved financial tables and reported `available: true` and a
spendable balance while actual deposits and execution remained blocked.

Now the same immutable `satchelFinancialBridgeReady()` predicate
gates this read **before session, Prisma or any financial table I/O**.
While held, it returns only the existing non-crediting, no-store,
`available: false` representation. Source-order tests verify that
setting all mutable switches to true cannot override the hold.

This is a financial truthfulness fix, not an activated ledger.
The Mecha card retains the existing blank Satchel balance rather than
claiming that chain wallet funds are already custody credit.
No player deposit, wager, payout, withdrawal or system service changed.

## October 18 — off-by-default funded Mecha preview timer

The new `deploy/aoe2hdbets-war-satchel-mecha-preview.service` and
`.timer` provide a bounded **read-only** operational preview after
explicit operator review and manual installation. One-shot service uses
`scripts/war-satchel-funded-mecha-worker.ts --dry-run` only.
There are no credentials, EnvironmentFile, `--execute`, automatic
`[Install]` activation, or Wolo systemd dependency. Timer is
nonpersistent and initially inactive.

The immutable source `SATCHEL_FINANCIAL_BRIDGE_READY=false` still
returns `financial_bridge_unverified_hold` before reading any funded
database work. This is NOT a certified live wager scheduler and
does not authorize any mainnet custody, signing or player-facing
deposit. Independent signer/custody, real settlement/refund/withdrawal
rehearsal, licensing/eligibility and protected source/runtime parity
remain mandatory for live real-WOLO V1.

## October 18 — avoid unnecessary signer I/O for empty funded Watcher batches

The protected Watcher outbox tick now selects a bounded, read-only
eligible batch before initiating a loopback connection to the exclusive
custody signer. If no eligible rows exist, it returns the existing empty
zero-count response without initiating a signer health request. For
nonempty batches the same authenticated signer connection and durable
signed-wager execution path remain mandatory. Source-level financial HOLD
and all operator certification flags are evaluated before even querying
the candidate table.

This removes unnecessary private-sidecar traffic for idle Watcher ticks;
it does **not** authorize unattended scheduling, settlement, custody
activation, or real WOLO transactions. A source-order regression
specifically rejects future changes that reconnect the signer before
determining that there is eligible work.

## October 18 — Watcher queue cannot run under source-level financial HOLD

The dedicated HD Watcher-funded poll already checked the eight mutable
financial-operation environment gates, and the downstream executor enforced
the hard source gate. But the poll queried queued database executions
before entering that downstream gate when all env switches were on.

The poll now calls `requireSatchelFinancialBridge()` at the start of its
guard, **before any funded queue inspection**, so no mutable environment
switches can cause held financial work to be selected. A direct no-database
regression test sets every mutable flag true and asserts source-HOLD
refusal with zero queue reads. This does not add activation authority
or change the Watcher, financial ledger, user interface or chain.

## October 18 — streamed, strictly capped vault bank HTTP observations

The held funded ledger previously checked the response `Content-Length`
but called `Response.text()` before checking the actual byte count. A
malformed or chunked mainnet status/bank response could therefore buffer
arbitrary bytes in process memory before reaching the nominal 64 KiB cap.

`lib/warSatchelBankJsonTransport.ts` now reuses the already-tested
`readWarSatchelBoundedUtf8` streaming reader with a strict 65536-byte
ceiling, finite chunk count, fatal UTF-8 decoding, and early cancellation.
It still admits ONLY the canonical read-only RPC status or an exactly
scoped REST `wolo-1` bank-by-denom request, with GET/no-store,
no redirects, and a five-second timeout. Invalid length, oversized
chunks, malformed/non-object JSON and transport failure are refused.
Regression tests inject fake streams with no external mainnet request.

This is **resource/transport hardening only**. Neither REST JSON nor a
status endpoint is cryptographically authenticated financial proof; a
network-visible balance is not independently reconciled vault solvency.
The source-level `SATCHEL_FINANCIAL_BRIDGE_READY=false` hold remains
mandatory. No custody credit, signed wager, withdrawal, service operation,
production activation or changes to mainnet source were performed.

## October 18, 2026 — strict finite Bech32 decoding on Linux

The Wolo protocol-2 reservation verifier previously called CosmJS
`fromBech32(value)` without a finite decode limit. On Linux CI, the
installed `@scure/base` rejected that dependency's default Infinity
limit before a valid test-vault address could be admitted. The verified
fix calls `fromBech32(value, 90)`, a strict BIP-173 maximum, and retains
exact lowercase `wolo` prefix, 20-byte payload, checksum, independent
approval signature, exact immutable economics, owner and vault binding.
Public Go fixture address round-trip regression tests are provided.

Separately refreshed the `/bets` route-local Git-blob source fingerprint
to reflect the Codex integration draft. No production or finance release
permission follows from a green source census or a repaired Node test.
Financial bridge remains held pending real independent reviewer, signer
isolation, custody solvency, authenticated chain receipts, and WoloChain
protected release authority. This branch is a narrow CI repair stacked
on financial integration draft #684, not a mainnet cutover.

## October 18, 2026 — Satchel/Mecha launch blockers and independent release tracks

This is the **app-owned launch boundary**, separate from Codex's WoloChain
implementation and WoloChain issue #5. A chain-observed wallet balance is NOT
an independently reconciled spendable War Satchel balance. The wallet funding
button remains disabled; intent and deposit-evidence APIs explicitly refuse
deposit/credit/wager authority. Canonical receipts may persist only as
**uncredited** research evidence. A screenshot or environment switch cannot
substitute for a funded custody ledger.

Mecha deliberately keeps `LIVE_EXECUTOR_IMPLEMENTED=false`. The existing
worker admits proven self-only Watcher markets and writes `shadow_ready` rows,
but never reserves WOLO, accepts a funded ticket/wager, or decrements a plan.
Shipping Wolo settlement binaries alone will NOT activate live Auto Bets.

Required app-and-chain work before a real-money canary:

1. Independently certify the versioned `bet-custody-v1` contract. The future
   configured custody URL must exactly equal
   `http://127.0.0.1:8092/settlement/v1/bet-custody`. This revision now rejects
   other hosts, ports, query fragments, credentials and normalized URL aliases
   when merely recognising a configured capability. Presence is NOT proof.
2. Verify segregated vault and signer control, independently authenticated
   finality, immutable intent owner/recipient matching, exact receipt admission,
   separate spendable-balance projection, installed custody migrations, ledger
   conservation and nonnegative double-entry, withdrawals and error recovery.
3. Implement an idempotent funded Mecha consumer: recheck frozen proposition,
   Watcher uploader and exact Steam roster, self-side, Desync sibling, plan
   version, 1,000-WOLO per-game and 10,000-WOLO plan budget; atomically reserve
   ledger funds and accept a durable stake ticket before decrementing a finite
   plan. Uncertain broadcasts cannot automatically retry.
4. Preserve WoloChain #5's claim #889, producer/signing isolation, full
   solvency/liability review, quiesced backup, code-only paired rollback and
   unchanged consensus. No app code can approve those controls.
5. Build the authenticated, source-transitive independent website-only
   release authority in app issue #665 with challenge-bound receipts,
   immutable HOLD and durable replay fencing. The existing `aoe2war finish`
   must still refuse the Wolo P1 until a real approved alternative exists.

**Operator / agent diagnostic** (read-only clean local checkout):

```bash
python3 scripts/aoe2_satchel_readiness.py --json
```

Exit code **2 is intentional**: source inventory can never grant funds,
custody, settlement, release or production certification. It emits exact
source hashes and named blockers without env secrets, network or DB writes.
Changed or missing source sentinels are **UNVERIFIED**, never READY.

Release order: exact source tests and CI → independent Wolo financial review
→ certified vault/ledger migrations → funded consumer and idempotency tests
→ explicitly approved bounded real-money canary → protected deployment and
runtime rollback verification. General Inspections / Kingdom Intelligence
earn green only from actual exact-version evidence.

## October 18, 2026 — aborting preview batches must never count as pre-existing bets

Rebased the objective fix from historical draft #619. PostgreSQL's
`createMany(skipDuplicates: true)` successful return count is the only
authority for how many Mecha preview rows were inserted. An unexpected
`P2002` is now reported as
`BET_AUTO_SHADOW_INSERT_CONFLICT_UNVERIFIED`; impossible return counts
are refused with `BET_AUTO_SHADOW_INSERT_COUNT_INVALID`. We do not
fabricate "already exists" acknowledgements or retry uncertain batches.
Tests explicitly exercise both negative paths.

This is **preview-only** correctness. It does not create balances,
accept stakes, decrement saved plans or authorize a Satchel transfer.


## October 18, 2026 — website-only release separation (candidate, not deployed)

For the website-only release candidate, the October 15 C3a
`war_satchel_simulation_guard_correction` migration is deliberately
**deferred**, preserving the original SQL in Git at `f579cd0d` and on
the held Satchel development/release track. The five older,
already-present but unapplied C1–C3a migrations remain unchanged in
source. The active production database remains at 112 applied
migrations per the last operator-verified frontier; no Satchel SQL was
installed by the website-only candidate.

This separation does not authorize a user to transfer WOLO, credit a
Satchel balance, execute real Mecha wagers or issue withdrawals. Any
code requiring unapplied Satchel tables or the corrected simulation
function must remain disabled until a separately reviewed guarded
schema rollout. This candidate is website/runtime work only, subject
to full GitHub and protected release gates; no deployment is claimed.


## October 16, 2026 — never truncate an active Watcher bet behind unrelated live markets

The non-financial Mecha shadow evaluator previously queried the newest
100 verified live winner markets across **all** game sessions before
matching those markets against the canonical active Watcher snapshot.
When 100 newer unrelated markets existed, an older still-live verified
Watcher match could be excluded despite its player being an exact
authenticated uploader. The preset filter added in #612 removed
unrelated owners, but not unrelated markets.

The read-only discovery query now restricts `linkedSessionKey` to
the unique unambiguous canonical session keys and aliases in the
already-supplied Watcher snapshot **whose authenticated uploader owns an enabled eligible saved plan**. It fetches **101** records to
detect exceeding the supported 100-market cohort, and throws an
explicit `BET_AUTO_SHADOW_ACTIVE_MARKET_COHORT_OVERFLOW` instead of
silently hiding an eligible market. Overflow fails the preview pass
before any outbox write, and the enclosing reconciliation controls
report the failure. This is still a deliberately bounded single
cohort, not an assertion that every larger cohort has been scanned.

Tests reproduce 100 newer unrelated markets obscuring one active
Watcher game, verify correct exact-game selection, and prove a
101-market active cohort cannot produce partial preview writes.
The same uploader identity, Steam roster, locked proposition,
Desync sibling and preset safety checks remain in admission.
This is an **objective correctness fix** rather than measured speed.
No actual reservation, BetStakeTicket, accepted wager, WOLO transfer,
plan decrement or live-executor enablement is introduced.


## October 16, 2026 — canonical Satchel evidence must fit the signed-64-bit ledger schema

The C3 canonical chain inspector accepted block heights with up to 20
decimal digits, including numbers too large for PostgreSQL `BIGINT`.
The C3d immutable, noncrediting receipt recorder accepted **arbitrarily
long** decimal strings for receipt height and confirmation count and
parsed confirmations directly with `BigInt` before limiting input.
This allowed malformed synthetic evidence to reach expensive numeric
parsing or storage errors instead of the evidence-integrity boundary.

Both C3 inspection and C3d persistence now share
`isPositiveSatchelInt64`, requiring canonical positive decimal
representation, no leading zeros, at most 19 digits, and an exact
maximum of `9223372036854775807`. Confirmation depth uses the same
validated quantity and independently requires at least three. The
stored intent's exact `uwolo` amount is checked against the same
DB-safe bound. Regression tests include exact boundary values,
malformed numbers, unsafe heights, and 100,000-digit adversarial inputs.

This is an **input-bounds correction**, not a statement that public
RPC heads independently authenticate consensus or that any actual
Satchel deposits are enabled. C3d still writes immutable
`uncredited` evidence only when its separate feature switch is
enabled, and neither this patch nor the C2/C3 foundations authorize
a vault, collateral credit, live balance, withdrawal, or funded
Mecha wager. WoloChain #17 remains unavailable pending dedicated
custody, independent chain trust, source/asset-liability reconciliation
and an operator-approved canary.


## October 16, 2026 — restrict shadow evaluation to proven live Watcher uploaders

The preview-only Mecha worker previously queried **every** enabled
self-only preset and compared those rows with up to 100 live Watcher
markets. As the player population grows, that is unnecessary DB work and
a large market-by-all-users cross product: a preset cannot be eligible
unless its owner is an exact authenticated uploader of an active session.

The worker now collects unique, nonblank uploader UIDs from the supplied
canonical active-session snapshot and restricts the existing
`betAutoPreset.findMany` query to those owner UIDs before market
evaluation. No active uploader means no database query. All original
market, Steam-ID/roster, uploader, selected-side, proposition, Desync,
and cap checks continue independently in
`evaluateBetAutoShadowAdmission`. This does not let a session UID
alone authorize any wager. Regression tests cover empty/no-uploader
snapshots, repeated uploader identities, excluding unrelated owner
presets, and maintaining preview-only candidate fields.

This is an **objective query-scope reduction**, not a benchmarked
throughput or latency claim. Actual reduction depends on active-session
population and current enabled presets. `LIVE_EXECUTOR_IMPLEMENTED=false`,
no funded balance, accepted ticket, reserve, or WOLO transfer is created.


## October 16, 2026 — Cosmos REST Satchel proof uses canonical root Tx and omitted success code

A source review found that `inspectCanonicalSatchelDeposit` accepted
only `tx_response.tx.body` and required an explicit `tx_response.code`.
The standard Cosmos v1beta1 `/txs/{hash}` response may expose the decoded
body in root-level `tx.body`, while protobuf JSON can omit the zero
execution code on success. That made valid evidence unable to pass
the otherwise exact C3 preview audit.

C3 now accepts either legitimate decoded-body placement, refuses
contradictory dual-body evidence, and accepts an **omitted** execution
code as zero only when all the existing exact sender, vault, denom,
amount, owner memo, chain, hash, committed height, timestamp and
confirmation-depth predicates pass. Explicit null, malformed and
nonzero execution codes still fail. Tests cover standard Cosmos
root-body replies, omitted code, conflicting envelopes and failures.

This is a wire compatibility and **noncrediting evidence** repair,
not custody certification or independent consensus verification.
Authenticated light-client evidence and an independent Satchel
vault/signer remain absent. `creditAuthorized=false`,
`depositAuthorized=false` and `wagerAuthorized=false` persist.
No token transfer, database correction, credit or live deployment occurred.


## October 15, 2026 — source-consistent stored-plan integrity across API and Mecha

The previous persisted-plan worker correctly rejected invalid historical
Desync enum values, oversized per-game stakes and finite plans above
10,000 WOLO. The player settings API, however, still normalized a
malformed stored Desync value to `none` for its backwards-compatible
preset representation, without flagging the record as invalid. This
could make a plan appear valid while the Watcher-market shadow worker
properly refused to evaluate it.

A single pure `storedBetAutoFinancialIssue` now applies the same
saved-plan bounds to the API's owner-only readiness projection, the
shadow producer, and exact-market admission. API readiness adds
`storedPlanValid`, `storedPlanIssue` and `requiresPlanReview`,
with explicit explanation when the historical plan is invalid. The
legacy displayed enum field remains backward-compatible and existing
UI/navigation are unchanged. Exhausted-but-valid finite plans retain
their separate lifecycle reason; no saved values are silently rewritten,
no new orders, reservations, or WOLO transfers occur.

Contract tests exercise legacy invalid enums, 10,000 WOLO finite
reserve boundary, per-game combined stake, indefinite Until-Out
consistency, non-integer amounts and legacy expiration. A genuine
new plan can only be saved through the existing owner-authenticated,
version-checked PATCH path. The funded executor remains intentionally
unavailable until dedicated Satchel custody, chain proof, reserve
accounting, and protected canary acceptance are established.


## October 15, 2026 — persisted Mecha plans receive full admission-time validation

The interactive preset form rejects combined stakes over 1,000 WOLO per
game, and finite plans requiring over 10,000 WOLO. Existing shadow admission,
however, checked the per-game ceiling but did not recheck a *stored*
finite plan's full 10,000-WOLO exposure at the moment a canonical Watcher
market became available. In addition, the worker converted unknown
historical Desync enum values to `none`, quietly changing the user's
stored selection rather than failing closed.

The shadow admission now rechecks stored Desync enums, Until-Out
null/finite-plan consistency, the 10,000-game maximum, per-leg limits
and total finite plan exposure at admission time. Invalid Desync values
never enter the immutable preview outbox; no automatic correction to
`none` occurs. Pure and worker integration tests prove that 500 WOLO
for 21 matches is rejected (10,500 > 10,000), invalid persisted enums
are rejected, and 500 for exactly 20 matches remains valid.
No client plan is rewritten and no user gets a false funded-bet receipt.

**This remains the non-financial shadow worker.**
`LIVE_EXECUTOR_IMPLEMENTED=false`, `acceptedAt=null`, no stake tickets,
reservations, on-chain payouts, active WOLO movement or decrement of
the player's finite plan. A future real executor must revalidate and lock
a *newly reviewed consent and balance* at actual stake acceptance.


## October 15, 2026 — one canonical vault collision policy for both Satchel gates

The C2 nonfundable intent route and C3 canonical receipt route each had
separate vault-exclusion lists. The preparation route omitted the
community Treasury and neither route rejected all known existing
mainnet wallets when some role addresses were absent from the
environment. This could allow a seemingly independent Satchel vault
candidate to reuse treasury, founder, player, staking, escrow or payout
addresses. Nothing had been credited, but the divergent prerequisites
would undermine future owner-bound custody certification.

`warSatchelVaultDistinctFromKnownWallets` now rejects every address
in the authoritative known WOLO mainnet wallet catalog plus all
currently supplied custody/role addresses. Both preparation and
canonical chain-audit gates share the same predicate, including the
existing treasury environment alias resolver. Tests enumerate all
registered wallets and verify conflicting configured addresses and
legacy aliases. These checks are additive; the existing minimum
configuration guard, strict chain, wallet proof, nonce, expiry,
exact receipt, uncredited status and feature flags remain intact.

This is **candidate isolation only**. A newly unknown address passing
the predicate is NOT certified as a segregated vault or solvent
escrow. Neither endpoint can yet authorize a Keplr transfer, a live
Satchel credit, a withdrawal or an automatic bet. A dedicated vault
must receive independent signer-control, chain-proof, accounting and
rescue certification before any wallet funding is enabled.


## October 15, 2026 — simulation ledger valid-release regression correction

The C3a simulation-only cross-player owner-isolation function had an
objective bug in its October 14 additive migration: it reused
`violating_accounts` (already holding the count of overdraft accounts)
for the distinct owner count, then rejected the required valid single
owner because that variable was **1** rather than **0**.

New additive
`20261015_151500_war_satchel_simulation_guard_correction` repairs the
function without editing any previously merged migration. It keeps
**two independent variables**: overdraft account count must be zero,
and distinct non-vault liability owner count must be exactly one.
No other SQL constraint, append-only ledger trigger, read-committed
transaction advisory lock, simulated source marker or no-live-credit
condition is relaxed.

PostgreSQL 16 CI now verifies a real committed, balanced, synthetic
single-player reservation release, with exact expected vault,
available and reserved balances, and fresh rejections of cross-owner
liability transfer, overdraft and falsely claimed live chain credit.
This is a correctness fix for the accounting **research** journal.
It does not implement a live custody ledger, create spendable balance,
authorize a Keplr transfer or execute a bet. The existing Satchel
funding UI MUST remain disabled until independent vault control,
chain-backed receipt admission, confirmed solvency and audited
withdrawal/reservation/accepted-stake paths are completed.

## C3d — immutable globally unique on-chain evidence admission (October 15, 2026)

`lib/warSatchelUncreditedProofRecorder.ts` adds an optional,
**non-crediting** durable evidence writer after the canonical read-only
`/api/user/war-satchel/deposit-evidence` checker. The additional
`WAR_SATCHEL_UNCREDITED_PROOF_RECORDING_ENABLED=true` flag is
**OFF by default** and only works when the existing owner-proof,
canonical receipt audit, and separately certified vault flags pass.

After full canonical `wolo-1` success/three-confirmation/exact
MsgSend validation, the writer uses SERIALIZABLE transaction plus
`FOR UPDATE` on the actual linked User and immutable deposit-intent
row, re-checking wallet, owner, receipt hash, memo, amount, vault, intent
creation and expiry. It inserts a `war_satchel_proof_candidates` row
with `status='uncredited'` only. Database constraints enforce one proof
per intent; one globally unique chain + tx hash + transfer ordinal;
owner/intent economic identity; SQL append-only immutable rows; and
**no status except uncredited**. Exact duplicate owner-side retries
return the same uncredited record; conflicting proofs stop without
rewriting data. A race that violates a unique constraint fails closed,
never receives a balance.

No Satchel asset or liability journal is posted. The existing ledger
remains `simulation`-only. No customer available balance changes, and
no Keplr transfer, signer execution, stake ticket, automatic betting,
withdrawal, refund or settlement transaction is created. The success
response explicitly remains `creditAuthorized=false` and
`wagerAuthorized=false`. Thus this is **persistent evidence**, not
real custody credit. Enabling a flag is not a substitute for a new
bank-backed live balanced ledger and withdrawal/solvency controls.

The C3d writer cannot be approved for live funds until all preceding
vault/operator and current-chain verification gates are independently
certified. It must never be presented as a usable War Satchel balance.
The current `LOAD SATCHEL` funding action stays disabled.

## C3c — canonical WoloChain bank-send candidate audit, no live funds (October 15, 2026)

`lib/warSatchelCanonicalReceipt.ts` and
`POST /api/user/war-satchel/deposit-evidence` add an independent
**owner-authenticated read-only** chain-evidence path for an already
server-prepared, immutable C2 intent. Unlike C3b's 8092 betting-escrow
verifier, the new validator inspects the actual canonical public
`wolo-1` RPC head and transaction REST bytes at one exact 64-hex hash,
hardcoded to `rpc-mainnet.aoe2war.com` and
`rest-mainnet.aoe2war.com`. It does **not** assume the betting escrow
is or can become the separate Satchel custody vault.

All endpoints are bounded, fixed-host, no redirects, 6.5-second
timeouts and at most 256 KiB per JSON response. The API requires a
signed-in owner, strict same-origin POST with exactly one UUID
`intentId` and one 64-hex `txHash`, the same persisted linked Keplr
wallet, an active immutable `prepared` intent on `wolo-1`, and a
separately certified vault distinct from known betting/challenge,
staking, payout and community treasury addresses. It verifies
transaction success, canonical chain id, synced final height with at
least **three confirmations**, on-chain time **within the C2 intent's
original 30-minute lifetime**, exact owner-bound memo, one—and only
one—`/cosmos.bank.v1beta1.MsgSend` sending the precise
`uwolo` amount from owner to vault, and rejects mixed-denom or
multiple-bank-message transactions.

Feature flags `WAR_SATCHEL_CANONICAL_RECEIPT_AUDIT_ENABLED=true` and
`WAR_SATCHEL_OWNER_PROOF_ENABLED=true` are both required to run a
read-only audit. **Leave both OFF in production until reviewed.** A
successful response is only
`CANONICAL_EVIDENCE_ONLY_UNCREDITED`, with all
`depositAuthorized=false`, `creditAuthorized=false`,
`wagerAuthorized=false`. It returns no transfer destination or
memo. No API mutation, bank transaction, deposit admission, ledger
posting, available balance, withdrawal, stake, bet or automation is
introduced. A verified transaction candidate does **not** prove
vault signer segregation, independently attested reserve, historical
unique credit admission, or withdrawal viability.

**Remaining C3/C4/C5 gate:** independently provision and certify the
vault/signer, live balanced immutable asset/liability journal,
globally exactly-once receipt admission, atomic reservation,
accepted-Watcher ticket debit, unmatched/full refunds, and withdrawals;
then protect and canary a certified app/Wolo deployment. The older
simulation-only ledger and nonfundable C2 prepared intents still
CANNOT represent real customer WOLO. The `LOAD SATCHEL` button
remains unavailable and no auto bets execute. No feature flag should
be switched on to make the presentation appear funded.

## C2c — signed-owner bound, NON-FUNDABLE deposit intent preparation (October 15, 2026)

`app/api/user/war-satchel/funding-intents/route.ts` creates an immutable
**preparation-only** record; it does not provide a wallet transfer instruction.
The endpoint is disabled by default behind both
`WAR_SATCHEL_NONCREDITING_INTENTS_ENABLED=true` and
`WAR_SATCHEL_OWNER_PROOF_ENABLED=true`, authenticated same-origin request,
a nominated distinct vault **candidate** (not a certified funded vault),
and a signed Keplr ADR-36 challenge consumed in the preceding five minutes
by the same logged-in UID and same persisted wallet address.

The route locks the User row, rechecks the linked address under a SERIALIZABLE
database transaction, enforces three intents per hour, no reuse of one recent
challenge window, and at most one unexpired prepared/submitted intent. Only
whole-number 1–10,000 WOLO amounts are admitted. A random server-side nonce,
canonical `aoe2war/satchel/v1/<uid>/<nonce>` memo, immutable sender,
owner, vault candidate, amount, and 30-minute expiry are stored under the
existing C1 SQL economic-identity lock. The response deliberately **redacts
the vault address and transfer memo** and returns
`state=PREPARED_UNFUNDABLE`, `depositAuthorized=false`,
`creditAuthorized=false` and `wagerAuthorized=false`.

The Mecha profile now mounts `WarSatchelWalletProof` under the Satchel panel, but only when the protected server capability reports an exact match to the connected Keplr address. Browser ADR-36 signing uses the server-issued challenge, sends the signature back to the one-use verifier, and displays a control-proof state only. The bank-transfer button remains unavailable; no local wallet signature authorizes a deposit or bet.

**This endpoint is not a deposit experience.** There is no real credited
balance, Keplr bank MsgSend, withdrawal, manual stake ticket funding or
funded Mecha executor. Its two feature flags must remain OFF in production.
Future C3/C4 work must independently certify Satchel vault custody, exact
finalized on-chain transfer and single-use credit admission, a balanced
asset/liability journal, refund/withdrawal coverage, and signed-release
proof before exposing *any* destination/memo or turning on LOAD SATCHEL.

## C3b — independent local chain evidence reader, still NON-CREDITING (October 14, 2026)

`lib/warSatchelReadOnlyChainAdapter.ts` extends the pure Gate B proof rules
with **read-only, server-side** sourcing. It reads settlement health and an
exact hash-based escrow-verification result only from pinned loopback
`127.0.0.1:8092`, and current canonical `wolo-1` height/sync status only
from `127.0.0.1:27657`. It refuses HTTP failure, wrong chain, catching-up
node, oversized/malformed responses, missing unique `uwolo` transfer,
failed transaction, wrong memo/owner/amount, stale head or insufficient
confirmations. It does not accept browser-submitted chain proof JSON or an
external user-provided HTTP host. The transaction hash is **a search hint,
not a receipt**.

The reader is **disabled by default** behind
`WAR_SATCHEL_PROOF_AUDIT_ENABLED=true`, and additionally requires a
server-configured `WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS` different from
both the existing betting escrow and challenge escrow addresses. Its
result is expressly `uncredited_deposit_candidate` with
`creditAuthorized=false`, `wagerAuthorized=false` and
`mutationPerformed=false`. No public route calls this helper; no database
balance or ledger journal is changed. It cannot fund the Satchel.

**Caution:** The present 8092 service is configured for the preexisting
manual betting escrow, not a separately certified Satchel vault. A distinct
Satchel vault and independently configured verifier/signer boundary must be
reviewed and introduced before even the read-only live candidate can
succeed. Merely enabling the audit flag or reusing existing bet collateral
is not an acceptable substitute. The source-only adapter makes no claim
to a deployed service upgrade or a functioning bank ledger.


## C3a simulation journal owner isolation — October 14, 2026

The already merged simulation-only accounting journal refused nonzero-sum
transactions, overdrafts and concurrent double reservations. A further
negative case was identified: a balanced posting pair could shift
liability from one player to another without overdrawing either account.
Source migration
`20261014_191500_war_satchel_simulation_single_owner` augments the
existing commit-time journal guard to require **exactly one owner** across
each journal's non-vault accounts. Mixed-owner liability movements and
ownerless vault-only journals are rejected, while the shared vault
asset category and one owner's liability buckets can coexist.

This is an additive migration; it does **not** alter either previous
migration's historical bytes, allow real deposit sources, accept money,
change user balances, or activate automatic wagers. PostgreSQL 16 CI
executes the existing simulated accounting and concurrency contracts,
then checks that a balanced cross-player transfer fails atomically with
no persisted journal or postings.

Do not merge or run a second historical accounting schema in parallel
with this existing simulation ledger. Funded custody still requires a
separate explicitly authorized live ledger/chain-proof source and
independent multi-rail collateral accounting.


## Gate B verifier hardening — canonical success semantics and unique transfer

The pure, non-crediting `examineSatchelDepositEvidence` contract
requires `tx_success=true` from the trusted WoloChain verifier, whose Go
implementation derives it directly from the canonical REST transaction
`Code == 0`. That Go JSON uses `code,omitempty`, so a successful code
of zero legitimately omits the optional field; any **present nonzero**
code is refused. This compatibility behavior is regression-tested.
The contract independently recounts the exact `wolo-1` `uwolo` transfers
matching the authorized sender, vault destination and integer amount,
rather than trusting the service's `matching_transfer_count` summary.
A mismatched count, duplicate exact transfer, ambiguous event index or
transaction timestamp later than the independently observed chain head
cannot become a receipt candidate. Negative tests cover missing-zero compatibility, nonzero failures, duplicate
exact transfers falsely summarized as unique, and future timestamps.

This only strengthens offline evidence validation. It does **not** authenticate
an untrusted client response, prove canonical head finality, install a
vault, write a deposit, authorize a credit, or enable automatic bets.


## War Satchel Gate C3a race-hardening — no concurrent double reservations (October 14, 2026)

A second reviewed PostgreSQL migration serializes the **commit-time** ledger
balance check with a transaction-scoped advisory lock. This prevents two
concurrent READ COMMITTED transactions from independently observing the same
unspent simulated balance and both committing a reservation. The function
explicitly rejects snapshot isolation levels that could hide commits made
while a concurrent transaction waited for the lock.

A real multi-session PostgreSQL 16 CI test races two 300-uwolo reservations
against one owner's remaining 400-uwolo available balance; exactly one must
commit and the other must fail without changing the ledger. The test also
requires the sum of account balances to remain correct and rejects replaying
the mutation under REPEATABLE READ.

The prior C3a migration remains **unchanged**; the fix is a new additive
migration so already-merged migration history is not rewritten.
This remains SIMULATION ONLY: it does not create or unlock a Satchel
deposit, credit funds, authorize transfers, or permit a live auto-bet.
The future funded ledger must use its own reviewed concurrency and vault
solvency design; this gate cannot be used as live-money authorization.

## War Satchel Gate C3a — simulation-only balanced accounting (October 14, 2026)

The next custody prerequisite is a **double-entry WOLO ledger** in which
every movement has one equal-and-opposite entry. This milestone introduces
three new Prisma models and tables: `WarSatchelLedgerAccount` for separated
user-available, user-reserved and custody-asset categories;
`WarSatchelLedgerJournal` for one unique source identity per operation; and
`WarSatchelLedgerPosting` for integer signed `uwolo` entries.

The database enforces crucial financial conditions independently of
application code. A deferred PostgreSQL constraint trigger refuses a journal
with fewer than two postings or a nonzero net sum at transaction commit.
Account balances cannot overdraw the vault asset or either user's available
and reserved liability. Journal IDs and external source keys are globally
unique; account identity, sources and postings are append-only and cannot
be overwritten or deleted to disguise past movements.

**Simulation-only guard:** the SQL database constraint accepts only
`source_kind='simulation'` with a `simulation:`-prefixed source key.
There is deliberately no production deposit-credit event, no spendable
balance API, no signed transfer, no wagering executor, no real vault
selection or withdrawal. This is a functioning *test ledger*, not a live
banking system. Existing bettors and balances are unaffected by this source
change. The migration must not be run manually on the production VPS.

An isolated PostgreSQL 16 workflow executes the real migration and checks
successful synthetic deposit and reservation plus failed scenarios:
nonzero-sum journal, missing side, duplicate source, overdraft,
wrong user account, live-credit spoofing, and immutable history. Automated
testing of a simulator does **not** constitute evidence of actual
WoloChain vault balances or ownership of funds.

**Gate C3b:** separately certify a custody vault and owner-authorized
transfer ingress, independent finalized `wolo-1/uwolo` receipt proof,
liability-to-chain-asset reconciliation, transactional credit admission
and exact-once credit; only then can any sandbox accounting infrastructure
become real money via an audited additional migration and canary.


## War Satchel Gate C2b — single-use server-issued wallet challenge (Oct 14, 2026)

Source `app/api/user/war-satchel/wallet-proof/route.ts` is a **disabled-by-default**
Keplr wallet-control verification endpoint. `POST` creates a cryptographically
random 128-bit nonce on the server for the authenticated current user and
persisted linked wallet; the request body cannot select an alternate UID,
signer, nonce, custody vault or amount.
The server locks the current user's database row and performs the hourly
challenge count plus insert in one bounded transaction. This prevents two
concurrent browser requests from both passing an unlocked quota check. It returns the exact ADR-36 text with
a five-minute expiration. `PUT` accepts the signature, independently loads
the stored nonce/current session user/wallet, limits verification attempts
with an atomic DB increment and atomically consumes the challenge exactly
once after cryptographic proof. Both methods require the explicit
`WAR_SATCHEL_OWNER_PROOF_ENABLED=true` operator release flag and an
`https://aoe2war.com` browser Origin; the default response is 503.

`WarSatchelWalletChallenge` is durable non-money evidence with a globally
unique nonce, owner-bound immutable metadata, immutable consumption, an
at-most-10-minute SQL time window and max five signature attempts.
Real PostgreSQL CI executes the migration and rejects replay, owner/
destination/nonce retargets and attempt-counter rewind. Normal release
security checks must also pass.

**This is NOT a Satchel funding capability or permanent wallet
authorization.** It does not alter `users.wallet_address`, produce
a spendable Satchel balance, sign/broadcast a transaction, reserve bets
or enable the Load button. The operator flag must remain **off** in
production until migrations and risk review are complete. A future
wallet-binding and custody deposit workflow must verify a separate
authorized vault and exact chain transfer and maintain immutable
double-entry accounting before enabling any real deposit or wager.


## War Satchel Gate C2a — Keplr owner-signature verifier (October 14, 2026)

`lib/warSatchelWalletOwnerProof.ts` implements a **pure off-chain ADR-36
signature-verification contract** using CosmJS canonical amino signing bytes
and Node's built-in secp256k1 verification; the dependency set is unchanged. A future authenticated server caller must issue, persist and
atomically consume a 128-bit unpredictable challenge bound to the signed-in
user UID and one exact `wolo1...` wallet, with a maximum 10-minute lifetime.
The signable human-readable message names `aoe2war.com`, `wolo-1`,
`satchel-v1:owner-proof`, UID, wallet, nonce and issued/expiry times. It
explicitly states that no transfer, bet, withdrawal or custody authorization
is conveyed by the signature. The verifier checks canonical ADR-36 amino
sign bytes, compressed secp256k1 pubkey and derived `wolo` address, signature,
owner session and expiry; negative tests exercise tampering, replay-consumed
challenges, mismatched UID/wallet and future/expired windows.

**Critical limitation:** A successful helper call is a candidate wallet-control
witness, not a verified persistent binding. This milestone does not expose a
public route or generate real challenges. Server-side persistent
`nonce` uniqueness, single-use atomic consumption, CSRF/session binding,
revocation and actor-safe rate limits still must be implemented and separately
tested before any client-side `Keplr.signArbitrary` flow can use it. Do not
accept a client-supplied challenge as trusted server evidence. It cannot
credit the Gate C1 tables or move WOLO, and the live Satchel funding
button remains disabled.


## War Satchel Gate C1 — persisted evidence, zero credited WOLO (October 14, 2026)

This milestone adds only the independently testable storage foundation of a
pre-funded War Satchel:

- `WarSatchelDepositIntent` uniquely identifies a prospective owner-bound
  wallet deposit, exact `wolo-1` vault destination, amount in canonical integer
  `uwolo`, owner nonce and memo, and a strict 30-minute expiry. Database
  constraints prohibit nonpositive amounts and duplicate memos/nonces. **An
  intent is not authorization to take custody, not a signed transfer, and not
  an owner wallet proof.**
- `WarSatchelProofCandidate` may later hold one exact chain receipt's identity,
  anchored to an intent and globally unique by
  `(chain_id, tx_hash, transfer_index)`. Its only allowed database status is
  `uncredited`. A database trigger refuses UPDATE/DELETE. A receipt candidate
  is *not* an available or reserved satchel balance. It cannot be spent,
  withdrawn, or used for a wager.
- No public API, wallet send route, custody address provisioning, signer
  delegation, auto-bet reservation, accepted BetStakeTicket, or bank accounting
  change is introduced. The "Load from Wallet" control **remains disabled**.
  The operator must not solicit real deposits until separately certified
  independent vault/key authority and complete ledger accounting exist.

This is intentionally isolated in new tables and has no migration touching
old betting, claim, staking, or payout records. The database schema and SQL
migration must be applied only by the existing protected release controller;
never to the live VPS ad hoc. The manual wallet-to-bet flow is unchanged.

**Next enabling step (C2):** independent Keplr wallet ownership proof and
revocable user intent admission; designated vault separated from manual Bet
Escrow or fully audited partitioning; exact authenticated chain verifier +
canonical finality, transactional immutable credit journal, global balance /
liability reconciliation, and idempotent audited withdrawal and reservation
machines. The already observed founder claim #889 is an independent financial
release blocker and must not be silently cleared as part of Satchel adoption.


## War Satchel Gate B — exact-transfer evidence, not deposited funds (October 13, 2026)

The `Mecha Emaren` profile still exposes only shadow auto-betting and a disabled
"Load from Wallet" control. Its wallet balance is not a custodial balance.
`lib/warSatchelAccountingResearch.ts` remains an **offline event-conservation
oracle**, and no client payload is permitted to call its `verified_deposit`
transition. No persistent Satchel credit ledger or live wager executor is
enabled by this milestone.

Two reusable **pure, explicitly NON-CREDITING** Gate B checks are introduced in
`lib/warSatchelCustodyEvidence.ts`:

- `satchelDepositMemo(uid, nonce)` establishes an exact versioned
  owner/nonce memo namespace distinct from manual bet-ticket stake memos.
- `examineSatchelDepositEvidence` requires caller-supplied **independently
  authenticated server evidence**: logged-in owner UID, proven Keplr sender,
  designated current escrow vault, `wolo-1`, `uwolo` with canonical integer
  amount, signed-intent provenance still external, exact memo/tx hash, chain
  success, finalized chain head, time-limited intent and adequate
  confirmations. It requires the WoloChain escrow verifier's *unique*
  `matching_transfer_count=1` and exact `matched_transfer_index` into the
  returned transfer list; foreign denominations and multi-transfer ambiguity
  are not creditable. It emits only an
  `uncredited_deposit_candidate` with a canonical
  `(chain ID, tx hash, transfer ordinal)` key and explicitly sets
  `creditAuthorized=false` and `wagerAuthorized=false`.
- `examineSatchelReserveArithmetic` rejects unverified/duplicate liability
  snapshots, old heights, missing categories, and numeric shortfalls. A
  positive surplus is **not proof of solvency or complete, non-overlapping
  liability enumeration**; `custodyApproved` and `executionReady` remain
  false even when arithmetic covers the supplied partitions.

WoloChain escrow verifier source PR #4 now exposes a canonical matched transfer
ordinal only when there is exactly one same-sender/same-recipient/same-amount
`uwolo` transfer; separate fake-denomination/failed-tx controls still refuse.
That PR is not automatically deployed. This app contract does not attest the
service URL, verify a Keplr signature or owner session, prove a finalized
canonical head from an independent node, establish bank-liability completeness,
perform unique database reservations, send WOLO, record a claim, or bypass the
manual Bet Escrow financial rail. Passing tests only qualifies the next
transactional-custody design review, never an enablement toggle.

**Remaining enabling gates:** establish the independently reviewed dedicated
Satchel vault or exact shared-vault partition; signed authenticated deposit
intent and memo/nonce TTL; chain finality/transfer uniqueness anchored to a
real verified node; globally unique immutable journal and transactional
balance credit with owner restrictions; bank assets ≥ all existing manual bet
stakes/refunds/claims/staking-reward and Satchel liabilities; a failing-closed
operator kill switch and reconciliation receipts; canary deposits and
withdrawals with separately authorized exact-signature checks; **then** connect
idempotent next-game reservations and accepted BetStakeTickets, full unmatched
refunds and withdrawals. Existing `LIVE_EXECUTOR_IMPLEMENTED=false` remains
authoritative until that later certification.

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

## October 13: War Satchel offline conservation research oracle

`lib/warSatchelAccountingResearch.ts` provides an intentionally **unwired**
and side-effect-free accounting projection for a future owner-specific custody
ledger. Its corresponding Node regression suite verifies canonical positive
integer `uwolo` amounts, exact `wolo-1/uwolo` classification, event-ID and
receipt replay rejection, one reservation per canonical game and policy version,
the maximum 1,000 WOLO per-match reservation, atomic-value conservation across
available/reserved/committed/withdrawal-pending/withdrawn states, unmatched
100% returns, bounded ticket refunds and withdrawal finalization/cancellation.

**CRITICAL TRUST BOUNDARY:** The reducer processes events that a future
independent verifier **must already have authenticated**. Naming an event
`verified_deposit`, supplying `receiptId`, or passing a WoloChain ID is
NOT cryptographic chain proof. Never accept these events from a browser, API
request or client-supplied transaction hash. The module does not authenticate
the account owner, inspect a real block, verify finality, reserve database rows,
hold a real bank balance, or authorize a signer. There is no DB table/migration,
API endpoint, user credit, deposit/withdrawal route, funded wager, automated
executor, or Wolo settlement change in this tranche. Financial issue #514
remains OPEN; the next gate is exact chain-event parsing, physical bank/vault
liability reconciliation and owner-bound durable ledger design with independent
security review. The E2 "Load from Wallet" button remains disabled.

### October 13: canonical-game economic uniqueness across plan edits

The offline reducer now prevents a second **active or committed** reservation
for one owner/canonical game even when the preset's policy version changes.
A never-committed reservation may be explicitly released and retried under a
new version; an accepted commitment cannot be repeated after a plan edit or a
refund. This is a research-level negative control for future funded execution,
not an authenticated custody ledger, chain transfer, real ticket, or live
betting capability. Database transaction ownership and physical liability
reconciliation remain necessary before an executor may use this invariant.

## October 13: E2 profile QueryClient context hotfix

The certified October 13 E2 deployment exposed an authenticated `/profile`
client crash: `No QueryClient set, use QueryClientProvider to set one`.
`MechaAutoBetCard` invokes `useWoloBalance` (TanStack `useQuery`), but
the profile route initially lacked the wallet-query provider present on
`/bets`, `/wolo`, `/wallet`, and `/staking`. The hotfix adds the
existing `app/Providers.tsx` through `app/profile/layout.tsx` so the
Mecha E2 wallet read has provider ancestry without imposing query-client
costs on unrelated site routes. The accompanying route-ancestry regression
ensures this does not recur when the E2 presentation changes. Wallet
verification, disabled satchel funding, replay truth and Wolo settlement
are unchanged. A certified build and Doctor health alone are **not** an
authenticated-page render proof; operator browser verification after
protected activation is required before this incident is closed.

## October 12: E2 Mecha command milestone (non-custodial)

The default /profile presentation is E2. The click-or-hover profile selector
supports B1/B2, A1/A2 and E1/E2. E1 remains the previous full Extreme layout,
while E2 uses a condensed Mecha command tile. Basic and Advanced variants share
their existing page content for now. A user choice persists in UID-scoped
browser storage, not yet as a cross-device account preference. The selector
supports Escape, keyboard focus and mouse transit across the trigger/popover
without collapsing prematurely.

The E2 tile now prioritizes three distinct numbers: exact connected-wallet
balance, personal War Satchel balance, and next-match WOLO stake. "AUTO BETTING"
identifies the feature; the short controls say "BET PLAN", "DESYNC" and
"ARM PREVIEW" instead of insider names "LOADOUT", "DS" and "LOAD PREVIEW".
The Mecha title and ON/OFF preview switch remain prominent. Its subtle beacon
is CSS-only and respects reduced-motion preferences, and the tile does not add
its own polling loop.

The wallet balance is a real Keplr-connected WoloChain address lookup through
the existing useWoloBalance hook, validated for exact address, wolo-1 chain ID,
uwolo denomination, decimals, data provenance, and bounded query freshness.
Disconnected, loading and errored reads never display fabricated "0 WOLO".
The independently verified War Satchel balance is not implemented and must
therefore display an explicit unavailable dash rather than a fictional zero.
The "LOAD SATCHEL" button opens a premium deposit amount panel with amount
entry and quick-select values. Its transfer button remains visibly unavailable
until an owner-specific, chain-reconciled custodial subledger, signature flow,
idempotent deposit verifier, and withdrawal authority are implemented and
certified. No click sends tokens, and the stored shadow preset cannot claim
funded readiness. No custody/address permissions or migrations are introduced.
The panel is a truthful product surface for an unfinished financial rail,
not an accepted or pending funding request.

Combined winner plus D-Sync stake for an automatic game must be an integer
from 1 to 1,000 WOLO. The finite-plan upper envelope remains 10,000 WOLO.
The server validates incoming preset changes, and the Watcher shadow admission
rejects even old stored presets exceeding the new combined cap. Manual betting
retains its separately enforced 50,000 WOLO policy. Saving/arming an E2 preset
is shadow evaluation only. It never means an accepted wager or confirmed
on-chain locked balance. The OFF switch uses a narrower owner-authenticated,
optimistic-versioned pause action that leaves all saved stake amounts unchanged
and succeeds even for legacy over-limit presets or invalid unsaved form edits.
Both E1 and E2 expose this fail-safe pause, and both validate the same
1,000-WOLO combined per-match cap in their client loadouts. Only an explicitly
saved new plan is subject to the tightened amount validator; a user must never
be locked out of pausing by an input-validation change.

Admin telemetry lives at /admin/auto-bets, linked from the admin hub.
Its session-gated GET /api/admin/auto-bets is private/no-store, bounded
to the latest 100 preset rows and 75 execution rows, and provides full
count metrics and execution-state distribution. It never sends tokens,
signer authority, raw Watcher sourceEvidence, or session credentials and
offers no forced execution or user balance mutations.

### Hard gates for future funded Mecha release

A single ordinary Cosmos bank-send signature does not authorize the server
to silently debit an arbitrary linked wallet in every future match. Either a
chain-supported, owner-revocable delegated authorization must be proven, or
a separately audited, pre-funded War Satchel account must be implemented.

Before financial execution can be enabled, require all of the following:

1. Verify exact Wolo chain ID, denom, signer role and sender wallet ownership;
   a chain-confirmed user transfer to the dedicated custody address is the
   only authority for crediting a personal War Satchel ledger.
2. Implement append-only user-credit, available, reserved, accepted-stake,
   payout/refund-liability, withdrawn and total-custody reconciliations,
   with immutable chain proof and strict nonnegative concurrency invariants.
3. Bind owner consent to verified UID + wallet, a revocable finite maximum
   allocation, a 1,000 WOLO combined per-match cap, per-day exposure ceiling,
   frozen policy version, pause/cancel propagation and expiry.
4. Revalidate the exact Watcher/Steam uploader roster, one canonical game
   identity, frozen verified team proposition, and matching live D-Sync child
   before any money reservation or spend; never trust raw Watcher telemetry.
5. Use a serializable/locked reservation transaction and deterministic
   unique tuple of user, canonical game, policy version and funded ticket.
   Preserve idempotency across process crashes and repeated retry attempts.
6. Prove the escrow spend and accept a canonical real BetStakeTicket before
   recording a financially committed wager or advancing a finite game count.
   Existing Bet Escrow payout/refund authority must independently accept the
   funding provenance. Never use an app-only synthetic wager.
7. Unmatched or void wagers return 100 percent of the unmatched stake;
   the 2 percent fee applies only under existing matched-settlement policy.
   Refunded liabilities cannot be withdrawn or spent twice.
8. Future game-by-game stake sequencing (example: 100, 200, 50, 1,000 WOLO)
   requires a durable server-side versioned queue, per-item caps, a bounded
   total, and one ordinal advance per accepted funded ticket. Until Out and
   skipped/missed matches need explicitly designed accounting. E2 currently
   supports a uniform per-game preview stake, not a stored variable queue.
9. Build admin visibility, reason codes, circuit breakers, cancellation,
   recovery replay, low-balance stop, crash/restart/race tests, a mainnet
   canary and immutable reconciliation receipts before any live toggle.
   On the public Bets Hall, a Mecha-agent label is admissible only for an
   actually accepted funded automatic wager.

The current runtime explicitly sets its live executor availability to false.
Changing environment variables or clicking ON cannot activate money movement.
This release milestone contains no new custody, funding, wager, migration or
withdrawal endpoint, and must not be represented as a live auto-betting release.

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

## 2026-10-18: signed wager review and authenticated acceptance integration

The held integration branch reuses PRs #638, #655 and #656 with current main.
It does not activate custody. `SATCHEL_FINANCIAL_BRIDGE_READY` remains the
literal `false`; preview settings and operator environment flags cannot lift
that source hold. No production migration, financial operation or service
replacement is authorized by this integration.

The actual Wolo interface is bearer-authenticated loopback **8094**:
`GET /satchel/v1/health`, `POST /satchel/v2/one-shot` for wagers, and
`POST /satchel/v1/proofs/operation` for read-only proof export. The two unused
unmerged HMAC/camel-case prototypes now refuse without I/O. They cannot be
reactivated with environment flags. Existing 8092/8093 settlement authorities,
the consensus executable and founder claim #889 are unchanged.

The app's `SatchelWagerAuthorization` records the original owner, linked wallet,
Watcher game/proposition, preset version, exact ticket legs, original Keplr
mandate/signature, reserve-journal identity and ledger revision under the
existing global financial lock. It adds no second balance ledger. Its three
HD-domain digests are deterministic snapshot bindings, not reserve proofs.
`SatchelWagerApproval` accepts only a separately signed Ed25519 reservation
matching that request. The version-1 sign bytes are the existing Go
`WagerReservationMessage` contract, covered by an actual Go golden fixture.
`attachIndependentSatchelWagerReview` is trusted internal ingress; no browser
approval endpoint or private-key approval generator ships with this change.
The independent reviewer must verify the actual hold, original owner consent,
current market, aggregate liabilities and operating-fee headroom before signing.

A first pass may reserve funds and prepare the immutable review request, then
return `waiting_for_review`. That leaves the original hold unattempted; it
neither releases money nor claims a broadcast. Only an unattempted reservation
with an original independent approval may resume through the bounded intake.
The submission transaction rechecks current consent, wallet, market and the
reviewed ticket legs before durably entering `unknown_hold`. A changed market
promotion cannot silently inherit the old review. Concurrent workers cannot
both acquire the first-attempt fence. An unknown/attempted operation is excluded
from every signing intake, including after restart.

An authenticated service ACK yields **broadcast_accepted**, never finality.
Its candidate hash is durably unique and immutable. Ticket and funded-ledger
commit require an opaque proof produced by the pinned offline verifier, binding
the actual Cosmos bytes, committed execution, exact transfer, fee and original
signed reservation. Satchel ticket acceptance does not fall back to ordinary
REST. Its timestamp comes from the authenticated primary `/commit` signed
header at the exact inclusion height/block identity; fractional seconds survive.
Proof freshness is checked again inside the ticket and financial transactions.
`reconcileFundedSatchelWager` is proof-only recovery of one exact attempted
operation: it cannot sign, prepare a new ticket, release funds or rebroadcast.
If an ACK was lost, its supplied hash is admitted only after the journaled
operation's authenticated proof matches it. Existing unique ticket/transfer
locks and immutable funded journals preserve exactly-once acceptance.

Both deposit and financial-proof adapters pin the **new** reviewed Wolo PR #39
custody artifact, source `99f32de617964565875ed4689bea0d688bb99147`, CI run
`39129775493`, Linux AMD64 SHA-256
`d431c580a47ff020d997534145c5c53959c70c6f2d00d13029582ee8ec8709ac`.
This is not a relabeling of the historical PR #29 or `bdbce253` settlement
artifact. The isolated test script first builds that clean source; Linux CI
must reproduce the pinned bytes. Its native macOS test-loader substitution
exists only in disposable tests. Synthetic validator/reviewer authority grants
no mainnet authority.

Source validation includes genuine SDK MsgSend execution, authenticated Comet
proofs and real isolated PostgreSQL credit/uniqueness/crash tests. The wager
proof test authenticates a real synthetic 7-WOLO transfer and its actual ante
fee; independently re-signed wrong-fee, amount and memo expectations fail.
This is component integration evidence. It does **not** certify the complete
100-WOLO deposit → 12-WOLO Watcher ticket → settlement/refund → withdrawal user
journey, which still needs a governed disposable database/service rehearsal.

Activation remains **BLOCKED**. Independent vault control, signer exclusivity,
public trust/approval authority outside app write control and a current trusted
consensus checkpoint/witness must be provisioned and inspected. An automatic
independent reservation-review consumer is not implemented by the signature
import function. Aggregate pending gas fees need a separately accounted budget;
the app's existing `readIndependentSatchelBank` reads configured RPC/REST JSON
and is **not independently authenticated bank-state or solvency evidence**.
Do not treat that function's name, a signed review digest or source CI as bank
certification. These are substantive remaining implementation/provisioning
requirements before lifting the source hold. Eligibility/jurisdiction controls
and the complete owner journey need independent launch review too.

The additive `20261019_010000_war_satchel_wager_authority` migration is test-only
in this delivery. Its request, review and candidate tables reject mutation,
wrong-reserve admission and hash reuse; installation rolls back atomically with
its caller. No earlier six-migration or eight-migration approval covers this
new cohort. Existing SQL simulation release authority remains main's contract;
financial PostgreSQL tests run separately in the isolated CI job. No deleted
release framework or deferred simulation migration is resurrected.

Wolo issue #5 and its one canonical six-control checklist remain binding:
producer/signer isolation, accepted/uncertain operation reconciliation, #889 and
all liabilities, independently checked bank/fees, fresh quiesced snapshots and
bounded financial-state-preserving rollback. PR #43 preserves the completed
Control One evidence; its source CI does not establish live isolation. Do not
fast-forward a VPS checkout, fence producers, install a service, apply this
migration, broadcast a canary or enable money based on this document. A later
owner-approved protected cutover must name the exact reviewed artifacts,
complete the missing evidence and retain consensus/8092/8093 separation.

## October 19 — private independent reviewer pickup bridge (SOURCE HOLD)

The held Mecha funded executor now attempts one bounded **private** reviewer pickup
only when the original durable Satchel wager authorization has no approved
signature. It posts only `{protocol:1,operation_id}` to a fixed loopback
`127.0.0.1:8095/reviewer/v1/wagers` service: no owner-selected bank data,
stake amount, fee amount, signature key, market identity or remote reviewer URL
is accepted over this ingress. A future separately controlled review service
**must** re-read and authenticate the immutable original Keplr mandate, exact
Watcher/Steam market/UID source, SQL hold and aggregate bank/gas liabilities
before it issues any response. Its implementation and certifiable runtime
remain **UNBUILT** (Wolo issue #46).

The app accepts either an exact `PENDING` response (no money path) or an
Ed25519-signed protocol-2 `WagerReservation` matching the HD-persisted
operation, owner, vault/escrow, amount, memo, immutable reservation, ledger and
consent digests and signed fee/time. The public verifier key comes from
operator-controlled private disk, **never** the HTTP body. Verification precedes
the existing serializable original-hold attachment; only its durable receipt
can allow a later transition to the irreversible submission attempt fence.
A transport failure, missing/expired grant, bad signature, service refusal or
unknown response stays `waiting_for_review`: no release, new signer call,
ticket acceptance or retry of an uncertain broadcast. Existing 8094 signer,
8092/8093 legacy services and consensus are untouched.

This source lane adds no public endpoint, background cron, issuer private key,
approved production signer or independently authenticated bank oracle.
`WAR_SATCHEL_AUTO_REVIEWER_ENABLED` and operator flags cannot defeat immutable
`SATCHEL_FINANCIAL_BRIDGE_READY=false`. Even a valid reviewer signature is
not standalone custody solvency evidence. A real, independently operated 8095
review service, signed authority provisioning, replay-safe reviewer journal,
fully authenticated producer/liability/fee census, protected migrations and
complete Keplr→Watcher→wager→return→withdrawal rehearsal remain mandatory.
No customer funds move from this source-only implementation.

## October 19 — P0 reviewer queue reachability repair

The original funded Watcher outbox mistakenly selected
`funded_reserved` rows **only after** a `SatchelWagerApproval` already
existed. The new app-side private 8095 review pickup therefore could not be
invoked again for an unreviewed reserved game after the first tick: the
approval prerequisite made the automatic review path circular.

The updated eligibility query retains `funded_reserved`, exactly one
prior admission/reservation attempt, the original immutable
`SatchelWagerAuthorization` and reserved hold **whether or not its
independent review has arrived yet**. Only within the existing four-minute
verified, live Watcher market window and only when the original owner
consent remains active. `funded_submitting`, `unknown_hold`, terminal,
expired, unsigned-consent and previously committed tickets are never
automatically reselected. The executor checks the durable attempt fence,
original reservation and independently authenticated review before any
signing. PENDING, a failed reviewer, or missing signer means wait, not
second reservation, transaction retry or 2% fee/refund.

This is a source-level reachability and scheduling correction under
`SATCHEL_FINANCIAL_BRIDGE_READY=false`; no funded production worker, live
custody, review issuer, wallet, chain transaction or fund balance is
activated by it. It must be revalidated in the continuous 8095→8094
isolated trial before any approved production canary.
