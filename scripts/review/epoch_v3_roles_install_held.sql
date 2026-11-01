-- PHASE 7 HELD: separate installation script, NOT a Prisma migration.
-- Role provisioning requires an operator-authorized privileged transaction,
-- dedicated secured migration owner, exact source SHA, backup+restore evidence.
-- It is run automatically ONLY inside a disposable PostgreSQL 16 CI fixture.
DO $roles$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY[
  'epoch_v3_migration_owner',
  'epoch_v3_proof_writer',
  'epoch_v3_app_reader',
  'epoch_v3_credit_consumer',
  'epoch_v3_settlement_worker',
  'epoch_v3_auditor'
 ] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=name) THEN
   EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT',name);
  ELSE
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=name AND
     (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
   THEN RAISE EXCEPTION 'EPOCH_V3_ROLE_NOT_ISOLATED:%',name; END IF;
  END IF;
 END LOOP;
END $roles$;
REVOKE ALL ON SCHEMA epoch_v3 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA epoch_v3 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA epoch_v3 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA epoch_v3 FROM PUBLIC;

-- No application membership is granted here; production enrollment must
-- bind an independently verified OS principal and least-privilege DB login.
GRANT USAGE ON SCHEMA epoch_v3 TO
 epoch_v3_proof_writer,epoch_v3_app_reader,epoch_v3_credit_consumer,
 epoch_v3_settlement_worker,epoch_v3_auditor;
GRANT SELECT ON epoch_v3.epochs TO epoch_v3_app_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA epoch_v3 TO epoch_v3_auditor;

-- Proof writer cannot mutate any financial balance, ticket, consumption or
-- operation. It is itself NOT a proof verifier; its real OS/process identity
-- MUST be bound to a reviewed native Comet/ICS23 verifier by the operator.
GRANT INSERT ON epoch_v3.receipts,epoch_v3.native_proof_certificates,
 epoch_v3.native_account_reserve_evidence TO epoch_v3_proof_writer;
GRANT SELECT ON epoch_v3.epochs,epoch_v3.receipts,
 epoch_v3.native_proof_certificates,epoch_v3.native_account_reserve_evidence
 TO epoch_v3_proof_writer;
-- Atomic SECURITY DEFINER functions have fixed search_path and no external IO.
-- Their caller has no underlying table INSERT/UPDATE/DELETE privileges.
GRANT EXECUTE ON FUNCTION
 epoch_v3.credit_deposit(text,text,character,integer,numeric,text,text),
 epoch_v3.admit_ticket(text,text,bigint,character,integer,date,text,jsonb)
 TO epoch_v3_credit_consumer;
GRANT EXECUTE ON FUNCTION
 epoch_v3.settle_market(text,bigint,text,text,text,jsonb),
 epoch_v3.reconcile_return(text,text,character,integer,numeric,text,text,text),
 epoch_v3.transition_operation(text,text,integer,text,text)
 TO epoch_v3_settlement_worker;

-- Auditor needs ONLY migration identity/checksum/finished state in Prisma's
-- migration chronology. GRANT column-level SELECT, not full-schema access.
DO $prisma_audit$
BEGIN
 IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
  GRANT SELECT (migration_name,checksum,finished_at,rolled_back_at)
  ON public._prisma_migrations TO epoch_v3_auditor;
 END IF;
END $prisma_audit$;

-- No GRANT on consume_receipt nor assert_native_proof_for_receipt: these
-- are internal SECURITY DEFINER functions; direct outsiders cannot run them.

-- Move ownable objects to a dedicated NEVER-LOGIN migration owner, so
-- SECURITY DEFINER execution is not exposed via app or proof-writer membership.
-- Requires CREATEROLE/DB migration-owner authority; the CI fixture uses a
-- new temporary cluster owner. Real installation requires separate approval.
DO $ownership$
DECLARE obj record;
BEGIN
 FOR obj IN SELECT c.relname,c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='epoch_v3' AND c.relkind IN ('r','v','S')
 LOOP
  EXECUTE format('ALTER %s epoch_v3.%I OWNER TO epoch_v3_migration_owner',
   CASE WHEN obj.relkind='S' THEN 'SEQUENCE'
    WHEN obj.relkind='v' THEN 'VIEW' ELSE 'TABLE' END,obj.relname);
 END LOOP;
 FOR obj IN SELECT p.oid::regprocedure::text identity
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='epoch_v3'
 LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO epoch_v3_migration_owner',obj.identity);
 END LOOP;
 ALTER SCHEMA epoch_v3 OWNER TO epoch_v3_migration_owner;
END $ownership$;

-- After changing ownership, revalidate zero public privileges and exact role
-- grants before any production schema migration. No login is created here.
