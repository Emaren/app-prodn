---
id: "aoe2war.app-prodn.we3-social-gateway-v1-review-20261119"
title: "WE3 Additive Social Gateway V1: Source and Exact Inverse"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "unapproved-source-review-proposal"
reviewed_at: "2026-11-19"
review_interval_days: 30
sensitivity: "restricted"
---

# WE3 Additive Social Gateway V1: Source and Exact Inverse

**REJECTED — DO NOT INSTALL.** WE1's owner-present HD catalog and independent
PG16 test proved that this previous full `social_gateway_v1` proposal
can leave elevated SECURITY DEFINER/view ownership and exposes unrestricted
Direct-message SELECT to a stolen raw writer credential. The correct,
independently source-qualified successor is WE1's **HD-only restricted
NOLOGIN executor V2** (51/51 PostgreSQL 16 test PASS), with only tiny
fixed-purpose broad-owned legacy DML leaves, never legacy table/sequence
GRANTs. See `docs/WE3_SOCIAL_HD_V2_SOURCE_CONTRACT_20261119.md`.
The SQL examples below are **historical negative evidence only**, not
an approved installer, candidate or rollback permit. The original 12 HD
raw ACLs (eight explicit tables and four NULL sequences) and column
ACLs are never to be changed by PRODUCT.


**NOT AN INSTALLER. NOT SQL ACCEPTED. NOT A ROOT OR FINANCIAL PERMIT.**
Supersedes the direct legacy GRANT/REVOKE proposal in the older WE3 review packet
ONLY after WE1 accepts exact physical HD/DE witnesses and independently proves
this source on an appropriately representative disposable PostgreSQL 16 cluster.

WE1 found the old proposal changed five NULL legacy relacl values into explicit
owner ACL entries after GRANT and REVOKE: four social serial identity sequences
and direct_message_drafts. This proposal never issues GRANT or REVOKE on *any*
pre-existing table, sequence, schema, function, default privilege or role.

## Owner and physical preconditions — must be independently verified

- The connection installing the gateway is the currently documented owner of
  all eight nonfinancial social tables, and its effective rights over those
  base tables and serial sequences are already present before installation.
  If owners differ, are unexpected, or have unsafe financial reachability,
  **HOLD**. Never assign ownership or grant extra legacy rights to make it pass.
- Source-pin the signed JWT verifier, restricted local AF_UNIX socket and two
  exact HTTP POST endpoints separately. No general SQL or dynamic query
  is reachable from an HTTP request.
- Require actual HD and DE read-only pg_auth_members/INHERIT/SET ROLE,
  pg_class.relacl, pg_attribute.attacl, pg_sequence, pg_default_acl,
  pg_proc/proacl/PUBLIC EXECUTE, pg_trigger, event triggers, FK dependencies,
  definer owner/search_path and transitive finance-write descendants.
  Reject *unknowns* and synthetic known-dangerous trigger/definer paths.
- Capture byte-exact preimage of all legacy ACL, role, function, trigger,
  schema, HBA and sequence records and the existing deployment state.
- Ensure new PostgreSQL actor aoe2war_social_writer and schema
  social_gateway_v1 are wholly absent. The synthetic local test replaces the
  actor name with its own fresh lab-only principal. Fail on existing objects.
- All new gateway objects must be created and owned by the verified legacy
  social-table owner, not an unreviewed superuser with financial authority.
  No CREATE/GRANT/REVOKE on any legacy object, no ALTER DEFAULT PRIVILEGES.
- Both new SECURITY DEFINER functions and new definer views deliberately use
  the existing owner rights; review their exact SQL and owner rights. All
  function bodies use schema-qualified relations and pinned search_path.

## Candidate installation — source-only, do not execute against HEL1

~~~sql
BEGIN;
CREATE ROLE aoe2war_social_writer LOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
-- Root/WE2 later provisions approved local HBA/SCRAM only; no password here.
CREATE SCHEMA social_gateway_v1;
CREATE VIEW social_gateway_v1.users WITH (security_barrier=true) AS
  SELECT id,uid,is_admin,verification_method,in_game_name,steam_persona_name,created_at
  FROM public.users;
CREATE VIEW social_gateway_v1.clans WITH (security_barrier=true) AS
  SELECT id,slug,status,chat_audience_policy FROM public.clans;
CREATE VIEW social_gateway_v1.clan_members WITH (security_barrier=true) AS
  SELECT clan_id,user_id,status,role FROM public.clan_members;
