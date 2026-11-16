---
id: "aoe2war.app-prodn.ember-appearance-writer-design"
title: "Ember Reign — Isolated Appearance Writer Source Review"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-product-source-only-not-a-live-permit"
reviewed_at: "2026-11-16"
review_interval_days: 30
sensitivity: "internal"
---

# Ember Reign — Isolated Appearance Writer Source Review

## State: SOURCE_ONLY / HOLD_C03_B_OWNER_ADMISSION

Review against Central #1280 comment #6909226282. This source is NOT
authorization to install database roles, SQL, systemd units, sockets,
environment secrets, HBA, Steam or a website release. No live mutation.

The accepted web datasource aoe2war_web_prod retains NOINHERIT, zero DML,
zero sequence rights, zero unreviewed SECURITY DEFINER access, and NO
membership in broad old reader aoe2war_r25_web_ro or any writer. The future
writer has a SEPARATE PostgreSQL identity aoe2war_appearance_writer and
is a standalone Node.js UNIX-socket sidecar, not a third Next.js runtime.
The web role never receives writer credentials, a SQL function bypass or
network/OS permissions beyond B-authorized local socket access.

## Exact user-facing action limits

Original 17 Ember Reign UI changes in PR #1377 are retained: richer November
crimson, logo crimson→midnight→black cycle, reduced motion, Zodiac image crop,
Watcher title, seamless ticker, fast arrows. UI remains nonfinancial.

Admin POST /api/admin/site-theme-campaign:
- requires existing requireAdmin and **independent** HS256 issuer, iat, exp
  verification by the writer and a fresh DB users(uid,is_admin) check;
- only fixed singleton slot=1 can move October key october-black-2026 to
  November key november-crimson-2026; UTC window, theme crimson, label fixed;
- optional enabled toggle only when current key is November; no caller
  arbitrary dates, labels, campaign slot, subject or other theme selection;
- row lock and old-key compare-and-swap, SERIALIZABLE; October override
  history never overwritten or copied to November.

Player POST /api/user/theme-campaign-override:
- independently verifies original signed session; resolves actual subject
  from database users.uid; caller can NEVER choose userId, uid or isAdmin;
- only seven existing appearance themes, enabled November campaign within
  exact UTC window, one authenticated current user;
- INSERT/ON CONFLICT override and mandatory INSERT of
  theme_campaign_override user_activity_events **in one transaction**;
- failed audit INSERT rolls back entire preference upsert, including earlier
  preference; concurrency abort produces 409 not optimistic success;
- response returns actual database RETURNING value, not fabricated success.

Both Next routes require same-origin POST, bounded 4KiB JSON, and no-store.
Sidecar independently validates request bytes, JWT signature, HTTP method,
actor DB identity, campaign state, and parameters. No arbitrary SQL or
user-submitted values for actor roles. Existing GETs remain read-only and
may return 503 until C03 separate minimal read grants are admitted.

## Source-owned components

- bin/appearance-writer.mjs: standalone Node/pg, process-scoped writer URL
  and same signing verifier; binds only UNIX socket, no TCP.
- lib/appearanceWriterCore.mjs: per-request DB actor check, singleton CAS,
  single transaction, forced audit rollback.
- lib/appearanceWriterClient.ts: website client for exact fixed local socket
  /run/aoe2war-appearance-writer/appearance.sock, no writer DB URL.
- Existing admin/personal API routes: direct Prisma writes removed.
- tests/ember-appearance-writer.test.mts: adversarial auth, escalation,
  injection, singleton, transaction/audit, conflict and source-route tests.

## B-owned socket and service admission

Root/B must separately install a unit running as a distinct non-web UID
and review actual source artifact, service sandbox, package dependencies,
socket GID and privileged inverse. The UNIX socket parent must be
writer-owned, group-searchable by web, NOT group-writable, and inaccessible
to unrelated principals. Socket itself mode 0660 with separately admitted
shared group. Web must not be able to replace/delete socket; credentials
for writer DB must not exist in web environment or file reads. Neither
group membership, root-owned unit, secret, /run directory nor live service
may be changed by WE3. Root must additionally validate actual UID990
Steam/nft and local PostgreSQL network restrictions.

## WE1/C03 minimal GRANT proposal: not an executable SQL migration

WE1 must independently read actual raw ACL/column/sequence preimages,
write exact signed DCL postimage plus tested inverse, and prove least privilege
with genuine isolated PostgreSQL role simulations before any live SQL.

Web SELECT proposal ONLY:
- site_theme_campaign columns slot,campaign_key,label,enabled,theme_key,
  starts_at,ends_at,updated_at,updated_by_user_id;
- user_theme_campaign_overrides columns campaign_key,user_id,theme_key,updated_at;
- user_appearance_preferences columns user_id,theme_key;
- existing users column-only reads preserved, including id,uid,
  in_game_name,steam_persona_name,created_at as required by admin listing;
- never give web broad SELECT, users.is_admin, DML, sequences, schema CREATE.

Separate aoe2war_appearance_writer proposal ONLY:
- users SELECT columns id,uid,is_admin, no users DML or users_id_seq;
- site_theme_campaign SELECT slot,campaign_key,label,enabled,theme_key,
  starts_at,ends_at,updated_at; UPDATE only campaign_key,label,theme_key,
  enabled,starts_at,ends_at,updated_by_user_id,updated_at;
- user_theme_campaign_overrides SELECT campaign_key,user_id,theme_key,updated_at;
  INSERT campaign_key,user_id,theme_key,created_at,updated_at; UPDATE
  theme_key,updated_at; USAGE on overrides_id_seq only;
- user_activity_events INSERT user_id,type,path,label,metadata,created_at;
  USAGE on activity_id_seq only;
- no financial table, payout, wallet, users DML/sequence, inherited reader,
  schema CREATE, PUBLIC EXECUTE or new unreviewed DEFINER functions.

PostgreSQL FOR UPDATE and ON CONFLICT can require additional precisely
scoped column privileges. WE1 must test actual effective privilege semantics;
the list is a proposal, never a grant assertion. Preimage and exact inverse
must preserve raw NULL ACLs and protected C03 fence.

## Required independent negative and physical acceptance

1. Unsigned/expired/future JWT and spoofed uid, isAdmin or actorId denied.
2. Ordinary-to-admin and cross-user denied by DB identity, not HTTP claims.
3. Only singleton=1 and fixed November transition; wrong key/active dates,
   arbitrary theme, repeat/concurrency hazards fail closed.
4. Audit INSERT error forces rollback of override; no half-write success.
5. Web cannot DML or use sequences, cannot read broad identity/financial;
   writer cannot DML users, any financial table or other sequence.
6. Real isolated PostgreSQL tests, privilege inverse, ordinary/admin Chrome,
   persisted Scribe override + activity, October history unchanged, then
   independent C03 signed permit and B signed Factory T10 acceptance.

Before signed owner SQL/socket admission: KEEP THE PUBLIC CAMPAIGN ON HOLD.
Financial gates remain OPEN, funding DENIED, no production modifications.
