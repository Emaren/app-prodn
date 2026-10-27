-- PHASE 7 held, ADDITIVE native-proof provenance gate.
-- Requires 20261027023000_epoch_v3_held_financial_ledger first.
-- NEVER apply to live production without independently approved release.
CREATE TABLE epoch_v3.native_proof_certificates (
 chain_id text NOT NULL DEFAULT 'wolo-1' CHECK(chain_id='wolo-1'),
 tx_hash char(64) NOT NULL CHECK(tx_hash ~ '^[A-F0-9]{64}$'),
 message_index integer NOT NULL CHECK(message_index=0),
 epoch_id text NOT NULL REFERENCES epoch_v3.epochs(epoch_id),
 owner_uid text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('deposit','wager_funding','escrow_return','withdrawal','fee')),
 denom text NOT NULL CHECK(denom='uwolo'),
 sender text NOT NULL,
 recipient text NOT NULL,
 memo text NOT NULL,
 amount_uwolo numeric(39,0) NOT NULL CHECK(amount_uwolo>0),
 funding_height bigint NOT NULL CHECK(funding_height>0),
 bank_state_height bigint NOT NULL CHECK(bank_state_height>funding_height+1),
 bank_commit_height bigint NOT NULL CHECK(bank_commit_height=bank_state_height+1),
 root_app_sha256 text NOT NULL CHECK(root_app_sha256 ~ '^[A-F0-9]{64}$'),
 root_block_sha256 text NOT NULL CHECK(root_block_sha256 ~ '^[A-F0-9]{64}$'),
 vault_account text NOT NULL,
 escrow_account text NOT NULL CHECK(escrow_account<>vault_account),
 vault_bank_balance_uwolo numeric(39,0) NOT NULL CHECK(vault_bank_balance_uwolo>=0),
 escrow_bank_balance_uwolo numeric(39,0) NOT NULL CHECK(escrow_bank_balance_uwolo>=0),
 proof_sha256 text NOT NULL CHECK(proof_sha256 ~ '^[a-f0-9]{64}$'),
 native_verifier_source text NOT NULL CHECK(native_verifier_source ~ '^[a-f0-9]{40}$'),
 native_verifier_binary_sha256 text NOT NULL CHECK(native_verifier_binary_sha256 ~ '^[a-f0-9]{64}$'),
 trust_anchor_sha256 text NOT NULL CHECK(trust_anchor_sha256 ~ '^[a-f0-9]{64}$'),
 verification_record_sha256 text NOT NULL CHECK(verification_record_sha256 ~ '^[a-f0-9]{64}$'),
 observed_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 issuer_provenance text NOT NULL CHECK(length(issuer_provenance) BETWEEN 10 AND 180),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(chain_id,tx_hash,message_index),
 UNIQUE(epoch_id,verification_record_sha256),
 FOREIGN KEY(chain_id,tx_hash,message_index)
    REFERENCES epoch_v3.receipts(chain_id,tx_hash,message_index),
 CHECK(expires_at>observed_at AND expires_at<=observed_at+interval '120 seconds')
);
CREATE TRIGGER native_certificates_immutable BEFORE UPDATE OR DELETE ON epoch_v3.native_proof_certificates
 FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();

