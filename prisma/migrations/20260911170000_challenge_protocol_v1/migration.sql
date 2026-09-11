/*
 * Challenge Protocol V1 — immutable Steam duel identity and stable winner authority.
 * Existing rows intentionally remain NULL/legacy; current profile identity is not
 * historical proof and must never be fabricated into old Challenge records.
 */
ALTER TABLE "scheduled_matches"
  ADD COLUMN "protocol_version" VARCHAR(32);

ALTER TABLE "scheduled_matches"
  ADD COLUMN "challenger_steam_id_snapshot" VARCHAR(32);

ALTER TABLE "scheduled_matches"
  ADD COLUMN "challenged_steam_id_snapshot" VARCHAR(32);

ALTER TABLE "scheduled_matches"
  ADD COLUMN "result_winner_side" VARCHAR(16);

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
  ADD CONSTRAINT "ck_scheduled_matches_result_winner_side"
  CHECK (
    "result_winner_side" IS NULL OR
    "result_winner_side" IN ('challenger', 'challenged')
  );
