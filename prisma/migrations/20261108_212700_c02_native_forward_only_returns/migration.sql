-- C02 source-only financial migration. NEVER migrate the live database without
-- Session A's C03 financial-owner transition, C06/C07 recovery and C08 grant.
-- The native 12-digit claim namespace is intentionally disjoint from the
-- legacy pending_wolo_claims integer primary-key namespace. No historical
-- row or payout state is rewritten, copied, cleared, or auto-paid.
--
-- The unchanged existing 13 Satchel migrations must already be installed.
-- New source-bound C02 v2 migration has separate acceptance and owner review.
BEGIN;

CREATE SEQUENCE war_satchel_native_claim_id_seq AS bigint
  MINVALUE 900000000001 MAXVALUE 999999999999 START 900000000001
  INCREMENT BY 1 NO CYCLE;

CREATE TABLE war_satchel_native_return_operations (
  claim_id bigint PRIMARY KEY DEFAULT nextval('war_satchel_native_claim_id_seq'),
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  owner_uid varchar(100) NOT NULL CHECK(owner_uid ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  wager_operation_id varchar(128) NOT NULL
    REFERENCES war_satchel_wager_broadcasts(operation_id) ON DELETE RESTRICT,
  ticket_id integer NOT NULL CHECK(ticket_id>0),
  market_id bigint NOT NULL CHECK(market_id>0),
  leg_id varchar(160) NOT NULL CHECK(length(leg_id)>0),
  entitlement_id varchar(160) NOT NULL CHECK(length(entitlement_id)>0),
  claim_kind varchar(24) NOT NULL CHECK(claim_kind IN ('bet_payout','bet_refund')),
  amount_uwolo bigint NOT NULL CHECK(amount_uwolo>0),
  -- Source-specific economics used by the independently pinned App
  -- signed-v2 allocation and Comet proof verifier after restart.
  principal_uwolo bigint NOT NULL CHECK(principal_uwolo>0),
  stake_uwolo bigint NOT NULL CHECK(stake_uwolo>0),
  funded_amount_uwolo bigint NOT NULL CHECK(funded_amount_uwolo>0),
  escrow_address varchar(100) NOT NULL CHECK(escrow_address ~ '^wolo1[0-9a-z]{38,90}$'),
  vault_address varchar(100) NOT NULL CHECK(vault_address ~ '^wolo1[0-9a-z]{38,90}$'),
  funding_tx_hash varchar(64) NOT NULL
    CHECK(funding_tx_hash ~ '^[A-F0-9]{64}$' AND funding_tx_hash <> repeat('0',64)),
  funding_height bigint NOT NULL CHECK(funding_height>0),
  funding_bank_root varchar(64) NOT NULL
    CHECK(funding_bank_root ~ '^[a-f0-9]{64}$' AND funding_bank_root <> repeat('0',64)),
  allocation_digest varchar(64) NOT NULL
    CHECK(allocation_digest ~ '^[a-f0-9]{64}$' AND allocation_digest <> repeat('0',64)),
  independent_reserve_review_sha256 varchar(64) NOT NULL
    CHECK(independent_reserve_review_sha256 ~ '^[a-f0-9]{64}$' AND
          independent_reserve_review_sha256 <> repeat('0',64)),
  owner_permit_sha256 varchar(64) NOT NULL
    CHECK(owner_permit_sha256 ~ '^[a-f0-9]{64}$' AND owner_permit_sha256 <> repeat('0',64)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(claim_id BETWEEN 900000000001 AND 999999999999),
  CHECK(escrow_address<>vault_address AND
        amount_uwolo<=50000000000 AND
        principal_uwolo<=stake_uwolo AND
        stake_uwolo<=funded_amount_uwolo),
  UNIQUE(wager_operation_id,leg_id,entitlement_id),
  UNIQUE(claim_id,owner_user_id)
);
ALTER SEQUENCE war_satchel_native_claim_id_seq
  OWNED BY war_satchel_native_return_operations.claim_id;

-- The original authenticated funded wager must be committed, never just a
-- wallet/amount match from the legacy chain transfer index.
CREATE FUNCTION war_satchel_native_source_admission() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $native_source$
DECLARE owner_id integer; linked_hash varchar(64); linked_ticket integer;
  linked_status varchar(24);
BEGIN
 SELECT a.owner_user_id, b.tx_hash, r.ticket_id, r.status
 INTO owner_id, linked_hash, linked_ticket, linked_status
 FROM public.war_satchel_wager_authorizations a
 JOIN public.war_satchel_wager_broadcasts b ON b.operation_id=a.operation_id
 JOIN public.war_satchel_funded_reservations r ON r.id=a.reservation_id
 WHERE a.operation_id=NEW.wager_operation_id FOR SHARE OF a,b,r;
 IF owner_id IS DISTINCT FROM NEW.owner_user_id
    OR linked_hash IS DISTINCT FROM NEW.funding_tx_hash
    OR linked_ticket IS DISTINCT FROM NEW.ticket_id
    OR linked_status IS DISTINCT FROM 'committed'
    OR NOT EXISTS (
      SELECT 1 FROM public.war_satchel_funded_reservations
      WHERE ticket_request_id=NEW.wager_operation_id
        AND amount_uwolo=NEW.funded_amount_uwolo
        AND tx_hash=NEW.funding_tx_hash
    ) THEN
   RAISE EXCEPTION 'C02_AUTHENTICATED_FRESH_WAGER_FUNDING_REQUIRED';
 END IF;
 RETURN NEW;
END;
$native_source$;
CREATE TRIGGER c02_original_funding_bound BEFORE INSERT
 ON war_satchel_native_return_operations FOR EACH ROW
 EXECUTE FUNCTION war_satchel_native_source_admission();

-- A separately signed original-op approval imported by a restricted finance
-- worker. This never claims that funds moved or grants execution authority.
CREATE TABLE war_satchel_native_return_approvals (
 claim_id bigint PRIMARY KEY
  REFERENCES war_satchel_native_return_operations(claim_id) ON DELETE RESTRICT,
 approval_json jsonb NOT NULL CHECK(
   jsonb_typeof(approval_json)='object'
   AND approval_json->>'version'='2'
   AND approval_json->>'claim_id'=claim_id::text
   AND length(approval_json::text) BETWEEN 200 AND 65536),
 approval_sha256 varchar(64) NOT NULL CHECK(
   approval_sha256 ~ '^[a-f0-9]{64}$' AND approval_sha256<>repeat('0',64)),
 created_at timestamptz NOT NULL DEFAULT now()
);

-- One write-ahead durable intent committed BEFORE any 8094 POST. Its absence
-- cannot be inferred from a lost DB acknowledgement. A duplicate claim cannot
-- gain a second request identity, including after timeout or server restart.
CREATE TABLE war_satchel_native_return_attempts (
 claim_id bigint PRIMARY KEY
  REFERENCES war_satchel_native_return_operations(claim_id) ON DELETE RESTRICT,
 operation_key varchar(128) NOT NULL UNIQUE,
 app_operation_id varchar(128) NOT NULL,
 -- The original signed v2 approval survives a crash, operator rotation, and
 -- permit expiry. Only the independent native verifier may authenticate it.
 approval_json jsonb NOT NULL CHECK (
   jsonb_typeof(approval_json)='object' AND
   approval_json->>'version'='2' AND
   approval_json->>'claim_id'=claim_id::text AND
   length(approval_json::text) BETWEEN 200 AND 65536),
 approval_sha256 varchar(64) NOT NULL
  CHECK(approval_sha256 ~ '^[a-f0-9]{64}$' AND approval_sha256 <> repeat('0',64)),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(operation_key='satchel:claim-return:'||claim_id::text)
);

-- Append-only untrusted *candidate* observations, never balance credits.
CREATE TABLE war_satchel_native_return_observations (
 id bigserial PRIMARY KEY,
 claim_id bigint NOT NULL
  REFERENCES war_satchel_native_return_attempts(claim_id) ON DELETE RESTRICT,
 state varchar(24) NOT NULL CHECK(state IN ('unknown','candidate')),
 tx_hash varchar(64) CHECK(tx_hash ~ '^[A-F0-9]{64}$' AND tx_hash <> repeat('0',64)),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='unknown' AND tx_hash IS NULL) OR
       (state='candidate' AND tx_hash IS NOT NULL))
);
CREATE INDEX ix_satchel_native_return_observations
 ON war_satchel_native_return_observations(claim_id,id);

