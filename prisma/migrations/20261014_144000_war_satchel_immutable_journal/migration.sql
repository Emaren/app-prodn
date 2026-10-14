-- Gate C3a: empty, append-only Wolo Satchel accounting evidence only.
-- No chain verification, token transfer, custody signer, spendable balance
-- endpoint, payout, refund, ticket, or producer action is introduced here.

CREATE TABLE "war_satchel_ledger_accounts" (
  "id" BIGSERIAL NOT NULL,
  "user_id" INTEGER,
  "chain_id" VARCHAR(32) NOT NULL DEFAULT 'wolo-1',
  "denom" VARCHAR(16) NOT NULL DEFAULT 'uwolo',
  "bucket" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "war_satchel_ledger_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "war_satchel_ledger_accounts_currency" CHECK ("chain_id"='wolo-1' AND "denom"='uwolo'),
  CONSTRAINT "war_satchel_ledger_accounts_bucket" CHECK (
    ("user_id" IS NULL AND "bucket"='vault_asset') OR
    ("user_id" IS NOT NULL AND "bucket" IN ('available','reserved','committed','withdrawing','withdrawn'))
  )
);
CREATE UNIQUE INDEX "uq_war_satchel_ledger_owner_bucket" ON "war_satchel_ledger_accounts" ("user_id","bucket");
CREATE UNIQUE INDEX "uq_war_satchel_ledger_single_vault" ON "war_satchel_ledger_accounts" ("bucket") WHERE "user_id" IS NULL;
ALTER TABLE "war_satchel_ledger_accounts"
  ADD CONSTRAINT "war_satchel_ledger_accounts_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE TABLE "war_satchel_ledger_journals" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL,
  "source_key" VARCHAR(180) NOT NULL,
  "event_kind" VARCHAR(32) NOT NULL,
  "proof_candidate_id" BIGINT,
  -- PostgreSQL transaction ID pins ALL postings to journal creation tx.
  -- A journal cannot acquire new rows in a subsequent transaction.
  "created_txid" BIGINT NOT NULL DEFAULT txid_current(),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "war_satchel_ledger_journals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "war_satchel_ledger_source_format" CHECK (length("source_key") BETWEEN 5 AND 180),
  CONSTRAINT "war_satchel_ledger_kind" CHECK (
    "event_kind" IN ('deposit','reserve','release','commit',
                     'verified_refund','withdraw_hold','withdraw_cancel','withdraw_confirmed')
  ),
  CONSTRAINT "war_satchel_ledger_deposit_proof" CHECK (
    ("event_kind"='deposit' AND "proof_candidate_id" IS NOT NULL) OR
    ("event_kind"<>'deposit' AND "proof_candidate_id" IS NULL)
  )
);
CREATE UNIQUE INDEX "uq_war_satchel_ledger_source" ON "war_satchel_ledger_journals" ("source_key");
CREATE UNIQUE INDEX "uq_war_satchel_ledger_proof" ON "war_satchel_ledger_journals" ("proof_candidate_id");
CREATE UNIQUE INDEX "uq_war_satchel_ledger_journal_owner" ON "war_satchel_ledger_journals" ("id","user_id");
CREATE INDEX "ix_war_satchel_ledger_owner_history" ON "war_satchel_ledger_journals" ("user_id","created_at");
ALTER TABLE "war_satchel_ledger_journals" ADD CONSTRAINT "war_satchel_ledger_journals_user_fkey"
 FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "war_satchel_ledger_journals" ADD CONSTRAINT "war_satchel_ledger_journals_proof_fkey"
 FOREIGN KEY ("proof_candidate_id") REFERENCES "war_satchel_proof_candidates" ("id")
 ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE TABLE "war_satchel_ledger_postings" (
  "id" BIGSERIAL NOT NULL,
  "journal_id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL,
  "account_id" BIGINT NOT NULL,
  -- Accounting convention: vault asset + is receipt; player liability -
  -- is owed WOLO. No application is authorized to spend this representation.
  "delta_uwolo" BIGINT NOT NULL,
  CONSTRAINT "war_satchel_ledger_postings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "war_satchel_ledger_nonzero_posting" CHECK ("delta_uwolo"<>0)
);
CREATE UNIQUE INDEX "uq_war_satchel_ledger_single_account_line"
 ON "war_satchel_ledger_postings" ("journal_id","account_id");
CREATE INDEX "ix_war_satchel_ledger_account_history"
 ON "war_satchel_ledger_postings" ("account_id","journal_id");
