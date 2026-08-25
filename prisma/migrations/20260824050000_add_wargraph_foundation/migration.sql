/*
 * WarGraph V1 persistence foundation.
 *
 * Protected-lane contract: this migration is purely additive. It creates only
 * new WarGraph tables, indexes, and triggers. No existing row or table is
 * altered. Mutable rows are lifecycle/projection state; constitutional evidence
 * and economic ledgers are append-only.
 */

BEGIN;

CREATE TABLE "war_graphs" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(64) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Edmonton',
  "projection_version" INTEGER NOT NULL DEFAULT 0,
  "current_ruleset_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graphs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graphs_public_id" UNIQUE ("public_id"),
  CONSTRAINT "uq_war_graphs_slug" UNIQUE ("slug"),
  CONSTRAINT "ck_war_graphs_status" CHECK (
    "status" IN ('draft', 'active', 'paused', 'retired')
  ),
  CONSTRAINT "ck_war_graphs_timezone" CHECK (
    "timezone" = 'America/Edmonton'
  ),
  CONSTRAINT "ck_war_graphs_versions" CHECK (
    "projection_version" >= 0 AND "current_ruleset_version" >= 1
  ),
  CONSTRAINT "ck_war_graphs_copy" CHECK (
    char_length(btrim("slug")) >= 2 AND char_length(btrim("name")) >= 2
  )
);

CREATE INDEX "ix_war_graphs_status_updated"
  ON "war_graphs"("status", "updated_at");

CREATE TABLE "war_graph_rulesets" (
  "id" SERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "ruleset_hash" VARCHAR(64) NOT NULL,
  "supersedes_id" INTEGER,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Edmonton',
  "prime_start_minute" INTEGER NOT NULL DEFAULT 1020,
  "prime_end_minute" INTEGER NOT NULL DEFAULT 1380,
  "response_window_seconds" INTEGER NOT NULL DEFAULT 900,
  "launch_window_seconds" INTEGER NOT NULL DEFAULT 1800,
  "max_resolved_actions" INTEGER NOT NULL DEFAULT 2,
  "crown_capacity" INTEGER NOT NULL DEFAULT 1,
  "ring_one_capacity" INTEGER NOT NULL DEFAULT 2,
  "ring_two_capacity" INTEGER NOT NULL DEFAULT 6,
  "frontier_advance_wolo" BIGINT NOT NULL DEFAULT 1,
  "ring_two_advance_wolo" BIGINT NOT NULL DEFAULT 2,
  "first_crown_blood_wolo" BIGINT NOT NULL DEFAULT 3,
  "crown_victory_wolo" BIGINT NOT NULL DEFAULT 50,
  "nightly_payout_ceiling_wolo" BIGINT NOT NULL,
  "treasury_reserve_floor_wolo" BIGINT NOT NULL DEFAULT 0,
  "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "effective_from" TIMESTAMP(6) NOT NULL,
  "published_by_user_id" INTEGER,
  "published_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_rulesets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_rulesets_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "uq_war_graph_rulesets_hash" UNIQUE ("ruleset_hash"),
  CONSTRAINT "uq_war_graph_rulesets_supersedes" UNIQUE ("supersedes_id"),
  CONSTRAINT "uq_war_graph_rulesets_graph_version" UNIQUE ("graph_id", "version"),
  CONSTRAINT "fk_war_graph_rulesets_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_rulesets_publisher" FOREIGN KEY ("published_by_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_rulesets_supersedes" FOREIGN KEY ("supersedes_id")
    REFERENCES "war_graph_rulesets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_rulesets_identity" CHECK (
    "version" >= 1 AND
    "ruleset_hash" ~ '^[0-9a-f]{64}$' AND
    char_length(btrim("idempotency_key")) >= 8 AND
    ("supersedes_id" IS NULL OR "supersedes_id" <> "id")
  ),
  CONSTRAINT "ck_war_graph_rulesets_constitutional_time" CHECK (
    "timezone" = 'America/Edmonton' AND
    "prime_start_minute" = 1020 AND
    "prime_end_minute" = 1380 AND
    "response_window_seconds" = 900 AND
    "launch_window_seconds" = 1800
  ),
  CONSTRAINT "ck_war_graph_rulesets_constitutional_topology" CHECK (
    "max_resolved_actions" = 2 AND
    "crown_capacity" = 1 AND
    "ring_one_capacity" = 2 AND
    "ring_two_capacity" = 6
  ),
  CONSTRAINT "ck_war_graph_rulesets_economy" CHECK (
    "frontier_advance_wolo" >= 0 AND
    "ring_two_advance_wolo" >= 0 AND
    "first_crown_blood_wolo" >= 0 AND
    "crown_victory_wolo" >= 0 AND
    "nightly_payout_ceiling_wolo" >= 0 AND
    "treasury_reserve_floor_wolo" >= 0 AND
    jsonb_typeof("settings") = 'object'
  )
);

CREATE INDEX "ix_war_graph_rulesets_graph_effective"
  ON "war_graph_rulesets"("graph_id", "effective_from");
CREATE INDEX "ix_war_graph_rulesets_publisher"
  ON "war_graph_rulesets"("published_by_user_id", "published_at");

CREATE TABLE "war_graph_layers" (
  "id" SERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "key" VARCHAR(24) NOT NULL,
  "display_name" VARCHAR(80) NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "kind" VARCHAR(24) NOT NULL,
  "fixed_capacity" INTEGER,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_layers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_layers_graph_key" UNIQUE ("graph_id", "key"),
  CONSTRAINT "uq_war_graph_layers_graph_ordinal" UNIQUE ("graph_id", "ordinal"),
  CONSTRAINT "fk_war_graph_layers_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_layers_shape" CHECK (
    ("kind" = 'crown' AND "ordinal" = 0 AND "fixed_capacity" = 1) OR
    ("kind" = 'inner' AND "ordinal" = 1 AND "fixed_capacity" = 2) OR
    ("kind" = 'middle' AND "ordinal" = 2 AND "fixed_capacity" = 6) OR
    ("kind" = 'frontier' AND "ordinal" = 3 AND "fixed_capacity" IS NULL)
  ),
  CONSTRAINT "ck_war_graph_layers_copy" CHECK (
    char_length(btrim("key")) >= 2 AND char_length(btrim("display_name")) >= 2
  )
);

CREATE INDEX "ix_war_graph_layers_graph_kind"
  ON "war_graph_layers"("graph_id", "kind");

CREATE TABLE "war_graph_nodes" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "graph_id" INTEGER NOT NULL,
  "layer_id" INTEGER NOT NULL,
  "seat_key" VARCHAR(64) NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "angular_seed" INTEGER NOT NULL DEFAULT 0,
  "presentation" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_nodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_nodes_public_id" UNIQUE ("public_id"),
  CONSTRAINT "uq_war_graph_nodes_id_graph" UNIQUE ("id", "graph_id"),
  CONSTRAINT "uq_war_graph_nodes_graph_seat" UNIQUE ("graph_id", "seat_key"),
  CONSTRAINT "uq_war_graph_nodes_layer_ordinal" UNIQUE ("layer_id", "ordinal"),
  CONSTRAINT "fk_war_graph_nodes_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_nodes_layer" FOREIGN KEY ("layer_id")
    REFERENCES "war_graph_layers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_nodes_shape" CHECK (
    "ordinal" >= 0 AND char_length(btrim("seat_key")) >= 2 AND
    jsonb_typeof("presentation") = 'object'
  )
);