-- Actual credits are separate from legacy claimed returns. An independently
-- authenticated original native bank proof is required BEFORE the restricted
-- finance writer can call the atomic credit function defined below.
CREATE TABLE war_satchel_native_return_credits (
 id bigserial PRIMARY KEY,
 claim_id bigint NOT NULL UNIQUE REFERENCES war_satchel_native_return_attempts(claim_id)
    ON DELETE RESTRICT,
 owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 chain_id varchar(32) NOT NULL DEFAULT 'wolo-1' CHECK(chain_id='wolo-1'),
 tx_hash varchar(64) NOT NULL
   CHECK(tx_hash ~ '^[A-F0-9]{64}$' AND tx_hash <> repeat('0',64)),
 message_index integer NOT NULL DEFAULT 0 CHECK(message_index=0),
 amount_uwolo bigint NOT NULL CHECK(amount_uwolo>0),
 vault_address varchar(100) NOT NULL CHECK(vault_address ~ '^wolo1[0-9a-z]{38,90}$'),
 canonical_height bigint NOT NULL CHECK(canonical_height>0),
 bank_block_hash varchar(64) NOT NULL
   CHECK(bank_block_hash ~ '^[A-F0-9]{64}$' AND bank_block_hash <> repeat('0',64)),
 authenticated_proof_digest varchar(64) NOT NULL
   CHECK(authenticated_proof_digest ~ '^[a-f0-9]{64}$' AND authenticated_proof_digest <> repeat('0',64)),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(chain_id,tx_hash,message_index)
);

