-- One successful single-MsgSend transaction may create only one customer credit,
-- across BOTH existing deposit and claim-return receipt tables. Comet does not
-- commit event ordinals; uniqueness is the physical uppercase chain/tx identity.
-- This additive migration never edits historical receipts, balances or journals.
-- An existing collision aborts installation rather than rewriting liabilities.
BEGIN;
LOCK TABLE war_satchel_funded_receipts, war_satchel_funded_claim_returns IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "war_satchel_physical_receipt_consumptions" (
  "chain_id" VARCHAR(32) NOT NULL,
  "tx_hash" VARCHAR(64) NOT NULL,
  "message_index" INTEGER NOT NULL DEFAULT 0,
  "owner_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "receipt_kind" VARCHAR(16) NOT NULL,
  "source_receipt_id" BIGINT NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "vault_address" VARCHAR(100) NOT NULL,
  PRIMARY KEY ("chain_id", "tx_hash"),
  UNIQUE ("receipt_kind", "source_receipt_id"),
  CHECK ("chain_id" = 'wolo-1' AND "message_index" = 0
    AND "tx_hash" ~ '^[A-F0-9]{64}$' AND "tx_hash" <> repeat('0',64)
    AND "receipt_kind" IN ('deposit','claim_return')
    AND "source_receipt_id" > 0 AND "amount_uwolo" > 0)
);

INSERT INTO "war_satchel_physical_receipt_consumptions"
  (chain_id,tx_hash,owner_user_id,receipt_kind,source_receipt_id,amount_uwolo,vault_address)
SELECT chain_id,upper(tx_hash),owner_user_id,'deposit',id,amount_uwolo,vault_address
FROM "war_satchel_funded_receipts"
UNION ALL
SELECT chain_id,upper(tx_hash),owner_user_id,'claim_return',id,amount_uwolo,vault_address
FROM "war_satchel_funded_claim_returns";

CREATE FUNCTION war_satchel_consume_physical_receipt()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $consume$
BEGIN
  -- Trigger writes participate in the very same transaction as receipt,
  -- journal and balance. A concurrent cross-table collision blocks on the
  -- physical primary key, then fails; rollback also rolls back consumption.
  INSERT INTO public.war_satchel_physical_receipt_consumptions
    (chain_id,tx_hash,owner_user_id,receipt_kind,source_receipt_id,amount_uwolo,vault_address)
  VALUES (NEW.chain_id,upper(NEW.tx_hash),NEW.owner_user_id,
    CASE TG_TABLE_NAME WHEN 'war_satchel_funded_receipts' THEN 'deposit' ELSE 'claim_return' END,
    NEW.id,NEW.amount_uwolo,NEW.vault_address);
  RETURN NEW;
END;
$consume$;
CREATE TRIGGER satchel_deposit_physical_consumption BEFORE INSERT
  ON war_satchel_funded_receipts FOR EACH ROW
  EXECUTE FUNCTION war_satchel_consume_physical_receipt();
CREATE TRIGGER satchel_return_physical_consumption BEFORE INSERT
  ON war_satchel_funded_claim_returns FOR EACH ROW
  EXECUTE FUNCTION war_satchel_consume_physical_receipt();
CREATE TRIGGER satchel_physical_consumption_immutable BEFORE UPDATE OR DELETE
  ON war_satchel_physical_receipt_consumptions FOR EACH ROW
  EXECUTE FUNCTION war_satchel_funded_audit_immutable();

CREATE TRIGGER satchel_physical_consumption_no_truncate BEFORE TRUNCATE
  ON war_satchel_physical_receipt_consumptions FOR EACH STATEMENT
  EXECUTE FUNCTION war_satchel_funded_audit_immutable();

COMMIT;
