-- Preserve the immutable deposit/return guard and its historical keys. Add a
-- withdrawal guard in the same physical namespace, without changing old rows
-- or overloading the old bigint receipt-kind contract with a UUID withdrawal.
-- Both BEFORE INSERT paths take the identical per-transaction advisory lock;
-- concurrent cross-path attempts block, recheck, then reject the second use.
DO $install$
BEGIN
LOCK TABLE war_satchel_physical_receipt_consumptions, war_satchel_funded_withdrawals IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE war_satchel_withdrawal_physical_consumptions (
 chain_id varchar(32) NOT NULL CHECK(chain_id='wolo-1'),
 tx_hash varchar(64) NOT NULL CHECK(tx_hash ~ '^[A-F0-9]{64}$' AND tx_hash<>repeat('0',64)),
 message_index integer NOT NULL DEFAULT 0 CHECK(message_index=0),
 withdrawal_id uuid NOT NULL UNIQUE REFERENCES war_satchel_funded_withdrawals(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 amount_uwolo bigint NOT NULL CHECK(amount_uwolo>0),
 vault_address varchar(100) NOT NULL,
 PRIMARY KEY(chain_id,tx_hash)
);
CREATE FUNCTION war_satchel_global_physical_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $guard$
BEGIN
 PERFORM pg_advisory_xact_lock(724177,hashtext(NEW.chain_id||':'||NEW.tx_hash));
 IF TG_TABLE_NAME='war_satchel_withdrawal_physical_consumptions' THEN
  IF EXISTS(SELECT 1 FROM public.war_satchel_physical_receipt_consumptions WHERE chain_id=NEW.chain_id AND tx_hash=NEW.tx_hash) THEN
   RAISE EXCEPTION 'physical transaction already consumed by a deposit or return';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.war_satchel_withdrawal_physical_consumptions WHERE chain_id=NEW.chain_id AND tx_hash=NEW.tx_hash) THEN
   RAISE EXCEPTION 'physical transaction already consumed by a withdrawal';
  END IF;
 END IF;
 RETURN NEW;
END;
$guard$;
CREATE TRIGGER satchel_withdrawal_physical_guard BEFORE INSERT ON war_satchel_withdrawal_physical_consumptions FOR EACH ROW EXECUTE FUNCTION war_satchel_global_physical_guard();
CREATE TRIGGER satchel_credit_global_physical_guard BEFORE INSERT ON war_satchel_physical_receipt_consumptions FOR EACH ROW EXECUTE FUNCTION war_satchel_global_physical_guard();
-- Preserve history. A pre-existing cross-path collision aborts installation.
INSERT INTO war_satchel_withdrawal_physical_consumptions(chain_id,tx_hash,withdrawal_id,owner_user_id,amount_uwolo,vault_address)
SELECT 'wolo-1',upper(w.tx_hash),w.id,w.owner_user_id,w.amount_uwolo,a.vault_address
 FROM war_satchel_funded_withdrawals w
 JOIN war_satchel_withdrawal_authorizations a ON a.withdrawal_id=w.id
 WHERE w.status='sent';
IF EXISTS(SELECT 1 FROM war_satchel_funded_withdrawals w WHERE w.status='sent' AND NOT EXISTS(SELECT 1 FROM war_satchel_withdrawal_physical_consumptions p WHERE p.withdrawal_id=w.id)) THEN
 RAISE EXCEPTION 'historical sent withdrawal lacks immutable vault authorization; independent reconciliation required';
END IF;
CREATE TRIGGER satchel_withdrawal_physical_immutable BEFORE UPDATE OR DELETE ON war_satchel_withdrawal_physical_consumptions FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_audit_immutable();
CREATE TRIGGER satchel_withdrawal_physical_no_truncate BEFORE TRUNCATE ON war_satchel_withdrawal_physical_consumptions FOR EACH STATEMENT EXECUTE FUNCTION war_satchel_funded_audit_immutable();
END;
$install$;
