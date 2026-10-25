-- HOLD: future prospective War Satchel epoch, never installed by website-only release.
-- Nine original financial migrations? The prior EIGHT protected migration bodies are untouched.
-- No legacy tables, balances, claims, receipts, transactions or ownership are reset.
-- Separate FINANCIAL migration authority and verified independently controlled vault required.
CREATE TABLE public."war_satchel_prospective_epochs" (
  "epoch_id" VARCHAR(80) PRIMARY KEY,
  "chain_id" VARCHAR(32) NOT NULL,
  "vault_address" VARCHAR(100) NOT NULL UNIQUE,
  "start_height" BIGINT NOT NULL,
  "start_app_hash" VARCHAR(64) NOT NULL,
  "manifest_sha256" VARCHAR(64) NOT NULL,
  "source_commit" VARCHAR(40) NOT NULL,
  "legacy_claims_sha256" VARCHAR(64) NOT NULL,
  "legacy_liabilities_sha256" VARCHAR(64) NOT NULL,
  "custody_witness_sha256" VARCHAR(64) NOT NULL,
  "recovery_witness_sha256" VARCHAR(64) NOT NULL,
  "reserve_witness_sha256" VARCHAR(64) NOT NULL,
  "five_reviewer_approval_sha256" VARCHAR(64) NOT NULL,
  "chain_anchor_witness_sha256" VARCHAR(64) NOT NULL,
  "approved_at" TIMESTAMPTZ,
  "state" VARCHAR(16) NOT NULL DEFAULT 'held',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_satchel_epoch_identity" CHECK (
    chain_id = 'wolo-1' AND start_height > 0
    AND epoch_id ~ '^[A-Za-z0-9_-]{12,80}$'
    AND vault_address ~ '^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$'
    AND start_app_hash ~ '^[a-f0-9]{64}$'
    AND manifest_sha256 ~ '^[a-f0-9]{64}$'
    AND source_commit ~ '^[a-f0-9]{40}$'
    AND legacy_claims_sha256 ~ '^[a-f0-9]{64}$'
    AND legacy_liabilities_sha256 ~ '^[a-f0-9]{64}$'
    AND custody_witness_sha256 ~ '^[a-f0-9]{64}$'
    AND recovery_witness_sha256 ~ '^[a-f0-9]{64}$'
    AND reserve_witness_sha256 ~ '^[a-f0-9]{64}$'
    AND five_reviewer_approval_sha256 ~ '^[a-f0-9]{64}$'
    AND chain_anchor_witness_sha256 ~ '^[a-f0-9]{64}$'
    AND state IN ('held', 'approved')
    AND (state = 'held' OR (approved_at IS NOT NULL AND approved_at <= created_at))
  )
);
-- No two simultaneously approved prospective vaults; new epochs demand a
-- separately reviewed financial transition, never an implicit fallback.
CREATE UNIQUE INDEX "uq_satchel_single_approved_epoch"
  ON public."war_satchel_prospective_epochs" ((1)) WHERE state = 'approved';

-- A vault cannot be declared a clean prospective epoch while any old
-- funded Satchel money state exists. This does NOT delete or discharge it.
CREATE FUNCTION public."satchel_epoch_cold_start_v1"() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $
BEGIN
  IF NEW.state = 'approved' AND (
     EXISTS(SELECT 1 FROM public.war_satchel_funded_balances)
     OR EXISTS(SELECT 1 FROM public.war_satchel_funded_receipts)
     OR EXISTS(SELECT 1 FROM public.war_satchel_funded_claim_returns)
     OR EXISTS(SELECT 1 FROM public.war_satchel_funded_journal)
     OR EXISTS(SELECT 1 FROM public.war_satchel_funded_reservations)
     OR EXISTS(SELECT 1 FROM public.war_satchel_funded_withdrawals)
     OR EXISTS(SELECT 1 FROM public.war_satchel_physical_receipt_consumptions)
  ) THEN
    RAISE EXCEPTION 'SATCHEL_EPOCH_OLD_FUNDED_ESTATE_NOT_EMPTY' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "tr_satchel_epoch_cold_start" BEFORE INSERT
 ON public."war_satchel_prospective_epochs" FOR EACH ROW
 EXECUTE FUNCTION public."satchel_epoch_cold_start_v1"();

CREATE TABLE public."war_satchel_epoch_deposit_receipts" (
  "receipt_id" BIGINT PRIMARY KEY,
  "epoch_id" VARCHAR(80) NOT NULL,
  "chain_id" VARCHAR(32) NOT NULL,
  "tx_hash" VARCHAR(64) NOT NULL,
  "message_index" INTEGER NOT NULL,
  "owner_user_id" INTEGER NOT NULL,
  "vault_address" VARCHAR(100) NOT NULL,
  "canonical_height" BIGINT NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_satchel_epoch_receipt"
    FOREIGN KEY ("receipt_id") REFERENCES public."war_satchel_funded_receipts"("id") ON DELETE RESTRICT,
  CONSTRAINT "fk_satchel_epoch_registry"
    FOREIGN KEY ("epoch_id") REFERENCES public."war_satchel_prospective_epochs"("epoch_id") ON DELETE RESTRICT,
  CONSTRAINT "fk_satchel_epoch_owner"
    FOREIGN KEY ("owner_user_id") REFERENCES public."users"("id") ON DELETE RESTRICT,
  CONSTRAINT "uq_satchel_epoch_physical" UNIQUE ("chain_id","tx_hash","message_index"),
  CONSTRAINT "ck_satchel_epoch_deposit" CHECK (
    chain_id = 'wolo-1' AND message_index = 0
    AND canonical_height > 0 AND amount_uwolo > 0
    AND tx_hash ~ '^[A-F0-9]{64}$'
  )
);

