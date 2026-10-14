-- C3a WAR SATCHEL ACCOUNTING FOUNDATION -- SIMULATION ONLY
-- Requires C1/C2 migrations. NEVER run ad hoc against live production.
-- This is not a custody balance: zero APIs, transfer routes or credit executors.
-- The intentionally strict simulation source check blocks live-money use.

CREATE TABLE "war_satchel_ledger_accounts" (
  "id" BIGSERIAL PRIMARY KEY,
  "account_key" VARCHAR(160) NOT NULL,
  "owner_user_id" INTEGER,
  "account_kind" VARCHAR(36) NOT NULL,
  "chain_id" VARCHAR(32) NOT NULL DEFAULT 'wolo-1',
  "denom" VARCHAR(24) NOT NULL DEFAULT 'uwolo',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "war_satchel_ledger_valid_kind" CHECK (
    ("account_kind" = 'vault_asset' AND "owner_user_id" IS NULL) OR
    ("account_kind" IN ('user_available_liability','user_reserved_liability') AND "owner_user_id" IS NOT NULL)
  ),
  CONSTRAINT "war_satchel_ledger_chain" CHECK ("chain_id" = 'wolo-1'),
  CONSTRAINT "war_satchel_ledger_denom" CHECK ("denom" = 'uwolo')
);
CREATE UNIQUE INDEX "uq_war_satchel_ledger_account_key" ON "war_satchel_ledger_accounts" ("account_key");
CREATE INDEX "ix_war_satchel_ledger_owner_kind" ON "war_satchel_ledger_accounts" ("owner_user_id", "account_kind");
ALTER TABLE "war_satchel_ledger_accounts"
  ADD CONSTRAINT "war_satchel_ledger_accounts_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE TABLE "war_satchel_ledger_journals" (
  "id" UUID NOT NULL PRIMARY KEY,
  "source_kind" VARCHAR(24) NOT NULL DEFAULT 'simulation',
  "source_key" VARCHAR(180) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "war_satchel_ledger_simulation_only" CHECK ("source_kind" = 'simulation'),
  CONSTRAINT "war_satchel_ledger_simulation_source" CHECK ("source_key" LIKE 'simulation:%')
);
CREATE UNIQUE INDEX "uq_war_satchel_ledger_source_key" ON "war_satchel_ledger_journals" ("source_key");

CREATE TABLE "war_satchel_ledger_postings" (
  "id" BIGSERIAL NOT NULL PRIMARY KEY,
  "journal_id" UUID NOT NULL,
  "account_id" BIGINT NOT NULL,
  "delta_uwolo" BIGINT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "war_satchel_nonzero_signed_posting" CHECK ("delta_uwolo" <> 0)
);
CREATE UNIQUE INDEX "uq_war_satchel_posting_one_entry_per_account"
  ON "war_satchel_ledger_postings" ("journal_id", "account_id");
CREATE INDEX "ix_war_satchel_postings_account_time"
  ON "war_satchel_ledger_postings" ("account_id", "created_at");
ALTER TABLE "war_satchel_ledger_postings"
  ADD CONSTRAINT "war_satchel_postings_journal_id_fkey"
  FOREIGN KEY ("journal_id") REFERENCES "war_satchel_ledger_journals" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "war_satchel_ledger_postings"
  ADD CONSTRAINT "war_satchel_postings_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "war_satchel_ledger_accounts" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- The record is a financial audit trail, even when only synthetic.
-- Owner, source, journal and signed posting can NEVER be rewritten or deleted.
CREATE FUNCTION war_satchel_ledger_append_only_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $wolo_append_only$
BEGIN
  RAISE EXCEPTION 'War Satchel ledger rows are immutable and append-only';
END;
$wolo_append_only$;
CREATE TRIGGER war_satchel_accounts_append_only
BEFORE UPDATE OR DELETE ON "war_satchel_ledger_accounts"
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_append_only_guard();
CREATE TRIGGER war_satchel_journals_append_only
BEFORE UPDATE OR DELETE ON "war_satchel_ledger_journals"
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_append_only_guard();
CREATE TRIGGER war_satchel_postings_append_only
BEFORE UPDATE OR DELETE ON "war_satchel_ledger_postings"
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_append_only_guard();

-- PostgreSQL deferred constraint triggers verify the complete *transaction*
-- rather than a temporarily incomplete journal after its first posting.
-- All account balances use exact integer uwolo, never floats.
-- Liability account delta < 0 means the platform owes the user;
-- positive liability would spend credit that does not exist.
-- This sandbox refuses any account overdraft or unsupported vault spending.
CREATE FUNCTION war_satchel_assert_balanced_sandbox_journal()
RETURNS TRIGGER LANGUAGE plpgsql AS $wolo_balance$
DECLARE
  source_id UUID;
  posting_count BIGINT;
  total NUMERIC;
  violating_accounts BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'war_satchel_ledger_journals' THEN
    source_id := NEW."id";
  ELSE
    source_id := NEW."journal_id";
  END IF;

  SELECT count(*)::BIGINT, COALESCE(sum("delta_uwolo"::NUMERIC), 0)
  INTO posting_count, total
  FROM "war_satchel_ledger_postings"
  WHERE "journal_id" = source_id;

  IF posting_count < 2 OR total <> 0 THEN
    RAISE EXCEPTION 'War Satchel journal must have >= 2 postings and balance to zero';
  END IF;

  -- Any account exceeding its available credit breaks financial invariants.
  SELECT count(*) INTO violating_accounts FROM (
    SELECT a."id", a."account_kind",
           COALESCE(sum(p."delta_uwolo"::NUMERIC), 0) AS account_balance
    FROM "war_satchel_ledger_accounts" a
    JOIN "war_satchel_ledger_postings" p ON p."account_id" = a."id"
    GROUP BY a."id", a."account_kind"
  ) ledger
  WHERE (account_kind = 'vault_asset' AND account_balance < 0)
     OR (account_kind IN ('user_available_liability', 'user_reserved_liability')
         AND account_balance > 0);

  IF violating_accounts > 0 THEN
    RAISE EXCEPTION 'War Satchel account overdraft / unfunded simulation movement';
  END IF;
  RETURN NULL;
END;
$wolo_balance$;
CREATE CONSTRAINT TRIGGER war_satchel_journal_commit_balanced
AFTER INSERT ON "war_satchel_ledger_journals"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION war_satchel_assert_balanced_sandbox_journal();
CREATE CONSTRAINT TRIGGER war_satchel_posting_commit_balanced
AFTER INSERT ON "war_satchel_ledger_postings"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION war_satchel_assert_balanced_sandbox_journal();

-- NO custody address, chain signer, public deposit route or automatic bet
-- has access to this test ledger. Real money posting must remain blocked
-- until audited vault reserve verification and a NEW migration/source gate.
