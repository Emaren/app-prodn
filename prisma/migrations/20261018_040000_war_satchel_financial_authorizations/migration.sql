-- Additive source-only financial authorization evidence. No funds or existing
-- record is modified; no activation is authorized by creating these tables.
DO $install$
BEGIN
CREATE TABLE war_satchel_withdrawal_authorizations (
 withdrawal_id uuid PRIMARY KEY REFERENCES war_satchel_funded_withdrawals(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 owner_uid varchar(100) NOT NULL CHECK(owner_uid ~ '^[a-zA-Z0-9_.:-]{1,100}$'),
 wallet_address varchar(100) NOT NULL, vault_address varchar(100) NOT NULL,
 amount_uwolo bigint NOT NULL CHECK(amount_uwolo>0 AND amount_uwolo<=50000000000),
 challenge_id uuid NOT NULL UNIQUE REFERENCES war_satchel_funded_withdrawal_challenges(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 owner_mandate_json jsonb NOT NULL CHECK(jsonb_typeof(owner_mandate_json)='object'),
 owner_mandate_digest varchar(64) NOT NULL CHECK(owner_mandate_digest ~ '^[a-f0-9]{64}$'),
 reservation_digest varchar(64) NOT NULL UNIQUE CHECK(reservation_digest ~ '^[a-f0-9]{64}$'),
 memo varchar(160) NOT NULL CHECK(memo='aoe2war/satchel/withdraw/v1/'||withdrawal_id::text),
 created_at timestamp(6) NOT NULL DEFAULT now(),CHECK(wallet_address<>vault_address)
);
CREATE TABLE war_satchel_withdrawal_approvals (
 withdrawal_id uuid PRIMARY KEY REFERENCES war_satchel_withdrawal_authorizations(withdrawal_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 approval_json jsonb NOT NULL CHECK(jsonb_typeof(approval_json)='object'),
 approval_digest varchar(64) NOT NULL CHECK(approval_digest ~ '^[a-f0-9]{64}$'),created_at timestamp(6) NOT NULL DEFAULT now()
);
CREATE TABLE war_satchel_withdrawal_revocations (
 withdrawal_id uuid PRIMARY KEY REFERENCES war_satchel_withdrawal_authorizations(withdrawal_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 created_at timestamp(6) NOT NULL DEFAULT now()
);
CREATE TABLE war_satchel_withdrawal_attempts (
 operation_id varchar(128) PRIMARY KEY,
 withdrawal_id uuid NOT NULL UNIQUE REFERENCES war_satchel_withdrawal_approvals(withdrawal_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 request_json jsonb NOT NULL CHECK(jsonb_typeof(request_json)='object'),
 request_digest varchar(64) NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamp(6) NOT NULL DEFAULT now(),CHECK(operation_id='satchel:withdrawal:'||withdrawal_id::text)
);
CREATE TABLE war_satchel_withdrawal_observations (
 id bigserial PRIMARY KEY,operation_id varchar(128) NOT NULL REFERENCES war_satchel_withdrawal_attempts(operation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 tx_hash varchar(64) CHECK(tx_hash ~ '^[A-F0-9]{64}$'),state varchar(32) NOT NULL CHECK(state IN ('unknown','candidate_hash','confirmed')),
 created_at timestamp(6) NOT NULL DEFAULT now(),CHECK((state='unknown' AND tx_hash IS NULL) OR (state<>'unknown' AND tx_hash IS NOT NULL))
);
CREATE INDEX ix_satchel_withdraw_observation_op ON war_satchel_withdrawal_observations(operation_id,created_at);
CREATE TABLE war_satchel_claim_return_authorizations (
 claim_id integer PRIMARY KEY REFERENCES pending_wolo_claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT CHECK(claim_id>0 AND claim_id<>889),
 owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 owner_uid varchar(100) NOT NULL,ticket_id integer NOT NULL CHECK(ticket_id>0),market_id integer NOT NULL CHECK(market_id>0),leg_id integer NOT NULL CHECK(leg_id>0),
 entitlement_id varchar(160) NOT NULL,operation_id varchar(128) NOT NULL,
 funding_tx_hash varchar(64) NOT NULL CHECK(funding_tx_hash ~ '^[A-F0-9]{64}$'),
 funded_amount_uwolo bigint NOT NULL CHECK(funded_amount_uwolo>0 AND funded_amount_uwolo<=1000000000),
 amount_uwolo bigint NOT NULL CHECK(amount_uwolo>0 AND amount_uwolo<=50000000000),
 principal_uwolo bigint NOT NULL CHECK(principal_uwolo>0 AND principal_uwolo<=funded_amount_uwolo),
 claim_kind varchar(24) NOT NULL CHECK(claim_kind IN ('bet_payout','bet_refund')),
 escrow_address varchar(100) NOT NULL,vault_address varchar(100) NOT NULL,
 return_tx_hash varchar(64) NOT NULL UNIQUE CHECK(return_tx_hash ~ '^[A-F0-9]{64}$'),
 approval_json jsonb NOT NULL CHECK(jsonb_typeof(approval_json)='object'),
 allocation_digest varchar(64) NOT NULL CHECK(allocation_digest ~ '^[a-f0-9]{64}$'),
 context_fingerprint varchar(64) NOT NULL CHECK(context_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamp(6) NOT NULL DEFAULT now(),CHECK(escrow_address<>vault_address),CHECK(claim_kind<>'bet_refund' OR amount_uwolo=principal_uwolo)
);
CREATE FUNCTION war_satchel_financial_authorization_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'satchel financial authorization evidence is immutable'; END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['war_satchel_withdrawal_authorizations','war_satchel_withdrawal_approvals','war_satchel_withdrawal_revocations','war_satchel_withdrawal_attempts','war_satchel_withdrawal_observations','war_satchel_claim_return_authorizations'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION war_satchel_financial_authorization_immutable()',tab);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION war_satchel_financial_authorization_immutable()',tab);
 END LOOP;
END $$;
END $install$;
