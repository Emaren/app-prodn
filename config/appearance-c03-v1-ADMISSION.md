# WE1 / C03: Ember Appearance V1 — independently tested PostgreSQL admission

**Decision:** `WE1_SOURCE_SQL_ISOLATED_ACCEPT`; `LIVE_DB_ADMISSION_REJECT_UNTIL_OWNER_B_PERMIT`.

This is the exact-source **nonfinancial-only PostgreSQL grant and inverse** for WE3's actual Ember Reign writer, **not** a substitute writer, a production migration, a root operation, or a financial authorization. PR #1379's completed WE1 financial-document review is intentionally untouched.

## Bound sources

- App canonical baseline: `d36e9f98e44b0a4de438c5cc623706873c333ca5`.
- Actual PRODUCT implementation examined independently in WE3 PR #1377 HEAD `6a9c89a040fc05edc99ef1e85d9ecb5273534683`:
  - Core `lib/appearanceWriterCore.mjs` Git blob `75b6f2e1d436a9fc31acb97a3b4fb5d6150f26f4`.
  - Node sidecar `bin/appearance-writer.mjs` Git blob `ef0dfbc5f0fc65802e73be4b9f0b885f328c3897`.
  - Web client `lib/appearanceWriterClient.ts` Git blob `ef14fff74eb7f332ec6c476bf67792cab9f379fd`.
  - Session verification source `lib/session.ts` Git blob `05b0656b99b873639ff4c5a256c78da01163b868`.