CREATE INDEX "ix_war_graph_nodes_board_order"
  ON "war_graph_nodes"("graph_id", "layer_id", "ordinal");

CREATE TABLE "war_graph_nights" (
  "id" SERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "ruleset_id" INTEGER NOT NULL,
  "local_date" DATE NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "prime_opens_at" TIMESTAMP(6) NOT NULL,
  "last_call_at" TIMESTAMP(6) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'scheduled',
  "static_at" TIMESTAMP(6),
  "settled_at" TIMESTAMP(6),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_nights_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_nights_graph_date" UNIQUE ("graph_id", "local_date"),
  CONSTRAINT "fk_war_graph_nights_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_nights_ruleset" FOREIGN KEY ("ruleset_id")
    REFERENCES "war_graph_rulesets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_nights_status" CHECK (
    "status" IN ('scheduled', 'prime', 'afterburn', 'static', 'settled', 'system_void')
  ),
  CONSTRAINT "ck_war_graph_nights_time" CHECK (
    "timezone" = 'America/Edmonton' AND
    "last_call_at" > "prime_opens_at" AND
    ("static_at" IS NULL OR "static_at" >= "last_call_at") AND
    ("settled_at" IS NULL OR ("static_at" IS NOT NULL AND "settled_at" >= "static_at"))
  ),
  CONSTRAINT "ck_war_graph_nights_state" CHECK (
    "version" >= 0 AND
    ("status" NOT IN ('static', 'settled') OR "static_at" IS NOT NULL) AND
    ("status" <> 'settled' OR "settled_at" IS NOT NULL)
  )
);

CREATE INDEX "ix_war_graph_nights_status_open"
  ON "war_graph_nights"("graph_id", "status", "prime_opens_at");
CREATE UNIQUE INDEX "uq_war_graph_nights_one_live"
  ON "war_graph_nights"("graph_id")
  WHERE "status" = 'prime';

CREATE TABLE "war_graph_memberships" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "graph_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "warrior_id" INTEGER,
  "player_key" VARCHAR(96) NOT NULL,
  "user_uid_snapshot" VARCHAR(100) NOT NULL,
  "steam_id_snapshot" VARCHAR(32) NOT NULL,
  "display_name_snapshot" VARCHAR(100) NOT NULL,
  "avatar_url_snapshot" VARCHAR(500),
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "eligibility_reason" VARCHAR(80) NOT NULL,
  "dormant_nights" INTEGER NOT NULL DEFAULT 0,
  "fossilization_stage" INTEGER NOT NULL DEFAULT 0,
  "last_participation_at" TIMESTAMP(6),
  "last_gravity_at" TIMESTAMP(6),
  "eligible_at" TIMESTAMP(6) NOT NULL,
  "ineligible_at" TIMESTAMP(6),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_memberships_public_id" UNIQUE ("public_id"),
  CONSTRAINT "uq_war_graph_memberships_id_graph" UNIQUE ("id", "graph_id"),
  CONSTRAINT "uq_war_graph_memberships_id_user" UNIQUE ("id", "user_id"),
  CONSTRAINT "uq_war_graph_memberships_graph_user" UNIQUE ("graph_id", "user_id"),
  CONSTRAINT "uq_war_graph_memberships_graph_player" UNIQUE ("graph_id", "player_key"),
  CONSTRAINT "fk_war_graph_memberships_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_memberships_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_memberships_warrior" FOREIGN KEY ("warrior_id")
    REFERENCES "warriors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_memberships_identity" CHECK (
    "player_key" ~ '^steam:[0-9]+$' AND
    "steam_id_snapshot" ~ '^[0-9]+$' AND
    char_length(btrim("user_uid_snapshot")) >= 1 AND
    char_length(btrim("display_name_snapshot")) >= 1
  ),
  CONSTRAINT "ck_war_graph_memberships_status" CHECK (
    "status" IN ('active', 'ineligible', 'retired')
  ),
  CONSTRAINT "ck_war_graph_memberships_projection" CHECK (
    "dormant_nights" >= 0 AND "fossilization_stage" BETWEEN 0 AND 8 AND "version" >= 0 AND
    ("ineligible_at" IS NULL OR "ineligible_at" >= "eligible_at")
  )
);

CREATE INDEX "ix_war_graph_memberships_status_updated"
  ON "war_graph_memberships"("graph_id", "status", "updated_at");
CREATE INDEX "ix_war_graph_memberships_warrior"
  ON "war_graph_memberships"("warrior_id");

