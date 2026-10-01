/*
 * Championship Challenge V2 reuses scheduled_matches as its per-seat financial
 * ledger. The original protocol allow-list predates championship_v2 and allowed
 * only steam_wolo_v1, so valid V2 challenge creation was rejected by PostgreSQL.
 *
 * Legacy rows remain protocol_version NULL. Every versioned row must retain two
 * distinct valid Steam ID64 snapshots; no historical row is rewritten here.
 */
ALTER TABLE "scheduled_matches"
  DROP CONSTRAINT IF EXISTS "ck_scheduled_matches_protocol_version";

ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "ck_scheduled_matches_protocol_version"
  CHECK (
    "protocol_version" IS NULL OR
    "protocol_version" IN ('steam_wolo_v1', 'championship_v2')
  );

ALTER TABLE "scheduled_matches"
  DROP CONSTRAINT IF EXISTS "ck_scheduled_matches_steam_wolo_identity";

ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "ck_scheduled_matches_steam_wolo_identity"
  CHECK (
    "protocol_version" IS NULL OR (
      "challenger_steam_id_snapshot" ~ '^[0-9]{15,20}$' AND
      "challenged_steam_id_snapshot" ~ '^[0-9]{15,20}$' AND
      "challenger_steam_id_snapshot" <> "challenged_steam_id_snapshot"
    )
  );
