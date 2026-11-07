-- Source-only additive cohort. No historical liability or state rewrite.
DO $install$
BEGIN
CREATE TABLE war_satchel_wager_authorizations (
 operation_id VARCHAR(128) PRIMARY KEY,
 reservation_id VARCHAR(128) NOT NULL UNIQUE REFERENCES war_satchel_funded_reservations(id) ON DELETE RESTRICT,
 owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 snapshot_json JSONB NOT NULL,
 reservation_digest VARCHAR(64) NOT NULL CHECK (reservation_digest ~ '^[a-f0-9]{64}$' AND reservation_digest <> repeat('0',64)),
 ledger_revision VARCHAR(64) NOT NULL CHECK (ledger_revision ~ '^[a-f0-9]{64}$' AND ledger_revision <> repeat('0',64)),
 consent_digest VARCHAR(64) NOT NULL CHECK (consent_digest ~ '^[a-f0-9]{64}$' AND consent_digest <> repeat('0',64)),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(jsonb_typeof(snapshot_json)='object')
);
CREATE TABLE war_satchel_wager_approvals (
 operation_id VARCHAR(128) PRIMARY KEY REFERENCES war_satchel_wager_authorizations(operation_id) ON DELETE RESTRICT,
 approval_json JSONB NOT NULL CHECK (jsonb_typeof(approval_json)='object'),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE war_satchel_wager_broadcasts (
 operation_id VARCHAR(128) PRIMARY KEY REFERENCES war_satchel_wager_authorizations(operation_id) ON DELETE RESTRICT,
 tx_hash VARCHAR(64) NOT NULL UNIQUE CHECK(tx_hash ~ '^[A-F0-9]{64}$' AND tx_hash <> repeat('0',64)),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION war_satchel_wager_authority_admission() RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog,public AS $admission$
DECLARE r public.war_satchel_funded_reservations; a public.war_satchel_wager_authorizations;
BEGIN
 IF TG_TABLE_NAME='war_satchel_wager_authorizations' THEN
  SELECT * INTO STRICT r FROM public.war_satchel_funded_reservations WHERE id=NEW.reservation_id FOR UPDATE;
  IF r.status<>'reserved' OR r.owner_user_id<>NEW.owner_user_id OR r.ticket_request_id<>NEW.operation_id
    OR (NEW.snapshot_json->>'ownerUserId')::integer IS DISTINCT FROM r.owner_user_id
    OR (NEW.snapshot_json->>'executionId')::integer IS DISTINCT FROM r.execution_id
    OR NEW.snapshot_json->>'reservationId' IS DISTINCT FROM r.id
    OR NEW.snapshot_json->>'operationId' IS DISTINCT FROM r.ticket_request_id
    OR NEW.snapshot_json->>'amountUwolo' IS DISTINCT FROM r.amount_uwolo::text THEN
   RAISE EXCEPTION 'wager authorization is not the durable owner reserve';
  END IF;
 ELSE
  SELECT * INTO STRICT a FROM public.war_satchel_wager_authorizations WHERE operation_id=NEW.operation_id;
  SELECT * INTO STRICT r FROM public.war_satchel_funded_reservations WHERE id=a.reservation_id FOR UPDATE;
  IF TG_TABLE_NAME='war_satchel_wager_approvals' AND r.status<>'reserved' THEN
   RAISE EXCEPTION 'review cannot authorize an attempted or released wager';
  END IF;
  IF TG_TABLE_NAME='war_satchel_wager_broadcasts' AND
    (r.status<>'unknown_hold' OR NOT EXISTS(SELECT 1 FROM public.war_satchel_wager_approvals WHERE operation_id=NEW.operation_id)) THEN
   RAISE EXCEPTION 'broadcast candidate requires durable attempt fence and review';
  END IF;
 END IF;
 RETURN NEW;
END $admission$;
CREATE TRIGGER satchel_wager_authorization_admission BEFORE INSERT ON war_satchel_wager_authorizations FOR EACH ROW EXECUTE FUNCTION war_satchel_wager_authority_admission();
CREATE TRIGGER satchel_wager_approval_admission BEFORE INSERT ON war_satchel_wager_approvals FOR EACH ROW EXECUTE FUNCTION war_satchel_wager_authority_admission();
CREATE TRIGGER satchel_wager_broadcast_admission BEFORE INSERT ON war_satchel_wager_broadcasts FOR EACH ROW EXECUTE FUNCTION war_satchel_wager_authority_admission();
CREATE TRIGGER satchel_wager_authorization_immutable BEFORE UPDATE OR DELETE ON war_satchel_wager_authorizations FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_audit_immutable();
CREATE TRIGGER satchel_wager_approval_immutable BEFORE UPDATE OR DELETE ON war_satchel_wager_approvals FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_audit_immutable();
CREATE TRIGGER satchel_wager_broadcast_immutable BEFORE UPDATE OR DELETE ON war_satchel_wager_broadcasts FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_audit_immutable();
CREATE TRIGGER satchel_wager_authorization_no_truncate BEFORE TRUNCATE ON war_satchel_wager_authorizations FOR EACH STATEMENT EXECUTE FUNCTION war_satchel_funded_audit_immutable();
CREATE TRIGGER satchel_wager_approval_no_truncate BEFORE TRUNCATE ON war_satchel_wager_approvals FOR EACH STATEMENT EXECUTE FUNCTION war_satchel_funded_audit_immutable();
CREATE TRIGGER satchel_wager_broadcast_no_truncate BEFORE TRUNCATE ON war_satchel_wager_broadcasts FOR EACH STATEMENT EXECUTE FUNCTION war_satchel_funded_audit_immutable();
END;
$install$;
