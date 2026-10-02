/*
 * Championship Challenge V2 reuses scheduled_matches as its per-seat financial
 * ledger. The original protocol allow-list predates championship_v2 and allowed
 * only steam_wolo_v1, so valid V2 challenge creation was rejected by PostgreSQL.
 *
 * Legacy rows remain protocol_version NULL. Every versioned row must retain two
 * distinct valid Steam ID64 snapshots; no historical row is rewritten here.
 *
 * This is a proof-bound replacement of two existing PostgreSQL CHECK
 * constraints. Release Recovery independently verifies these exact live
 * definitions before and after the durable pre-migration pg_dump.
 */
-- AOE2WAR-MIGRATION-MODE: PRODUCTION_PROVEN_CHECK_REPLACEMENT
-- AOE2WAR-PRODUCTION-CHECK: scheduled_matches ck_scheduled_matches_protocol_version before_sha256=4556ea241adef098ef9cc3a4bed540dd6362ae25f6a024571e4e6dffbccff7d4 after_sha256=5360090c2838853d83c710893bdf25bf607732e6565a6df47da0878b5c0908e8
-- AOE2WAR-PRODUCTION-CHECK: scheduled_matches ck_scheduled_matches_steam_wolo_identity before_sha256=a87421a52c6ceb502aaf3c074a40a4c938a496a697dac446dfb17f74b50e9cf3 after_sha256=fea8defdbfaaaa3e33a66399043f8932249b4e2326ccee23ffae587d560ffa59

BEGIN;

ALTER TABLE "scheduled_matches"
  DROP CONSTRAINT "ck_scheduled_matches_protocol_version";

ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "ck_scheduled_matches_protocol_version"
  CHECK (
    "protocol_version" IS NULL OR
    "protocol_version" IN ('steam_wolo_v1', 'championship_v2')
  );

ALTER TABLE "scheduled_matches"
  DROP CONSTRAINT "ck_scheduled_matches_steam_wolo_identity";

ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "ck_scheduled_matches_steam_wolo_identity"
  CHECK (
    "protocol_version" IS NULL OR (
      "challenger_steam_id_snapshot" ~ '^[0-9]{15,20}$' AND
      "challenged_steam_id_snapshot" ~ '^[0-9]{15,20}$' AND
      "challenger_steam_id_snapshot" <> "challenged_steam_id_snapshot"
    )
  );

COMMIT;
