---
id: "aoe2war.app-prodn.we3-social-text-sql-review-20261118"
title: "WE3 Social Writer SQL Privilege and Inverse Proposal"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "unapproved-source-review-proposal"
reviewed_at: "2026-11-18"
review_interval_days: 30
sensitivity: "restricted"
---

# WE3 P0 social text writer — SQL authority, dependencies and inverse
**2026-11-18 · REVIEW-ONLY PROPOSAL · NOT AN INSTALLER · NOT A WE1 OR WE2 PERMIT**

Source: Emaren/app-prodn PR #1418. Initial GitHub source tree `0127a217ec157f6df7c70332d7ee83354f9fa8e2`; UID650 local tree identical. Exact text writer `lib/socialWriterCore.mjs`, local Unix daemon `bin/social-writer.mjs`, signed-session verifier `lib/socialWriterSession.mjs`, Next transport `lib/socialWriterClient.ts`, static Clan route plus original Direct route, 147 focused tests. The PRODUCT guard prohibits changing *.sql, systemd, infra, scripts or protected runtime. This document deliberately does not install or grant anything. WE1 owns a source/physical database authorization and inverse; WE2 owns root/Factory/guard.

## Credential, caller and runtime boundaries
- Linux OS principal: `aoe2war-social-writer` only, **not** UID990 and not root, fixed socket `/run/aoe2war-social-writer/social.sock` (owner directory must not be writable by web; web only gets group-search/connect).
- PostgreSQL principal: separate `aoe2war_social_writer` LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2; no existing memberships or SET ROLE, default privileges, schema/database CREATE, replication, temp shell, superuser or extensions. Require SCRAM admission ONLY on approved local HD database/HBA, no unreviewed database CONNECT. Never pass writer URL to Next.js; exact `postgresql://aoe2war_social_writer@127.0.0.1:5432/aoe2hd_db` credential privately provisioned by WE2, not in git/JS.
- JWT verifier checks real, already-signed `aoe2hdbets` HS256 existing session with 30-day maximum; `SESSION_SECRET` provisioned only to writer, never embedded. No trust in caller-submitted UID, role, senderId, conversationId or SQL.
- HTTP routes: only authenticated same-origin text-only POST `/api/social/clan-text` and `/api/contact-emaren`, no wildcard; bounded payload 4096 bytes. The original dynamic `/api/clans/[slug]` remains unchanged and continues to serve authenticated reads and dev/rollback POST. Unix writer accepts only POST `/v1/clan/text` and `/v1/direct/text`. No TCP listener. Financial routes, ports and R25 financial masks unchanged.
- Nonessential writes are omitted: attachments, reactions, edits, AI, notifications, admin management. The existing GET inbox production path was changed to avoid implicit AI-account, conversation, receipt, activity and notice-collapse writes; proper read authorization still requires independent tests.

## Exact SQL call graph (tables use Prisma @@map names)
| Operation | Table | Authority/columns |
|---|---|---|
| viewer/recipient | public.users | SELECT(id,uid,is_admin,verification_method,in_game_name,steam_persona_name,created_at); **never** email, token, wallet, secrets, balances; no users write |
| Clan lookup | public.clans | SELECT(id,slug,status,chat_audience_policy) |
| Active clan membership | public.clan_members | SELECT(clan_id,user_id,status,role) |
| Clan cooldown/dedupe | public.clan_messages | SELECT(id,clan_id,author_user_id,body,audience,created_at) |
| Clan human text | public.clan_messages | INSERT(clan_id,author_user_id,body,audience,created_at,updated_at); internal identity serial guard |
| Direct pair/lookup | public.direct_conversations | SELECT(id,pair_key), INSERT(pair_key,created_at,updated_at), UPDATE(updated_at) |
| Direct participants | public.direct_conversation_participants | SELECT(id,conversation_id,user_id), INSERT(conversation_id,user_id,joined_at), UPDATE(last_read_at,typing_updated_at) |
| Direct message lookup/dedupe | public.direct_messages | SELECT(id,conversation_id,sender_user_id,body,reply_to_message_id,created_at) |
| Direct text | public.direct_messages | INSERT(conversation_id,sender_user_id,body,reply_to_message_id,created_at) |
| Clear only own draft | public.direct_message_drafts | SELECT(conversation_id,user_id), DELETE |
| Four numeric identities only | public.clan_messages_id_seq, public.direct_conversations_id_seq, public.direct_conversation_participants_id_seq, public.direct_messages_id_seq | USAGE only |

**No other table, sequence, function, schema or role membership grant.** In particular, keep `aoe2war_web_prod` unchanged: no direct social DML/sequence or private Direct content access. Do not grant `users_id_seq`. A separate root-controlled PG/HBA user may be needed but must not be inherited by web.