CREATE TABLE "war_graph_occupancies" (
  "id" SERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "membership_id" INTEGER NOT NULL,
  "node_id" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "occupied_at" TIMESTAMP(6) NOT NULL,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_occupancies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_occupancies_member_graph"
    UNIQUE ("membership_id", "graph_id"),
  CONSTRAINT "uq_war_graph_occupancies_node_graph"
    UNIQUE ("node_id", "graph_id") DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "fk_war_graph_occupancies_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_occupancies_membership" FOREIGN KEY ("membership_id", "graph_id")
    REFERENCES "war_graph_memberships"("id", "graph_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_occupancies_node" FOREIGN KEY ("node_id", "graph_id")
    REFERENCES "war_graph_nodes"("id", "graph_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_occupancies_version" CHECK ("version" >= 0)
);

CREATE INDEX "ix_war_graph_occupancies_graph_updated"
  ON "war_graph_occupancies"("graph_id", "updated_at");

CREATE TABLE "war_graph_presences" (
  "id" SERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "membership_id" INTEGER NOT NULL,
  "realm_seen_at" TIMESTAMP(6),
  "graph_seen_at" TIMESTAMP(6),
  "ready_until" TIMESTAMP(6),
  "watcher_seen_at" TIMESTAMP(6),
  "watcher_healthy" BOOLEAN NOT NULL DEFAULT FALSE,
  "watcher_identity_hash" VARCHAR(64),
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_presences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_presences_membership" UNIQUE ("membership_id"),
  CONSTRAINT "uq_war_graph_presences_member_graph" UNIQUE ("membership_id", "graph_id"),
  CONSTRAINT "fk_war_graph_presences_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_presences_membership" FOREIGN KEY ("membership_id", "graph_id")
    REFERENCES "war_graph_memberships"("id", "graph_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_presences_projection" CHECK (
    "version" >= 0 AND
    ("watcher_identity_hash" IS NULL OR "watcher_identity_hash" ~ '^[0-9a-f]{64}$') AND
    ("watcher_healthy" = FALSE OR "watcher_seen_at" IS NOT NULL)
  )
);

CREATE INDEX "ix_war_graph_presences_watcher"
  ON "war_graph_presences"("graph_id", "watcher_healthy", "watcher_seen_at");
CREATE INDEX "ix_war_graph_presences_ready"
  ON "war_graph_presences"("graph_id", "ready_until");

CREATE TABLE "war_graph_advance_requests" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "graph_id" INTEGER NOT NULL,
  "night_id" INTEGER NOT NULL,
  "ruleset_id" INTEGER NOT NULL,
  "challenger_membership_id" INTEGER NOT NULL,
  "source_node_id" INTEGER NOT NULL,
  "target_layer_id" INTEGER NOT NULL,
  "source_layer_ordinal" INTEGER NOT NULL,
  "target_layer_ordinal" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "requested_at" TIMESTAMP(6) NOT NULL,
  "response_deadline_at" TIMESTAMP(6) NOT NULL,
  "accepted_at" TIMESTAMP(6),
  "resolved_at" TIMESTAMP(6),
  "resolution_code" VARCHAR(64),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_advance_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_advance_requests_public_id" UNIQUE ("public_id"),
  CONSTRAINT "uq_war_graph_advance_requests_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "fk_war_graph_advance_requests_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_advance_requests_night" FOREIGN KEY ("night_id")
    REFERENCES "war_graph_nights"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_advance_requests_ruleset" FOREIGN KEY ("ruleset_id")
    REFERENCES "war_graph_rulesets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_advance_requests_challenger" FOREIGN KEY ("challenger_membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_advance_requests_source_node" FOREIGN KEY ("source_node_id")
    REFERENCES "war_graph_nodes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_advance_requests_target_layer" FOREIGN KEY ("target_layer_id")
    REFERENCES "war_graph_layers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_advance_requests_geometry" CHECK (
    "source_layer_ordinal" BETWEEN 1 AND 3 AND
    "target_layer_ordinal" = "source_layer_ordinal" - 1
  ),
  CONSTRAINT "ck_war_graph_advance_requests_timing" CHECK (
    "response_deadline_at" = "requested_at" + INTERVAL '15 minutes' AND
    ("accepted_at" IS NULL OR "accepted_at" BETWEEN "requested_at" AND "response_deadline_at") AND
    ("resolved_at" IS NULL OR "resolved_at" >= "requested_at")
  ),
  CONSTRAINT "ck_war_graph_advance_requests_status" CHECK (
    "status" IN ('open', 'accepted', 'bound', 'expired', 'settled', 'canceled', 'system_void') AND
    "version" >= 0 AND
    ("status" NOT IN ('accepted', 'bound') OR "accepted_at" IS NOT NULL) AND
    ("status" NOT IN ('expired', 'settled', 'canceled', 'system_void') OR "resolved_at" IS NOT NULL)
  )
);

CREATE INDEX "ix_war_graph_advance_requests_night_status"
  ON "war_graph_advance_requests"("graph_id", "night_id", "status", "requested_at");
CREATE INDEX "ix_war_graph_advance_requests_target_deadline"
  ON "war_graph_advance_requests"("target_layer_id", "status", "response_deadline_at");
CREATE INDEX "ix_war_graph_advance_requests_challenger"
  ON "war_graph_advance_requests"("challenger_membership_id", "requested_at");
CREATE UNIQUE INDEX "uq_war_graph_advance_requests_one_open_challenger"
  ON "war_graph_advance_requests"("challenger_membership_id")
  WHERE "status" IN ('open', 'accepted', 'bound');

CREATE TABLE "war_graph_defense_obligations" (
  "id" SERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "advance_request_id" INTEGER NOT NULL,
  "defender_membership_id" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "view_evidence_hash" VARCHAR(64) NOT NULL,
  "viewed_at" TIMESTAMP(6) NOT NULL,
  "deadline_at" TIMESTAMP(6) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
  "resolution_code" VARCHAR(64),
  "resolved_at" TIMESTAMP(6),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_defense_obligations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_defense_obligations_advance" UNIQUE ("advance_request_id"),
  CONSTRAINT "uq_war_graph_defense_obligations_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "fk_war_graph_defense_obligations_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_defense_obligations_advance" FOREIGN KEY ("advance_request_id")
    REFERENCES "war_graph_advance_requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_defense_obligations_defender" FOREIGN KEY ("defender_membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_defense_obligations_evidence" CHECK (
    "view_evidence_hash" ~ '^[0-9a-f]{64}$' AND "deadline_at" >= "viewed_at"
  ),
  CONSTRAINT "ck_war_graph_defense_obligations_status" CHECK (
    "status" IN ('pending', 'released', 'defaulted', 'system_void') AND
    "version" >= 0 AND
    ("status" = 'pending' OR "resolved_at" IS NOT NULL)
  )
);

CREATE INDEX "ix_war_graph_defense_obligations_defender"
  ON "war_graph_defense_obligations"("defender_membership_id", "status", "deadline_at");
CREATE INDEX "ix_war_graph_defense_obligations_deadline"
  ON "war_graph_defense_obligations"("graph_id", "status", "deadline_at");
CREATE UNIQUE INDEX "uq_war_graph_defense_obligations_one_pending_defender"
  ON "war_graph_defense_obligations"("defender_membership_id")
  WHERE "status" = 'pending';

CREATE TABLE "war_graph_pairings" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "graph_id" INTEGER NOT NULL,
  "night_id" INTEGER NOT NULL,
  "ruleset_id" INTEGER NOT NULL,
  "advance_request_id" INTEGER,
  "aggressor_membership_id" INTEGER NOT NULL,
  "defender_membership_id" INTEGER NOT NULL,
  "aggressor_start_node_id" INTEGER NOT NULL,
  "defender_start_node_id" INTEGER NOT NULL,
  "aggressor_start_layer_ordinal" INTEGER NOT NULL,
  "defender_start_layer_ordinal" INTEGER NOT NULL,
  "aggressor_start_version" INTEGER NOT NULL,
  "defender_start_version" INTEGER NOT NULL,
  "source" VARCHAR(24) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'accepted',
  "accepted_at" TIMESTAMP(6) NOT NULL,
  "launch_deadline_at" TIMESTAMP(6) NOT NULL,
  "aggressor_ready_at" TIMESTAMP(6),
  "defender_ready_at" TIMESTAMP(6),
  "commenced_at" TIMESTAMP(6),
  "resolved_at" TIMESTAMP(6),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_pairings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_pairings_public_id" UNIQUE ("public_id"),
  CONSTRAINT "uq_war_graph_pairings_advance" UNIQUE ("advance_request_id"),
  CONSTRAINT "uq_war_graph_pairings_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "fk_war_graph_pairings_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_pairings_night" FOREIGN KEY ("night_id")
    REFERENCES "war_graph_nights"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_pairings_ruleset" FOREIGN KEY ("ruleset_id")
    REFERENCES "war_graph_rulesets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_pairings_advance" FOREIGN KEY ("advance_request_id")
    REFERENCES "war_graph_advance_requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_pairings_aggressor" FOREIGN KEY ("aggressor_membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_pairings_defender" FOREIGN KEY ("defender_membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_pairings_aggressor_node" FOREIGN KEY ("aggressor_start_node_id")
    REFERENCES "war_graph_nodes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_pairings_defender_node" FOREIGN KEY ("defender_start_node_id")
    REFERENCES "war_graph_nodes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_pairings_participants" CHECK (
    "aggressor_membership_id" <> "defender_membership_id" AND
    "aggressor_start_node_id" <> "defender_start_node_id"
  ),
  CONSTRAINT "ck_war_graph_pairings_geometry" CHECK (
    "aggressor_start_layer_ordinal" BETWEEN 1 AND 3 AND
    "defender_start_layer_ordinal" = "aggressor_start_layer_ordinal" - 1
  ),
  CONSTRAINT "ck_war_graph_pairings_source" CHECK (
    "source" IN ('advance', 'organic', 'organic_autobind') AND
    ("source" <> 'advance' OR "advance_request_id" IS NOT NULL)
  ),
  CONSTRAINT "ck_war_graph_pairings_timing" CHECK (
    "launch_deadline_at" = "accepted_at" + INTERVAL '30 minutes' AND
    ("aggressor_ready_at" IS NULL OR "aggressor_ready_at" >= "accepted_at") AND
    ("defender_ready_at" IS NULL OR "defender_ready_at" >= "accepted_at") AND
    ("commenced_at" IS NULL OR "commenced_at" >= "accepted_at") AND
    ("resolved_at" IS NULL OR "resolved_at" >= COALESCE("commenced_at", "accepted_at"))
  ),
  CONSTRAINT "ck_war_graph_pairings_status" CHECK (
    "status" IN ('accepted', 'engaged', 'live', 'settled', 'voided') AND
    "version" >= 0 AND "aggressor_start_version" >= 0 AND "defender_start_version" >= 0 AND
    ("status" <> 'live' OR "commenced_at" IS NOT NULL) AND
    ("status" NOT IN ('settled', 'voided') OR "resolved_at" IS NOT NULL)
  )
);

CREATE INDEX "ix_war_graph_pairings_night_status"
  ON "war_graph_pairings"("graph_id", "night_id", "status", "accepted_at");
CREATE INDEX "ix_war_graph_pairings_aggressor"
  ON "war_graph_pairings"("aggressor_membership_id", "accepted_at");
CREATE INDEX "ix_war_graph_pairings_defender"
  ON "war_graph_pairings"("defender_membership_id", "accepted_at");

CREATE TABLE "war_graph_engagements" (
  "id" SERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "pairing_id" INTEGER NOT NULL,
  "membership_id" INTEGER NOT NULL,
  "role" VARCHAR(16) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "acquired_at" TIMESTAMP(6) NOT NULL,
  "released_at" TIMESTAMP(6),
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_engagements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_engagements_pairing_role" UNIQUE ("pairing_id", "role"),
  CONSTRAINT "uq_war_graph_engagements_pairing_member" UNIQUE ("pairing_id", "membership_id"),
  CONSTRAINT "fk_war_graph_engagements_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_engagements_pairing" FOREIGN KEY ("pairing_id")
    REFERENCES "war_graph_pairings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_engagements_membership" FOREIGN KEY ("membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_engagements_role" CHECK (
    "role" IN ('aggressor', 'defender')
  ),
  CONSTRAINT "ck_war_graph_engagements_status" CHECK (
    "status" IN ('active', 'released') AND "version" >= 0 AND
    (("status" = 'active' AND "released_at" IS NULL) OR
     ("status" = 'released' AND "released_at" >= "acquired_at"))
  )
);

CREATE INDEX "ix_war_graph_engagements_member_status"
  ON "war_graph_engagements"("membership_id", "status", "acquired_at");
CREATE UNIQUE INDEX "uq_war_graph_engagements_one_active_member"
  ON "war_graph_engagements"("membership_id")
  WHERE "status" = 'active';

CREATE TABLE "war_graph_watcher_attestations" (
  "id" BIGSERIAL NOT NULL,
  "source_schema" VARCHAR(64) NOT NULL,
  "source_attestation_id" VARCHAR(128) NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "receipt_hash" VARCHAR(64) NOT NULL,
  "uploader_user_id" INTEGER NOT NULL,
  "api_key_id" INTEGER,
  "game_stats_id" INTEGER,
  "replay_parse_attempt_id" INTEGER,
  "uploader_uid_snapshot" VARCHAR(100) NOT NULL,
  "ingestion_provenance" VARCHAR(32),
  "live_provenance" BOOLEAN NOT NULL DEFAULT FALSE,
  "provenance_signature_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "replay_hash" VARCHAR(64) NOT NULL,
  "replay_fingerprint" VARCHAR(160),
  "live_game_fingerprint" VARCHAR(160),
  "platform_match_id" VARCHAR(128),
  "watcher_identity_hash" VARCHAR(64) NOT NULL,
  "watcher_session_hash" VARCHAR(64) NOT NULL,
  "roster_hash" VARCHAR(64),
  "roster_player_key_hashes" JSONB NOT NULL,
  "uploader_player_key_hash" VARCHAR(64),
  "participant_bound" BOOLEAN NOT NULL,
  "commenced_at" TIMESTAMP(6),
  "is_final" BOOLEAN NOT NULL,
  "archive_verified" BOOLEAN NOT NULL,
  "file_role" VARCHAR(24),
  "finality_status" VARCHAR(32),
  "result_trusted" BOOLEAN NOT NULL,
  "result_provenance" VARCHAR(48),
  "winning_player_key_hashes" JSONB NOT NULL,
  "result_hash" VARCHAR(64),
  "receipt" JSONB NOT NULL,
  "received_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_watcher_attestations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_watcher_attestations_source" UNIQUE ("source_attestation_id"),
  CONSTRAINT "uq_war_graph_watcher_attestations_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "uq_war_graph_watcher_attestations_receipt_hash" UNIQUE ("receipt_hash"),
  CONSTRAINT "uq_war_graph_watcher_attestations_id_uploader" UNIQUE ("id", "uploader_user_id"),
  CONSTRAINT "fk_war_graph_watcher_attestations_uploader" FOREIGN KEY ("uploader_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_watcher_attestations_api_key" FOREIGN KEY ("api_key_id")
    REFERENCES "api_keys"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_watcher_attestations_game" FOREIGN KEY ("game_stats_id")
    REFERENCES "game_stats"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_watcher_attestations_parse_attempt" FOREIGN KEY ("replay_parse_attempt_id")
    REFERENCES "replay_parse_attempts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_watcher_attestations_hashes" CHECK (
    "receipt_hash" ~ '^[0-9a-f]{64}$' AND
    "replay_hash" ~ '^[0-9a-f]{64}$' AND
    ("live_game_fingerprint" IS NULL OR "live_game_fingerprint" ~ '^[0-9a-f]{64}$') AND
    "watcher_identity_hash" ~ '^[0-9a-f]{64}$' AND
    "watcher_session_hash" ~ '^[0-9a-f]{64}$' AND
    ("roster_hash" IS NULL OR "roster_hash" ~ '^[0-9a-f]{64}$') AND
    ("uploader_player_key_hash" IS NULL OR "uploader_player_key_hash" ~ '^[0-9a-f]{64}$') AND
    ("result_hash" IS NULL OR "result_hash" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "ck_war_graph_watcher_attestations_arrays" CHECK (
    jsonb_typeof("roster_player_key_hashes") = 'array' AND
    jsonb_typeof("winning_player_key_hashes") = 'array' AND
    jsonb_typeof("receipt") = 'object'
  ),
  CONSTRAINT "ck_war_graph_watcher_attestations_participant_binding" CHECK (
    "participant_bound" = FALSE OR (
      "roster_hash" IS NOT NULL AND
      "uploader_player_key_hash" IS NOT NULL AND
      jsonb_array_length("roster_player_key_hashes") = 2
    )
  ),
  CONSTRAINT "ck_war_graph_watcher_attestations_trusted_result" CHECK (
    "result_trusted" = FALSE OR (
      "is_final" = TRUE AND
      "archive_verified" = TRUE AND
      "result_hash" IS NOT NULL AND
      "result_provenance" IS NOT NULL AND
      jsonb_array_length("winning_player_key_hashes") >= 1
    )
  ),
  CONSTRAINT "ck_war_graph_watcher_attestations_copy" CHECK (
    char_length(btrim("source_schema")) >= 4 AND
    char_length(btrim("source_attestation_id")) >= 4 AND
    char_length(btrim("uploader_uid_snapshot")) >= 1
  )
);

CREATE INDEX "ix_war_graph_watcher_attestations_platform_match"
  ON "war_graph_watcher_attestations"("platform_match_id", "received_at");
CREATE INDEX "ix_war_graph_watcher_attestations_live_fingerprint"
  ON "war_graph_watcher_attestations"("live_game_fingerprint", "received_at");
CREATE INDEX "ix_war_graph_watcher_attestations_uploader_commenced"
  ON "war_graph_watcher_attestations"("uploader_user_id", "commenced_at");
CREATE INDEX "ix_war_graph_watcher_attestations_game"
  ON "war_graph_watcher_attestations"("game_stats_id", "received_at");
CREATE INDEX "ix_war_graph_watcher_attestations_replay_hash"
  ON "war_graph_watcher_attestations"("replay_hash");

CREATE TABLE "war_graph_contests" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "graph_id" INTEGER NOT NULL,
  "night_id" INTEGER NOT NULL,
  "ruleset_id" INTEGER NOT NULL,
  "pairing_id" INTEGER,
  "advance_request_id" INTEGER,
  "aggressor_membership_id" INTEGER NOT NULL,
  "defender_membership_id" INTEGER NOT NULL,
  "aggressor_start_node_id" INTEGER NOT NULL,
  "defender_start_node_id" INTEGER NOT NULL,
  "aggressor_start_layer_ordinal" INTEGER NOT NULL,
  "defender_start_layer_ordinal" INTEGER NOT NULL,
  "aggressor_start_version" INTEGER NOT NULL,
  "defender_start_version" INTEGER NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "provenance" VARCHAR(32) NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "live_game_fingerprint" VARCHAR(160),
  "platform_match_id" VARCHAR(128),
  "game_stats_id" INTEGER,
  "authoritative_order_key" VARCHAR(160),
  "commenced_at" TIMESTAMP(6),
  "qualification_status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "qualification_reason" VARCHAR(64),
  "result_status" VARCHAR(32) NOT NULL DEFAULT 'unresolved',
  "outcome_code" VARCHAR(48),
  "winner_membership_id" INTEGER,
  "loser_membership_id" INTEGER,
  "roster_hash" VARCHAR(64),
  "proposition_hash" VARCHAR(64),
  "result_hash" VARCHAR(64),
  "settlement_key" VARCHAR(160),
  "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
  "settled_at" TIMESTAMP(6),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_contests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_contests_public_id" UNIQUE ("public_id"),
  CONSTRAINT "uq_war_graph_contests_pairing" UNIQUE ("pairing_id"),
  CONSTRAINT "uq_war_graph_contests_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "uq_war_graph_contests_live_fingerprint" UNIQUE ("live_game_fingerprint"),
  CONSTRAINT "uq_war_graph_contests_platform_match" UNIQUE ("platform_match_id"),
  CONSTRAINT "uq_war_graph_contests_game_stats" UNIQUE ("game_stats_id"),
  CONSTRAINT "uq_war_graph_contests_settlement" UNIQUE ("settlement_key"),
  CONSTRAINT "fk_war_graph_contests_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_night" FOREIGN KEY ("night_id")
    REFERENCES "war_graph_nights"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_ruleset" FOREIGN KEY ("ruleset_id")
    REFERENCES "war_graph_rulesets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_pairing" FOREIGN KEY ("pairing_id")
    REFERENCES "war_graph_pairings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_advance" FOREIGN KEY ("advance_request_id")
    REFERENCES "war_graph_advance_requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_aggressor" FOREIGN KEY ("aggressor_membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_defender" FOREIGN KEY ("defender_membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_winner" FOREIGN KEY ("winner_membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_loser" FOREIGN KEY ("loser_membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_aggressor_node" FOREIGN KEY ("aggressor_start_node_id")
    REFERENCES "war_graph_nodes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_defender_node" FOREIGN KEY ("defender_start_node_id")
    REFERENCES "war_graph_nodes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contests_game" FOREIGN KEY ("game_stats_id")
    REFERENCES "game_stats"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_contests_participants" CHECK (
    "aggressor_membership_id" <> "defender_membership_id" AND
    "aggressor_start_node_id" <> "defender_start_node_id"
  ),
  CONSTRAINT "ck_war_graph_contests_geometry" CHECK (
    "aggressor_start_layer_ordinal" BETWEEN 1 AND 3 AND
    "defender_start_layer_ordinal" = "aggressor_start_layer_ordinal" - 1 AND
    "aggressor_start_version" >= 0 AND "defender_start_version" >= 0
  ),
  CONSTRAINT "ck_war_graph_contests_kind" CHECK (
    "kind" IN (
      'VERIFIED_BATTLE',
      'DEFENSE_DEFAULT',
      'DEFENDER_NO_START_DEFAULT',
      'CHALLENGER_ABANDONMENT',
      'TECHNICAL_VOID',
      'SYSTEM_VOID',
      'MUTUAL_NO_START'
    )
  ),
  CONSTRAINT "ck_war_graph_contests_provenance" CHECK (
    "provenance" IN ('LIVE_DOUBLE_WATCHER', 'ADMINISTRATIVE', 'SYSTEM') AND
    ("kind" <> 'VERIFIED_BATTLE' OR "provenance" = 'LIVE_DOUBLE_WATCHER')
  ),
  CONSTRAINT "ck_war_graph_contests_qualification" CHECK (
    "qualification_status" IN ('pending', 'eligible', 'ineligible', 'system_void') AND
    (
      "qualification_reason" IS NULL OR
      "qualification_reason" IN (
        'WARGRAPH_ELIGIBLE',
        'INELIGIBLE_SAME_RING',
        'INELIGIBLE_RING_GAP',
        'INELIGIBLE_ACTION_CAP',
        'INELIGIBLE_NOT_LIVE',
        'INELIGIBLE_SINGLE_WATCHER',
        'INELIGIBLE_OUTSIDE_PRIME_WINDOW',
        'INELIGIBLE_CONFLICTING_ENGAGEMENT',
        'INELIGIBLE_GRAPH_STATE_AT_START'
      )
    ) AND
    ("qualification_status" <> 'eligible' OR "qualification_reason" = 'WARGRAPH_ELIGIBLE')
  ),
  CONSTRAINT "ck_war_graph_contests_result" CHECK (
    "result_status" IN ('unresolved', 'verified', 'no_battle', 'void') AND
    (
      ("winner_membership_id" IS NULL AND "loser_membership_id" IS NULL) OR
      (
        "winner_membership_id" IS NOT NULL AND
        "loser_membership_id" IS NOT NULL AND
        "winner_membership_id" <> "loser_membership_id" AND
        "winner_membership_id" IN ("aggressor_membership_id", "defender_membership_id") AND
        "loser_membership_id" IN ("aggressor_membership_id", "defender_membership_id")
      )
    ) AND
    ("result_status" <> 'verified' OR ("winner_membership_id" IS NOT NULL AND "result_hash" IS NOT NULL)) AND
    ("kind" = 'VERIFIED_BATTLE' OR ("winner_membership_id" IS NULL AND "loser_membership_id" IS NULL))
  ),
  CONSTRAINT "ck_war_graph_contests_hashes" CHECK (
    ("roster_hash" IS NULL OR "roster_hash" ~ '^[0-9a-f]{64}$') AND
    ("proposition_hash" IS NULL OR "proposition_hash" ~ '^[0-9a-f]{64}$') AND
    ("result_hash" IS NULL OR "result_hash" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "ck_war_graph_contests_state" CHECK (
    "status" IN ('pending', 'evidence_pending', 'qualified', 'settled', 'voided', 'rejected') AND
    "version" >= 0 AND
    ("settled_at" IS NULL OR "settled_at" >= COALESCE("commenced_at", "created_at")) AND
    ("status" <> 'settled' OR ("settled_at" IS NOT NULL AND "settlement_key" IS NOT NULL)) AND
    (
      "status" <> 'settled' OR "kind" <> 'VERIFIED_BATTLE' OR
      (
        "qualification_status" = 'eligible' AND
        "result_status" = 'verified' AND
        "commenced_at" IS NOT NULL AND
        "live_game_fingerprint" IS NOT NULL AND
        "game_stats_id" IS NOT NULL AND
        "roster_hash" IS NOT NULL AND
        "result_hash" IS NOT NULL
      )
    )
  )
);

CREATE INDEX "ix_war_graph_contests_night_status"
  ON "war_graph_contests"("graph_id", "night_id", "status", "commenced_at");
CREATE INDEX "ix_war_graph_contests_aggressor"
  ON "war_graph_contests"("aggressor_membership_id", "commenced_at");
CREATE INDEX "ix_war_graph_contests_defender"
  ON "war_graph_contests"("defender_membership_id", "commenced_at");
CREATE INDEX "ix_war_graph_contests_qualification"
  ON "war_graph_contests"("qualification_status", "created_at");

CREATE TABLE "war_graph_contest_attestations" (
  "id" BIGSERIAL NOT NULL,
  "contest_id" INTEGER NOT NULL,
  "attestation_id" BIGINT NOT NULL,
  "membership_id" INTEGER NOT NULL,
  "uploader_user_id" INTEGER NOT NULL,
  "participant_role" VARCHAR(16) NOT NULL,
  "evidence_phase" VARCHAR(16) NOT NULL,
  "validation_hash" VARCHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "linked_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_contest_attestations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_contest_attestations_evidence" UNIQUE ("attestation_id"),
  CONSTRAINT "uq_war_graph_contest_attestations_evidence_user" UNIQUE ("attestation_id", "uploader_user_id"),
  CONSTRAINT "uq_war_graph_contest_attestations_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "uq_war_graph_contest_attestations_phase_member" UNIQUE ("contest_id", "evidence_phase", "membership_id"),
  CONSTRAINT "uq_war_graph_contest_attestations_phase_uploader" UNIQUE ("contest_id", "evidence_phase", "uploader_user_id"),
  CONSTRAINT "uq_war_graph_contest_attestations_phase_role" UNIQUE ("contest_id", "evidence_phase", "participant_role"),
  CONSTRAINT "fk_war_graph_contest_attestations_contest" FOREIGN KEY ("contest_id")
    REFERENCES "war_graph_contests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contest_attestations_evidence" FOREIGN KEY ("attestation_id", "uploader_user_id")
    REFERENCES "war_graph_watcher_attestations"("id", "uploader_user_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_contest_attestations_membership" FOREIGN KEY ("membership_id", "uploader_user_id")
    REFERENCES "war_graph_memberships"("id", "user_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_contest_attestations_role" CHECK (
    "participant_role" IN ('aggressor', 'defender')
  ),
  CONSTRAINT "ck_war_graph_contest_attestations_phase" CHECK (
    "evidence_phase" IN ('start', 'final')
  ),
  CONSTRAINT "ck_war_graph_contest_attestations_hash" CHECK (
    "validation_hash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX "ix_war_graph_contest_attestations_member"
  ON "war_graph_contest_attestations"("membership_id", "linked_at");

CREATE TABLE "war_graph_actions" (
  "id" BIGSERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "night_id" INTEGER NOT NULL,
  "contest_id" INTEGER NOT NULL,
  "membership_id" INTEGER NOT NULL,
  "slot" INTEGER NOT NULL,
  "action_type" VARCHAR(32) NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "applied_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_actions_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "uq_war_graph_actions_night_member_slot" UNIQUE ("night_id", "membership_id", "slot"),
  CONSTRAINT "uq_war_graph_actions_contest_member" UNIQUE ("contest_id", "membership_id"),
  CONSTRAINT "fk_war_graph_actions_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_actions_night" FOREIGN KEY ("night_id")
    REFERENCES "war_graph_nights"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_actions_contest" FOREIGN KEY ("contest_id")
    REFERENCES "war_graph_contests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_actions_membership" FOREIGN KEY ("membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_actions_slot" CHECK ("slot" IN (1, 2)),
  CONSTRAINT "ck_war_graph_actions_type" CHECK (
    "action_type" IN (
      'VERIFIED_BATTLE',
      'DEFENSE_DEFAULT',
      'DEFENDER_NO_START_DEFAULT',
      'CHALLENGER_ABANDONMENT'
    )
  )
);

CREATE INDEX "ix_war_graph_actions_night"
  ON "war_graph_actions"("graph_id", "night_id", "applied_at");
CREATE INDEX "ix_war_graph_actions_member"
  ON "war_graph_actions"("membership_id", "applied_at");

CREATE TABLE "war_graph_movements" (
  "id" BIGSERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "night_id" INTEGER,
  "contest_id" INTEGER,
  "membership_id" INTEGER NOT NULL,
  "from_node_id" INTEGER,
  "to_node_id" INTEGER NOT NULL,
  "from_layer_ordinal" INTEGER,
  "to_layer_ordinal" INTEGER NOT NULL,
  "movement_type" VARCHAR(32) NOT NULL,
  "reason_code" VARCHAR(64) NOT NULL,
  "source_key" VARCHAR(160) NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "membership_version_before" INTEGER NOT NULL,
  "membership_version_after" INTEGER NOT NULL,
  "moved_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_movements_source" UNIQUE ("source_key"),
  CONSTRAINT "uq_war_graph_movements_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "uq_war_graph_movements_contest_member" UNIQUE ("contest_id", "membership_id"),
  CONSTRAINT "fk_war_graph_movements_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_movements_night" FOREIGN KEY ("night_id")
    REFERENCES "war_graph_nights"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_movements_contest" FOREIGN KEY ("contest_id")
    REFERENCES "war_graph_contests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_movements_membership" FOREIGN KEY ("membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_movements_from_node" FOREIGN KEY ("from_node_id")
    REFERENCES "war_graph_nodes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_movements_to_node" FOREIGN KEY ("to_node_id")
    REFERENCES "war_graph_nodes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_movements_type" CHECK (
    "movement_type" IN (
      'INITIAL_ASSIGNMENT',
      'BATTLE_ADVANCE',
      'SEAT_CLAIM',
      'CATASTROPHIC_FALL',
      'GRAVITY_MOVE'
    )
  ),
  CONSTRAINT "ck_war_graph_movements_version" CHECK (
    "membership_version_before" >= 0 AND
    "membership_version_after" = "membership_version_before" + 1
  ),
  CONSTRAINT "ck_war_graph_movements_nodes" CHECK (
    ("from_node_id" IS NULL OR "from_node_id" <> "to_node_id") AND
    "to_layer_ordinal" BETWEEN 0 AND 3
  ),
  CONSTRAINT "ck_war_graph_movements_geometry" CHECK (
    (
      "movement_type" = 'INITIAL_ASSIGNMENT' AND
      "from_node_id" IS NULL AND "from_layer_ordinal" IS NULL AND
      "to_layer_ordinal" BETWEEN 0 AND 3 AND
      "night_id" IS NULL AND "contest_id" IS NULL
    ) OR
    (
      "movement_type" IN ('BATTLE_ADVANCE', 'SEAT_CLAIM') AND
      "from_node_id" IS NOT NULL AND "from_layer_ordinal" IS NOT NULL AND
      "to_layer_ordinal" = "from_layer_ordinal" - 1 AND "contest_id" IS NOT NULL
    ) OR
    (
      "movement_type" = 'CATASTROPHIC_FALL' AND
      "from_node_id" IS NOT NULL AND "from_layer_ordinal" BETWEEN 0 AND 2 AND
      "to_layer_ordinal" = 3 AND "contest_id" IS NOT NULL
    ) OR
    (
      "movement_type" = 'GRAVITY_MOVE' AND
      "from_node_id" IS NOT NULL AND "from_layer_ordinal" IS NOT NULL AND
      "to_layer_ordinal" > 0 AND "to_layer_ordinal" < "from_layer_ordinal" AND
      "contest_id" IS NULL
    )
  )
);

CREATE INDEX "ix_war_graph_movements_graph_time"
  ON "war_graph_movements"("graph_id", "moved_at");
CREATE INDEX "ix_war_graph_movements_member_time"
  ON "war_graph_movements"("membership_id", "moved_at");
CREATE INDEX "ix_war_graph_movements_night_type"
  ON "war_graph_movements"("night_id", "movement_type");

CREATE TABLE "war_graph_events" (
  "id" BIGSERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "night_id" INTEGER,
  "membership_id" INTEGER,
  "advance_request_id" INTEGER,
  "pairing_id" INTEGER,
  "contest_id" INTEGER,
  "actor_user_id" INTEGER,
  "aggregate_type" VARCHAR(32) NOT NULL,
  "aggregate_id" VARCHAR(128) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "event_type" VARCHAR(64) NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "previous_event_hash" VARCHAR(64),
  "event_hash" VARCHAR(64) NOT NULL,
  "prior_version" INTEGER,
  "new_version" INTEGER,
  "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_events_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "uq_war_graph_events_hash" UNIQUE ("event_hash"),
  CONSTRAINT "uq_war_graph_events_aggregate_sequence"
    UNIQUE ("graph_id", "aggregate_type", "aggregate_id", "sequence"),
  CONSTRAINT "fk_war_graph_events_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_events_night" FOREIGN KEY ("night_id")
    REFERENCES "war_graph_nights"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_events_membership" FOREIGN KEY ("membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_events_advance" FOREIGN KEY ("advance_request_id")
    REFERENCES "war_graph_advance_requests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_events_pairing" FOREIGN KEY ("pairing_id")
    REFERENCES "war_graph_pairings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_events_contest" FOREIGN KEY ("contest_id")
    REFERENCES "war_graph_contests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_events_actor" FOREIGN KEY ("actor_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_events_identity" CHECK (
    "sequence" >= 1 AND
    char_length(btrim("aggregate_type")) >= 2 AND
    char_length(btrim("aggregate_id")) >= 1 AND
    char_length(btrim("event_type")) >= 3
  ),
  CONSTRAINT "ck_war_graph_events_hash_chain" CHECK (
    "event_hash" ~ '^[0-9a-f]{64}$' AND
    ("previous_event_hash" IS NULL OR "previous_event_hash" ~ '^[0-9a-f]{64}$') AND
    (("sequence" = 1 AND "previous_event_hash" IS NULL) OR
     ("sequence" > 1 AND "previous_event_hash" IS NOT NULL))
  ),
  CONSTRAINT "ck_war_graph_events_versions" CHECK (
    ("prior_version" IS NULL AND ("new_version" IS NULL OR "new_version" = 0)) OR
    ("prior_version" IS NOT NULL AND "prior_version" >= 0 AND "new_version" = "prior_version" + 1)
  ),
  CONSTRAINT "ck_war_graph_events_payload" CHECK (
    jsonb_typeof("payload") = 'object'
  )
);

CREATE INDEX "ix_war_graph_events_graph_time"
  ON "war_graph_events"("graph_id", "occurred_at");
CREATE INDEX "ix_war_graph_events_night_time"
  ON "war_graph_events"("night_id", "occurred_at");
CREATE INDEX "ix_war_graph_events_member_time"
  ON "war_graph_events"("membership_id", "occurred_at");
CREATE INDEX "ix_war_graph_events_type_time"
  ON "war_graph_events"("event_type", "occurred_at");

CREATE TABLE "war_graph_rewards" (
  "id" BIGSERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "night_id" INTEGER NOT NULL,
  "ruleset_id" INTEGER NOT NULL,
  "contest_id" INTEGER NOT NULL,
  "event_id" BIGINT NOT NULL,
  "membership_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "reward_kind" VARCHAR(32) NOT NULL,
  "amount_wolo" BIGINT NOT NULL,
  "settlement_key" VARCHAR(160) NOT NULL,
  "payout_request_id" VARCHAR(160) NOT NULL,
  "recipient_wallet_snapshot" VARCHAR(100),
  "policy_hash" VARCHAR(64) NOT NULL,
  "entitled_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_rewards_settlement" UNIQUE ("settlement_key"),
  CONSTRAINT "uq_war_graph_rewards_payout_request" UNIQUE ("payout_request_id"),
  CONSTRAINT "uq_war_graph_rewards_contest_kind" UNIQUE ("contest_id", "reward_kind"),
  CONSTRAINT "fk_war_graph_rewards_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_rewards_night" FOREIGN KEY ("night_id")
    REFERENCES "war_graph_nights"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_rewards_ruleset" FOREIGN KEY ("ruleset_id")
    REFERENCES "war_graph_rulesets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_rewards_contest" FOREIGN KEY ("contest_id")
    REFERENCES "war_graph_contests"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_rewards_event" FOREIGN KEY ("event_id")
    REFERENCES "war_graph_events"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_rewards_membership" FOREIGN KEY ("membership_id")
    REFERENCES "war_graph_memberships"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_rewards_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_rewards_kind" CHECK (
    "reward_kind" IN (
      'FRONTIER_TO_RING_II',
      'RING_II_TO_RING_I',
      'FIRST_BLOOD',
      'CROWN_BATTLE_WINNER'
    )
  ),
  CONSTRAINT "ck_war_graph_rewards_amount" CHECK ("amount_wolo" > 0),
  CONSTRAINT "ck_war_graph_rewards_hash" CHECK (
    "policy_hash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX "ix_war_graph_rewards_night"
  ON "war_graph_rewards"("night_id", "entitled_at");
CREATE INDEX "ix_war_graph_rewards_user"
  ON "war_graph_rewards"("user_id", "entitled_at");
CREATE UNIQUE INDEX "uq_war_graph_rewards_one_first_blood"
  ON "war_graph_rewards"("night_id")
  WHERE "reward_kind" = 'FIRST_BLOOD';

CREATE TABLE "war_graph_payout_events" (
  "id" BIGSERIAL NOT NULL,
  "reward_id" BIGINT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "state_sequence" INTEGER NOT NULL,
  "request_id" VARCHAR(160) NOT NULL,
  "idempotency_key" VARCHAR(180) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "tx_hash" VARCHAR(128),
  "error_code" VARCHAR(80),
  "error_detail" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "observed_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_graph_payout_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_payout_events_idempotency" UNIQUE ("idempotency_key"),
  CONSTRAINT "uq_war_graph_payout_events_attempt_sequence"
    UNIQUE ("reward_id", "attempt_number", "state_sequence"),
  CONSTRAINT "uq_war_graph_payout_events_request_status"
    UNIQUE ("reward_id", "request_id", "status"),
  CONSTRAINT "fk_war_graph_payout_events_reward" FOREIGN KEY ("reward_id")
    REFERENCES "war_graph_rewards"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_payout_events_sequence" CHECK (
    "attempt_number" >= 1 AND "state_sequence" >= 0
  ),
  CONSTRAINT "ck_war_graph_payout_events_status" CHECK (
    "status" IN ('submitted', 'unknown', 'failed', 'succeeded') AND
    ("status" <> 'succeeded' OR ("tx_hash" IS NOT NULL AND char_length(btrim("tx_hash")) >= 8)) AND
    ("status" <> 'failed' OR "error_code" IS NOT NULL)
  ),
  CONSTRAINT "ck_war_graph_payout_events_evidence" CHECK (
    jsonb_typeof("evidence") = 'object'
  )
);

CREATE INDEX "ix_war_graph_payout_events_reward"
  ON "war_graph_payout_events"("reward_id", "observed_at");
CREATE INDEX "ix_war_graph_payout_events_status"
  ON "war_graph_payout_events"("status", "observed_at");
CREATE UNIQUE INDEX "uq_war_graph_payout_events_one_success"
  ON "war_graph_payout_events"("reward_id")
  WHERE "status" = 'succeeded';

CREATE TABLE "war_graph_spectator_sessions" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "graph_id" INTEGER NOT NULL,
  "user_id" INTEGER,
  "focus_contest_id" INTEGER,
  "session_key_hash" VARCHAR(64) NOT NULL,
  "ip_hash" VARCHAR(64),
  "user_agent_hash" VARCHAR(64),
  "opened_at" TIMESTAMP(6) NOT NULL,
  "last_seen_at" TIMESTAMP(6) NOT NULL,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "closed_at" TIMESTAMP(6),
  "version" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "war_graph_spectator_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_spectator_sessions_public_id" UNIQUE ("public_id"),
  CONSTRAINT "uq_war_graph_spectator_sessions_key" UNIQUE ("session_key_hash"),
  CONSTRAINT "fk_war_graph_spectator_sessions_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_spectator_sessions_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_graph_spectator_sessions_focus" FOREIGN KEY ("focus_contest_id")
    REFERENCES "war_graph_contests"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_spectator_sessions_hashes" CHECK (
    "session_key_hash" ~ '^[0-9a-f]{64}$' AND
    ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{64}$') AND
    ("user_agent_hash" IS NULL OR "user_agent_hash" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "ck_war_graph_spectator_sessions_timing" CHECK (
    "last_seen_at" >= "opened_at" AND
    "expires_at" > "last_seen_at" AND
    ("closed_at" IS NULL OR "closed_at" >= "opened_at") AND
    "version" >= 0
  )
);

CREATE INDEX "ix_war_graph_spectator_sessions_active"
  ON "war_graph_spectator_sessions"("graph_id", "expires_at");
CREATE INDEX "ix_war_graph_spectator_sessions_focus"
  ON "war_graph_spectator_sessions"("focus_contest_id", "expires_at");
CREATE INDEX "ix_war_graph_spectator_sessions_user"
  ON "war_graph_spectator_sessions"("user_id", "last_seen_at");

CREATE TABLE "war_graph_jobs" (
  "id" BIGSERIAL NOT NULL,
  "graph_id" INTEGER NOT NULL,
  "job_type" VARCHAR(48) NOT NULL,
  "dedupe_key" VARCHAR(180) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'queued',
  "available_at" TIMESTAMP(6) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 8,
  "lease_owner" VARCHAR(128),
  "lease_expires_at" TIMESTAMP(6),
  "last_error_code" VARCHAR(80),
  "last_error" TEXT,
  "completed_at" TIMESTAMP(6),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "war_graph_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_war_graph_jobs_dedupe" UNIQUE ("dedupe_key"),
  CONSTRAINT "fk_war_graph_jobs_graph" FOREIGN KEY ("graph_id")
    REFERENCES "war_graphs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_graph_jobs_type" CHECK (
    "job_type" IN (
      'sync_membership',
      'correlate_attestation',
      'resolve_advance',
      'resolve_pairing',
      'settle_contest',
      'apply_gravity',
      'advance_fossilization',
      'settle_night',
      'submit_reward',
      'reconcile_payout'
    )
  ),
  CONSTRAINT "ck_war_graph_jobs_payload" CHECK (
    jsonb_typeof("payload") = 'object'
  ),
  CONSTRAINT "ck_war_graph_jobs_attempts" CHECK (
    "attempt_count" >= 0 AND "max_attempts" >= 1 AND
    "attempt_count" <= "max_attempts" AND "version" >= 0
  ),
  CONSTRAINT "ck_war_graph_jobs_state" CHECK (
    "status" IN ('queued', 'running', 'succeeded', 'dead') AND
    (
      ("status" = 'running' AND "lease_owner" IS NOT NULL AND "lease_expires_at" IS NOT NULL) OR
      ("status" <> 'running')
    ) AND
    ("status" NOT IN ('succeeded', 'dead') OR "completed_at" IS NOT NULL)
  )
);

CREATE INDEX "ix_war_graph_jobs_claim"
  ON "war_graph_jobs"("status", "available_at");
CREATE INDEX "ix_war_graph_jobs_graph_type"
  ON "war_graph_jobs"("graph_id", "job_type", "status");
CREATE INDEX "ix_war_graph_jobs_lease"
  ON "war_graph_jobs"("lease_expires_at");

/* Immutable constitutional/economic ledgers reuse the repository's generic
 * mutation-rejection trigger function installed by the replay evidence lane. */

CREATE TRIGGER "war_graph_rulesets_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_rulesets"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_rulesets_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_rulesets"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_layers_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_layers"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_layers_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_layers"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_nodes_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_nodes"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_nodes_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_nodes"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_watcher_attestations_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_watcher_attestations"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_watcher_attestations_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_watcher_attestations"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_contest_attestations_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_contest_attestations"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_contest_attestations_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_contest_attestations"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_actions_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_actions"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_actions_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_actions"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_movements_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_movements"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_movements_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_movements"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_events_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_events_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_rewards_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_rewards"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_rewards_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_rewards"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_graph_payout_events_append_only"
BEFORE UPDATE OR DELETE ON "war_graph_payout_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();
CREATE TRIGGER "war_graph_payout_events_append_only_truncate"
BEFORE TRUNCATE ON "war_graph_payout_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

COMMIT;