-- A second, account-local manifest: live native proofs only, not caller balances.
-- Completeness including external HD/DE writers must be independently proven.
CREATE TABLE epoch_v3.native_account_reserve_evidence (
 epoch_id text NOT NULL REFERENCES epoch_v3.epochs(epoch_id),
 account_role text NOT NULL CHECK(account_role IN ('vault','escrow')),
 chain_id text NOT NULL CHECK(chain_id='wolo-1'),
 bank_state_height bigint NOT NULL CHECK(bank_state_height>0),
 bank_commit_height bigint NOT NULL CHECK(bank_commit_height=bank_state_height+1),
 block_sha256 text NOT NULL CHECK(block_sha256 ~ '^[A-F0-9]{64}$'),
 app_sha256 text NOT NULL CHECK(app_sha256 ~ '^[A-F0-9]{64}$'),
 bank_balance_uwolo numeric(39,0) NOT NULL CHECK(bank_balance_uwolo>=0),
 liabilities_uwolo numeric(39,0) NOT NULL CHECK(liabilities_uwolo>=0),
 maximum_unknown_outflow_uwolo numeric(39,0) NOT NULL CHECK(maximum_unknown_outflow_uwolo>=0),
 gas_uwolo numeric(39,0) NOT NULL CHECK(gas_uwolo>=0),
 operating_floor_uwolo numeric(39,0) NOT NULL CHECK(operating_floor_uwolo>=0),
 inventory_sha256 text NOT NULL CHECK(inventory_sha256 ~ '^[a-f0-9]{64}$'),
 nonoverlap_sha256 text NOT NULL CHECK(nonoverlap_sha256 ~ '^[a-f0-9]{64}$'),
 proof_sha256 text NOT NULL CHECK(proof_sha256 ~ '^[a-f0-9]{64}$'),
 observed_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(epoch_id,account_role,bank_state_height)
);
CREATE TRIGGER reserve_evidence_immutable BEFORE UPDATE OR DELETE ON epoch_v3.native_account_reserve_evidence
 FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();

