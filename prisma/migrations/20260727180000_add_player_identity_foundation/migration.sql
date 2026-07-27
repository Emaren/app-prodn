BEGIN;

-- BEGIN PRISMA STRUCTURAL DIFF
-- CreateTable
CREATE TABLE "warriors" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(32) NOT NULL,
    "seed_platform_account_id" INTEGER,
    "kind" VARCHAR(32) NOT NULL DEFAULT 'platform_seed',
    "preferred_display_name" VARCHAR(100) NOT NULL,
    "normalized_display_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'provisional',
    "merged_into_warrior_id" INTEGER,
    "merged_by_decision_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "warriors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_accounts" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(32) NOT NULL,
    "platform" VARCHAR(24) NOT NULL,
    "external_account_id" VARCHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "latest_display_name" VARCHAR(255),
    "first_observed_at" TIMESTAMP(6),
    "last_observed_at" TIMESTAMP(6),
    "created_from" VARCHAR(32) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_name_observations" (
    "id" SERIAL NOT NULL,
    "platform_account_id" INTEGER NOT NULL,
    "replay_player_snapshot_id" INTEGER,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "normalization_version" VARCHAR(32) NOT NULL,
    "observed_at" TIMESTAMP(6) NOT NULL,
    "source_kind" VARCHAR(32) NOT NULL,
    "source_identity" VARCHAR(160) NOT NULL,
    "exact" BOOLEAN NOT NULL DEFAULT true,
    "confidence_bps" INTEGER,
    "provenance" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_name_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisional_identities" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(32) NOT NULL,
    "normalization_version" VARCHAR(32) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'open',
    "first_observed_at" TIMESTAMP(6) NOT NULL,
    "last_observed_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "provisional_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_decisions" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(32) NOT NULL,
    "decision_key" VARCHAR(128) NOT NULL,
    "decision_type" VARCHAR(32) NOT NULL,
    "outcome" VARCHAR(24) NOT NULL,
    "actor_user_id" INTEGER,
    "actor_role_snapshot" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "evidence" JSONB NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "impact_preview" JSONB,
    "effective_from" TIMESTAMP(6),
    "effective_to" TIMESTAMP(6),
    "supersedes_decision_id" INTEGER,
    "decided_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_decision_subjects" (
    "id" SERIAL NOT NULL,
    "decision_id" INTEGER NOT NULL,
    "subject_role" VARCHAR(24) NOT NULL,
    "warrior_id" INTEGER,
    "platform_account_id" INTEGER,
    "provisional_identity_id" INTEGER,
    "site_account_user_id" INTEGER,
    "warrior_platform_link_id" INTEGER,
    "warrior_claim_id" INTEGER,
    "replay_player_snapshot_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_decision_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warrior_platform_links" (
    "id" SERIAL NOT NULL,
    "link_key" VARCHAR(128) NOT NULL,
    "warrior_id" INTEGER NOT NULL,
    "platform_account_id" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'proposed',
    "attribution_from" TIMESTAMP(6) NOT NULL,
    "attribution_to" TIMESTAMP(6),
    "control_verified_at" TIMESTAMP(6),
    "verification_method" VARCHAR(32) NOT NULL,
    "confidence_bps" INTEGER,
    "evidence" JSONB NOT NULL,
    "authorized_by_decision_id" INTEGER NOT NULL,
    "superseded_by_decision_id" INTEGER,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "warrior_platform_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warrior_claims" (
    "id" SERIAL NOT NULL,
    "claim_key" VARCHAR(128) NOT NULL,
    "warrior_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" VARCHAR(24) NOT NULL DEFAULT 'primary',
    "status" VARCHAR(24) NOT NULL DEFAULT 'proposed',
    "effective_from" TIMESTAMP(6),
    "effective_to" TIMESTAMP(6),
    "verification_method" VARCHAR(32) NOT NULL,
    "evidence" JSONB NOT NULL,
    "authorized_by_decision_id" INTEGER NOT NULL,
    "superseded_by_decision_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "warrior_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_resolution_runs" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(32) NOT NULL,
    "run_key" VARCHAR(128) NOT NULL,
    "resolver_version" VARCHAR(64) NOT NULL,
    "normalization_version" VARCHAR(32) NOT NULL,
    "schema_version" VARCHAR(32) NOT NULL,
    "comparison_policy_version" VARCHAR(32),
    "mode" VARCHAR(24) NOT NULL,
    "source_watermark" JSONB NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "result_hash" VARCHAR(64),
    "status" VARCHAR(24) NOT NULL DEFAULT 'running',
    "counts" JSONB,
    "mismatch_summary" JSONB,
    "failure_summary" JSONB,
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_resolution_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replay_player_identity_projections" (
    "id" SERIAL NOT NULL,
    "resolution_run_id" INTEGER NOT NULL,
    "replay_player_snapshot_id" INTEGER NOT NULL,
    "game_stats_id" INTEGER NOT NULL,
    "effective_game_at" TIMESTAMP(6) NOT NULL,
    "game_time_source" VARCHAR(32) NOT NULL,
    "platform_account_id" INTEGER,
    "provisional_identity_id" INTEGER,
    "warrior_id" INTEGER,
    "warrior_platform_link_id" INTEGER,
    "resolution_status" VARCHAR(32) NOT NULL,
    "aggregate_eligible" BOOLEAN NOT NULL DEFAULT false,
    "exclusion_reason" VARCHAR(64),
    "exact" BOOLEAN NOT NULL DEFAULT false,
    "confidence_bps" INTEGER,
    "reason_code" VARCHAR(64) NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "projection_hash" VARCHAR(64) NOT NULL,
    "provenance" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replay_player_identity_projections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_projection_publications" (
    "id" SERIAL NOT NULL,
    "publication_key" VARCHAR(128) NOT NULL,
    "scope" VARCHAR(32) NOT NULL,
    "action" VARCHAR(24) NOT NULL,
    "resolution_run_id" INTEGER,
    "predecessor_publication_id" INTEGER,
    "reason" VARCHAR(1000) NOT NULL,
    "published_by_user_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_projection_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warriors_public_id_key" ON "warriors"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_warriors_seed_platform_account" ON "warriors"("seed_platform_account_id");

-- CreateIndex
CREATE INDEX "ix_warriors_status_name" ON "warriors"("status", "normalized_display_name");

-- CreateIndex
CREATE INDEX "ix_warriors_merged_into" ON "warriors"("merged_into_warrior_id");

-- CreateIndex
CREATE INDEX "ix_warriors_merge_decision" ON "warriors"("merged_by_decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_accounts_public_id_key" ON "platform_accounts"("public_id");

-- CreateIndex
CREATE INDEX "ix_platform_accounts_status_last_seen" ON "platform_accounts"("status", "last_observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_accounts_namespace_external" ON "platform_accounts"("platform", "external_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_name_observations_idempotency" ON "platform_name_observations"("idempotency_key");

-- CreateIndex
CREATE INDEX "ix_platform_name_observations_account_time" ON "platform_name_observations"("platform_account_id", "observed_at");

-- CreateIndex
CREATE INDEX "ix_platform_name_observations_normalized" ON "platform_name_observations"("normalization_version", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_platform_name_observations_snapshot_version" ON "platform_name_observations"("replay_player_snapshot_id", "normalization_version");

-- CreateIndex
CREATE UNIQUE INDEX "provisional_identities_public_id_key" ON "provisional_identities"("public_id");

-- CreateIndex
CREATE INDEX "ix_provisional_identities_status_last_seen" ON "provisional_identities"("status", "last_observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_provisional_identities_version_name" ON "provisional_identities"("normalization_version", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "identity_decisions_public_id_key" ON "identity_decisions"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_decisions_decision_key_key" ON "identity_decisions"("decision_key");

-- CreateIndex
CREATE INDEX "ix_identity_decisions_type_time" ON "identity_decisions"("decision_type", "decided_at");

-- CreateIndex
CREATE INDEX "ix_identity_decisions_supersedes" ON "identity_decisions"("supersedes_decision_id");

-- CreateIndex
CREATE INDEX "ix_identity_decision_subjects_decision" ON "identity_decision_subjects"("decision_id");

-- CreateIndex
CREATE INDEX "ix_identity_decision_subjects_snapshot" ON "identity_decision_subjects"("replay_player_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "warrior_platform_links_link_key_key" ON "warrior_platform_links"("link_key");

-- CreateIndex
CREATE INDEX "ix_warrior_platform_links_account_window" ON "warrior_platform_links"("platform_account_id", "status", "attribution_from", "attribution_to");

-- CreateIndex
CREATE INDEX "ix_warrior_platform_links_warrior_window" ON "warrior_platform_links"("warrior_id", "status", "attribution_from", "attribution_to");

-- CreateIndex
CREATE UNIQUE INDEX "warrior_claims_claim_key_key" ON "warrior_claims"("claim_key");

-- CreateIndex
CREATE INDEX "ix_warrior_claims_warrior_window" ON "warrior_claims"("warrior_id", "role", "status", "effective_from", "effective_to");

-- CreateIndex
CREATE INDEX "ix_warrior_claims_user_status" ON "warrior_claims"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "identity_resolution_runs_public_id_key" ON "identity_resolution_runs"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_resolution_runs_run_key_key" ON "identity_resolution_runs"("run_key");

-- CreateIndex
CREATE INDEX "ix_identity_resolution_runs_version_mode_input" ON "identity_resolution_runs"("resolver_version", "mode", "input_hash");

-- CreateIndex
CREATE INDEX "ix_identity_resolution_runs_status_completed" ON "identity_resolution_runs"("status", "completed_at");

-- CreateIndex
CREATE INDEX "ix_replay_player_identity_projection_run_status" ON "replay_player_identity_projections"("resolution_run_id", "resolution_status");

-- CreateIndex
CREATE INDEX "ix_replay_player_identity_projection_warrior_game" ON "replay_player_identity_projections"("warrior_id", "aggregate_eligible", "game_stats_id");

-- CreateIndex
CREATE INDEX "ix_replay_player_identity_projection_platform_game" ON "replay_player_identity_projections"("platform_account_id", "game_stats_id");

-- CreateIndex
CREATE INDEX "ix_replay_player_identity_projection_provisional_game" ON "replay_player_identity_projections"("provisional_identity_id", "game_stats_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_replay_player_identity_projection_run_snapshot" ON "replay_player_identity_projections"("resolution_run_id", "replay_player_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_projection_publications_publication_key_key" ON "identity_projection_publications"("publication_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_identity_projection_publication_predecessor" ON "identity_projection_publications"("predecessor_publication_id");

-- CreateIndex
CREATE INDEX "ix_identity_projection_publications_scope_id" ON "identity_projection_publications"("scope", "id");

-- CreateIndex
CREATE INDEX "ix_identity_projection_publications_run" ON "identity_projection_publications"("resolution_run_id");

-- AddForeignKey
ALTER TABLE "warriors" ADD CONSTRAINT "warriors_seed_platform_account_id_fkey" FOREIGN KEY ("seed_platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warriors" ADD CONSTRAINT "warriors_merged_into_warrior_id_fkey" FOREIGN KEY ("merged_into_warrior_id") REFERENCES "warriors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warriors" ADD CONSTRAINT "warriors_merged_by_decision_id_fkey" FOREIGN KEY ("merged_by_decision_id") REFERENCES "identity_decisions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "platform_name_observations" ADD CONSTRAINT "platform_name_observations_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "platform_name_observations" ADD CONSTRAINT "platform_name_observations_replay_player_snapshot_id_fkey" FOREIGN KEY ("replay_player_snapshot_id") REFERENCES "replay_player_snapshots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decisions" ADD CONSTRAINT "identity_decisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decisions" ADD CONSTRAINT "identity_decisions_supersedes_decision_id_fkey" FOREIGN KEY ("supersedes_decision_id") REFERENCES "identity_decisions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decision_subjects" ADD CONSTRAINT "identity_decision_subjects_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "identity_decisions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decision_subjects" ADD CONSTRAINT "identity_decision_subjects_warrior_id_fkey" FOREIGN KEY ("warrior_id") REFERENCES "warriors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decision_subjects" ADD CONSTRAINT "identity_decision_subjects_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decision_subjects" ADD CONSTRAINT "identity_decision_subjects_provisional_identity_id_fkey" FOREIGN KEY ("provisional_identity_id") REFERENCES "provisional_identities"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decision_subjects" ADD CONSTRAINT "identity_decision_subjects_site_account_user_id_fkey" FOREIGN KEY ("site_account_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decision_subjects" ADD CONSTRAINT "identity_decision_subjects_warrior_platform_link_id_fkey" FOREIGN KEY ("warrior_platform_link_id") REFERENCES "warrior_platform_links"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decision_subjects" ADD CONSTRAINT "identity_decision_subjects_warrior_claim_id_fkey" FOREIGN KEY ("warrior_claim_id") REFERENCES "warrior_claims"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_decision_subjects" ADD CONSTRAINT "identity_decision_subjects_replay_player_snapshot_id_fkey" FOREIGN KEY ("replay_player_snapshot_id") REFERENCES "replay_player_snapshots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_platform_links" ADD CONSTRAINT "warrior_platform_links_warrior_id_fkey" FOREIGN KEY ("warrior_id") REFERENCES "warriors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_platform_links" ADD CONSTRAINT "warrior_platform_links_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_platform_links" ADD CONSTRAINT "warrior_platform_links_authorized_by_decision_id_fkey" FOREIGN KEY ("authorized_by_decision_id") REFERENCES "identity_decisions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_platform_links" ADD CONSTRAINT "warrior_platform_links_superseded_by_decision_id_fkey" FOREIGN KEY ("superseded_by_decision_id") REFERENCES "identity_decisions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_platform_links" ADD CONSTRAINT "warrior_platform_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_claims" ADD CONSTRAINT "warrior_claims_warrior_id_fkey" FOREIGN KEY ("warrior_id") REFERENCES "warriors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_claims" ADD CONSTRAINT "warrior_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_claims" ADD CONSTRAINT "warrior_claims_authorized_by_decision_id_fkey" FOREIGN KEY ("authorized_by_decision_id") REFERENCES "identity_decisions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "warrior_claims" ADD CONSTRAINT "warrior_claims_superseded_by_decision_id_fkey" FOREIGN KEY ("superseded_by_decision_id") REFERENCES "identity_decisions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_resolution_runs" ADD CONSTRAINT "identity_resolution_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replay_player_identity_projections" ADD CONSTRAINT "replay_player_identity_projections_resolution_run_id_fkey" FOREIGN KEY ("resolution_run_id") REFERENCES "identity_resolution_runs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replay_player_identity_projections" ADD CONSTRAINT "replay_player_identity_projections_replay_player_snapshot__fkey" FOREIGN KEY ("replay_player_snapshot_id") REFERENCES "replay_player_snapshots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replay_player_identity_projections" ADD CONSTRAINT "replay_player_identity_projections_game_stats_id_fkey" FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replay_player_identity_projections" ADD CONSTRAINT "replay_player_identity_projections_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replay_player_identity_projections" ADD CONSTRAINT "replay_player_identity_projections_provisional_identity_id_fkey" FOREIGN KEY ("provisional_identity_id") REFERENCES "provisional_identities"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replay_player_identity_projections" ADD CONSTRAINT "replay_player_identity_projections_warrior_id_fkey" FOREIGN KEY ("warrior_id") REFERENCES "warriors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "replay_player_identity_projections" ADD CONSTRAINT "replay_player_identity_projections_warrior_platform_link_i_fkey" FOREIGN KEY ("warrior_platform_link_id") REFERENCES "warrior_platform_links"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_projection_publications" ADD CONSTRAINT "identity_projection_publications_resolution_run_id_fkey" FOREIGN KEY ("resolution_run_id") REFERENCES "identity_resolution_runs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_projection_publications" ADD CONSTRAINT "identity_projection_publications_predecessor_publication_i_fkey" FOREIGN KEY ("predecessor_publication_id") REFERENCES "identity_projection_publications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_projection_publications" ADD CONSTRAINT "identity_projection_publications_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
-- END PRISMA STRUCTURAL DIFF
-- =============================================================================
-- Player Identity hardening
-- =============================================================================
-- Prisma owns the table, column, ordinary index, and foreign-key structure above.
-- The constraints and triggers below enforce the cross-row, append-only, and
-- lifecycle invariants documented in AoE2WAR-docs commit
-- 94d1ef7b3e2e9efa3fe9555fe257758e087b8f95.

-- State, shape, interval, and confidence checks.
ALTER TABLE "warriors"
  ADD CONSTRAINT "ck_warriors_kind"
    CHECK ("kind" IN ('platform_seed', 'consolidated', 'manual', 'ai')),
  ADD CONSTRAINT "ck_warriors_status"
    CHECK ("status" IN ('provisional', 'active', 'disputed', 'merged', 'retired')),
  ADD CONSTRAINT "ck_warriors_merge_shape"
    CHECK (
      (
        "status" = 'merged'
        AND "merged_into_warrior_id" IS NOT NULL
        AND "merged_by_decision_id" IS NOT NULL
      )
      OR
      (
        "status" <> 'merged'
        AND "merged_into_warrior_id" IS NULL
        AND "merged_by_decision_id" IS NULL
      )
    ),
  ADD CONSTRAINT "ck_warriors_no_self_merge"
    CHECK (
      "merged_into_warrior_id" IS NULL
      OR "merged_into_warrior_id" <> "id"
    ),
  ADD CONSTRAINT "ck_warriors_platform_seed"
    CHECK (
      "kind" <> 'platform_seed'
      OR "seed_platform_account_id" IS NOT NULL
    );

ALTER TABLE "platform_accounts"
  ADD CONSTRAINT "ck_platform_accounts_status"
    CHECK ("status" IN ('active', 'restricted', 'disputed', 'retired')),
  ADD CONSTRAINT "ck_platform_accounts_observation_window"
    CHECK (
      "first_observed_at" IS NULL
      OR "last_observed_at" IS NULL
      OR "first_observed_at" <= "last_observed_at"
    );

ALTER TABLE "platform_name_observations"
  ADD CONSTRAINT "ck_platform_name_observations_confidence"
    CHECK (
      "confidence_bps" IS NULL
      OR "confidence_bps" BETWEEN 0 AND 10000
    );

ALTER TABLE "provisional_identities"
  ADD CONSTRAINT "ck_provisional_identities_status"
    CHECK ("status" IN ('open', 'ambiguous', 'closed', 'retired')),
  ADD CONSTRAINT "ck_provisional_identities_observation_window"
    CHECK ("first_observed_at" <= "last_observed_at");

ALTER TABLE "identity_decisions"
  ADD CONSTRAINT "ck_identity_decisions_interval"
    CHECK (
      "effective_to" IS NULL
      OR (
        "effective_from" IS NOT NULL
        AND "effective_from" < "effective_to"
      )
    ),
  ADD CONSTRAINT "ck_identity_decisions_no_self_supersession"
    CHECK (
      "supersedes_decision_id" IS NULL
      OR "supersedes_decision_id" <> "id"
    );

ALTER TABLE "identity_decision_subjects"
  ADD CONSTRAINT "ck_identity_decision_subjects_exactly_one"
    CHECK (
      num_nonnulls(
        "warrior_id",
        "platform_account_id",
        "provisional_identity_id",
        "site_account_user_id",
        "warrior_platform_link_id",
        "warrior_claim_id",
        "replay_player_snapshot_id"
      ) = 1
    );

CREATE UNIQUE INDEX "uq_identity_decision_subject_exact"
  ON "identity_decision_subjects" (
    "decision_id",
    "subject_role",
    "warrior_id",
    "platform_account_id",
    "provisional_identity_id",
    "site_account_user_id",
    "warrior_platform_link_id",
    "warrior_claim_id",
    "replay_player_snapshot_id"
  ) NULLS NOT DISTINCT;

ALTER TABLE "warrior_platform_links"
  ADD CONSTRAINT "ck_warrior_platform_links_status"
    CHECK (
      "status" IN (
        'proposed',
        'active',
        'rejected',
        'superseded',
        'revoked',
        'disputed'
      )
    ),
  ADD CONSTRAINT "ck_warrior_platform_links_interval"
    CHECK (
      "attribution_to" IS NULL
      OR "attribution_from" < "attribution_to"
    ),
  ADD CONSTRAINT "ck_warrior_platform_links_confidence"
    CHECK (
      "confidence_bps" IS NULL
      OR "confidence_bps" BETWEEN 0 AND 10000
    );

ALTER TABLE "warrior_claims"
  ADD CONSTRAINT "ck_warrior_claims_status"
    CHECK (
      "status" IN (
        'proposed',
        'active',
        'rejected',
        'superseded',
        'revoked',
        'disputed'
      )
    ),
  ADD CONSTRAINT "ck_warrior_claims_role"
    CHECK ("role" = 'primary'),
  ADD CONSTRAINT "ck_warrior_claims_interval"
    CHECK (
      "effective_to" IS NULL
      OR (
        "effective_from" IS NOT NULL
        AND "effective_from" < "effective_to"
      )
    ),
  ADD CONSTRAINT "ck_warrior_claims_active_start"
    CHECK (
      "status" <> 'active'
      OR "effective_from" IS NOT NULL
    );

ALTER TABLE "identity_resolution_runs"
  ADD CONSTRAINT "ck_identity_resolution_runs_status"
    CHECK ("status" IN ('running', 'succeeded', 'failed', 'cancelled')),
  ADD CONSTRAINT "ck_identity_resolution_runs_lifecycle"
    CHECK (
      (
        "status" = 'running'
        AND "completed_at" IS NULL
        AND "result_hash" IS NULL
      )
      OR
      (
        "status" = 'succeeded'
        AND "completed_at" IS NOT NULL
        AND "result_hash" IS NOT NULL
        AND "counts" IS NOT NULL
      )
      OR
      (
        "status" IN ('failed', 'cancelled')
        AND "completed_at" IS NOT NULL
      )
    );

ALTER TABLE "replay_player_identity_projections"
  ADD CONSTRAINT "ck_replay_identity_projection_confidence"
    CHECK (
      "confidence_bps" IS NULL
      OR "confidence_bps" BETWEEN 0 AND 10000
    ),
  ADD CONSTRAINT "ck_replay_identity_projection_target_exclusive"
    CHECK (
      NOT (
        "platform_account_id" IS NOT NULL
        AND "provisional_identity_id" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "ck_replay_identity_projection_warrior_shape"
    CHECK (
      "warrior_id" IS NULL
      OR (
        "platform_account_id" IS NOT NULL
        AND "warrior_platform_link_id" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "ck_replay_identity_projection_link_shape"
    CHECK (
      "warrior_platform_link_id" IS NULL
      OR (
        "warrior_id" IS NOT NULL
        AND "platform_account_id" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "ck_replay_identity_projection_aggregate_shape"
    CHECK (
      "aggregate_eligible" = FALSE
      OR (
        "resolution_status" = 'resolved'
        AND "warrior_id" IS NOT NULL
        AND "platform_account_id" IS NOT NULL
        AND "warrior_platform_link_id" IS NOT NULL
        AND "exclusion_reason" IS NULL
      )
    ),
  ADD CONSTRAINT "ck_replay_identity_projection_exclusion_shape"
    CHECK (
      "exclusion_reason" IS NULL
      OR "aggregate_eligible" = FALSE
    );

ALTER TABLE "identity_projection_publications"
  ADD CONSTRAINT "ck_identity_projection_publications_action"
    CHECK ("action" IN ('publish_run', 'use_legacy')),
  ADD CONSTRAINT "ck_identity_projection_publications_target"
    CHECK (
      (
        "action" = 'publish_run'
        AND "resolution_run_id" IS NOT NULL
      )
      OR
      (
        "action" = 'use_legacy'
        AND "resolution_run_id" IS NULL
      )
    ),
  ADD CONSTRAINT "ck_identity_projection_publications_no_self_predecessor"
    CHECK (
      "predecessor_publication_id" IS NULL
      OR "predecessor_publication_id" <> "id"
    );

-- Fast-path uniqueness for open-ended authoritative intervals. Triggers below
-- also reject every finite overlap.
CREATE UNIQUE INDEX "uq_warrior_platform_links_open_active_account"
  ON "warrior_platform_links" ("platform_account_id")
  WHERE "status" = 'active' AND "attribution_to" IS NULL;

CREATE UNIQUE INDEX "uq_warrior_claims_open_active_primary"
  ON "warrior_claims" ("warrior_id")
  WHERE (
    "status" = 'active'
    AND "role" = 'primary'
    AND "effective_to" IS NULL
  );

-- Shared rejection function for immutable ledgers.
CREATE OR REPLACE FUNCTION "reject_player_identity_append_only_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only; append a superseding identity record instead',
    TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "platform_name_observations_append_only"
BEFORE UPDATE OR DELETE ON "platform_name_observations"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "platform_name_observations_append_only_truncate"
BEFORE TRUNCATE ON "platform_name_observations"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "identity_decisions_append_only"
BEFORE UPDATE OR DELETE ON "identity_decisions"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "identity_decisions_append_only_truncate"
BEFORE TRUNCATE ON "identity_decisions"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "identity_decision_subjects_append_only"
BEFORE UPDATE OR DELETE ON "identity_decision_subjects"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "identity_decision_subjects_append_only_truncate"
BEFORE TRUNCATE ON "identity_decision_subjects"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "replay_player_identity_projections_append_only"
BEFORE UPDATE OR DELETE ON "replay_player_identity_projections"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "replay_player_identity_projections_append_only_truncate"
BEFORE TRUNCATE ON "replay_player_identity_projections"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "identity_projection_publications_append_only"
BEFORE UPDATE OR DELETE ON "identity_projection_publications"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

CREATE TRIGGER "identity_projection_publications_append_only_truncate"
BEFORE TRUNCATE ON "identity_projection_publications"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_append_only_mutation"();

-- Mutable identity entities may evolve only through bounded fields. Deletes and
-- truncation remain forbidden.
CREATE OR REPLACE FUNCTION "reject_player_identity_delete_or_truncate"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    '% cannot be deleted or truncated; use a reviewed lifecycle transition',
    TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "warriors_no_delete"
BEFORE DELETE ON "warriors"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "warriors_no_truncate"
BEFORE TRUNCATE ON "warriors"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "platform_accounts_no_delete"
BEFORE DELETE ON "platform_accounts"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "platform_accounts_no_truncate"
BEFORE TRUNCATE ON "platform_accounts"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "provisional_identities_no_delete"
BEFORE DELETE ON "provisional_identities"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "provisional_identities_no_truncate"
BEFORE TRUNCATE ON "provisional_identities"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "warrior_platform_links_no_delete"
BEFORE DELETE ON "warrior_platform_links"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "warrior_platform_links_no_truncate"
BEFORE TRUNCATE ON "warrior_platform_links"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "warrior_claims_no_delete"
BEFORE DELETE ON "warrior_claims"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "warrior_claims_no_truncate"
BEFORE TRUNCATE ON "warrior_claims"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "identity_resolution_runs_no_delete"
BEFORE DELETE ON "identity_resolution_runs"
FOR EACH ROW EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

CREATE TRIGGER "identity_resolution_runs_no_truncate"
BEFORE TRUNCATE ON "identity_resolution_runs"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_player_identity_delete_or_truncate"();

-- Platform-account keys are immutable; replay windows may only expand.
CREATE OR REPLACE FUNCTION "enforce_platform_account_update"()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW."id",
    NEW."public_id",
    NEW."platform",
    NEW."external_account_id",
    NEW."created_from",
    NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id",
    OLD."public_id",
    OLD."platform",
    OLD."external_account_id",
    OLD."created_from",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION
      'platform account identity keys and creation evidence are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."first_observed_at" IS NOT NULL
     AND (
       NEW."first_observed_at" IS NULL
       OR NEW."first_observed_at" > OLD."first_observed_at"
     ) THEN
    RAISE EXCEPTION
      'platform account first_observed_at may only move earlier'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."last_observed_at" IS NOT NULL
     AND (
       NEW."last_observed_at" IS NULL
       OR NEW."last_observed_at" < OLD."last_observed_at"
     ) THEN
    RAISE EXCEPTION
      'platform account last_observed_at may only move later'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "platform_accounts_bounded_update"
BEFORE UPDATE ON "platform_accounts"
FOR EACH ROW EXECUTE FUNCTION "enforce_platform_account_update"();

-- Provisional keys are immutable; their evidence window may only expand.
CREATE OR REPLACE FUNCTION "enforce_provisional_identity_update"()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW."id",
    NEW."public_id",
    NEW."normalization_version",
    NEW."normalized_name",
    NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id",
    OLD."public_id",
    OLD."normalization_version",
    OLD."normalized_name",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION
      'provisional identity key and creation evidence are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."first_observed_at" > OLD."first_observed_at" THEN
    RAISE EXCEPTION
      'provisional first_observed_at may only move earlier'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."last_observed_at" < OLD."last_observed_at" THEN
    RAISE EXCEPTION
      'provisional last_observed_at may only move later'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "provisional_identities_bounded_update"
BEFORE UPDATE ON "provisional_identities"
FOR EACH ROW EXECUTE FUNCTION "enforce_provisional_identity_update"();

-- Warrior seed identity is immutable. A merged Warrior is terminal, and every
-- merge is cycle-checked under deterministic advisory locks.
CREATE OR REPLACE FUNCTION "enforce_warrior_update"()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(
    NEW."id",
    NEW."public_id",
    NEW."seed_platform_account_id",
    NEW."kind",
    NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id",
    OLD."public_id",
    OLD."seed_platform_account_id",
    OLD."kind",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION
      'Warrior identity seed and creation fields are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = 'merged'
     AND ROW(
       NEW."preferred_display_name",
       NEW."normalized_display_name",
       NEW."status",
       NEW."merged_into_warrior_id",
       NEW."merged_by_decision_id"
     ) IS DISTINCT FROM ROW(
       OLD."preferred_display_name",
       OLD."normalized_display_name",
       OLD."status",
       OLD."merged_into_warrior_id",
       OLD."merged_by_decision_id"
     ) THEN
    RAISE EXCEPTION
      'merged Warrior identity is terminal'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "warriors_bounded_update"
BEFORE UPDATE ON "warriors"
FOR EACH ROW EXECUTE FUNCTION "enforce_warrior_update"();

CREATE OR REPLACE FUNCTION "enforce_warrior_merge_acyclic"()
RETURNS TRIGGER AS $$
DECLARE
  has_cycle BOOLEAN;
  lock_low INTEGER;
  lock_high INTEGER;
BEGIN
  IF NEW."status" <> 'merged' THEN
    RETURN NEW;
  END IF;

  IF NEW."merged_into_warrior_id" = NEW."id" THEN
    RAISE EXCEPTION
      'Warrior cannot merge into itself'
      USING ERRCODE = '23514';
  END IF;

  lock_low := LEAST(NEW."id", NEW."merged_into_warrior_id");
  lock_high := GREATEST(NEW."id", NEW."merged_into_warrior_id");

  PERFORM pg_advisory_xact_lock(207704, lock_low);
  IF lock_high <> lock_low THEN
    PERFORM pg_advisory_xact_lock(207704, lock_high);
  END IF;

  WITH RECURSIVE merge_chain AS (
    SELECT
      "id",
      "merged_into_warrior_id",
      ARRAY["id"]::INTEGER[] AS visited
    FROM "warriors"
    WHERE "id" = NEW."merged_into_warrior_id"

    UNION ALL

    SELECT
      next_warrior."id",
      next_warrior."merged_into_warrior_id",
      merge_chain.visited || next_warrior."id"
    FROM "warriors" AS next_warrior
    JOIN merge_chain
      ON next_warrior."id" = merge_chain."merged_into_warrior_id"
    WHERE NOT next_warrior."id" = ANY(merge_chain.visited)
  )
  SELECT EXISTS (
    SELECT 1
    FROM merge_chain
    WHERE "id" = NEW."id"
       OR "merged_into_warrior_id" = NEW."id"
  )
  INTO has_cycle;

  IF has_cycle THEN
    RAISE EXCEPTION
      'Warrior merge would create a cycle'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "warriors_merge_acyclic"
BEFORE INSERT OR UPDATE OF
  "status",
  "merged_into_warrior_id",
  "merged_by_decision_id"
ON "warriors"
FOR EACH ROW EXECUTE FUNCTION "enforce_warrior_merge_acyclic"();

-- Links and claims preserve their original evidence and identity fields. A
-- proposal is never activated in place: activation is a new row authorized by
-- a new decision. Existing rows may only enter a terminal disposition.
CREATE OR REPLACE FUNCTION "enforce_warrior_platform_link_update"()
RETURNS TRIGGER AS $$
BEGIN
  -- Evaluate lifecycle intent before the broader immutable-evidence guard so
  -- attempted in-place activation receives the authoritative rejection reason.
  IF ROW(
    NEW."status",
    NEW."attribution_to",
    NEW."superseded_by_decision_id"
  ) IS DISTINCT FROM ROW(
    OLD."status",
    OLD."attribution_to",
    OLD."superseded_by_decision_id"
  ) THEN
    IF OLD."status" IN (
      'rejected',
      'superseded',
      'revoked',
      'disputed'
    ) THEN
      RAISE EXCEPTION
        'terminal Warrior-platform link cannot transition again'
        USING ERRCODE = '55000';
    END IF;

    IF NEW."status" NOT IN (
      'rejected',
      'superseded',
      'revoked',
      'disputed'
    ) THEN
      RAISE EXCEPTION
        'Warrior-platform link activation requires a new authorized row'
        USING ERRCODE = '55000';
    END IF;

    IF NEW."superseded_by_decision_id" IS NULL THEN
      RAISE EXCEPTION
        'Warrior-platform link terminal transition requires a new decision'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF ROW(
    NEW."id",
    NEW."link_key",
    NEW."warrior_id",
    NEW."platform_account_id",
    NEW."attribution_from",
    NEW."control_verified_at",
    NEW."verification_method",
    NEW."confidence_bps",
    NEW."evidence",
    NEW."authorized_by_decision_id",
    NEW."created_by_user_id",
    NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id",
    OLD."link_key",
    OLD."warrior_id",
    OLD."platform_account_id",
    OLD."attribution_from",
    OLD."control_verified_at",
    OLD."verification_method",
    OLD."confidence_bps",
    OLD."evidence",
    OLD."authorized_by_decision_id",
    OLD."created_by_user_id",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION
      'Warrior-platform link identity and original evidence are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."superseded_by_decision_id" IS NOT NULL
     AND NEW."superseded_by_decision_id"
         IS DISTINCT FROM OLD."superseded_by_decision_id" THEN
    RAISE EXCEPTION
      'Warrior-platform link superseding decision is immutable once set'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "warrior_platform_links_bounded_update"
BEFORE UPDATE ON "warrior_platform_links"
FOR EACH ROW EXECUTE FUNCTION "enforce_warrior_platform_link_update"();

CREATE OR REPLACE FUNCTION "enforce_warrior_claim_update"()
RETURNS TRIGGER AS $$
BEGIN
  -- Evaluate lifecycle intent before the broader immutable-evidence guard so
  -- attempted in-place activation receives the authoritative rejection reason.
  IF ROW(
    NEW."status",
    NEW."effective_to",
    NEW."superseded_by_decision_id"
  ) IS DISTINCT FROM ROW(
    OLD."status",
    OLD."effective_to",
    OLD."superseded_by_decision_id"
  ) THEN
    IF OLD."status" IN (
      'rejected',
      'superseded',
      'revoked',
      'disputed'
    ) THEN
      RAISE EXCEPTION
        'terminal Warrior claim cannot transition again'
        USING ERRCODE = '55000';
    END IF;

    IF NEW."status" NOT IN (
      'rejected',
      'superseded',
      'revoked',
      'disputed'
    ) THEN
      RAISE EXCEPTION
        'Warrior claim activation requires a new authorized row'
        USING ERRCODE = '55000';
    END IF;

    IF NEW."superseded_by_decision_id" IS NULL THEN
      RAISE EXCEPTION
        'Warrior claim terminal transition requires a new decision'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF ROW(
    NEW."id",
    NEW."claim_key",
    NEW."warrior_id",
    NEW."user_id",
    NEW."role",
    NEW."effective_from",
    NEW."verification_method",
    NEW."evidence",
    NEW."authorized_by_decision_id",
    NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id",
    OLD."claim_key",
    OLD."warrior_id",
    OLD."user_id",
    OLD."role",
    OLD."effective_from",
    OLD."verification_method",
    OLD."evidence",
    OLD."authorized_by_decision_id",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION
      'Warrior claim identity and original evidence are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."superseded_by_decision_id" IS NOT NULL
     AND NEW."superseded_by_decision_id"
         IS DISTINCT FROM OLD."superseded_by_decision_id" THEN
    RAISE EXCEPTION
      'Warrior claim superseding decision is immutable once set'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "warrior_claims_bounded_update"
BEFORE UPDATE ON "warrior_claims"
FOR EACH ROW EXECUTE FUNCTION "enforce_warrior_claim_update"();

-- One active Warrior attribution interval per PlatformAccount.
CREATE OR REPLACE FUNCTION "enforce_warrior_platform_link_overlap"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" <> 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(207701, NEW."platform_account_id");

  IF EXISTS (
    SELECT 1
    FROM "warrior_platform_links" AS existing
    WHERE existing."platform_account_id" = NEW."platform_account_id"
      AND existing."status" = 'active'
      AND existing."id" <> NEW."id"
      AND COALESCE(
        existing."attribution_to",
        'infinity'::TIMESTAMP
      ) > NEW."attribution_from"
      AND COALESCE(
        NEW."attribution_to",
        'infinity'::TIMESTAMP
      ) > existing."attribution_from"
  ) THEN
    RAISE EXCEPTION
      'active Warrior attribution overlaps another link for PlatformAccount %',
      NEW."platform_account_id"
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "warrior_platform_links_no_active_overlap"
BEFORE INSERT OR UPDATE OF
  "platform_account_id",
  "status",
  "attribution_from",
  "attribution_to"
ON "warrior_platform_links"
FOR EACH ROW EXECUTE FUNCTION "enforce_warrior_platform_link_overlap"();

-- One active primary controller interval per Warrior.
CREATE OR REPLACE FUNCTION "enforce_warrior_claim_overlap"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" <> 'active' OR NEW."role" <> 'primary' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(207702, NEW."warrior_id");

  IF EXISTS (
    SELECT 1
    FROM "warrior_claims" AS existing
    WHERE existing."warrior_id" = NEW."warrior_id"
      AND existing."status" = 'active'
      AND existing."role" = 'primary'
      AND existing."id" <> NEW."id"
      AND COALESCE(
        existing."effective_to",
        'infinity'::TIMESTAMP
      ) > NEW."effective_from"
      AND COALESCE(
        NEW."effective_to",
        'infinity'::TIMESTAMP
      ) > existing."effective_from"
  ) THEN
    RAISE EXCEPTION
      'active primary claim overlaps another claim for Warrior %',
      NEW."warrior_id"
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "warrior_claims_no_active_overlap"
BEFORE INSERT OR UPDATE OF
  "warrior_id",
  "role",
  "status",
  "effective_from",
  "effective_to"
ON "warrior_claims"
FOR EACH ROW EXECUTE FUNCTION "enforce_warrior_claim_overlap"();

-- Resolution runs start in running state, may transition to one terminal state
-- exactly once, and preserve every input-defining field.
CREATE OR REPLACE FUNCTION "enforce_identity_resolution_run_lifecycle"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'running' THEN
      RAISE EXCEPTION
        'identity resolution run must be inserted in running state'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" <> 'running' THEN
    RAISE EXCEPTION
      'terminal identity resolution run is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF ROW(
    NEW."id",
    NEW."public_id",
    NEW."run_key",
    NEW."resolver_version",
    NEW."normalization_version",
    NEW."schema_version",
    NEW."comparison_policy_version",
    NEW."mode",
    NEW."source_watermark",
    NEW."input_hash",
    NEW."started_at",
    NEW."created_by_user_id",
    NEW."created_at"
  ) IS DISTINCT FROM ROW(
    OLD."id",
    OLD."public_id",
    OLD."run_key",
    OLD."resolver_version",
    OLD."normalization_version",
    OLD."schema_version",
    OLD."comparison_policy_version",
    OLD."mode",
    OLD."source_watermark",
    OLD."input_hash",
    OLD."started_at",
    OLD."created_by_user_id",
    OLD."created_at"
  ) THEN
    RAISE EXCEPTION
      'identity resolution run inputs and creation evidence are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."status" NOT IN (
    'running',
    'succeeded',
    'failed',
    'cancelled'
  ) THEN
    RAISE EXCEPTION
      'invalid identity resolution run transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "identity_resolution_runs_lifecycle"
BEFORE INSERT OR UPDATE ON "identity_resolution_runs"
FOR EACH ROW EXECUTE FUNCTION "enforce_identity_resolution_run_lifecycle"();

-- Projection inserts are legal only during a running parent run and must match
-- immutable replay evidence, exact Steam identity, and any claimed Warrior link.
CREATE OR REPLACE FUNCTION "validate_replay_player_identity_projection"()
RETURNS TRIGGER AS $$
DECLARE
  run_status VARCHAR(24);
  source_game_stats_id INTEGER;
  source_steam_id VARCHAR(32);
  target_platform VARCHAR(24);
  target_external_account_id VARCHAR(64);
  link_valid BOOLEAN;
BEGIN
  SELECT "status"
  INTO run_status
  FROM "identity_resolution_runs"
  WHERE "id" = NEW."resolution_run_id"
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'identity resolution run % does not exist',
      NEW."resolution_run_id"
      USING ERRCODE = '23503';
  END IF;

  IF run_status <> 'running' THEN
    RAISE EXCEPTION
      'projections may be inserted only while parent run is running'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    "game_stats_id",
    "steam_id"
  INTO
    source_game_stats_id,
    source_steam_id
  FROM "replay_player_snapshots"
  WHERE "id" = NEW."replay_player_snapshot_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'replay player snapshot % does not exist',
      NEW."replay_player_snapshot_id"
      USING ERRCODE = '23503';
  END IF;

  IF source_game_stats_id <> NEW."game_stats_id" THEN
    RAISE EXCEPTION
      'projection game_stats_id must match source replay snapshot'
      USING ERRCODE = '23514';
  END IF;

  IF source_steam_id IS NOT NULL THEN
    IF NEW."platform_account_id" IS NULL THEN
      RAISE EXCEPTION
        'Steam-backed replay snapshot requires exact PlatformAccount'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      "platform",
      "external_account_id"
    INTO
      target_platform,
      target_external_account_id
    FROM "platform_accounts"
    WHERE "id" = NEW."platform_account_id";

    IF NOT FOUND
       OR target_platform <> 'steam'
       OR target_external_account_id <> source_steam_id THEN
      RAISE EXCEPTION
        'Steam-backed replay snapshot cannot project to a different PlatformAccount'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."warrior_id" IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM "warrior_platform_links"
      WHERE "id" = NEW."warrior_platform_link_id"
        AND "warrior_id" = NEW."warrior_id"
        AND "platform_account_id" = NEW."platform_account_id"
        AND "status" = 'active'
        AND "attribution_from" <= NEW."effective_game_at"
        AND (
          "attribution_to" IS NULL
          OR NEW."effective_game_at" < "attribution_to"
        )
    )
    INTO link_valid;

    IF NOT link_valid THEN
      RAISE EXCEPTION
        'Warrior projection requires a covering active Warrior-platform link'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_player_identity_projections_validate_insert"
BEFORE INSERT ON "replay_player_identity_projections"
FOR EACH ROW EXECUTE FUNCTION "validate_replay_player_identity_projection"();

-- Publication is an append-only, scope-linear chain. Publication serializes by
-- scope and may select only a succeeded run or explicit legacy mode.
CREATE OR REPLACE FUNCTION "validate_identity_projection_publication"()
RETURNS TRIGGER AS $$
DECLARE
  latest_publication_id INTEGER;
  selected_run_status VARCHAR(24);
BEGIN
  PERFORM pg_advisory_xact_lock(207703, hashtext(NEW."scope"));

  SELECT "id"
  INTO latest_publication_id
  FROM "identity_projection_publications"
  WHERE "scope" = NEW."scope"
  ORDER BY "id" DESC
  LIMIT 1;

  IF latest_publication_id IS NULL THEN
    IF NEW."predecessor_publication_id" IS NOT NULL THEN
      RAISE EXCEPTION
        'first publication for a scope must have no predecessor'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."predecessor_publication_id"
        IS DISTINCT FROM latest_publication_id THEN
    RAISE EXCEPTION
      'publication predecessor must be the current latest publication for scope %',
      NEW."scope"
      USING ERRCODE = '40001';
  END IF;

  IF NEW."action" = 'publish_run' THEN
    SELECT "status"
    INTO selected_run_status
    FROM "identity_resolution_runs"
    WHERE "id" = NEW."resolution_run_id";

    IF NOT FOUND OR selected_run_status <> 'succeeded' THEN
      RAISE EXCEPTION
        'publication may reference only a succeeded identity resolution run'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "identity_projection_publications_validate_insert"
BEFORE INSERT ON "identity_projection_publications"
FOR EACH ROW EXECUTE FUNCTION "validate_identity_projection_publication"();

COMMENT ON TABLE "warriors" IS
  'Competitive career identities. They do not own wallets, wagers, posts, messages, or moderation history.';
COMMENT ON TABLE "platform_accounts" IS
  'Durable external platform accounts such as SteamID64; not equivalent to a human controller.';
COMMENT ON TABLE "platform_name_observations" IS
  'Append-only exact names observed for a PlatformAccount, versioned by replay snapshot and normalization contract.';
COMMENT ON TABLE "identity_decisions" IS
  'Append-only operator and system identity adjudications.';
COMMENT ON TABLE "replay_player_identity_projections" IS
  'Immutable versioned interpretations of replay-player evidence inside one controlled resolver run.';
COMMENT ON TABLE "identity_projection_publications" IS
  'Append-only scope-level publication chain selecting a succeeded identity run or explicit legacy mode.';

COMMIT;
