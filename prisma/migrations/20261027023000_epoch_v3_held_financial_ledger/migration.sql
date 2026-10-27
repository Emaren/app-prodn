-- PHASE 6 HELD / FINANCIAL EPOCH V3: NEW isolated PostgreSQL namespace.
-- Apply ONLY to a disposable isolated PG cluster until Central release arbitration.
-- Existing nine protected migrations and all legacy financial tables UNCHANGED.
-- No application or public runtime role is granted USAGE/EXECUTE/INSERT.
CREATE SCHEMA epoch_v3;
REVOKE ALL ON SCHEMA epoch_v3 FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA epoch_v3 REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA epoch_v3 REVOKE ALL ON FUNCTIONS FROM PUBLIC;

CREATE TABLE epoch_v3.epochs (
  epoch_id text PRIMARY KEY CHECK (epoch_id ~ '^[a-z][a-z0-9_-]{11,63}$'),
  h_star bigint NOT NULL CHECK (h_star>0),
  vault_address text NOT NULL, escrow_address text NOT NULL,
  signer_policy_sha256 text NOT NULL CHECK (signer_policy_sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'HELD_NONEXECUTING'
    CHECK (state='HELD_NONEXECUTING'),
  CHECK (vault_address<>escrow_address)
);
CREATE TABLE epoch_v3.receipts (
  chain_id text NOT NULL DEFAULT 'wolo-1' CHECK(chain_id='wolo-1'),
  tx_hash char(64) NOT NULL CHECK(tx_hash ~ '^[A-F0-9]{64}$'),
  message_index integer NOT NULL CHECK(message_index>=0),
  epoch_id text NOT NULL REFERENCES epoch_v3.epochs(epoch_id),
  owner_uid text NOT NULL CHECK(length(owner_uid) BETWEEN 1 AND 100),
  kind text NOT NULL CHECK(kind IN ('deposit','wager_funding','escrow_return','withdrawal','fee')),
  sender text NOT NULL, recipient text NOT NULL, memo text NOT NULL,
  amount_uwolo numeric(39,0) NOT NULL CHECK(amount_uwolo>0),
  chain_height bigint NOT NULL CHECK(chain_height>0),
  native_proof_sha256 text NOT NULL CHECK(native_proof_sha256 ~ '^[a-f0-9]{64}$'),
  proof_verified_at timestamptz NOT NULL,
  chain_time timestamptz NOT NULL,
  PRIMARY KEY (chain_id,tx_hash,message_index)
);
-- Physical global uniqueness is enforced across ALL *new-v3* credit paths
-- via this single table. Legacy readers do not yet share this index:
-- external source-exclusion / cross-estate census remains a deployment HOLD.
CREATE TABLE epoch_v3.receipt_consumptions (
  chain_id text NOT NULL,tx_hash char(64) NOT NULL,message_index integer NOT NULL,
  epoch_id text NOT NULL,owner_uid text NOT NULL,
  consumer_kind text NOT NULL CHECK(consumer_kind IN ('deposit','ticket','return','withdrawal','fee')),
  economic_key text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(chain_id,tx_hash,message_index),
  UNIQUE(epoch_id,consumer_kind,economic_key),
  FOREIGN KEY(chain_id,tx_hash,message_index)
    REFERENCES epoch_v3.receipts(chain_id,tx_hash,message_index)
);
CREATE TABLE epoch_v3.positions (
  epoch_id text NOT NULL REFERENCES epoch_v3.epochs(epoch_id),
  owner_uid text NOT NULL,
  available_uwolo numeric(39,0) NOT NULL DEFAULT 0 CHECK(available_uwolo>=0),
  reserved_uwolo numeric(39,0) NOT NULL DEFAULT 0 CHECK(reserved_uwolo>=0),
  pending_uwolo numeric(39,0) NOT NULL DEFAULT 0 CHECK(pending_uwolo>=0),
  PRIMARY KEY(epoch_id,owner_uid)
);
CREATE TABLE epoch_v3.daily_reservations (
  epoch_id text NOT NULL REFERENCES epoch_v3.epochs(epoch_id),
  owner_uid text NOT NULL, utc_day date NOT NULL,
  used_uwolo numeric(39,0) NOT NULL DEFAULT 0 CHECK(used_uwolo>=0 AND used_uwolo<=50000000000),
  PRIMARY KEY(epoch_id,owner_uid,utc_day)
);
CREATE TABLE epoch_v3.operations (
  epoch_id text NOT NULL REFERENCES epoch_v3.epochs(epoch_id),
  operation_id text NOT NULL,
  economic_key text NOT NULL,
  owner_uid text NOT NULL,
  fingerprint_sha256 text NOT NULL CHECK(fingerprint_sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'PREPARED_UNSIGNED' CHECK(state IN (
    'PREPARED_UNSIGNED','ATTEMPT_FENCED','SIGNED_UNKNOWN',
    'BROADCAST_UNKNOWN','UNKNOWN_NO_REPLAY','PROVEN_FINAL')),
  version integer NOT NULL DEFAULT 0 CHECK(version>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(epoch_id,operation_id),
  UNIQUE(epoch_id,economic_key)
);
CREATE TABLE epoch_v3.operation_transitions (
  epoch_id text NOT NULL,operation_id text NOT NULL,
  version integer NOT NULL CHECK(version>=1),from_state text NOT NULL,to_state text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(epoch_id,operation_id,version),
  FOREIGN KEY(epoch_id,operation_id) REFERENCES epoch_v3.operations(epoch_id,operation_id)
);
CREATE TABLE epoch_v3.tickets (
  epoch_id text NOT NULL REFERENCES epoch_v3.epochs(epoch_id),
  ticket_id bigint NOT NULL CHECK(ticket_id>0),owner_uid text NOT NULL,
  operation_id text NOT NULL,
  principal_uwolo numeric(39,0) NOT NULL
    CHECK(principal_uwolo BETWEEN 1000000 AND 10000000000 AND mod(principal_uwolo,1000000)=0),
  chain_id text NOT NULL,tx_hash char(64) NOT NULL,message_index integer NOT NULL,
  utc_day date NOT NULL,
  admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(epoch_id,ticket_id),
  UNIQUE(epoch_id,operation_id),
  FOREIGN KEY(chain_id,tx_hash,message_index)
    REFERENCES epoch_v3.receipt_consumptions(chain_id,tx_hash,message_index)
);
CREATE TABLE epoch_v3.allocations (
  epoch_id text NOT NULL,ticket_id bigint NOT NULL,
  market_id bigint NOT NULL CHECK(market_id>0),
  leg_id bigint NOT NULL CHECK(leg_id>0),
  wager_id bigint NOT NULL CHECK(wager_id>0),
  side text NOT NULL CHECK(side IN ('left','right')),
  principal_uwolo numeric(39,0) NOT NULL CHECK(principal_uwolo>0 AND mod(principal_uwolo,1000000)=0),
  PRIMARY KEY(epoch_id,ticket_id,market_id,leg_id),
  UNIQUE(epoch_id,market_id,wager_id),
  FOREIGN KEY(epoch_id,ticket_id) REFERENCES epoch_v3.tickets(epoch_id,ticket_id)
);
CREATE TABLE epoch_v3.market_plans (
  epoch_id text NOT NULL REFERENCES epoch_v3.epochs(epoch_id),
  market_id bigint NOT NULL,
  winning_side text NOT NULL CHECK(winning_side IN ('left','right','void')),
  resolution_sha256 text NOT NULL CHECK(resolution_sha256 ~ '^[a-f0-9]{64}$'),
  plan_sha256 text NOT NULL CHECK(plan_sha256 ~ '^[a-f0-9]{64}$'),
  principal_uwolo numeric(39,0) NOT NULL CHECK(principal_uwolo>0),
  return_uwolo numeric(39,0) NOT NULL CHECK(return_uwolo>=0),
  fee_uwolo numeric(39,0) NOT NULL CHECK(fee_uwolo>=0),
  PRIMARY KEY(epoch_id,market_id),
  CHECK(principal_uwolo=return_uwolo+fee_uwolo)
);
CREATE TABLE epoch_v3.entitlements (
  epoch_id text NOT NULL,ticket_id bigint NOT NULL,market_id bigint NOT NULL,
  leg_id bigint NOT NULL,owner_uid text NOT NULL,
  entitlement_id text NOT NULL,kind text NOT NULL
    CHECK(kind IN ('matched_payout','unmatched_refund','void_refund','lost')),
  original_operation_id text NOT NULL,
  amount_uwolo numeric(39,0) NOT NULL CHECK(amount_uwolo>=0),
  fee_uwolo numeric(39,0) NOT NULL CHECK(fee_uwolo>=0),
  PRIMARY KEY(epoch_id,ticket_id,market_id,leg_id),
  UNIQUE(epoch_id,entitlement_id),
  FOREIGN KEY(epoch_id,ticket_id,market_id,leg_id)
    REFERENCES epoch_v3.allocations(epoch_id,ticket_id,market_id,leg_id),
  FOREIGN KEY(epoch_id,market_id) REFERENCES epoch_v3.market_plans(epoch_id,market_id)
);
CREATE TABLE epoch_v3.return_effects (
  epoch_id text NOT NULL,
  entitlement_id text NOT NULL,
  operation_id text NOT NULL,
  chain_id text NOT NULL,tx_hash char(64) NOT NULL,message_index integer NOT NULL,
  amount_uwolo numeric(39,0) NOT NULL CHECK(amount_uwolo>0),
  PRIMARY KEY(epoch_id,entitlement_id),
  UNIQUE(epoch_id,operation_id),
  FOREIGN KEY(epoch_id,entitlement_id) REFERENCES epoch_v3.entitlements(epoch_id,entitlement_id),
  FOREIGN KEY(chain_id,tx_hash,message_index)
    REFERENCES epoch_v3.receipt_consumptions(chain_id,tx_hash,message_index)
);
-- Append-only journal of every materialized owner balance effect.
CREATE TABLE epoch_v3.balance_events (
  epoch_id text NOT NULL,source_kind text NOT NULL,source_key text NOT NULL,
  owner_uid text NOT NULL,
  available_delta numeric(39,0) NOT NULL DEFAULT 0,
  reserved_delta numeric(39,0) NOT NULL DEFAULT 0,
  pending_delta numeric(39,0) NOT NULL DEFAULT 0,
  happened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(epoch_id,source_kind,source_key),
  CHECK(available_delta<>0 OR reserved_delta<>0 OR pending_delta<>0)
);
-- All core financial tables are private, internal and append-only.
-- Mutable position/operation/day counters can change ONLY via controlled functions.
CREATE FUNCTION epoch_v3.reject_change() RETURNS trigger LANGUAGE plpgsql
AS $fn$ BEGIN RAISE EXCEPTION 'EPOCH_V3_IMMUTABLE_FINANCIAL_HISTORY'; END $fn$;
CREATE TRIGGER receipts_immutable BEFORE UPDATE OR DELETE ON epoch_v3.receipts
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();
CREATE TRIGGER consumptions_immutable BEFORE UPDATE OR DELETE ON epoch_v3.receipt_consumptions
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();
CREATE TRIGGER tickets_immutable BEFORE UPDATE OR DELETE ON epoch_v3.tickets
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();
CREATE TRIGGER allocations_immutable BEFORE UPDATE OR DELETE ON epoch_v3.allocations
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();
CREATE TRIGGER plans_immutable BEFORE UPDATE OR DELETE ON epoch_v3.market_plans
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();
CREATE TRIGGER entitlements_immutable BEFORE UPDATE OR DELETE ON epoch_v3.entitlements
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();
CREATE TRIGGER effects_immutable BEFORE UPDATE OR DELETE ON epoch_v3.return_effects
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();
CREATE TRIGGER balance_events_immutable BEFORE UPDATE OR DELETE ON epoch_v3.balance_events
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();
CREATE TRIGGER transitions_immutable BEFORE UPDATE OR DELETE ON epoch_v3.operation_transitions
  FOR EACH ROW EXECUTE FUNCTION epoch_v3.reject_change();

-- The isolated-cluster test owner can insert native-verified receipt facts.
-- NO production proof-ingest role/grant exists. Account proof authentication,
-- owner authentication and trusted Comet H/H+1 must occur *before* insertion.
CREATE FUNCTION epoch_v3.consume_receipt(
  p_epoch text,p_owner text,p_kind text,p_hash char(64),p_index integer,
  p_amount numeric,p_sender text,p_recipient text,p_economic_key text
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,epoch_v3 AS $fn$
DECLARE r epoch_v3.receipts%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM epoch_v3.receipts
    WHERE chain_id='wolo-1' AND tx_hash=p_hash AND message_index=p_index FOR KEY SHARE;
  IF r.epoch_id<>p_epoch OR r.owner_uid<>p_owner OR r.kind<>p_kind
    OR r.amount_uwolo<>p_amount OR r.sender<>p_sender OR r.recipient<>p_recipient THEN
    RAISE EXCEPTION 'EPOCH_V3_PHYSICAL_OR_OWNER_MISMATCH';
  END IF;
  IF p_kind='escrow_return' AND
    r.memo<>('aoe2war/satchel/epoch-v3/'||p_epoch||'/return/'||p_economic_key) THEN
    RAISE EXCEPTION 'EPOCH_V3_RETURN_MEMO_MISMATCH';
  END IF;
  INSERT INTO epoch_v3.receipt_consumptions
    (chain_id,tx_hash,message_index,epoch_id,owner_uid,consumer_kind,economic_key)
    VALUES ('wolo-1',p_hash,p_index,p_epoch,p_owner,
      CASE p_kind WHEN 'wager_funding' THEN 'ticket' WHEN 'escrow_return' THEN 'return'
       ELSE p_kind END,p_economic_key);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'PHYSICAL_RECEIPT_ALREADY_CONSUMED';
END $fn$;

CREATE FUNCTION epoch_v3.credit_deposit(
 p_epoch text,p_owner text,p_hash char(64),p_index integer,p_amount numeric,
 p_sender text,p_recipient text
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,epoch_v3 AS $fn$
BEGIN
  IF p_amount<=0 THEN RAISE EXCEPTION 'INVALID_DEPOSIT_AMOUNT'; END IF;
  PERFORM 1 FROM epoch_v3.epochs WHERE epoch_id=p_epoch AND vault_address=p_recipient;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_EPOCH_VAULT'; END IF;
  PERFORM epoch_v3.consume_receipt(p_epoch,p_owner,'deposit',p_hash,p_index,
    p_amount,p_sender,p_recipient,'deposit:'||p_hash||':'||p_index);
  INSERT INTO epoch_v3.positions(epoch_id,owner_uid,available_uwolo)
    VALUES(p_epoch,p_owner,p_amount)
  ON CONFLICT(epoch_id,owner_uid) DO UPDATE
    SET available_uwolo=epoch_v3.positions.available_uwolo+EXCLUDED.available_uwolo;
  INSERT INTO epoch_v3.balance_events(epoch_id,source_kind,source_key,owner_uid,available_delta)
    VALUES(p_epoch,'deposit',p_hash||':'||p_index,p_owner,p_amount);
END $fn$;

CREATE FUNCTION epoch_v3.admit_ticket(
 p_epoch text,p_owner text,p_ticket bigint,p_hash char(64),p_index integer,
 p_day date,p_intent_sha256 text,p_legs jsonb
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,epoch_v3 AS $fn$
DECLARE v epoch_v3.receipts%ROWTYPE; en epoch_v3.epochs%ROWTYPE;
  used numeric; total numeric; n integer; x record; op text;
BEGIN
  IF p_ticket<=0 OR p_intent_sha256 !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_legs)<>'array' OR jsonb_array_length(p_legs)>16
    OR jsonb_array_length(p_legs)<1 THEN
    RAISE EXCEPTION 'EPOCH_V3_INVALID_TICKET_INTENT';
  END IF;
  SELECT * INTO STRICT en FROM epoch_v3.epochs WHERE epoch_id=p_epoch;
  SELECT * INTO STRICT v FROM epoch_v3.receipts
    WHERE chain_id='wolo-1' AND tx_hash=p_hash AND message_index=p_index;
  IF v.kind<>'wager_funding' OR v.epoch_id<>p_epoch OR v.owner_uid<>p_owner
    OR v.sender<>en.vault_address OR v.recipient<>en.escrow_address
    OR v.chain_height<=en.h_star OR v.amount_uwolo>10000000000
    OR p_day<>(v.chain_time AT TIME ZONE 'UTC')::date
    OR mod(v.amount_uwolo,1000000)<>0 OR p_index<>0
    OR v.memo<>('aoe2war/satchel/epoch-v3/'||p_epoch||'/ticket/'||p_ticket) THEN
    RAISE EXCEPTION 'EPOCH_V3_WRONG_OR_UNFUNDED_TICKET';
  END IF;
  SELECT COUNT(*),COALESCE(SUM((l->>'amount_uwolo')::numeric),0)
    INTO n,total FROM jsonb_array_elements(p_legs) l;
  IF total<>v.amount_uwolo THEN RAISE EXCEPTION 'TICKET_ALLOCATION_EXCEEDS_FUNDING'; END IF;
  -- Serialize same owner/day before any read or credit/move. Hash collision
  -- only over-serializes; never weakens atomicity.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_epoch||':'||p_owner||':'||p_day::text,0));
  INSERT INTO epoch_v3.daily_reservations(epoch_id,owner_uid,utc_day)
    VALUES(p_epoch,p_owner,p_day) ON CONFLICT DO NOTHING;
  SELECT used_uwolo INTO used FROM epoch_v3.daily_reservations
    WHERE epoch_id=p_epoch AND owner_uid=p_owner AND utc_day=p_day FOR UPDATE;
  IF used+v.amount_uwolo>50000000000 THEN RAISE EXCEPTION 'EPOCH_V3_DAILY_CAP'; END IF;
  UPDATE epoch_v3.positions
    SET available_uwolo=available_uwolo-v.amount_uwolo,
        reserved_uwolo=reserved_uwolo+v.amount_uwolo
    WHERE epoch_id=p_epoch AND owner_uid=p_owner AND available_uwolo>=v.amount_uwolo;
  IF NOT FOUND THEN RAISE EXCEPTION 'EPOCH_V3_OWNER_AVAILABLE_DEFICIT'; END IF;
  op:='satchel:e3:'||p_epoch||':'||p_ticket;
  PERFORM epoch_v3.consume_receipt(p_epoch,p_owner,'wager_funding',p_hash,p_index,
    v.amount_uwolo,en.vault_address,en.escrow_address,op);
  INSERT INTO epoch_v3.operations(epoch_id,operation_id,economic_key,owner_uid,fingerprint_sha256)
    VALUES(p_epoch,op,'funding_ticket:'||p_ticket,p_owner,p_intent_sha256);
  INSERT INTO epoch_v3.tickets(epoch_id,ticket_id,owner_uid,operation_id,
    principal_uwolo,chain_id,tx_hash,message_index,utc_day)
    VALUES(p_epoch,p_ticket,p_owner,op,v.amount_uwolo,'wolo-1',p_hash,p_index,p_day);
  FOR x IN SELECT * FROM jsonb_to_recordset(p_legs)
    AS l(market_id bigint,leg_id bigint,wager_id bigint,side text,amount_uwolo numeric) LOOP
    IF x.amount_uwolo<=0 OR x.amount_uwolo>10000000000 OR mod(x.amount_uwolo,1000000)<>0 THEN
      RAISE EXCEPTION 'EPOCH_V3_INVALID_LEG';
    END IF;
    INSERT INTO epoch_v3.allocations(epoch_id,ticket_id,market_id,leg_id,wager_id,side,principal_uwolo)
      VALUES(p_epoch,p_ticket,x.market_id,x.leg_id,x.wager_id,x.side,x.amount_uwolo);
  END LOOP;
  UPDATE epoch_v3.daily_reservations SET used_uwolo=used_uwolo+v.amount_uwolo
    WHERE epoch_id=p_epoch AND owner_uid=p_owner AND utc_day=p_day;
  INSERT INTO epoch_v3.balance_events(epoch_id,source_kind,source_key,owner_uid,available_delta,reserved_delta)
    VALUES(p_epoch,'ticket',op,p_owner,-v.amount_uwolo,v.amount_uwolo);
END $fn$;

CREATE FUNCTION epoch_v3.transition_operation(
 p_epoch text,p_op text,p_expected_version integer,p_from text,p_to text
) RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,epoch_v3 AS $fn$
DECLARE v integer;
BEGIN
  IF NOT (
      (p_from='PREPARED_UNSIGNED' AND p_to='ATTEMPT_FENCED') OR
      (p_from='ATTEMPT_FENCED' AND p_to IN ('SIGNED_UNKNOWN','UNKNOWN_NO_REPLAY')) OR
      (p_from='SIGNED_UNKNOWN' AND p_to IN ('BROADCAST_UNKNOWN','UNKNOWN_NO_REPLAY')) OR
      (p_from='BROADCAST_UNKNOWN' AND p_to='UNKNOWN_NO_REPLAY')
    ) THEN RAISE EXCEPTION 'UNKNOWN_NO_REPLAY'; END IF;
  UPDATE epoch_v3.operations SET state=p_to,version=version+1
    WHERE epoch_id=p_epoch AND operation_id=p_op AND version=p_expected_version
      AND state=p_from RETURNING version INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'EPOCH_V3_STALE_OPERATION_VERSION'; END IF;
  INSERT INTO epoch_v3.operation_transitions(epoch_id,operation_id,version,from_state,to_state)
    VALUES(p_epoch,p_op,v,p_from,p_to);
  RETURN v;
END $fn$;
-- Permanent production rule: no SQL function can set PROVEN_FINAL from
-- a caller-asserted flag. A separately reviewed native-proof consumer will
-- require its own proven physical effect and privileged role to settle.

CREATE FUNCTION epoch_v3.settle_market(
 p_epoch text,p_market bigint,p_winner text,p_resolution_sha text,
 p_plan_sha text,p_outcomes jsonb
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,epoch_v3 AS $fn$
DECLARE n integer;src_count integer; principal numeric;paid numeric;fees numeric;
  left_total numeric;right_total numeric;expected_fee numeric; x record; v record;
BEGIN
  IF p_winner NOT IN ('left','right','void') OR p_resolution_sha !~ '^[a-f0-9]{64}$'
    OR p_plan_sha !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_outcomes)<>'array' THEN
    RAISE EXCEPTION 'EPOCH_V3_INVALID_SETTLEMENT';
  END IF;
  -- Lock actual source allocations (not user-supplied balance estimates).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_epoch||':market:'||p_market,0));
  SELECT COUNT(*),COALESCE(SUM(principal_uwolo),0),
    COALESCE(SUM(principal_uwolo) FILTER(WHERE side='left'),0),
    COALESCE(SUM(principal_uwolo) FILTER(WHERE side='right'),0)
  INTO src_count,principal,left_total,right_total FROM epoch_v3.allocations
    WHERE epoch_id=p_epoch AND market_id=p_market;
  IF src_count<1 OR jsonb_array_length(p_outcomes)<>src_count THEN
    RAISE EXCEPTION 'EPOCH_V3_SETTLEMENT_INCOMPLETE';
  END IF;
  paid:=0;fees:=0;n:=0;
  FOR x IN SELECT * FROM jsonb_to_recordset(p_outcomes)
    AS r(ticket_id bigint,leg_id bigint,wager_id bigint,owner_uid text,amount_uwolo numeric,
         fee_uwolo numeric,kind text) LOOP
    SELECT a.principal_uwolo,a.wager_id,a.side,t.owner_uid,t.operation_id
      INTO STRICT v FROM epoch_v3.allocations a
      JOIN epoch_v3.tickets t ON t.epoch_id=a.epoch_id AND t.ticket_id=a.ticket_id
      WHERE a.epoch_id=p_epoch AND a.market_id=p_market AND a.ticket_id=x.ticket_id
        AND a.leg_id=x.leg_id FOR SHARE OF a,t;
    IF x.wager_id<>v.wager_id OR x.owner_uid<>v.owner_uid
      OR x.amount_uwolo<0 OR x.fee_uwolo<0
      OR x.kind NOT IN ('matched_payout','unmatched_refund','void_refund','lost')
      OR (x.kind='lost' AND (x.amount_uwolo<>0 OR x.fee_uwolo<>0))
      OR (x.kind='unmatched_refund' AND (x.amount_uwolo>v.principal_uwolo OR x.fee_uwolo<>0))
      OR (x.kind='matched_payout' AND (p_winner<>v.side OR x.amount_uwolo<=0))
      OR (x.kind='void_refund' AND p_winner<>'void')
      OR (p_winner='void' AND (x.kind<>'void_refund' OR x.amount_uwolo<>v.principal_uwolo OR x.fee_uwolo<>0))
    THEN RAISE EXCEPTION 'EPOCH_V3_SETTLEMENT_OWNERSHIP_OR_ECONOMICS'; END IF;
    paid:=paid+x.amount_uwolo;fees:=fees+x.fee_uwolo;n:=n+1;
  END LOOP;
  -- Actual per-entitlement amount is pinned by source fixture/owner mandate;
  -- market conservation and 2% fee are checked independently here.
  expected_fee:=CASE WHEN p_winner='void' THEN 0
    ELSE floor(((LEAST(left_total,right_total)*2/1000000)*200+5000)/10000)*1000000 END;
  IF fees<>expected_fee OR paid+fees<>principal THEN
    RAISE EXCEPTION 'EPOCH_V3_MATCHED_ONLY_FEE_OR_PRINCIPAL_CONSERVATION';
  END IF;
  INSERT INTO epoch_v3.market_plans(epoch_id,market_id,winning_side,resolution_sha256,
      plan_sha256,principal_uwolo,return_uwolo,fee_uwolo)
    VALUES(p_epoch,p_market,p_winner,p_resolution_sha,p_plan_sha,principal,paid,fees);
  FOR x IN SELECT * FROM jsonb_to_recordset(p_outcomes)
    AS r(ticket_id bigint,leg_id bigint,wager_id bigint,owner_uid text,amount_uwolo numeric,
         fee_uwolo numeric,kind text) LOOP
    INSERT INTO epoch_v3.entitlements(epoch_id,ticket_id,market_id,leg_id,owner_uid,
      entitlement_id,kind,original_operation_id,amount_uwolo,fee_uwolo)
    VALUES(p_epoch,x.ticket_id,p_market,x.leg_id,x.owner_uid,
      'satchel:e3:'||p_epoch||':entitlement:'||p_market||':'||x.ticket_id||':'||x.leg_id,
      x.kind,'satchel:e3:'||p_epoch||':'||x.ticket_id,x.amount_uwolo,x.fee_uwolo);
    UPDATE epoch_v3.positions
      SET reserved_uwolo=reserved_uwolo-(
        SELECT principal_uwolo FROM epoch_v3.allocations WHERE epoch_id=p_epoch
         AND ticket_id=x.ticket_id AND market_id=p_market AND leg_id=x.leg_id),
        pending_uwolo=pending_uwolo+x.amount_uwolo
      WHERE epoch_id=p_epoch AND owner_uid=x.owner_uid AND reserved_uwolo>=(
        SELECT principal_uwolo FROM epoch_v3.allocations WHERE epoch_id=p_epoch
          AND ticket_id=x.ticket_id AND market_id=p_market AND leg_id=x.leg_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'EPOCH_V3_RESERVED_DEFICIT'; END IF;
    INSERT INTO epoch_v3.balance_events(epoch_id,source_kind,source_key,owner_uid,reserved_delta,pending_delta)
      VALUES(p_epoch,'settlement',
        p_market||':'||x.ticket_id||':'||x.leg_id,x.owner_uid,
        -(SELECT principal_uwolo FROM epoch_v3.allocations WHERE epoch_id=p_epoch
          AND ticket_id=x.ticket_id AND market_id=p_market AND leg_id=x.leg_id),
        x.amount_uwolo);
  END LOOP;
END $fn$;

CREATE FUNCTION epoch_v3.reconcile_return(
 p_epoch text,p_entitlement text,p_hash char(64),p_index integer,p_amount numeric,
 p_sender text,p_recipient text,p_operation text
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,epoch_v3 AS $fn$
DECLARE e epoch_v3.entitlements%ROWTYPE; en epoch_v3.epochs%ROWTYPE;
BEGIN
  SELECT * INTO STRICT e FROM epoch_v3.entitlements
    WHERE epoch_id=p_epoch AND entitlement_id=p_entitlement;
  SELECT * INTO STRICT en FROM epoch_v3.epochs WHERE epoch_id=p_epoch;
  IF e.amount_uwolo<=0 OR e.amount_uwolo<>p_amount
    OR p_sender<>en.escrow_address OR p_recipient<>en.vault_address
    OR p_operation<>p_entitlement||':return' OR p_index<>0 THEN
    RAISE EXCEPTION 'EPOCH_V3_RETURN_ENTITLEMENT_MISMATCH';
  END IF;
  PERFORM epoch_v3.consume_receipt(p_epoch,e.owner_uid,'escrow_return',p_hash,p_index,
    p_amount,p_sender,p_recipient,p_entitlement);
  INSERT INTO epoch_v3.return_effects(epoch_id,entitlement_id,operation_id,
    chain_id,tx_hash,message_index,amount_uwolo)
    VALUES(p_epoch,p_entitlement,p_operation,'wolo-1',p_hash,p_index,p_amount);
  UPDATE epoch_v3.positions
    SET pending_uwolo=pending_uwolo-p_amount,available_uwolo=available_uwolo+p_amount
    WHERE epoch_id=p_epoch AND owner_uid=e.owner_uid AND pending_uwolo>=p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'EPOCH_V3_PENDING_LIABILITY_DEFICIT'; END IF;
  INSERT INTO epoch_v3.balance_events(epoch_id,source_kind,source_key,owner_uid,available_delta,pending_delta)
    VALUES(p_epoch,'return',p_entitlement,e.owner_uid,p_amount,-p_amount);
END $fn$;

-- Auditable independent reconciliation of all materialized owner positions.
-- Historical, DE and external accounts must be separately proven before release.
CREATE VIEW epoch_v3.position_reconciliation AS
 SELECT p.epoch_id,p.owner_uid,p.available_uwolo,p.reserved_uwolo,p.pending_uwolo,
   COALESCE(sum(e.available_delta),0) AS event_available_uwolo,
   COALESCE(sum(e.reserved_delta),0) AS event_reserved_uwolo,
   COALESCE(sum(e.pending_delta),0) AS event_pending_uwolo,
   (p.available_uwolo=COALESCE(sum(e.available_delta),0) AND
    p.reserved_uwolo=COALESCE(sum(e.reserved_delta),0) AND
    p.pending_uwolo=COALESCE(sum(e.pending_delta),0)) AS exact
 FROM epoch_v3.positions p LEFT JOIN epoch_v3.balance_events e
 ON e.epoch_id=p.epoch_id AND e.owner_uid=p.owner_uid
 GROUP BY p.epoch_id,p.owner_uid,p.available_uwolo,p.reserved_uwolo,p.pending_uwolo;
CREATE VIEW epoch_v3.account_liability_inventory AS
 SELECT epoch_id,
   sum(available_uwolo) AS owner_available_uwolo,
   sum(reserved_uwolo) AS outstanding_stake_uwolo,
   sum(pending_uwolo) AS escrow_return_due_uwolo,
   sum(available_uwolo+reserved_uwolo+pending_uwolo) AS total_new_epoch_liability_uwolo
 FROM epoch_v3.positions GROUP BY epoch_id;
-- Strict default-deny until source-specific roles, native verifier binary,
-- financial writer exclusion and owner permits are installed and independently
-- certified. Even an app superuser must not be promoted to release authority.
REVOKE ALL ON ALL TABLES IN SCHEMA epoch_v3 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA epoch_v3 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA epoch_v3 FROM PUBLIC;
