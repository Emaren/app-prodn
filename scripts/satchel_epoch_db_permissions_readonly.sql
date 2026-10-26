-- Safe to run BEFORE or AFTER the held ninth financial migration.
-- SELECT-only. No wallet/tx contents, keys, addresses, amounts or credentials.
-- Use an ALREADY AUTHORIZED read-only database connection as the actual app
-- role (or note clearly if you inspected a different read-only audit role).
-- This script deliberately does not create tables, roles, permissions or funds.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ;

WITH RECURSIVE role_chain(oid) AS (
  SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user
  UNION
  SELECT m.roleid FROM pg_catalog.pg_auth_members m
  JOIN role_chain c ON c.oid=m.member
)
SELECT current_user AS inspected_login,
  (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS is_superuser,
  (SELECT rolcreaterole FROM pg_catalog.pg_roles WHERE rolname=current_user) AS can_create_roles,
  EXISTS(SELECT 1 FROM role_chain c
    JOIN pg_catalog.pg_roles r ON r.oid=c.oid
    WHERE r.rolname='aoe2war_epoch_finance_owner') AS direct_or_transitive_finance_control,
  COALESCE(pg_catalog.has_table_privilege(current_user,
    pg_catalog.to_regclass('public.war_satchel_prospective_epochs'),'SELECT'),false) AS can_read_registry,
  COALESCE(pg_catalog.has_table_privilege(current_user,
    pg_catalog.to_regclass('public.war_satchel_prospective_epochs'),'INSERT'),false) AS can_register_epoch,
  COALESCE(pg_catalog.has_table_privilege(current_user,
    pg_catalog.to_regclass('public.war_satchel_prospective_epochs'),'UPDATE'),false) AS can_change_epoch,
  COALESCE(pg_catalog.has_table_privilege(current_user,
    pg_catalog.to_regclass('public.war_satchel_epoch_deposit_receipts'),'INSERT'),false) AS can_insert_receipt;

SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreaterole,rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN ('aoe2war_epoch_finance_owner','aoe2war_epoch_credit_writer')
ORDER BY rolname;

SELECT p.proname, p.prosecdef AS is_security_definer,
  p.proconfig AS execution_context
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
AND p.proname IN (
 'satchel_epoch_cold_start_v1',
 'satchel_epoch_receipt_guard_v1',
 'satchel_epoch_immutable_v1'
)
ORDER BY p.proname;

SELECT
  pg_catalog.to_regclass('public.war_satchel_prospective_epochs') IS NOT NULL
  AND pg_catalog.to_regclass('public.war_satchel_epoch_deposit_receipts') IS NOT NULL
  AS epoch_installed
\gset
\if :epoch_installed
  SELECT
  COALESCE(pg_catalog.has_table_privilege(current_user,
    pg_catalog.to_regclass('public.war_satchel_prospective_epochs'),'SELECT'),false)
  AND COALESCE(pg_catalog.has_table_privilege(current_user,
    pg_catalog.to_regclass('public.war_satchel_epoch_deposit_receipts'),'SELECT'),false)
  AS can_count_epochs
  \gset
  \if :can_count_epochs
    SELECT (SELECT COUNT(*) FROM public.war_satchel_prospective_epochs) AS epoch_count,
      (SELECT COUNT(*) FROM public.war_satchel_epoch_deposit_receipts) AS epoch_receipt_count;
  \else
    SELECT 'INSTALLED_BUT_SELECT_NOT_GRANTED' AS epoch_count_status;
  \endif
\else
  SELECT 'NINTH_MIGRATION_NOT_INSTALLED_AS_EXPECTED' AS epoch_count_status;
\endif

-- Distinct legacy tables are NEVER summed here. Their balances and reserve
-- provenance need a separate finance-witnessed exact-height reconciliation.
SELECT 'UNKNOWN_UNTIL_INDEPENDENTLY_PROVEN' AS spendable_custody,
  'UNKNOWN_UNTIL_RECONCILED' AS legacy_claims,
  'UNKNOWN_UNTIL_AUTHORIZED' AS reserved_collateral;
COMMIT;
