# WE1/C03 — Ember appearance PostgreSQL admission v1 (SOURCE / ISOLATED TEST ONLY)

**Current verdict:** `ACCEPT_ISOLATED_SOURCE_CONTRACT; REJECT_PHYSICAL_ADMISSION_UNTIL_EVIDENCE_AND_PERMIT`.

## Exact source and provenance

Canonical production source baseline: `d36e9f98e44b0a4de438c5cc623706873c333ca5`. November source candidate initially PR #1377 head `9313de6bea250089c84ef1634eefb0ce1eef871f`. Physical catalog and role negative-test findings: [Central #1280 comment #6909226282](https://github.com/Emaren/app-prodn/issues/1280#issuecomment-6909226282). Separate financial document PR #1379 is already accepted and **out of scope**.

| File | Git blob SHA-1 | Exact UTF-8 SHA-256 |
| --- | --- | --- |
| `config/appearance-c03-v1-apply.sql` | `4179344b01f66bdd8de0f88fb85b576adee1cdcd` | `101ba17ffe80f1f84929c46c89c6b93d5f1772115c9d44034353ac7ca30cd799` |
| `config/appearance-c03-v1-inverse.sql` | `821e06d0525632d1f2fdff9c8724e22e80940e41` | `e947d26158327bedbc4b0cc07c7490e8c35c99451a912adf664a44e9f5492448` |
| `scripts/appearance_c03_writer.mjs` | `fb2fe9539bc9a8a07e6293c9463350e765c0830b` | `d2c20600b8667f58d44f80ce14b5ef66837f6b8f9a7548d0062e77d5862083da` |
| `lib/appearanceWriterClient.ts` | `9ab74f7d07861cbbd5be6500632e517e1bdbcb33` | `6645c30b6712889dd3daf58ec37e367b9da14a1b0b6518d0f9da2540acd65e60` |
| `deploy/aoe2war-appearance-writer.service` | `b376a82b1f7f5da3b757e351983e1b4b72075dcc` | `c0c212af1aee2da25b1bdaa2b66385f0c069ec43338680ec00f0c7d1685d9ceb` |
| `tests/appearance_c03_isolated_fixture.sql` | `a7ca0694b164a4984750a24491afd378cc39029f` | `c907e924d8f10f1bc075b005e6c45ec37a0531452183b44aa08c837190fe2bf9` |
| `tests/appearance_c03_isolated_adversarial.py` | `a6abafc38813510948ed31cc10017ef0cba26b5f` | `3568f1329419435cac0cf252632979afe6e509806718e6d4b96f54ca45400916` |

Each digest was independently read from the restricted UID650, unmodified checked-out source. No production DB role or live table was modified.

## Exact staged authority

The apply SQL is **stage-only**, executed by an independently authorized PostgreSQL owner against exact `aoe2hd_db` catalog preimage. It is **not** an executable permit. It creates `aoe2war_appearance_writer NOLOGIN NOINHERIT PASSWORD NULL`; no memberships, schema/database CREATE, BYPASSRLS, superuser, replication, or default ACL.

The existing website login `aoe2war_web_prod` receives **column SELECT only**, no write or sequence:
- `site_theme_campaign(slot,campaign_key,label,enabled,theme_key,starts_at,ends_at,updated_by_user_id,created_at,updated_at)`
- `user_theme_campaign_overrides(id,campaign_key,user_id,theme_key,created_at,updated_at)`
- `user_appearance_preferences(user_id,theme_key)`

The separately authenticated NOLOGIN writer is staged with:
- `users` SELECT `(id,uid,is_admin)` only — never UPDATE.
- Campaign SELECT the ten fields above; campaign UPDATE only `(campaign_key,label,enabled,theme_key,starts_at,ends_at,updated_by_user_id,updated_at)`.
- Override SELECT `(id,campaign_key,user_id,theme_key,created_at,updated_at)`; INSERT only `(campaign_key,user_id,theme_key)`; UPDATE only `(theme_key,updated_at)`.
- Activity SELECT `(id,user_id,type,path,label,created_at)`; INSERT only `(user_id,type,path,label,metadata)`.
- Exactly two sequences with USAGE only: `public.user_theme_campaign_overrides_id_seq` and `public.user_activity_events_id_seq`.
- No `users_id_seq`, financial/settlement tables or broad `aoe2war_r25_web_ro` membership (which has SELECT 190/190 tables).

Source does not create login credentials, HBA rules, role activation, service files or sockets on HEL1. An explicitly separate `LOGIN`/password+HBA admission must be owner permitted. Writer credentials cannot enter the website process.

