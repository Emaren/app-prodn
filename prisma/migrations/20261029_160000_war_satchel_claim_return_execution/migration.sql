-- Additive pending-claim execution evidence. Original thirteen migrations and
-- post-payment authorizations remain byte-for-byte unchanged. No activation.
CREATE TABLE war_satchel_claim_return_execution_reviews (
 claim_id integer PRIMARY KEY REFERENCES pending_wolo_claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT CHECK(claim_id>0 AND claim_id<>889),
 owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 owner_uid varchar(100) NOT NULL CHECK(owner_uid ~ '^[a-zA-Z0-9_.:-]{1,100}$'),
 entitlement_id varchar(160) NOT NULL CHECK(length(entitlement_id)>0),
 allocation_digest varchar(64) NOT NULL CHECK(allocation_digest ~ '^[a-f0-9]{64}$'),
 economics_json jsonb NOT NULL CHECK(jsonb_typeof(economics_json)='object' AND NOT economics_json ? 'txHash'),
 reserve_review_json jsonb NOT NULL CHECK(jsonb_typeof(reserve_review_json)='object'),
 review_digest varchar(64) NOT NULL CHECK(review_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamp(6) NOT NULL DEFAULT now(),
 CONSTRAINT uq_satchel_return_execution_entitlement UNIQUE(allocation_digest,entitlement_id)
);
CREATE TABLE war_satchel_claim_return_execution_attempts (
 claim_id integer PRIMARY KEY REFERENCES war_satchel_claim_return_execution_reviews(claim_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 run_id varchar(128) NOT NULL UNIQUE CHECK(run_id='satchel:claim-return:'||claim_id::text),
 request_json jsonb NOT NULL CHECK(jsonb_typeof(request_json)='object'),
 request_digest varchar(64) NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamp(6) NOT NULL DEFAULT now()
);
CREATE TABLE war_satchel_claim_return_execution_observations (
 id bigserial PRIMARY KEY,
 claim_id integer NOT NULL REFERENCES war_satchel_claim_return_execution_attempts(claim_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 state varchar(24) NOT NULL CHECK(state IN ('unknown','confirmed')),
 tx_hash varchar(64) CHECK(tx_hash ~ '^[A-F0-9]{64}$' AND tx_hash<>repeat('0',64)),
 created_at timestamp(6) NOT NULL DEFAULT now(),
 CHECK((state='unknown' AND tx_hash IS NULL) OR (state='confirmed' AND tx_hash IS NOT NULL))
);
CREATE INDEX ix_satchel_return_execution_observations ON war_satchel_claim_return_execution_observations(claim_id,created_at);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['war_satchel_claim_return_execution_reviews','war_satchel_claim_return_execution_attempts','war_satchel_claim_return_execution_observations'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION war_satchel_financial_authorization_immutable()',tab);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION war_satchel_financial_authorization_immutable()',tab);
 END LOOP;
END $$;