CREATE FUNCTION public."satchel_epoch_receipt_guard_v1"() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $
DECLARE r RECORD; e RECORD;
BEGIN
  SELECT * INTO r FROM public.war_satchel_funded_receipts WHERE id = NEW.receipt_id;
  SELECT * INTO e FROM public.war_satchel_prospective_epochs WHERE epoch_id = NEW.epoch_id;
  IF NOT FOUND OR e.epoch_id IS NULL OR e.state <> 'approved'
    OR NEW.canonical_height <= e.start_height
    OR NEW.vault_address <> e.vault_address
    OR NEW.chain_id <> e.chain_id
    OR r.id IS NULL OR r.chain_id <> NEW.chain_id
    OR r.tx_hash <> NEW.tx_hash OR r.transfer_index <> NEW.message_index
    OR r.owner_user_id <> NEW.owner_user_id OR r.vault_address <> NEW.vault_address
    OR r.canonical_height <> NEW.canonical_height OR r.amount_uwolo <> NEW.amount_uwolo
  THEN RAISE EXCEPTION 'SATCHEL_EPOCH_RECEIPT_REFUSED' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "tr_satchel_epoch_receipt_guard" BEFORE INSERT
  ON public."war_satchel_epoch_deposit_receipts" FOR EACH ROW EXECUTE FUNCTION public."satchel_epoch_receipt_guard_v1"();

CREATE FUNCTION public."satchel_epoch_immutable_v1"() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $
BEGIN
  RAISE EXCEPTION 'SATCHEL_EPOCH_IMMUTABLE' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "tr_satchel_epoch_registry_immutable"
  BEFORE UPDATE OR DELETE ON public."war_satchel_prospective_epochs"
  FOR EACH ROW EXECUTE FUNCTION public."satchel_epoch_immutable_v1"();
CREATE TRIGGER "tr_satchel_epoch_receipts_immutable"
  BEFORE UPDATE OR DELETE ON public."war_satchel_epoch_deposit_receipts"
  FOR EACH ROW EXECUTE FUNCTION public."satchel_epoch_immutable_v1"();
CREATE TRIGGER "tr_satchel_epoch_registry_no_truncate"
  BEFORE TRUNCATE ON public."war_satchel_prospective_epochs"
  FOR EACH STATEMENT EXECUTE FUNCTION public."satchel_epoch_immutable_v1"();
CREATE TRIGGER "tr_satchel_epoch_receipts_no_truncate"
  BEFORE TRUNCATE ON public."war_satchel_epoch_deposit_receipts"
  FOR EACH STATEMENT EXECUTE FUNCTION public."satchel_epoch_immutable_v1"();
-- Privilege hardening. This migration requires a privileged, separately
-- approved FINANCIAL migrator (CREATEROLE/ownership transfer), never the
-- website deployer or application runtime. Both authority roles have NO LOGIN.
-- A mainnet registrar is enrolled separately after five-human independent
-- authentication; there is no automatic registrar LOGIN or membership grant.
DO $epoch_roles$
DECLARE n text;
BEGIN
  FOREACH n IN ARRAY ARRAY['aoe2war_epoch_finance_owner','aoe2war_epoch_credit_writer'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=n) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',n);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles
      WHERE rolname=n AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb
      OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
      RAISE EXCEPTION 'SATCHEL_EPOCH_UNSAFE_PRIVILEGED_ROLE: %',n USING ERRCODE='42501';
    END IF;
  END LOOP;
  IF EXISTS(
      SELECT 1 FROM pg_auth_members m
      JOIN pg_roles pr ON pr.oid=m.roleid
      WHERE pr.rolname='aoe2war_epoch_finance_owner'
    ) THEN
    -- Financial registration must not be implicitly enrolled by a migration.
    -- An existing enrollment requires explicit pre-migration review.
    RAISE EXCEPTION 'SATCHEL_EPOCH_FINANCE_ROLE_PREENROLLED' USING ERRCODE='42501';
  END IF;
END
$epoch_roles$;

-- Object ownership, not merely REVOKE FROM PUBLIC, is critical:
-- a deployment/app role owning the table could INSERT approved epochs anyway.
ALTER TABLE public."war_satchel_prospective_epochs" OWNER TO aoe2war_epoch_finance_owner;
ALTER TABLE public."war_satchel_epoch_deposit_receipts" OWNER TO aoe2war_epoch_finance_owner;
ALTER FUNCTION public."satchel_epoch_cold_start_v1"() OWNER TO aoe2war_epoch_finance_owner;
ALTER FUNCTION public."satchel_epoch_receipt_guard_v1"() OWNER TO aoe2war_epoch_finance_owner;
ALTER FUNCTION public."satchel_epoch_immutable_v1"() OWNER TO aoe2war_epoch_finance_owner;
REVOKE ALL ON public."war_satchel_prospective_epochs", public."war_satchel_epoch_deposit_receipts" FROM PUBLIC;
GRANT SELECT ON public."war_satchel_prospective_epochs" TO aoe2war_epoch_credit_writer;
GRANT SELECT, INSERT ON public."war_satchel_epoch_deposit_receipts" TO aoe2war_epoch_credit_writer;
-- Runtime account membership in credit_writer (and denial of finance_owner)
-- is provisioned out of band, then witnessed on the actual production role.
-- A role holding finance_owner can register a held/approved epoch only after
-- real custody, H*, solvency and signed five-human review. It must NEVER be
-- the app login, owner of the website tables, or routine Prisma deploy role.