## SQL proposal — WE1 to retype into its own signed source after physical census
The following is deliberately NONEXECUTABLE review text, not a deployment permit. Execute only as WE1-qualified root/DB owner on an independently admitted maintenance path. Existing-role presence, schema/ACL drift, unapproved triggers, SECURITY DEFINER paths or dependency differences must fail closed BEFORE executing this.

```sql
BEGIN;
-- PRECONDITIONS: WE1 captures exact pg_authid, pg_auth_members, pg_namespace,
-- pg_database, pg_class, pg_attribute, pg_sequence, pg_proc, pg_trigger,
-- pg_depend, pg_constraint, pg_default_acl, proacl and raw relacl/attacl
-- before any mutation. All expected objects must exist as ordinary HD
-- tables, with no unapproved side-effect triggers, dangerous definer paths,
-- financial foreign-key/trigger descendants or role inheritance.
-- Abort if either principal exists unexpectedly.
CREATE ROLE aoe2war_social_writer LOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
-- LOGIN intentionally has no password until WE2's separately approved
-- local SCRAM credential/HBA enrollment. No secrets are stored here.
GRANT USAGE ON SCHEMA public TO aoe2war_social_writer;
GRANT SELECT(id,uid,is_admin,verification_method,in_game_name,
  steam_persona_name,created_at)
  ON public.users TO aoe2war_social_writer;
GRANT SELECT(id,slug,status,chat_audience_policy)
  ON public.clans TO aoe2war_social_writer;
GRANT SELECT(clan_id,user_id,status,role)
  ON public.clan_members TO aoe2war_social_writer;
GRANT SELECT(id,clan_id,author_user_id,body,audience,created_at),
  INSERT(clan_id,author_user_id,body,audience,created_at,updated_at)
  ON public.clan_messages TO aoe2war_social_writer;
GRANT SELECT(id,pair_key), INSERT(pair_key,created_at,updated_at),
  UPDATE(updated_at)
  ON public.direct_conversations TO aoe2war_social_writer;
GRANT SELECT(id,conversation_id,user_id),
  INSERT(conversation_id,user_id,joined_at),
  UPDATE(last_read_at,typing_updated_at)
  ON public.direct_conversation_participants TO aoe2war_social_writer;
GRANT SELECT(id,conversation_id,sender_user_id,body,
  reply_to_message_id,created_at),
  INSERT(conversation_id,sender_user_id,body,reply_to_message_id,created_at)
  ON public.direct_messages TO aoe2war_social_writer;
GRANT SELECT(conversation_id,user_id), DELETE
  ON public.direct_message_drafts TO aoe2war_social_writer;
GRANT USAGE ON SEQUENCE public.clan_messages_id_seq,
  public.direct_conversations_id_seq,
  public.direct_conversation_participants_id_seq,
  public.direct_messages_id_seq TO aoe2war_social_writer;
-- Before COMMIT, WE1 MUST assert: role membership empty, no CREATE on
-- any DB/schema, no unexpected SECURITY DEFINER EXECUTE via PUBLIC,
-- no unapproved enabled user triggers/definer/FK-to-finance descendants,
-- no other table/column write, no financial sequence USAGE/UPDATE and
-- no connectivity to DE/other DBs. A test-role SELECT of all permitted
-- columns, denial of all others, and transitive side-effect isolation.
-- If ANY unknown: ROLLBACK; HOLD. COMMIT only with signed independent proof.
COMMIT;
```

## Exact inverse for a first-ever, zero-preexisting-role install
Only if preimage confirms the role was completely absent, no unrelated grants or ownership have been added, and an approved rollback permit exists; revoke the exact new privileges and drop role. Never touch original `aoe2war_web_prod` or raw existing ACLs. If role now has additional dependencies, stop rather than CASCADE.

```sql
BEGIN;
REVOKE USAGE ON SEQUENCE public.clan_messages_id_seq,
  public.direct_conversations_id_seq,
  public.direct_conversation_participants_id_seq,
  public.direct_messages_id_seq FROM aoe2war_social_writer;
REVOKE SELECT(conversation_id,user_id),DELETE
  ON public.direct_message_drafts FROM aoe2war_social_writer;
REVOKE SELECT(id,conversation_id,sender_user_id,body,reply_to_message_id,created_at),
  INSERT(conversation_id,sender_user_id,body,reply_to_message_id,created_at)
  ON public.direct_messages FROM aoe2war_social_writer;
REVOKE SELECT(id,conversation_id,user_id),INSERT(conversation_id,user_id,joined_at),
  UPDATE(last_read_at,typing_updated_at)
  ON public.direct_conversation_participants FROM aoe2war_social_writer;
REVOKE SELECT(id,pair_key),INSERT(pair_key,created_at,updated_at),UPDATE(updated_at)
  ON public.direct_conversations FROM aoe2war_social_writer;
REVOKE SELECT(id,clan_id,author_user_id,body,audience,created_at),
  INSERT(clan_id,author_user_id,body,audience,created_at,updated_at)
  ON public.clan_messages FROM aoe2war_social_writer;
REVOKE SELECT(clan_id,user_id,status,role)
  ON public.clan_members FROM aoe2war_social_writer;
REVOKE SELECT(id,slug,status,chat_audience_policy)
  ON public.clans FROM aoe2war_social_writer;
REVOKE SELECT(id,uid,is_admin,verification_method,in_game_name,
  steam_persona_name,created_at)
  ON public.users FROM aoe2war_social_writer;
REVOKE USAGE ON SCHEMA public FROM aoe2war_social_writer;
DROP ROLE aoe2war_social_writer; -- never CASCADE
COMMIT;
```

