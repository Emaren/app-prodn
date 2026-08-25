-- AOE2WAR-MIGRATION-MODE: PRODUCTION_PROVEN_CHECK_REPLACEMENT
-- AOE2WAR-PRODUCTION-CHECK: war_graph_movements ck_war_graph_movements_geometry before_sha256=07dc85f73c1dcd2a2828c6d400b0b343217dae081a742e5826ddb81d6e466741 after_sha256=2189d4b1d5aa93fbe659f0a7033efc1e4995f0938cb7b8b24f05aa087f53338f
-- AOE2WAR-PRODUCTION-CHECK: war_graph_movements ck_war_graph_movements_type before_sha256=3305ab58ac45f8a8f803124c3ed76d98a68ad2b43676810206ff441a52d2fef2 after_sha256=f702deb3723f4ba871c9c4f9edea2a5ebf1f0141f1c5583ee81ad0403158f80a

/*
 * WarGraph founding-board correction movement contract.
 *
 * This extends the immutable movement ledger with one explicit administrative
 * correction class. It does not alter board state itself.
 *
 * FOUNDING_CORRECTION is deliberately narrow:
 * - no contest
 * - no night/action semantics
 * - exact V1 correction reason
 * - Ring II -> Ring II reseat, or Frontier -> Ring II
 */

BEGIN;

ALTER TABLE "war_graph_movements"
  DROP CONSTRAINT "ck_war_graph_movements_type";

ALTER TABLE "war_graph_movements"
  ADD CONSTRAINT "ck_war_graph_movements_type"
  CHECK (
    "movement_type" IN (
      'INITIAL_ASSIGNMENT',
      'BATTLE_ADVANCE',
      'SEAT_CLAIM',
      'CATASTROPHIC_FALL',
      'GRAVITY_MOVE',
      'FOUNDING_CORRECTION'
    )
  );

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
    )
  );

COMMIT;