CREATE VIEW social_gateway_v1.clan_messages WITH (security_barrier=true) AS
  SELECT id,clan_id,author_user_id,body,audience,created_at
  FROM public.clan_messages;
CREATE VIEW social_gateway_v1.direct_messages WITH (security_barrier=true) AS
  SELECT id,conversation_id,sender_user_id,body,reply_to_message_id,created_at
  FROM public.direct_messages;

CREATE FUNCTION social_gateway_v1.append_clan_message(
  p_clan_id integer,p_author integer,p_body text,p_audience text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $f$
DECLARE new_id integer;
BEGIN
  IF p_body IS NULL OR btrim(p_body)='' OR char_length(p_body)>1200
     OR p_audience NOT IN ('clan','users','public') THEN
    RAISE EXCEPTION 'INVALID_CLAN_TEXT' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users
     WHERE id=p_author AND verification_method IS DISTINCT FROM 'system')
     OR NOT EXISTS (SELECT 1 FROM public.clans
     WHERE id=p_clan_id AND status='active') THEN
    RAISE EXCEPTION 'INVALID_CLAN_IDENTITY' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.clans c WHERE c.id=p_clan_id
    AND (
      CASE p_audience WHEN 'clan' THEN 0
         WHEN 'users' THEN 1 ELSE 2 END
    ) > (
      CASE c.chat_audience_policy WHEN 'clan' THEN 0
         WHEN 'users' THEN 1 ELSE 2 END
    )
  ) THEN
    RAISE EXCEPTION 'CLAN_POLICY_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_audience='clan' AND NOT EXISTS(
    SELECT 1 FROM public.clan_members
    WHERE clan_id=p_clan_id AND user_id=p_author AND status='active'
  ) AND NOT EXISTS (SELECT 1 FROM public.users
                    WHERE id=p_author AND is_admin=true) THEN
    RAISE EXCEPTION 'CLAN_MEMBERSHIP_REQUIRED' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.clan_messages(
    clan_id,author_user_id,body,audience,created_at,updated_at)
    VALUES (p_clan_id,p_author,p_body,p_audience,clock_timestamp(),clock_timestamp())
    RETURNING id INTO new_id;
  RETURN new_id;
END $f$;