## WE1 compulsory physical source review (NOT satisfied by UID650 synthetic tests)
1. HD and DE role membership and nested SET ROLE reachability, including grants via PUBLIC and default ACLs; LOGIN/HBA host/db restriction proof and restart persistence.
2. For **each touched table**, enumerate `pg_trigger` (including internal FK actions), trigger function OIDs + owner + SECURITY DEFINER + search_path, callable direct and transitive function chains, DML descendants, cross-database dblink/FDW/extension paths and possible changes in financial rows.
3. User, clan and direct records must be truly nonfinancial, not views that proxy/trigger financial relations. Verify four sequences and ALL granted columns exact; deny `users` raw wallet/token/private fields.
4. Every other public or shared schema SECURITY DEFINER routine reachable through PUBLIC or schema USAGE must be reviewed; NOINHERIT does **not** suppress PUBLIC EXECUTE. No generic PUBLIC EXECUTE revocation without separately approved impact assessment. Check sequences DEFAULT and triggers even if no explicit direct EXECUTE.
5. Capture raw ACL/attacl/proacl, post-grant role permissions, then exact inverse restoring every raw NULL ACL and absence-of-role metadata. Synthetic 42501 is helpful but NOT a physical graph closure.
6. Complete prospective product tests against a disposable HD schema with original constraints, two distinct JWT-signed human users + outsider + admin, persistent readback, recipient visibility, no unauthorized listener, and financing negatives.
7. WE2 alone reviews/changes the protected `scripts/r25_b_guard_production_v1.cjs` with an exact static POST whitelist and Unix socket egress, passes negative source-bound guard tests, Docker/Factory/DocsV2, 3032 activate/T10 and two actual authorized Chrome sessions. Do not send unsolicited messages to real players.

## Library #1417 narrow read-only coordination (separate from social role)
The existing `app/api/library/games/route.ts` loads `lib/libraryHistoricalIndex.ts`: final `game_stats` (already SELECT admitted), public display `users`, historical `user_activity_events` package metadata and `watcher_client_events` batch proofs. `app/api/library/activity/route.ts` also selects activity rows, with nested users. Live 42501 evidence points to the latter two tables but exact restricted-role query/preimage must be replayed.

Prospective SELECT-only columns for `aoe2war_web_prod` **after WE1 confirms metadata privacy and upload event type filter**:
- `user_activity_events`: SELECT(id,user_id,type,label,metadata,created_at). The `metadata` JSON column may contain arbitrary non-public other event types. Prefer a vetted projection limited to `type='replay_upload'` and whitelisted public metadata keys rather than raw column grant; code must switch to such a projection before this is safe.
- `watcher_client_events`: SELECT(id,user_id,user_uid,event_type,created_at,watcher_id,session_id,replay_hash). Do not expose `ip_address`, `user_agent` or non-public metadata. Prefer public intake event types only.
- Corresponding inverse: REVOKE exactly the newly granted SELECT columns or DROP exclusively new safe projections / their EXECUTE privilege, restoring original ACL.
- No DML/sequence/function rights for public web; no raw replay rewrites; filter/paging/provenance original. UI shows UNKNOWN instead of 0 when reads fail.

**Status:** SQL and grants are REVIEW ONLY; isolated synthetic PG16 passing is not HEL1 admission. Never treat this document as an owner-signed C03 or Factory permit.


## Library metadata-denial read fallback (nonfinancial source behavior)

When final replay records and public user display fields remain readable but
either provenance event collection explicitly returns SQLSTATE 42501 or Prisma
P1010, the unfiltered all-source Library can show genuine final replay rows.
Its response sets provenanceComplete=false and names unreadable provenance
streams. The browser warns that source labels are provisional; specific
origin filters return 503 instead of claiming a complete zero. This is a
degraded read-only path, NOT a claim that missing ZIP/Watcher provenance was
restored. Unexpected errors or inability to read game records/users still
return 503. All original replay archives and event rows remain untouched.
Complete source filters require independently reviewed public projections.