- Physical production read-only catalog baseline: [Central #1280 comment #6909226282](https://github.com/Emaren/app-prodn/issues/1280#issuecomment-6909226282): web DB role `aoe2war_web_prod` NOINHERIT, no DML, no sequences, no role memberships. Broad legacy `aoe2war_r25_web_ro` SELECT on **190/190 public tables** must NEVER be inherited. Campaign GET currently 42501/503. Live October singleton/history protected.
- Old source-only November candidate `9313de6...` is superseded. DO NOT use its old test or artifact permit for the new WE3 candidate.

## Exact WE1 files

| Source | Git blob | SHA-256 (UTF-8 file) |
| --- | --- | --- |
| `config/appearance-c03-v1-apply.sql` | `eaf0e46bcb6c573bf57a7d070a79e72a029bdf8f` | `3adf4296436fcb4d20a2261c7a12f0894b4df8aceadcb6e0e5d6f3a967c151e3` |
| `config/appearance-c03-v1-inverse.sql` | `c93d1682bc1891dadfd1c5edbc5cf6a9f0eb8432` | `65270456e8fd957019a84b617e5a86de901b1e69e61369272e260151358068ed` |
| `tests/appearance_c03_isolated_fixture.sql` | `a7ca0694b164a4984750a24491afd378cc39029f` | `c907e924d8f10f1bc075b005e6c45ec37a0531452183b44aa08c837190fe2bf9` |
| `tests/appearance_c03_we3_real_core_pg.mjs` | `6637828907609fd607d11d0150b48f3548c6ed7f` | `9f6810a2a7d91a5a60b9918c6cf60d3d5457db60dafb377b7f5917bcc02648d2` |
| `tests/appearance_c03_we3_admission_runner.py` | `4ed1a8adcdf3118bbfbd577a201021b74443a83f` | Tested current runner source plus final hash on restricted UID650 (see final exact-head receipt) |

No alternative deployable writer/client/systemd unit is included. **WE3 is the sole PRODUCT writer source owner.** WE1's earlier reference sidecar was retired because it needlessly queried the activity ledger; the actual WE3 writer does not.

## Staged SQL role and exact permissions

SQL stage uses a single transaction with a short timeout, checks the exact `aoe2hd_db` and privileged caller, the installed owner `aoe2hd_user`, RLS/ACL/drift, no role membership, web 0 DML/sequence/schema-create, no unreviewed callable SECURITY DEFINER and no default ACL drift. It creates `aoe2war_appearance_writer` as **NOLOGIN NOINHERIT PASSWORD NULL** (no superuser, create, ownership, BYPASSRLS or replication). No HBA, login password or service is installed.

**Existing website role** receives column-only SELECT and **nothing else**:
- `site_theme_campaign(slot,campaign_key,label,enabled,theme_key,starts_at,ends_at,updated_by_user_id,updated_at)`
- `user_theme_campaign_overrides(campaign_key,user_id,theme_key,updated_at)`
- `user_appearance_preferences(user_id,theme_key)`

**Distinct writer (NOLOGIN during stage)**:
- `users` SELECT `(id,uid,is_admin)`; no UPDATE and no `users_id_seq`.
- `site_theme_campaign` SELECT the nine fields above; UPDATE only `(campaign_key,label,enabled,theme_key,starts_at,ends_at,updated_by_user_id,updated_at)`.
- `user_theme_campaign_overrides` SELECT `(campaign_key,user_id,theme_key,updated_at)`; INSERT **`(campaign_key,user_id,theme_key,created_at,updated_at)`**, UPDATE `(theme_key,updated_at)`.
- `user_activity_events` **INSERT only** `(user_id,type,path,label,metadata,created_at)`. No writer SELECT on the activity ledger.
- Exactly two sequence USAGE grants: `public.user_theme_campaign_overrides_id_seq` and `public.user_activity_events_id_seq`.
- Never any financial/wallet/bet/table permission, users DML, users ID sequence, inherited broad reader, user-defined SECURITY DEFINER, default ACL, schema CREATE or database CREATE.

Both explicit timestamp INSERT column permissions were confirmed necessary by reading WE3's **actual SQL**. Under-granting them would make the live writer fail; granting any extra table-wide write authority would break C03.

## Real isolated execution (NOT a production admission)

UID650 private Apple Silicon M1 PostgreSQL14.18, exact private PGDATA `~/we1-c03-pg14-isolate-20261116/data`, **127.0.0.1:55491**. The role has real SCRAM HBA in this **synthetic** database only. All SQL application, test role temporary login/password, synthetic October fixture resets, inverse and validation are fenced to UID650's exact private PGDATA and isolated clone of WE3 HEAD. No HEL1/production database connection is available to these tests.

**Combined exact-source acceptance: 39 admission/ACL/negative checks PLUS 46 independent actual WE3-core checks = 85 PASS**, including:
- web 42501 DML, override INSERT, sequence and financial SELECT denial; no broad table SELECT, no privileged `users.is_admin` read, no broad role membership.
- writer SQL financial SELECT, `users` UPDATE, `users_id_seq` denial; no schema/database CREATE; only explicitly required timestamp INSERT rights, no activity SELECT.
- actual synthetic SCRAM writer credential; **wrong password denied**; HS256 signed-session issuer/expiry and forged/future/expired negatives; server independently re-reads DB `users.is_admin` and actual subject, rejects ordinary admin and client-supplied IDs.
- fixed October→November singleton, no October record changes, seven-theme validation, active-date/disabled campaign check, eight concurrent SERIALIZABLE operations and paired mandatory audit per successful write.
- injected activity permission failure returns HOLD and **rolls back** the override; successful committed audit and override after restoration.

**Raw catalog ACL SHA-256** (not a production fingerprint):

| Phase | SHA-256 |
| --- | --- |
| Original synthetic PG catalog | `4482b1b7bca488b7dbcd0cc0e5b191d770b7fe4546f1d44b9493a77152806b75` |
| Minimal staged SQL | `b4b7c3b6b397cabe0a3ccfa9dc78f9a8076261067a37179771f98523579054ef` |
| After inverse | `4482b1b7bca488b7dbcd0cc0e5b191d770b7fe4546f1d44b9493a77152806b75` |

The inverse requires the writer NOLOGIN and **no live writer sessions**, revokes the *exact* staged column/sequence grants, removes the role and restores the original raw ACL fingerprint. It **never deletes/rewinds October or November campaign rows**. This test qualifies the core transaction, **not** the actual standalone Node HTTP-over-Unix sidecar runtime.

## Separate real authority still required

WE1/C03 source review and synthetic test PASS does **not** imply owner permission to mutate PostgreSQL, B security approval, physical writer activation or permission to release the website.

**B/WE2 OS-auth holder must independently review** WE3's exact final source, root-owned service install and inverse, distinct Linux service principal (currently ABSENT on HEL1), socket directory ownership/group permissions, UID990 protection, SSH/Steam/nft confinement, HBA SCRAM and credential custody. Because normal website sessions are **HS256 shared-secret signed**, the independent verification code does *not* provide an independent signing trust domain against compromise of the website. B must explicitly accept or replace this with separately signed audience-bound short-lived proof and test both impersonation and IPC peer identity.

**Owner must separately authorize** source-bound exact production preimage/installation permit for stage, then a different deliberate login/HBA/service activation permit. Stage without both permits **must leave writer NOLOGIN** and must not touch existing financial HBA. After authorized physical work: anonymous campaign GET200, real Emaren admin GET/POST, ordinary Scribe admin403, real Scribe saved override and activity on reload, source-bound ACL/privilege negative tests on HEL1, and proven inverse. No physical post-permit test has been performed yet.

**Final WE1 decision:** `SOURCE_REVIEW_AND_ISOLATED_SQL_INVERSE=ACCEPT`; `B_SECURITY_OS_AUTH=NOT_ACCEPTED`; `OWNER_ONE_USE_PERMIT=ABSENT`; `LIVE_POSTGRES_DB_ADMISSION=REJECT_NOW`; `FINANCIAL_GATES_C01_C02_C03_C05_C06_C07_C09=OPEN`; `FUNDING_DENIED`; `PRODUCTION_CHANGES=ZERO`.