ALTER TABLE "war_satchel_ledger_postings" ADD CONSTRAINT "war_satchel_ledger_postings_journal_owner_fkey"
 FOREIGN KEY ("journal_id","user_id") REFERENCES "war_satchel_ledger_journals" ("id","user_id")
 ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "war_satchel_ledger_postings" ADD CONSTRAINT "war_satchel_ledger_postings_account_fkey"
 FOREIGN KEY ("account_id") REFERENCES "war_satchel_ledger_accounts" ("id")
 ON DELETE RESTRICT ON UPDATE NO ACTION;

-- No subsequent transaction can append to a signed-off immutable journal.
CREATE FUNCTION war_satchel_ledger_posting_insert_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $ledger_insert$
DECLARE
  journal_txid BIGINT;
  journal_owner INTEGER;
  account_owner INTEGER;
BEGIN
  SELECT "created_txid","user_id" INTO journal_txid,journal_owner
    FROM "war_satchel_ledger_journals" WHERE "id"=NEW."journal_id";
  SELECT "user_id" INTO account_owner FROM "war_satchel_ledger_accounts"
    WHERE "id"=NEW."account_id";
  IF journal_txid IS NULL OR journal_txid<>txid_current() THEN
    RAISE EXCEPTION 'Posting may only join its journal creation transaction';
  END IF;
  IF journal_owner IS DISTINCT FROM NEW."user_id" THEN
    RAISE EXCEPTION 'Journal posting owner mismatch';
  END IF;
  IF account_owner IS NOT NULL AND account_owner<>NEW."user_id" THEN
    RAISE EXCEPTION 'Cross-user Satchel ledger posting';
  END IF;
  RETURN NEW;
END;
$ledger_insert$;
CREATE TRIGGER war_satchel_ledger_posting_insert_guard
BEFORE INSERT ON "war_satchel_ledger_postings"
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_posting_insert_guard();

CREATE FUNCTION war_satchel_ledger_journal_insert_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $ledger_journal$
DECLARE
  proof_owner INTEGER;
BEGIN
  IF NEW."created_txid"<>txid_current() THEN
    RAISE EXCEPTION 'Journal must use server transaction identity';
  END IF;
  IF NEW."proof_candidate_id" IS NOT NULL THEN
    SELECT "user_id" INTO proof_owner
      FROM "war_satchel_proof_candidates" WHERE "id"=NEW."proof_candidate_id";
    IF proof_owner IS DISTINCT FROM NEW."user_id" THEN
      RAISE EXCEPTION 'Ledger deposit proof does not belong to journal owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$ledger_journal$;
CREATE TRIGGER war_satchel_ledger_journal_insert_guard
BEFORE INSERT ON "war_satchel_ledger_journals"
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_journal_insert_guard();

-- DEFERRABLE: client inserts header + multiple lines in a SINGLE SQL tx.
-- Commit fails if entries are unbalanced or fewer than two.
CREATE FUNCTION war_satchel_ledger_assert_balanced()
RETURNS TRIGGER LANGUAGE plpgsql AS $ledger_balanced$
DECLARE
  total BIGINT;
  lines INTEGER;
BEGIN
  SELECT COALESCE(SUM("delta_uwolo"),0), COUNT(*)
    INTO total,lines FROM "war_satchel_ledger_postings"
    WHERE "journal_id"=NEW."id";
  IF lines < 2 OR total<>0 THEN
    RAISE EXCEPTION 'Unbalanced or empty War Satchel financial journal';
  END IF;
  RETURN NEW;
END;
$ledger_balanced$;
CREATE CONSTRAINT TRIGGER war_satchel_ledger_balanced_on_commit
AFTER INSERT ON "war_satchel_ledger_journals"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_assert_balanced();

CREATE FUNCTION war_satchel_ledger_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $ledger_immutable$
BEGIN
  RAISE EXCEPTION 'Posted War Satchel financial evidence is immutable';
END;
$ledger_immutable$;
CREATE TRIGGER war_satchel_ledger_accounts_immutable
BEFORE UPDATE OR DELETE ON "war_satchel_ledger_accounts"
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_immutable();
CREATE TRIGGER war_satchel_ledger_journals_immutable
BEFORE UPDATE OR DELETE ON "war_satchel_ledger_journals"
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_immutable();
CREATE TRIGGER war_satchel_ledger_postings_immutable
BEFORE UPDATE OR DELETE ON "war_satchel_ledger_postings"
FOR EACH ROW EXECUTE FUNCTION war_satchel_ledger_immutable();
