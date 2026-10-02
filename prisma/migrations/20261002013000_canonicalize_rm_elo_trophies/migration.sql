-- Canonicalize the Random Map ELO championship family.
--
-- Historical Elite/Veteran rows predate the explicit RM/DM custody split.
-- Rename those rows in place so their numeric PKs and all dependent history
-- remain intact, then materialize the three missing RM divisions.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "trophies" WHERE "trophy_id" = 'elite_champion_belt'
  ) AND EXISTS (
    SELECT 1 FROM "trophies" WHERE "trophy_id" = 'elo-elite'
  ) THEN
    RAISE EXCEPTION 'cannot canonicalize RM Elite: legacy and canonical trophy rows both exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "trophies" WHERE "trophy_id" = 'veteran_champion_rm'
  ) AND EXISTS (
    SELECT 1 FROM "trophies" WHERE "trophy_id" = 'elo-veteran'
  ) THEN
    RAISE EXCEPTION 'cannot canonicalize RM Veteran: legacy and canonical trophy rows both exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "trophies" WHERE "trophy_id" = 'elite_champion_belt'
  ) AND NOT EXISTS (
    SELECT 1 FROM "trophies" WHERE "trophy_id" = 'elo-elite'
  ) THEN
    UPDATE "trophies"
    SET
      "trophy_id" = 'elo-elite',
      "display_name" = 'RM Elite Championship',
      "tier" = 'Elite',
      "status" = CASE WHEN "status" = 'draft' THEN 'vacant' ELSE "status" END,
      "elo_band_min" = 1800,
      "elo_band_max" = 2099,
      "nft_id" = 'elo-elite',
      "nft_metadata_uri" = '/api/trophies/elo-elite/metadata',
      "nft_image_uri" = '/champions/belts/elo-elite.webp',
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "trophy_id" = 'elite_champion_belt';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "trophies" WHERE "trophy_id" = 'veteran_champion_rm'
  ) AND NOT EXISTS (
    SELECT 1 FROM "trophies" WHERE "trophy_id" = 'elo-veteran'
  ) THEN
    UPDATE "trophies"
    SET
      "trophy_id" = 'elo-veteran',
      "display_name" = 'RM Veteran Championship',
      "tier" = 'Veteran',
      "status" = CASE WHEN "status" = 'draft' THEN 'vacant' ELSE "status" END,
      "elo_band_min" = 1500,
      "elo_band_max" = 1799,
      "nft_id" = 'elo-veteran',
      "nft_metadata_uri" = '/api/trophies/elo-veteran/metadata',
      "nft_image_uri" = '/champions/belts/elo-veteran.webp',
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "trophy_id" = 'veteran_champion_rm';
  END IF;
END
$$;

INSERT INTO "trophies" (
  "trophy_id",
  "display_name",
  "kind",
  "family",
  "tier",
  "status",
  "elo_band_min",
  "elo_band_max",
  "current_bounty_wolo",
  "tribute_amount_wolo",
  "bounty_growth_wolo",
  "payout_frequency",
  "bounty_accrual_frequency",
  "nft_class_id",
  "nft_id",
  "nft_metadata_uri",
  "nft_image_uri",
  "chain_status"
)
VALUES
  ('elo-rising', 'RM Rising Championship', 'belt', 'elo', 'Rising', 'vacant', NULL, 1199, 0, 1, 1, 'daily', 'daily', 'aoe2war.wartrophy.elo', 'elo-rising', '/api/trophies/elo-rising/metadata', '/champions/belts/elo-rising.webp', 'app_only'),
  ('elo-challenger', 'RM Challenger Championship', 'belt', 'elo', 'Challenger', 'vacant', 1200, 1499, 0, 2, 2, 'daily', 'daily', 'aoe2war.wartrophy.elo', 'elo-challenger', '/api/trophies/elo-challenger/metadata', '/champions/belts/elo-challenger.webp', 'app_only'),
  ('elo-veteran', 'RM Veteran Championship', 'belt', 'elo', 'Veteran', 'vacant', 1500, 1799, 0, 3, 3, 'daily', 'daily', 'aoe2war.wartrophy.elo', 'elo-veteran', '/api/trophies/elo-veteran/metadata', '/champions/belts/elo-veteran.webp', 'app_only'),
  ('elo-elite', 'RM Elite Championship', 'belt', 'elo', 'Elite', 'vacant', 1800, 2099, 0, 4, 4, 'daily', 'daily', 'aoe2war.wartrophy.elo', 'elo-elite', '/api/trophies/elo-elite/metadata', '/champions/belts/elo-elite.webp', 'app_only'),
  ('elo-legend', 'RM Legend Championship', 'belt', 'elo', 'Legend', 'vacant', 2100, NULL, 0, 5, 5, 'daily', 'daily', 'aoe2war.wartrophy.elo', 'elo-legend', '/api/trophies/elo-legend/metadata', '/champions/belts/elo-legend.webp', 'app_only')
