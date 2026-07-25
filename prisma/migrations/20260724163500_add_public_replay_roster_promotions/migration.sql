CREATE TABLE "replay_roster_promotions" (
  "id" SERIAL NOT NULL,
  "observation_id" INTEGER NOT NULL,
  "game_stats_id" INTEGER NOT NULL,
  "promoted_by_user_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "promotion_key" VARCHAR(255) NOT NULL,
  "decision_hash" VARCHAR(64) NOT NULL,
  "policy_version" VARCHAR(64) NOT NULL,
  "replay_hash" VARCHAR(64) NOT NULL,
  "previous_players_hash" VARCHAR(64) NOT NULL,
  "projected_players_hash" VARCHAR(64) NOT NULL,
  "format" VARCHAR(16) NOT NULL,
  "player_count" INTEGER NOT NULL,
  "previous_players" JSONB NOT NULL,
  "projected_players" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "affects_public_aggregates" BOOLEAN NOT NULL DEFAULT TRUE,
  "affects_results" BOOLEAN NOT NULL DEFAULT FALSE,
  "affects_bets" BOOLEAN NOT NULL DEFAULT FALSE,
  "settlement_authority" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "replay_roster_promotions_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "fk_replay_roster_promotions_observation"
    FOREIGN KEY ("observation_id")
    REFERENCES "replay_observations"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "fk_replay_roster_promotions_game_stats"
    FOREIGN KEY ("game_stats_id")
    REFERENCES "game_stats"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "fk_replay_roster_promotions_actor"
    FOREIGN KEY ("promoted_by_user_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "ck_replay_roster_promotions_decision_hash"
    CHECK (
      "decision_hash"::text ~ '^[0-9a-f]{64}$'::text
    ),

  CONSTRAINT "ck_replay_roster_promotions_replay_hash"
    CHECK (
      "replay_hash"::text ~ '^[0-9a-f]{64}$'::text
    ),

  CONSTRAINT "ck_replay_roster_promotions_previous_hash"
    CHECK (
      "previous_players_hash"::text ~ '^[0-9a-f]{64}$'::text
    ),

  CONSTRAINT "ck_replay_roster_promotions_projected_hash"
    CHECK (
      "projected_players_hash"::text ~ '^[0-9a-f]{64}$'::text
    ),

  CONSTRAINT "ck_replay_roster_promotions_hash_changed"
    CHECK (
      "previous_players_hash" <> "projected_players_hash"
    ),

  CONSTRAINT "ck_replay_roster_promotions_reason"
    CHECK (
      char_length(
        btrim("reason")
      ) >= 8
    ),

  CONSTRAINT "ck_replay_roster_promotions_policy_key"
    CHECK (
      "promotion_key" = "policy_version"
    ),

  CONSTRAINT "ck_replay_roster_promotions_previous_array"
    CHECK (
      jsonb_typeof(
        "previous_players"
      ) = 'array'
    ),

  CONSTRAINT "ck_replay_roster_promotions_projected_array"
    CHECK (
      jsonb_typeof(
        "projected_players"
      ) = 'array'
    ),

  CONSTRAINT "ck_replay_roster_promotions_player_count"
    CHECK (
      "player_count" =
        jsonb_array_length(
          "projected_players"
        )
    ),

  CONSTRAINT "ck_replay_roster_promotions_format"
    CHECK (
      (
        "format" = '2v2'
        AND
        "player_count" = 4
      )
      OR
      (
        "format" = '3v3'
        AND
        "player_count" = 6
      )
      OR
      (
        "format" = '4v4'
        AND
        "player_count" = 8
      )
    ),

  CONSTRAINT "ck_replay_roster_promotions_public"
    CHECK (
      "affects_public_aggregates" = TRUE
    ),

  CONSTRAINT "ck_replay_roster_promotions_no_results"
    CHECK (
      "affects_results" = FALSE
    ),

  CONSTRAINT "ck_replay_roster_promotions_no_bets"
    CHECK (
      "affects_bets" = FALSE
    ),

  CONSTRAINT "ck_replay_roster_promotions_no_settlement"
    CHECK (
      "settlement_authority" = FALSE
    )
);

CREATE UNIQUE INDEX
  "uq_replay_roster_promotions_idempotency"
ON
  "replay_roster_promotions"(
    "idempotency_key"
  );

CREATE UNIQUE INDEX
  "uq_replay_roster_promotions_observation_key"
ON
  "replay_roster_promotions"(
    "observation_id",
    "promotion_key"
  );

CREATE UNIQUE INDEX
  "uq_replay_roster_promotions_game_key"
ON
  "replay_roster_promotions"(
    "game_stats_id",
    "promotion_key"
  );

CREATE INDEX
  "ix_replay_roster_promotions_game_created"
ON
  "replay_roster_promotions"(
    "game_stats_id",
    "created_at"
  );

CREATE INDEX
  "ix_replay_roster_promotions_actor_created"
ON
  "replay_roster_promotions"(
    "promoted_by_user_id",
    "created_at"
  );

CREATE FUNCTION
  "reject_replay_roster_promotion_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION
    'replay_roster_promotions is append-only';
END;
$function$;

CREATE TRIGGER
  "trg_replay_roster_promotions_immutable"
BEFORE UPDATE OR DELETE
ON
  "replay_roster_promotions"
FOR EACH ROW
EXECUTE FUNCTION
  "reject_replay_roster_promotion_mutation"();

COMMENT ON TABLE
  "replay_roster_promotions"
IS
  'Append-only public participant-roster authority. It cannot authorize replay results, bets, payouts or settlement.';
