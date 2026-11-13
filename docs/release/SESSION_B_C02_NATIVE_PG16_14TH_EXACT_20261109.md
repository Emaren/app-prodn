---
id: "aoe2war.app-prodn.session-b-c02-native-pg16-14th-exact-20261109"
title: "C02 exact 14th Satchel migration and durable original-operation journal isolated acceptance"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "disposable PG16 noncrediting acceptance; production DDL prohibited"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# C02 exact 14th Satchel migration and durable original-operation journal isolated acceptance

The 13 original Satchel migrations are pinned by catalog SHA256 2121c25ac84e4731adfbde9029c22c53d765e6c57e747a3396ea72e00f24e8ba. The fourteenth 20261108_212700_c02_native_forward_only_returns/migration.sql is SHA256 005b6143b69db15586a0562a97f419ad4a35a758cdec3909ff9f46a1b07dc2c3. Finance-only journal adapter SHA256 is 8d340144ce6df399c17aa6f03393dea0d76255901a6d83ee9873d5555a276f0e. The existing restricted public App 8094 transport source is 3998247e3cec10b17967381b0cae2f8634a796ce482235b0966e7e957293e020. Do not alter live HD/DE grants or Site R25 to test this source.

## Actual isolated PG16 proof

scripts/c02_native_pg16_fourteenth_migration_v1.py runs a disposable PostgreSQL 16 with listen_addresses empty, a private Unix socket and no production DSN. It verifies byte-pinned source, applies all 14 migrations and confirms five native return tables with zero actual native attempts or credits. The real 14th source-trigger rejects historic claim IDs 889 and 9645 and a fresh claim without authenticated funding. A separate explicitly synthetic schema reuses the exact native attempt-table DDL with a sandbox-only original FK. First synthetic operation inserts once; duplicate and conflicting approvals each insert ZERO new rows; initial digest remains unchanged. Restricted UPDATE/DELETE fail; even owner UPDATE is rejected by append-only trigger. Real native tables remain empty and private scratch database is deleted.

Receipt SHA256 f53d9a4ed87869862d4a25d4062455c81f2e75379aa7b5a4e4e86927aa5d825b, PASS_ISOLATED_PG16_EXACT_14TH_MIGRATION_AND_ORIGINAL_OPERATION_ONCE_NONFUNDED. No native listener, signing key, real escrow or paid customer was involved. Complementary source tests prove committed insertOnce before one POST, timeout/disconnect/404 UNKNOWN then GET only, replay denial, historic transfer-index and claim_group_key market refusal, and zero 8092/8093 fallback.

## Required finance-owner contract

The scratch SELECT+INSERT role was DENIED SELECT ... FOR SHARE against attempts. The Prisma journal adapter performs two FOR SHARE reads in a serializable transaction. Session A must admit a dedicated finance owner with the necessary row-lock capability; do not grant UPDATE or raw finance reads to the restricted public web merely for a green test. A revised optimistic lock/unique design would require separate source and negative test acceptance. Original funding, independent 8095 review, 8094 exact operation and global physical tx uniqueness must be verified before any credit. C02_APP_TRANSPORT=HOLD until real finance-owned journal and native wire admission; C03_APP_HANDOFF=HOLD until authenticated Chrome and physical V18 roundtrip. No C09 funds authorized.