ON CONFLICT ("trophy_id") DO UPDATE
SET
  "display_name" = EXCLUDED."display_name",
  "family" = 'elo',
  "tier" = EXCLUDED."tier",
  "status" = CASE
    WHEN "trophies"."status" = 'draft' THEN 'vacant'
    ELSE "trophies"."status"
  END,
  "elo_band_min" = EXCLUDED."elo_band_min",
  "elo_band_max" = EXCLUDED."elo_band_max",
  "tribute_amount_wolo" = EXCLUDED."tribute_amount_wolo",
  "bounty_growth_wolo" = EXCLUDED."bounty_growth_wolo",
  "payout_frequency" = EXCLUDED."payout_frequency",
  "bounty_accrual_frequency" = EXCLUDED."bounty_accrual_frequency",
  "nft_class_id" = EXCLUDED."nft_class_id",
  "nft_id" = EXCLUDED."nft_id",
  "nft_metadata_uri" = EXCLUDED."nft_metadata_uri",
  "nft_image_uri" = EXCLUDED."nft_image_uri",
  "updated_at" = CURRENT_TIMESTAMP;

WITH desired("trophy_id", "amount_wolo") AS (
  VALUES
    ('elo-rising', 1),
    ('elo-challenger', 2),
    ('elo-veteran', 3),
    ('elo-elite', 4),
    ('elo-legend', 5)
)
UPDATE "trophy_economics_versions" v
SET "effective_to" = CURRENT_TIMESTAMP
FROM "trophies" t
JOIN desired d ON d."trophy_id" = t."trophy_id"
WHERE v."trophy_id" = t."id"
  AND v."effective_to" IS NULL
  AND (
    v."tribute_amount_wolo" <> d."amount_wolo"
    OR v."bounty_growth_wolo" <> d."amount_wolo"
    OR v."payout_frequency" <> 'daily'
    OR v."bounty_accrual_frequency" <> 'daily'
  );

WITH desired("trophy_id", "amount_wolo") AS (
  VALUES
    ('elo-rising', 1),
    ('elo-challenger', 2),
    ('elo-veteran', 3),
    ('elo-elite', 4),
    ('elo-legend', 5)
)
INSERT INTO "trophy_economics_versions" (
  "trophy_id",
  "tribute_amount_wolo",
  "bounty_growth_wolo",
  "payout_frequency",
  "bounty_accrual_frequency",
  "reason"
)
SELECT
  t."id",
  d."amount_wolo",
  d."amount_wolo",
  'daily',
  'daily',
  'Canonical RM ELO championship registry seed.'
FROM "trophies" t
JOIN desired d ON d."trophy_id" = t."trophy_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "trophy_economics_versions" v
  WHERE v."trophy_id" = t."id"
    AND v."effective_to" IS NULL
    AND v."tribute_amount_wolo" = d."amount_wolo"
    AND v."bounty_growth_wolo" = d."amount_wolo"
    AND v."payout_frequency" = 'daily'
    AND v."bounty_accrual_frequency" = 'daily'
);

INSERT INTO "trophy_events" (
  "trophy_id",
  "event_type",
  "actor_role",
  "initiated_by",
  "status",
  "raw_response"
)
SELECT
  t."id",
  'TROPHY_CREATED',
  'system',
  'system',
  'recorded',
  jsonb_build_object(
    'registryRepair', 'rm_elo_canonicalization',
    'canonicalTrophyId', t."trophy_id"
  )
FROM "trophies" t
WHERE t."trophy_id" IN (
  'elo-rising',
  'elo-challenger',
  'elo-veteran',
  'elo-elite',
  'elo-legend'
)
AND NOT EXISTS (
  SELECT 1
  FROM "trophy_events" e
  WHERE e."trophy_id" = t."id"
);