## Actual isolated PostgreSQL acceptance

On the restricted M1 UID650: synthetic PostgreSQL 14.18, data directory `~/we1-c03-pg14-isolate-20261116/data`, bound to `127.0.0.1:55491` with an isolated Unix socket under UID650-private `/tmp`. No production DB or credentials are used. The adversarial suite passed **61/61** actual database/socket/session checks; artificial no-password/incorrect-password writer SQL connections were rejected by independently configured actual `scram-sha-256` HBA, valid synthetic writer credential connected, actual JS sidecar verified HS256 issuer/iat/exp session tokens and database `is_admin`. Tests covered anonymous/expired/future/forged, ordinary admin denial, cross-user body rejection, invalid theme/key, wrong/inactive campaign, exact one-November transition, October history preservation, eight parallel per-user mutations with one upsert row and deduplicated audit, injected DB activity INSERT permission failure rolling back override, and SQLSTATE42501 web/finance/sequence/no-inheritance controls. Node source `--check` PASS; full local TypeScript `tsc --noEmit` PASS after copying the generated Prisma client from a UID650 working tree with an exactly equal `prisma/schema.prisma` SHA-256 `897d5e994265470d5a67b34deb1b6dd2de41282a388510f726a5a860b74cfb0f`. Original tracked branch source remained clean.

**Deterministic raw catalog fingerprint:** before `4482b1b7bca488b7dbcd0cc0e5b191d770b7fe4546f1d44b9493a77152806b75`; after stage `36997e32ed03c38bd5ef6d103ae1a8bf05bcb314ddb95c29e5f07d02c2c24fef`; after inverse `4482b1b7bca488b7dbcd0cc0e5b191d770b7fe4546f1d44b9493a77152806b75` **EXACT PASS**. Inverse first requires `NOLOGIN`, no live writer sessions, unchanged role membership, then revokes only this contract's grants and drops the writer role, rolling back the transaction on unexpected dependencies. **Data rows are deliberately not deleted.**

## Genuine B/WE2 OS/auth review — not yet complete

Read-only HEL1 source check: current website OS identity `aoe2war-web-prod` UID990/group984, service `aoe2hdbets-web-prod.service` active PID600020. Proposed new `aoe2war-appearance` account is **ABSENT**, proposed service unit is not installed. Thus service principal/user creation, exact binary, root-owned env file, JWT HS256 verifier secret custody, source integrity, socket peer boundary, mode/group, systemd AF_UNIX/loopback restrictions and independent service staging/rollback all need **genuine independent B/WE2** security acceptance and owner permit.

**Important limitation to review:** current website session JWTs use HS256 and the existing Next.js process also holds the signing secret; sidecar verification is independent as a code path, but **not an independent signing authority**. B must explicitly evaluate the shared-key threat model or authorize a separately signed short-lived, receiver-bound attestation. The caller-provided origin is not a substitute for Unix-socket peer identity. This candidate must not be advertised as hardened against a compromised website process until B accepts these controls. Also B must verify the direct UID650 client module is imported only by server routes, and source `requireAdmin`/origin gate remains in place. Do not install a third Next.js runtime or add a public TCP listener.

## WE3 integration contract and physical approval requirements

WE3 must remove the existing **direct** production Prisma `siteThemeCampaign.update` / `userThemeCampaignOverride.upsert` / separate `recordUserActivity` mutations from PR #1377, routing *only authenticated POSTs* through `callAppearanceWriter()` while preserving actual signed cookies, same-origin CSRF checks, admin authorization and fail-closed errors. Public/admin GETs should use the newly reviewed projection (without `SELECT *` expansion). **Do not turn 42501 into fake success or prefer HTTP 200 when state was not committed.** Preserve existing October source/overrides; November key is `november-crimson-2026`.

Before any **production** SQL, a real C03 independent reviewer must accept the exact source hashes and complete raw ACL preimage of the target PostgreSQL catalog, with source-qualified B OS/auth approval, exact one-use owner-approved SQL stage/inverse and separately approved writer auth/service activation. HBA and authentication may not inherit financial/custody authority. After admitted stage test anonymous GET200, Emaren admin GET/POST, Scribe admin403, persisted personal override and committed activity across reload, concurrent races, genuine production denied financial DML and exact rollback. These tests remain **NOT RUN ON PRODUCTION**. If any source/permit/preimage differs, **HOLD**, no service/role change.

**This source handoff is not self-approval.** B and WE3 must independently review it and preserve all seven financial gates OPEN and funding DENIED. Website on prior accepted source stays untouched.
