-- C2b: Keplr wallet OWNERSHIP challenge only, never credit or custody.
CREATE TABLE "war_satchel_wallet_challenges" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL,
  "owner_uid" VARCHAR(100) NOT NULL,
  "wallet_address" VARCHAR(100) NOT NULL,
  "nonce" VARCHAR(32) NOT NULL,
  "issued_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "consumed_at" TIMESTAMP(6),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "war_satchel_wallet_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "war_satchel_wallet_nonce_format" CHECK ("nonce" ~ '^[a-f0-9]{32}$'),
  CONSTRAINT "war_satchel_wallet_time_window" CHECK (
    "expires_at" > "issued_at" AND
    "expires_at" <= "issued_at" + INTERVAL '10 minutes'
  ),
  CONSTRAINT "war_satchel_wallet_attempt_bounds" CHECK ("attempts" >= 0 AND "attempts" <= 5),
  CONSTRAINT "war_satchel_wallet_consume_clock" CHECK (
    "consumed_at" IS NULL OR
    ("consumed_at" >= "issued_at" AND "consumed_at" < "expires_at")
  )
);
CREATE UNIQUE INDEX "uq_war_satchel_wallet_nonce" ON "war_satchel_wallet_challenges" ("nonce");
CREATE INDEX "ix_war_satchel_wallet_actor_issue" ON "war_satchel_wallet_challenges" ("user_id", "issued_at");
CREATE INDEX "ix_war_satchel_wallet_actor_expiry" ON "war_satchel_wallet_challenges" ("user_id", "expires_at");
ALTER TABLE "war_satchel_wallet_challenges"
  ADD CONSTRAINT "war_satchel_wallet_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE FUNCTION war_satchel_wallet_challenge_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $wolo_wallet_lock$
BEGIN
  IF (NEW."id", NEW."user_id", NEW."owner_uid", NEW."wallet_address",
      NEW."nonce", NEW."issued_at", NEW."expires_at")
     IS DISTINCT FROM
     (OLD."id", OLD."user_id", OLD."owner_uid", OLD."wallet_address",
      OLD."nonce", OLD."issued_at", OLD."expires_at")
  THEN
    RAISE EXCEPTION 'Wallet challenge owner/address/nonce is immutable';
  END IF;
  IF OLD."consumed_at" IS NOT NULL AND
     NEW."consumed_at" IS DISTINCT FROM OLD."consumed_at"
  THEN
    RAISE EXCEPTION 'Consumed wallet challenge cannot be replayed or changed';
  END IF;
  IF NEW."attempts" < OLD."attempts" THEN
    RAISE EXCEPTION 'Wallet proof failed-attempt count cannot decrease';
  END IF;
  RETURN NEW;
END;
$wolo_wallet_lock$;
CREATE TRIGGER war_satchel_wallet_challenge_immutable
BEFORE UPDATE ON "war_satchel_wallet_challenges"
FOR EACH ROW EXECUTE FUNCTION war_satchel_wallet_challenge_lock();
