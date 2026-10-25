-- PRIVILEGED READ-ONLY REVIEW, never an activation or migration command.
-- Execute ONLY with an independently provisioned SELECT-only database login.
-- Prints role/permission booleans and counts; no keys, tx contents, wallets,
-- connection strings, claimant identities, private signing records, or amounts.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ;
SELECT current_user AS inspected_role,
  (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_superuser,
  pg_has_role(current_user,'aoe2war_epoch_finance_owner','MEMBER') AS member_of_epoch_finance,
  has_table_privilege(current_user,'public.war_satchel_prospective_epochs','SELECT') AS can_read_epoch,
  has_table_privilege(current_user,'public.war_satchel_prospective_epochs','INSERT') AS can_register_epoch,
  has_table_privilege(current_user,'public.war_satchel_prospective_epochs','UPDATE') AS can_approve_epoch,
  has_table_privilege(current_user,'public.war_satchel_epoch_deposit_receipts','INSERT') AS can_record_receipt;
SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreaterole
FROM pg_roles WHERE rolname IN ('aoe2war_epoch_finance_owner','aoe2war_epoch_credit_writer') ORDER BY rolname;
SELECT
  (SELECT count(*) FROM public.war_satchel_prospective_epochs) AS epoch_rows,
  (SELECT count(*) FROM public.war_satchel_epoch_deposit_receipts) AS epoch_receipt_rows,
  (SELECT count(*) FROM public.war_satchel_funded_receipts) AS funded_receipt_rows,
  (SELECT count(*) FROM public.war_satchel_funded_balances) AS funded_balance_rows,
  (SELECT count(*) FROM public.war_satchel_funded_claim_returns) AS funded_claim_return_rows,
  (SELECT count(*) FROM public.war_satchel_funded_withdrawals) AS funded_withdrawal_rows;
COMMIT;
-- GATE: an actual application ROLE must have can_register_epoch=FALSE,
-- can_approve_epoch=FALSE, member_of_epoch_finance=FALSE, is_superuser=FALSE.
-- Production migrations and first custody activation remain forbidden.