CREATE FUNCTION social_gateway_v1.ensure_direct_pair(
  p_actor integer,p_target integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $f$
DECLARE key text; row_id integer;
BEGIN
  IF p_actor IS NULL OR p_target IS NULL OR p_actor=p_target
    OR NOT EXISTS(SELECT 1 FROM public.users
       WHERE id=p_actor AND verification_method IS DISTINCT FROM 'system')
    OR NOT EXISTS(SELECT 1 FROM public.users
       WHERE id=p_target AND verification_method IS DISTINCT FROM 'system') THEN
    RAISE EXCEPTION 'INVALID_DIRECT_PAIR' USING ERRCODE='22023';
  END IF;
  key=least(p_actor,p_target)::text || ':' || greatest(p_actor,p_target)::text;
  INSERT INTO public.direct_conversations(pair_key,created_at,updated_at)
     VALUES(key,clock_timestamp(),clock_timestamp())
     ON CONFLICT(pair_key) DO NOTHING;
  SELECT id INTO row_id FROM public.direct_conversations WHERE pair_key=key;
  IF row_id IS NULL THEN
    RAISE EXCEPTION 'DIRECT_PAIR_UNAVAILABLE' USING ERRCODE='55000';
  END IF;
  INSERT INTO public.direct_conversation_participants(
     conversation_id,user_id,joined_at)
     VALUES(row_id,p_actor,clock_timestamp()),(row_id,p_target,clock_timestamp())
     ON CONFLICT(conversation_id,user_id) DO NOTHING;
  RETURN row_id;
END $f$;

CREATE FUNCTION social_gateway_v1.send_direct_text(
  p_conversation integer,p_sender integer,p_body text,p_reply integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $f$
DECLARE new_id integer;
BEGIN
  IF p_conversation IS NULL OR p_sender IS NULL OR p_body IS NULL
     OR btrim(p_body)='' OR char_length(p_body)>1000
     OR NOT EXISTS(SELECT 1 FROM public.direct_conversation_participants
      WHERE conversation_id=p_conversation AND user_id=p_sender) THEN
    RAISE EXCEPTION 'INVALID_DIRECT_SEND' USING ERRCODE='22023';
  END IF;
  IF p_reply IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.direct_messages
    WHERE id=p_reply AND conversation_id=p_conversation
  ) THEN
    RAISE EXCEPTION 'REPLY_OUTSIDE_CONVERSATION' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.direct_messages(
     conversation_id,sender_user_id,body,reply_to_message_id,created_at)
     VALUES(p_conversation,p_sender,p_body,p_reply,clock_timestamp())
     RETURNING id INTO new_id;
  UPDATE public.direct_conversations SET updated_at=clock_timestamp()
    WHERE id=p_conversation;
  UPDATE public.direct_conversation_participants
    SET last_read_at=clock_timestamp(),typing_updated_at=NULL
    WHERE conversation_id=p_conversation AND user_id=p_sender;
  DELETE FROM public.direct_message_drafts
    WHERE conversation_id=p_conversation AND user_id=p_sender;
  RETURN new_id;
END $f$;

-- PUBLIC has default function EXECUTE until explicitly revoked.
-- Do both before this transaction is committed, fail on drift.
REVOKE ALL ON FUNCTION
  social_gateway_v1.append_clan_message(integer,integer,text,text),
  social_gateway_v1.ensure_direct_pair(integer,integer),
  social_gateway_v1.send_direct_text(integer,integer,text,integer)
  FROM PUBLIC;
GRANT USAGE ON SCHEMA social_gateway_v1 TO aoe2war_social_writer;
GRANT SELECT ON social_gateway_v1.users,
  social_gateway_v1.clans,social_gateway_v1.clan_members,
  social_gateway_v1.clan_messages,social_gateway_v1.direct_messages
  TO aoe2war_social_writer;
GRANT EXECUTE ON FUNCTION
  social_gateway_v1.append_clan_message(integer,integer,text,text),
  social_gateway_v1.ensure_direct_pair(integer,integer),
  social_gateway_v1.send_direct_text(integer,integer,text,integer)
  TO aoe2war_social_writer;
-- Independently compare all legacy raw ACL/attacl/proacl and trigger graphs
-- with the signed preimage. No unexpected rights, side effects or owner drift.
-- Otherwise ROLLBACK. Never accept a partial footprint.
COMMIT;
~~~

## Exact inverse — new objects exclusively

~~~sql
BEGIN;
REVOKE EXECUTE ON FUNCTION
  social_gateway_v1.append_clan_message(integer,integer,text,text),
  social_gateway_v1.ensure_direct_pair(integer,integer),
  social_gateway_v1.send_direct_text(integer,integer,text,integer)
  FROM aoe2war_social_writer;
REVOKE SELECT ON social_gateway_v1.users,
  social_gateway_v1.clans,social_gateway_v1.clan_members,
  social_gateway_v1.clan_messages,social_gateway_v1.direct_messages
  FROM aoe2war_social_writer;
REVOKE USAGE ON SCHEMA social_gateway_v1 FROM aoe2war_social_writer;
DROP FUNCTION
  social_gateway_v1.append_clan_message(integer,integer,text,text),
  social_gateway_v1.ensure_direct_pair(integer,integer),
  social_gateway_v1.send_direct_text(integer,integer,text,integer)
  RESTRICT;
DROP VIEW social_gateway_v1.users,social_gateway_v1.clans,
  social_gateway_v1.clan_members,social_gateway_v1.clan_messages,
  social_gateway_v1.direct_messages RESTRICT;
DROP SCHEMA social_gateway_v1 RESTRICT;
DROP ROLE aoe2war_social_writer; -- requires exact new role/no foreign dependencies
-- Compare ALL original raw SQL/catalog preimages and data after COMMIT.
COMMIT;
~~~

## Remaining admissibility blockers

1. Actual HEL1 eight-table owner identity and reachability are unknown.
   If the legacy social-table owner also has finance authority or cross-system
   SECURITY DEFINER paths, this gateway is NOT automatically safe.
2. Actual triggers on any touched table, FK descendants and arbitrary PUBLIC
   callable functions must be independently closed against financial writes.
3. New gateway view SELECT alone does not provide per-recipient isolation to a
   compromised database actor. The fixed AF_UNIX and signed-session sidecar is
   mandatory; verify network/socket peer and auth negative tests. Do not expose
   gateway credentials to Next.js.
4. Exact original schema and DML must match; no unapproved missing columns,
   triggers, unknown defaults, extensions or roles.
5. The original legacy ACL inverse remains rejected. This new schema's code
   requires independently reproduced install/rollback evidence on the actual
   source and a matching disposable PostgreSQL cluster before any permit.
6. WE2 alone can authorize the systemd/HBA/role installation after WE1
   technical ACCEPT, and activate/rollback public website. No FINANCIAL
   C01–C09 gate is declared closed by a nonfinancial website source test.
