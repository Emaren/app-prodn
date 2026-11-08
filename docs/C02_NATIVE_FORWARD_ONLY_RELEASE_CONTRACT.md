---
id: "aoe2war.app-prodn.docs-c02-native-forward-only-release"
title: "C02 — Native-only WOLO Satchel App integration (held)"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain","postgresql"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "source-only-held-financial-release-contract"
reviewed_at: "2026-11-08"
review_interval_days: 14
sensitivity: "internal"
---

# C02 — Native-only WOLO Satchel App integration (held)

## Provenance and authority
- App base: Emaren/app-prodn integration/20261023-satchel-final-gated at d258ddafa6c4060f4b4db66d4d662c5db1c27ad8.
- WoloChain native contract: held fix/c01-producer-review-20261104 at 5beb646f311b05dc55710fe8ea9248db80af1d1d.
- Session B owns this App source; Session A alone approves financial SQL owners/grants, custody, 8094/8095 deployment, C08 ratification, and C09 funded permit.
- C02 is NOT FINANCIALLY ACTIVATED. The existing source-level SATCHEL_FINANCIAL_BRIDGE_READY remains false. Do not change it without complete physical acceptance. No customer funds are moved by this branch.

## Protocol
1. Keep all 13 byte-pinned historical Satchel SQL migrations. Apply only one additive 14th migration: prisma/migrations/20261108_212700_c02_native_forward_only_returns/migration.sql.
2. Fresh return claim identity is a bigint in 900000000001..999999999999, entirely disjoint from legacy pending_wolo_claims integer IDs. All 69 unresolved historical paid-without-hash claims remain UNKNOWN, and old claims 889 and 9645 cannot enter this namespace.
3. An eligible original transaction is a committed, authenticated funded Satchel wager in war_satchel_wager_broadcasts bound to its original user, reservation, ticket, tx hash and source bank state. A fresh signed return approval is checked against these immutable economics by the existing real Ed25519 v2 verifier and stored separately.
4. New native financial execution is non-public: prepare through 127.0.0.1:8094/satchel/v1/returns/prepare, then independently verify current post-prepare 8094 check-execution backed by the separate signed 8095 reserve-review issuer and owner permit. Neither a stale review nor an imported digest authorizes an execution.
5. Commit one immutable original operation key and exact signed approval in war_satchel_native_return_attempts before the one permitted POST /satchel/v1/returns/execute. An ambiguous COMMIT, timeout, disconnect, 404, server restart or unknown outcome can only lead to GET /satchel/v1/returns/execution/{original_claim_id}. Never POST twice. No 8092/8093 fallback.
6. A reported transaction hash is a NONCREDITING UNKNOWN candidate. The App uses its independently pinned Go/Comet proof verifier to validate actual chain ID, owner, escrow, vault, amount, unique MsgSend, original memo, block, signed review and recent trusted header before a dedicated finance-writer database transaction can credit.
7. The credit goes only to the existing funded Satchel balance and append-only journal. The global war_satchel_physical_receipt_consumptions unique tx fence also covers deposits and older Satchel return receipts: the same chain transfer can credit exactly once across all three paths.

## Source files
- lib/warSatchelNativeOnlyReturn.ts: bounded private 8094 protocol; original-op idempotency; GET-only recovery.
- lib/warSatchelNativeReturnJournal.ts: source identity, owner and finance-owner write-ahead SQL transaction.
- lib/warSatchelNativeReturnRuntime.ts: signed-review import, 8094 native reserve check, one-shot operation, pinned Comet receipt, atomic credit. No public API route.
- lib/warSatchelAuthenticatedClaimReturn.ts: 12-digit Go protocol parity without legacy-claim payouts.
- prisma/schema.prisma: new forward-only models; the 14th SQL migration is actual database authority.
- scripts/c02_native_forward_only_pg16_rehearsal.py: disposable Unix-socket PG16 actual 13+1 DDL, rollback, synthetic credit, legacy-ID, duplicate, bad-proof and role-denial checks.
- tests/war-satchel-native-8094-forward-only.test.mts: adversarial timeout, duplicate, concurrent request, lost COMMIT and NO 8092 fallback.
- tests/war-satchel-native-go-http-wire.test.mts: actual compiled WoloChain 8094 HTTP handler in a test-only local process using an INERT no-key backend. It is not a funded canary or a production signer.

## Physical evidence (nonfunded)
- Original 13 SQL migrations: PG16 29 tables, 76 indexes, 8 sequences; role and schema negative tests pass. Receipt SHA256 820a7aff86d929df30337dc3fac7b8e8802545946f89bc86280fea645dcc540b.
- 14th source: PG16 rollback, 34 Satchel tables, one synthetic 1-WOLO credit, one journal, one globally consumed tx; old IDs, duplicate, malformed bank root, unauthorized writes and immutable-row attacks rejected. The latest receipt SHA is published in the C02 GitHub PR.
- App signed-v2/claim/transport group: 32/32 PASS. Chain internal/satchelservice escrow-return suite PASS on 5beb646f... .
- Real App-to-Go-handler cross-process wire, no keys, fixed 8094 port: PASS; receipt SHA256 d7d64076c207eb51a933fcc48622af06be91039eb88e69fc8974ffcb5b451702.
- Prisma 7.10 validate, generate and full TypeScript compile PASS on isolated held finance source.

## Required production acceptance — DO NOT SKIP
1. Session A accepts C04 legacy-liability quarantine, C05 reserve safety and C06/C07 complete SAME-capture offhost backup plus exact isolated restore.
2. Replay all 14 migrations on the actual C07 restored HD schema, prove repeatability, partial-failure rollback, financial owner/sequence/function privilege denial and finance-safe website compatibility. Synthetic fixtures alone are not sufficient.
3. Session A approves and physically installs C03 full finance-writer owner/grant migration. Legacy HD/DE, Next.js, Traffic, worker and cron processes cannot update or inherit new financial DML/EXECUTE. Demonstrate authenticated browser continuity during rollback.
4. Run exact production binaries/permissions for custody 8094 and independent reviewer 8095; prove 8092 network usage is zero. No raw production key, token, mnemonic, password or recovery seed is to be exposed.
5. After genuine C08 owner policy adoption and distinct C09 exact canary signature, test ONE new operation in the enrolled runtime: signed approval, one POST, unknown/read-only recovery, independent signed bank proof, exactly one App ledger credit, two duplicate denials and no historical liability migration.
6. Only Session A can authorize final funded permission and customer-asset movement. Source PR merge, synthetic PG16 PASS, inert Go wire PASS, website deployment and signed intent cannot close C02.

## Decision
**C02 OPEN — tested finance-source candidate, not a real funded release.**
Production rollback after a first actual operation must preserve append-only UNKNOWN journals and never resent an ambiguous payment, revert to legacy 8092, delete a credit or silently drop new finance tables. Disable only the approved new producer and run read-only original-operation reconciliation until owner-authorized forward repair.

### Legacy database compatibility repair (November 8)

An exact-head CI isolated deposit test caught a real staging hazard: adding a new optional native_return_credit_id to the old Prisma funded-journal model caused existing deposit queries against the original 13-migration schema to fail. The C02 14th migration now preserves every old journal column, adds a distinct native_return_credit journal event and links it to the immutable native return credit through a guarded trigger. This is deliberately backward-compatible with the original generated Prisma client and staged finance-safe website. The independent PostgreSQL 16 rehearsal proves the old column list remains unchanged and an unbacked native journal event is denied. The formerly failing real deposit CI suite MUST pass on the new head before merging.
