---
id: "aoe2war.app-prodn.docs-ops-war-satchel-initial-install-frontier-20261016"
title: "War Satchel six-migration initial-install release frontier"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "read-only-operator-release-evidence"
reviewed_at: "2026-10-16"
review_interval_days: 30
sensitivity: "internal"
---
# War Satchel six-migration initial-install release frontier

Status: RELEASE HOLD. Operational evidence from October 16, 2026, read-only; this is not production approval.

## Production evidence

- Live HD DB aoe2hd_db / public: 114 Prisma rows, 112 applied, 2 historical rolled-back then subsequently applied.
- Both historical rollback names were later applied: 20260310_initial_schema and 20260401_235900_add_scheduled_matches.
- Zero incomplete rows, checksum mismatches, or missing applied SQL files.
- Zero installed war_satchel_% relations/functions; zero applied War Satchel migrations.
- Deployed app cf564f6e49 has five pending Satchel directories; release candidate 25244c744a adds a sixth correction.

## Exact ordered SQL installation manifest (Git blob fingerprints)

1. 20261014_103500_war_satchel_noncrediting_foundation : de584eba527eb414666b6c850e35378ee9c57081
2. 20261014_133000_war_satchel_wallet_owner_challenges : b88ec91bfe51c621f2722c86d20cd0399c516460
3. 20261014_150000_war_satchel_simulated_double_entry : 37bdca571c54174f063ac40562446b5162d10269
4. 20261014_164500_war_satchel_simulation_concurrency_guard : bfe55c4d852d4b17c92e070d7e103c02ce0e27a4
5. 20261014_191500_war_satchel_simulation_single_owner : 7dda438c358c41fb002e56779b5f5f09862f0b33
6. 20261015_151500_war_satchel_simulation_guard_correction : 911a9684b14d163fe1ad4b2b04cfec7a60268e69

Six CREATE OR REPLACE FUNCTION statements occur in this sequence. Generic additive migration policy rightly rejects them; keep it unchanged. The last correction keeps overdraft count separate from distinct liability-owner count.

## Required operator approval pathway

1. Independently inspect six exact SQL files and trigger/function permissions, dependencies, locks and schema assumptions.
2. Rehearse all six on isolated PostgreSQL 16 using .github/workflows/war-satchel-sql-proof.yml, including owner challenge, balanced journals, concurrency races and negative funding/owner/immutability cases.
3. Test authorized representative isolated DB, with no production secrets in CI. Collect reviewed hashes, explicit signoffs and rollback/forward-fix plan.
4. Design narrowly allowlisted, six-file initial-install migration release mode with exact Git candidate, whole pending frontier, and operator acceptance. Never create a general function-replacement bypass.
5. Prove restorable pre-migration backup, SHA256, durable receipts, independently verified live DB inventory and quiescent ingress before any production write.
6. Independently clear Wolo release hold: founder payout claim #889, combined HD/DE signer+ingress isolation and complete drain, modern settlement-only rollback/watchdog, validator never restarted.
7. Only with explicit operator approval use protected migration process and post-migration receipts; subsequently retry exact-candidate protected Finish.

NEVER: manually fake Prisma migration history, relax automatic migration checks, run db push in production, enable real custody credits based on a simulation, retry founder claim #889 without exact chain proof, or touch the validator.

Evidence: https://github.com/Emaren/app-prodn/issues/634 ; Wolo HOLD: https://github.com/Emaren/wolochain/issues/5
