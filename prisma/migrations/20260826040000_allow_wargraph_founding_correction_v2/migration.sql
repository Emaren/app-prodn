-- AOE2WAR-MIGRATION-MODE: PRODUCTION_PROVEN_CHECK_REPLACEMENT
-- AOE2WAR-PRODUCTION-CHECK: war_graph_movements ck_war_graph_movements_geometry before_sha256=2189d4b1d5aa93fbe659f0a7033efc1e4995f0938cb7b8b24f05aa087f53338f after_sha256=0b72d1b4f2d2168d33f5326dc57bd71e3c9bd7345827ad3b798deab70e23d279

/*
 * WarGraph founding-board correction V2.
 *
 * Preserve V1 and authorize only the non-Crown layer transitions used by the
 * final founding correction:
 *
 *   Ring I -> Ring II
 *   Ring I -> Frontier
 *   Ring II -> Frontier
 *   Frontier -> Ring I
 *   Frontier -> Ring II
 *   Frontier -> Frontier
 *
 * V2 remains:
 * - administrative founding correction only
 * - no contest
 * - no night/action semantics
 * - no Crown movement
 * - exact V2 reason code
 */

BEGIN;

ALTER TABLE "war_graph_movements"
  DROP CONSTRAINT "ck_war_graph_movements_geometry";

ALTER TABLE "war_graph_movements"
  ADD CONSTRAINT "ck_war_graph_movements_geometry"
  CHECK (
    (
      "movement_type" = 'INITIAL_ASSIGNMENT' AND
      "from_node_id" IS NULL AND
      "from_layer_ordinal" IS NULL AND
      "to_layer_ordinal" BETWEEN 0 AND 3 AND
      "night_id" IS NULL AND
      "contest_id" IS NULL
    ) OR
    (
      "movement_type" IN ('BATTLE_ADVANCE', 'SEAT_CLAIM') AND
      "from_node_id" IS NOT NULL AND
      "from_layer_ordinal" IS NOT NULL AND
      "to_layer_ordinal" = "from_layer_ordinal" - 1 AND
      "contest_id" IS NOT NULL
    ) OR
    (
      "movement_type" = 'CATASTROPHIC_FALL' AND
      "from_node_id" IS NOT NULL AND
      "from_layer_ordinal" BETWEEN 0 AND 2 AND
      "to_layer_ordinal" = 3 AND
      "contest_id" IS NOT NULL
    ) OR
    (
      "movement_type" = 'GRAVITY_MOVE' AND
      "from_node_id" IS NOT NULL AND
      "from_layer_ordinal" IS NOT NULL AND
      "to_layer_ordinal" > 0 AND
      "to_layer_ordinal" < "from_layer_ordinal" AND
      "contest_id" IS NULL
    ) OR
    (
      "movement_type" = 'FOUNDING_CORRECTION' AND
      "reason_code" = 'FOUNDING_BOARD_CORRECTION_V1' AND
      "from_node_id" IS NOT NULL AND
      (
        (
          "from_layer_ordinal" = 2 AND
          "to_layer_ordinal" = 2
        ) OR
        (
          "from_layer_ordinal" = 3 AND
          "to_layer_ordinal" = 2
        )
      ) AND
      "night_id" IS NULL AND
      "contest_id" IS NULL
    ) OR
    (
      "movement_type" = 'FOUNDING_CORRECTION' AND
      "reason_code" = 'FOUNDING_BOARD_CORRECTION_V2' AND
      "from_node_id" IS NOT NULL AND
      (
        ("from_layer_ordinal" = 1 AND "to_layer_ordinal" = 2) OR
        ("from_layer_ordinal" = 1 AND "to_layer_ordinal" = 3) OR
        ("from_layer_ordinal" = 2 AND "to_layer_ordinal" = 3) OR
        ("from_layer_ordinal" = 3 AND "to_layer_ordinal" = 1) OR
        ("from_layer_ordinal" = 3 AND "to_layer_ordinal" = 2) OR
        ("from_layer_ordinal" = 3 AND "to_layer_ordinal" = 3)
      ) AND
      "night_id" IS NULL AND
      "contest_id" IS NULL
    )
  );

COMMIT;