-- SQL cannot verify Comet signatures/ICS23 itself. The native verifier is an
-- independent source-pinned local binary, not an HTTP assertion or Ed25519 JSON
-- witness. The dedicated proof-writer credential is the ONLY production issuer.
-- Source qualification never provisions it or sets epoch state active.
CREATE FUNCTION epoch_v3.assert_native_proof_for_receipt(
 p_epoch text,p_owner text,p_kind text,p_hash char(64),p_index integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,epoch_v3 AS $native$
DECLARE c epoch_v3.native_proof_certificates%ROWTYPE; r epoch_v3.receipts%ROWTYPE;
 e epoch_v3.epochs%ROWTYPE; qualified_count integer;
BEGIN
 SELECT * INTO STRICT r FROM epoch_v3.receipts
 WHERE chain_id='wolo-1' AND tx_hash=p_hash AND message_index=p_index;
 SELECT * INTO STRICT c FROM epoch_v3.native_proof_certificates
 WHERE chain_id='wolo-1' AND tx_hash=p_hash AND message_index=p_index;
 SELECT * INTO STRICT e FROM epoch_v3.epochs WHERE epoch_id=p_epoch;
 IF c.epoch_id<>p_epoch OR c.owner_uid<>p_owner OR c.purpose<>p_kind
    OR r.epoch_id<>c.epoch_id OR r.owner_uid<>c.owner_uid
    OR r.kind<>c.purpose OR r.sender<>c.sender OR r.recipient<>c.recipient
    OR r.amount_uwolo<>c.amount_uwolo OR r.memo<>c.memo
    OR r.chain_height<>c.funding_height OR r.native_proof_sha256<>c.proof_sha256
    OR c.vault_account<>e.vault_address OR c.escrow_account<>e.escrow_address
    OR c.funding_height<=e.h_star OR c.observed_at>clock_timestamp()
    OR c.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'BANK_PROOF_STALE_OR_RECEIPT_MISMATCH'; END IF;
 -- Native bank evidence must prove BOTH distinct account domains using the
 -- identical, fresh, signed H/H+1 consensus root, never sum both balances.
 SELECT count(*) INTO qualified_count
 FROM epoch_v3.native_account_reserve_evidence b
 WHERE b.epoch_id=p_epoch AND b.chain_id='wolo-1'
 AND b.bank_state_height=c.bank_state_height
 AND b.bank_commit_height=c.bank_commit_height
 AND b.block_sha256=c.root_block_sha256 AND b.app_sha256=c.root_app_sha256
 AND b.observed_at<=clock_timestamp() AND b.expires_at>clock_timestamp()
 AND b.expires_at<=b.observed_at+interval '120 seconds'
 AND b.bank_balance_uwolo >=
   b.liabilities_uwolo+b.maximum_unknown_outflow_uwolo+
   b.gas_uwolo+b.operating_floor_uwolo
 AND ((b.account_role='vault' AND b.bank_balance_uwolo=c.vault_bank_balance_uwolo)
   OR (b.account_role='escrow' AND b.bank_balance_uwolo=c.escrow_bank_balance_uwolo));
 IF qualified_count<>2 THEN
   RAISE EXCEPTION 'BANK_PROOF_STALE_OR_ACCOUNT_RESERVE_DEFICIT';
 END IF;
END $native$;

-- Every physical consumption path, old or future, passes one strengthened
-- security boundary. Existing source-only PG fixture must install matching
-- private native proof rows to exercise the guarded positive case.
CREATE OR REPLACE FUNCTION epoch_v3.consume_receipt(
 p_epoch text,p_owner text,p_kind text,p_hash char(64),p_index integer,
 p_amount numeric,p_sender text,p_recipient text,p_economic_key text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,epoch_v3 AS $fn$
DECLARE r epoch_v3.receipts%ROWTYPE;
BEGIN
 PERFORM epoch_v3.assert_native_proof_for_receipt(p_epoch,p_owner,p_kind,p_hash,p_index);
 SELECT * INTO STRICT r FROM epoch_v3.receipts
 WHERE chain_id='wolo-1' AND tx_hash=p_hash AND message_index=p_index FOR KEY SHARE;
 IF r.epoch_id<>p_epoch OR r.owner_uid<>p_owner OR r.kind<>p_kind
    OR r.amount_uwolo<>p_amount OR r.sender<>p_sender OR r.recipient<>p_recipient
 THEN RAISE EXCEPTION 'EPOCH_V3_PHYSICAL_OR_OWNER_MISMATCH'; END IF;
 IF p_kind='escrow_return' AND
    r.memo<>('aoe2war/satchel/epoch-v3/'||p_epoch||'/return/'||p_economic_key)
 THEN RAISE EXCEPTION 'EPOCH_V3_RETURN_MEMO_MISMATCH'; END IF;
 INSERT INTO epoch_v3.receipt_consumptions
 (chain_id,tx_hash,message_index,epoch_id,owner_uid,consumer_kind,economic_key)
 VALUES ('wolo-1',p_hash,p_index,p_epoch,p_owner,
 CASE p_kind WHEN 'wager_funding' THEN 'ticket'
 WHEN 'escrow_return' THEN 'return' ELSE p_kind END,p_economic_key);
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'PHYSICAL_RECEIPT_ALREADY_CONSUMED';
END $fn$;

-- SECURITY DEFINER wrappers allow dedicated NOLOGIN group-roles to call
-- whitelisted atomic functions, never direct INSERT/UPDATE of financial rows.
-- Verify function ownership and OS/database role enrollment before production.
ALTER FUNCTION epoch_v3.credit_deposit(text,text,character,integer,numeric,text,text) SECURITY DEFINER;
ALTER FUNCTION epoch_v3.admit_ticket(text,text,bigint,character,integer,date,text,jsonb) SECURITY DEFINER;
ALTER FUNCTION epoch_v3.settle_market(text,bigint,text,text,text,jsonb) SECURITY DEFINER;
ALTER FUNCTION epoch_v3.reconcile_return(text,text,character,integer,numeric,text,text,text) SECURITY DEFINER;
ALTER FUNCTION epoch_v3.transition_operation(text,text,integer,text,text) SECURITY DEFINER;

REVOKE ALL ON ALL TABLES IN SCHEMA epoch_v3 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA epoch_v3 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA epoch_v3 FROM PUBLIC;
