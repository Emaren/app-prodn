/*
 * Challenge Protocol V1 — immutable Steam duel identity and stable winner authority.
 * Existing rows intentionally remain NULL/legacy; current profile identity is not
 * historical proof and must never be fabricated into old Challenge records.
 */
ALTER TABLE "scheduled_matches"
  ADD COLUMN "protocol_version" VARCHAR(32),
  ADD COLUMN "challenger_steam_id_snapshot" VARCHAR(32),
  ADD COLUMN "challenged_steam_id_snapshot" VARCHAR(32),
  ADD COLUMN "result_winner_user_id" INTEGER;

ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "ck_scheduled_matches_protocol_version"
  CHECK (
    "protocol_version" IS NULL OR
    "protocol_version" = 'steam_wolo_v1'
  );

ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "ck_scheduled_matches_steam_wolo_identity"
  CHECK (
    "protocol_version" IS DISTINCT FROM 'steam_wolo_v1' OR (
      "challenger_steam_id_snapshot" ~ '^[0-9]{15,20}$' AND
      "challenged_steam_id_snapshot" ~ '^[0-9]{15,20}$' AND
      "challenger_steam_id_snapshot" <> "challenged_steam_id_snapshot"
    )
  );

ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "ck_scheduled_matches_result_winner_participant"
  CHECK (
    "result_winner_user_id" IS NULL OR
    "result_winner_user_id" IN ("challenger_user_id", "challenged_user_id")
  );

ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "scheduled_matches_result_winner_user_id_fkey"
  FOREIGN KEY ("result_winner_user_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

CREATE INDEX "ix_scheduled_matches_result_winner_user_id"
  ON "scheduled_matches"("result_winner_user_id");