-- Share the existing global physical tx consumption fence with both ordinary
-- Satchel deposits and older Satchel claim-return receipts. This prevents one
-- tx from being credited through two different App financial source families.
DO $audit$
DECLARE constraint_name text; n integer;
BEGIN
 SELECT count(*),min(c.conname) INTO n,constraint_name FROM pg_constraint c
 JOIN pg_class t ON t.oid=c.conrelid
 WHERE t.oid='public.war_satchel_physical_receipt_consumptions'::regclass
 AND c.contype='c' AND pg_get_constraintdef(c.oid) LIKE '%receipt_kind%'
 AND pg_get_constraintdef(c.oid) LIKE '%claim_return%';
 IF n<>1 THEN RAISE EXCEPTION 'C02_GLOBAL_PHYSICAL_RECEIPT_CONSTRAINT_DRIFT'; END IF;
 EXECUTE format('ALTER TABLE public.war_satchel_physical_receipt_consumptions DROP CONSTRAINT %I',constraint_name);
END;
$audit$;
ALTER TABLE war_satchel_physical_receipt_consumptions
 ADD CONSTRAINT c02_physical_receipt_source_three_way CHECK(
 chain_id='wolo-1' AND message_index=0 AND
 tx_hash ~ '^[A-F0-9]{64}$' AND tx_hash<>repeat('0',64) AND
 receipt_kind IN ('deposit','claim_return','native_return') AND
 source_receipt_id>0 AND amount_uwolo>0
);
CREATE FUNCTION war_satchel_native_return_consume() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $consume$
BEGIN
 INSERT INTO public.war_satchel_physical_receipt_consumptions
 (chain_id,tx_hash,message_index,owner_user_id,receipt_kind,
  source_receipt_id,amount_uwolo,vault_address)
 VALUES (NEW.chain_id,NEW.tx_hash,NEW.message_index,NEW.owner_user_id,
 'native_return',NEW.id,NEW.amount_uwolo,NEW.vault_address);
 RETURN NEW;
END;
$consume$;
CREATE TRIGGER c02_global_chain_tx_once AFTER INSERT
 ON war_satchel_native_return_credits FOR EACH ROW
 EXECUTE FUNCTION war_satchel_native_return_consume();

-- Extend the EXISTING funded double-entry journal; no side-channel balance
-- table and no minted spendable credit without one matching audit entry.
ALTER TABLE war_satchel_funded_journal ADD COLUMN native_return_credit_id bigint
 REFERENCES war_satchel_native_return_credits(id) ON DELETE RESTRICT;
ALTER TABLE war_satchel_funded_journal
 DROP CONSTRAINT ck_satchel_funded_journal_conservation;
ALTER TABLE war_satchel_funded_journal
 ADD CONSTRAINT ck_satchel_funded_journal_conservation CHECK(
 CASE event_kind
 WHEN 'deposit_credit' THEN receipt_id IS NOT NULL AND native_return_credit_id IS NULL
  AND delta_available_uwolo=amount_uwolo AND delta_reserved_uwolo=0
  AND delta_committed_uwolo=0 AND delta_withdrawal_pending_uwolo=0
 WHEN 'claim_return_credit' THEN
  ((claim_return_id IS NOT NULL AND native_return_credit_id IS NULL) OR
   (claim_return_id IS NULL AND native_return_credit_id IS NOT NULL))
  AND delta_available_uwolo=amount_uwolo AND delta_reserved_uwolo=0
  AND delta_committed_uwolo=0 AND delta_withdrawal_pending_uwolo=0
 WHEN 'wager_reserve' THEN execution_id IS NOT NULL AND native_return_credit_id IS NULL
  AND delta_available_uwolo=-amount_uwolo AND delta_reserved_uwolo=amount_uwolo
  AND delta_committed_uwolo=0 AND delta_withdrawal_pending_uwolo=0
 WHEN 'wager_commit' THEN execution_id IS NOT NULL AND native_return_credit_id IS NULL
  AND delta_available_uwolo=0 AND delta_reserved_uwolo=-amount_uwolo
  AND delta_committed_uwolo=amount_uwolo AND delta_withdrawal_pending_uwolo=0
 WHEN 'wager_refund' THEN execution_id IS NOT NULL AND native_return_credit_id IS NULL
  AND delta_available_uwolo=amount_uwolo AND delta_reserved_uwolo=-amount_uwolo
  AND delta_committed_uwolo=0 AND delta_withdrawal_pending_uwolo=0
 WHEN 'withdraw_reserve' THEN native_return_credit_id IS NULL
  AND delta_available_uwolo=-amount_uwolo AND delta_reserved_uwolo=0
  AND delta_committed_uwolo=0 AND delta_withdrawal_pending_uwolo=amount_uwolo
 WHEN 'withdraw_cancel' THEN native_return_credit_id IS NULL
  AND delta_available_uwolo=amount_uwolo AND delta_reserved_uwolo=0
  AND delta_committed_uwolo=0 AND delta_withdrawal_pending_uwolo=-amount_uwolo
 WHEN 'withdraw_sent' THEN native_return_credit_id IS NULL
  AND delta_available_uwolo=0 AND delta_reserved_uwolo=0
  AND delta_committed_uwolo=0 AND delta_withdrawal_pending_uwolo=-amount_uwolo
 ELSE FALSE
 END);

