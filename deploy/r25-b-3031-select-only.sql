-- R25 B isolated new principal. OWNER-APPROVED PROVISIONING TEMPLATE ONLY.
-- This file is never run by CI, the guard, or the HEL1 witness.
-- Do not alter any current service roles, tables, owners, users or grants.
-- Run only against the owner's reviewed AoE2WAR application database,
-- separately approved by C/F, with a root-controlled dedicated password.
BEGIN;
CREATE ROLE aoe2war_r25_web_ro LOGIN NOINHERIT NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE aoe2war_r25_web_ro SET default_transaction_read_only = on;
ALTER ROLE aoe2war_r25_web_ro SET statement_timeout = '10000ms';
ALTER ROLE aoe2war_r25_web_ro SET lock_timeout = '2000ms';
GRANT USAGE ON SCHEMA public TO aoe2war_r25_web_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO aoe2war_r25_web_ro;
COMMIT;
-- Set an owner-custodied password outside SQL logs with interactive psql:
--   \password aoe2war_r25_web_ro
-- This template DOES NOT silently grant privileges on future tables.
-- If functions, views or database schema privilege review fails, HOLD.
-- DO NOT revoke from PUBLIC or modify original financial roles to force PASS.