-- Idempotency, global tx consumption, double-entry posting and balance update
-- share ONE transaction. SECURITY INVOKER; PUBLIC has NO function execute.
-- Session A must authorize and provision a dedicated finance writer with the
-- minimum DML grants in the C03 adoption. No owner/grant in this migration.
CREATE FUNCTION war_satchel_native_credit_once(
 p_claim_id bigint,p_tx_hash varchar,p_height bigint,p_bank_block_hash varchar,
 p_proof_digest varchar,p_vault_address varchar
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,public AS $credit$
DECLARE r public.war_satchel_native_return_operations; receipt_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(724176,4702);
 SELECT * INTO STRICT r FROM public.war_satchel_native_return_operations
 WHERE claim_id=p_claim_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.war_satchel_native_return_attempts
               WHERE claim_id=p_claim_id)
 OR p_tx_hash=r.funding_tx_hash
 OR p_vault_address IS DISTINCT FROM r.vault_address
 OR p_height<=r.funding_height
 OR p_bank_block_hash !~ '^[A-F0-9]{64}$'
 OR p_proof_digest !~ '^[a-f0-9]{64}$'
 OR p_proof_digest=repeat('0',64) THEN
  RAISE EXCEPTION 'C02_NATIVE_ORIGINAL_OPERATION_OR_BANK_PROOF_REQUIRED';
 END IF;
 INSERT INTO public.war_satchel_native_return_credits
 (claim_id,owner_user_id,tx_hash,amount_uwolo,canonical_height,
  bank_block_hash,authenticated_proof_digest,vault_address)
 VALUES(p_claim_id,r.owner_user_id,p_tx_hash,r.amount_uwolo,p_height,
        p_bank_block_hash,p_proof_digest,p_vault_address)
 RETURNING id INTO receipt_id;
 INSERT INTO public.war_satchel_funded_balances(owner_user_id,available_uwolo)
 VALUES(r.owner_user_id,0) ON CONFLICT(owner_user_id) DO NOTHING;
 UPDATE public.war_satchel_funded_balances
 SET available_uwolo=available_uwolo+r.amount_uwolo,
     version=version+1,updated_at=now()
 WHERE owner_user_id=r.owner_user_id;
 INSERT INTO public.war_satchel_funded_journal
 (owner_user_id,source_key,event_kind,amount_uwolo,
  delta_available_uwolo,delta_reserved_uwolo,delta_committed_uwolo,
  delta_withdrawal_pending_uwolo,native_return_credit_id)
 VALUES(r.owner_user_id,'native:return:'||p_claim_id::text,'claim_return_credit',
  r.amount_uwolo,r.amount_uwolo,0,0,0,receipt_id);
 RETURN receipt_id;
END;
$credit$;
REVOKE ALL ON FUNCTION war_satchel_native_credit_once(
 bigint,varchar,bigint,varchar,varchar,varchar) FROM PUBLIC;

DO $immutable$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY[
  'war_satchel_native_return_operations','war_satchel_native_return_approvals',
  'war_satchel_native_return_attempts','war_satchel_native_return_observations',
  'war_satchel_native_return_credits'
 ] LOOP
  EXECUTE format('CREATE TRIGGER c02_immutable_rows BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.war_satchel_funded_audit_immutable()',tab);
  EXECUTE format('CREATE TRIGGER c02_immutable_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.war_satchel_funded_audit_immutable()',tab);
 END LOOP;
END;
$immutable$;

COMMIT;
