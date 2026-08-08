BEGIN;

CREATE TABLE "round_proposals" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "category" VARCHAR(40) NOT NULL DEFAULT 'kingdom',
  "title" VARCHAR(180) NOT NULL,
  "summary" VARCHAR(500) NOT NULL,
  "body" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "created_by_user_id" INTEGER,
  "created_by_label" VARCHAR(120) NOT NULL DEFAULT 'Founding Steward',
  "voting_closes_at" TIMESTAMP(6),
  "decided_at" TIMESTAMP(6),
  "decision_note" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_round_proposals_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_round_proposals_status" CHECK ("status" IN ('open', 'adopted', 'declined', 'withdrawn', 'archived')),
  CONSTRAINT "ck_round_proposals_copy" CHECK (length(btrim("title")) >= 3 AND length(btrim("summary")) >= 3 AND length(btrim("body")) >= 10)
);
CREATE UNIQUE INDEX "round_proposals_public_id_key" ON "round_proposals"("public_id");
CREATE INDEX "ix_round_proposals_status_created" ON "round_proposals"("status", "created_at");
CREATE INDEX "ix_round_proposals_category_status" ON "round_proposals"("category", "status");
CREATE INDEX "ix_round_proposals_creator_created" ON "round_proposals"("created_by_user_id", "created_at");

CREATE TABLE "round_votes" (
  "id" SERIAL PRIMARY KEY,
  "proposal_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "choice" VARCHAR(16) NOT NULL,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_round_votes_proposal" FOREIGN KEY ("proposal_id") REFERENCES "round_proposals"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_round_votes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_round_votes_choice" CHECK ("choice" IN ('support', 'oppose'))
);
CREATE UNIQUE INDEX "uq_round_votes_proposal_user" ON "round_votes"("proposal_id", "user_id");
CREATE INDEX "ix_round_votes_user_updated" ON "round_votes"("user_id", "updated_at");

CREATE TABLE "round_comments" (
  "id" SERIAL PRIMARY KEY,
  "proposal_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_round_comments_proposal" FOREIGN KEY ("proposal_id") REFERENCES "round_proposals"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_round_comments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_round_comments_body" CHECK (length(btrim("body")) BETWEEN 1 AND 4000)
);
CREATE INDEX "ix_round_comments_proposal_created" ON "round_comments"("proposal_id", "created_at");
CREATE INDEX "ix_round_comments_user_created" ON "round_comments"("user_id", "created_at");

CREATE TABLE "round_events" (
  "id" SERIAL PRIMARY KEY,
  "proposal_id" INTEGER,
  "actor_user_id" INTEGER,
  "event_type" VARCHAR(32) NOT NULL,
  "detail" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_round_events_proposal" FOREIGN KEY ("proposal_id") REFERENCES "round_proposals"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_round_events_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX "ix_round_events_proposal_created" ON "round_events"("proposal_id", "created_at");
CREATE INDEX "ix_round_events_type_created" ON "round_events"("event_type", "created_at");

CREATE OR REPLACE FUNCTION "prevent_round_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'round_events is append-only; append a superseding civic event instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "round_events_append_only"
BEFORE UPDATE OR DELETE ON "round_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_round_event_mutation"();
CREATE TRIGGER "round_events_append_only_truncate"
BEFORE TRUNCATE ON "round_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_round_event_mutation"();

CREATE TABLE "forge_projects" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(80) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "category" VARCHAR(40) NOT NULL DEFAULT 'kingdom',
  "summary" VARCHAR(500) NOT NULL,
  "body" TEXT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'gathering',
  "target_wolo" BIGINT NOT NULL,
  "development_days" INTEGER NOT NULL DEFAULT 120,
  "total_deeds" INTEGER NOT NULL DEFAULT 10000,
  "patron_deeds" INTEGER NOT NULL DEFAULT 7000,
  "builder_deeds" INTEGER NOT NULL DEFAULT 2000,
  "kingdom_deeds" INTEGER NOT NULL DEFAULT 1000,
  "featured_order" INTEGER NOT NULL DEFAULT 0,
  "target_date" TIMESTAMP(6),
  "shipped_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_forge_projects_status" CHECK ("status" IN ('gathering', 'authorized', 'building', 'shipped', 'paused', 'closed')),
  CONSTRAINT "ck_forge_projects_target" CHECK ("target_wolo" > 0),
  CONSTRAINT "ck_forge_projects_development_days" CHECK ("development_days" BETWEEN 1 AND 1460),
  CONSTRAINT "ck_forge_projects_deeds" CHECK ("total_deeds" = 10000 AND "patron_deeds" = 7000 AND "builder_deeds" = 2000 AND "kingdom_deeds" = 1000)
);
CREATE UNIQUE INDEX "forge_projects_public_id_key" ON "forge_projects"("public_id");
CREATE UNIQUE INDEX "forge_projects_slug_key" ON "forge_projects"("slug");
CREATE INDEX "ix_forge_projects_status_featured" ON "forge_projects"("status", "featured_order");
CREATE INDEX "ix_forge_projects_category_status" ON "forge_projects"("category", "status");

CREATE TABLE "forge_milestones" (
  "id" SERIAL PRIMARY KEY,
  "project_id" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "summary" VARCHAR(500) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'sealed',
  "completed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_forge_milestones_project" FOREIGN KEY ("project_id") REFERENCES "forge_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_forge_milestones_sequence" CHECK ("sequence" > 0),
  CONSTRAINT "ck_forge_milestones_status" CHECK ("status" IN ('sealed', 'ready', 'building', 'proven', 'failed'))
);
CREATE UNIQUE INDEX "uq_forge_milestones_project_sequence" ON "forge_milestones"("project_id", "sequence");
CREATE INDEX "ix_forge_milestones_project_status" ON "forge_milestones"("project_id", "status");

CREATE TABLE "forge_commitments" (
  "id" SERIAL PRIMARY KEY,
  "project_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "amount_wolo" BIGINT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'signalled',
  "settlement_mode" VARCHAR(32) NOT NULL DEFAULT 'app_signal',
  "funding_memo" VARCHAR(255),
  "funding_tx_hash" VARCHAR(128),
  "confirmed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_forge_commitments_project" FOREIGN KEY ("project_id") REFERENCES "forge_projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_forge_commitments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_forge_commitments_amount" CHECK ("amount_wolo" > 0),
  CONSTRAINT "ck_forge_commitments_status" CHECK ("status" IN ('signalled', 'awaiting_funding', 'funded', 'withdrawn', 'released', 'refunded')),
  CONSTRAINT "ck_forge_commitments_mode" CHECK ("settlement_mode" IN ('app_signal', 'chain_verified', 'manual')),
  CONSTRAINT "ck_forge_commitments_funded_mode" CHECK ("status" <> 'funded' OR "settlement_mode" = 'chain_verified'),
  CONSTRAINT "ck_forge_commitments_chain_proof" CHECK ("settlement_mode" <> 'chain_verified' OR ("status" IN ('funded', 'released', 'refunded') AND "funding_tx_hash" IS NOT NULL AND "funding_memo" IS NOT NULL AND "confirmed_at" IS NOT NULL AND "funding_tx_hash" = upper("funding_tx_hash")))
);
CREATE UNIQUE INDEX "uq_forge_commitments_project_user" ON "forge_commitments"("project_id", "user_id");
CREATE UNIQUE INDEX "forge_commitments_funding_memo_key" ON "forge_commitments"("funding_memo");
CREATE UNIQUE INDEX "forge_commitments_funding_tx_hash_key" ON "forge_commitments"("funding_tx_hash");
CREATE UNIQUE INDEX "uq_forge_commitments_funding_tx_hash_normalized" ON "forge_commitments"(lower("funding_tx_hash")) WHERE "funding_tx_hash" IS NOT NULL;
CREATE INDEX "ix_forge_commitments_user_status" ON "forge_commitments"("user_id", "status");
CREATE INDEX "ix_forge_commitments_project_status" ON "forge_commitments"("project_id", "status");

CREATE TABLE "forge_deed_holdings" (
  "id" SERIAL PRIMARY KEY,
  "project_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "deed_class" VARCHAR(24) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "rights_mode" VARCHAR(40) NOT NULL DEFAULT 'provenance_governance',
  "source_ref" VARCHAR(180) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_forge_deed_holdings_project" FOREIGN KEY ("project_id") REFERENCES "forge_projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_forge_deed_holdings_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_forge_deed_holdings_class" CHECK ("deed_class" IN ('patron', 'builder', 'kingdom')),
  CONSTRAINT "ck_forge_deed_holdings_quantity" CHECK ("quantity" BETWEEN 1 AND 10000),
  CONSTRAINT "ck_forge_deed_holdings_rights" CHECK ("rights_mode" = 'provenance_governance')
);
CREATE UNIQUE INDEX "forge_deed_holdings_source_ref_key" ON "forge_deed_holdings"("source_ref");
CREATE INDEX "ix_forge_deed_holdings_project_class" ON "forge_deed_holdings"("project_id", "deed_class");
CREATE INDEX "ix_forge_deed_holdings_user_created" ON "forge_deed_holdings"("user_id", "created_at");

CREATE OR REPLACE FUNCTION "enforce_forge_deed_class_supply"()
RETURNS TRIGGER AS $$
DECLARE
  class_limit INTEGER;
  issued_quantity INTEGER;
BEGIN
  PERFORM 1 FROM "forge_projects" WHERE "id" = NEW."project_id" FOR UPDATE;
  SELECT CASE NEW."deed_class"
    WHEN 'patron' THEN "patron_deeds"
    WHEN 'builder' THEN "builder_deeds"
    WHEN 'kingdom' THEN "kingdom_deeds"
  END
  INTO class_limit
  FROM "forge_projects"
  WHERE "id" = NEW."project_id";

  SELECT COALESCE(sum("quantity"), 0)
  INTO issued_quantity
  FROM "forge_deed_holdings"
  WHERE "project_id" = NEW."project_id"
    AND "deed_class" = NEW."deed_class"
    AND (TG_OP = 'INSERT' OR "id" <> NEW."id");

  IF class_limit IS NULL OR issued_quantity + NEW."quantity" > class_limit THEN
    RAISE EXCEPTION 'forge deed class supply exceeded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "forge_deed_class_supply_guard"
BEFORE INSERT OR UPDATE ON "forge_deed_holdings"
FOR EACH ROW EXECUTE FUNCTION "enforce_forge_deed_class_supply"();

CREATE TABLE "forge_events" (
  "id" SERIAL PRIMARY KEY,
  "project_id" INTEGER,
  "actor_user_id" INTEGER,
  "event_type" VARCHAR(32) NOT NULL,
  "detail" TEXT NOT NULL,
  "amount_wolo" BIGINT,
  "tx_hash" VARCHAR(128),
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_forge_events_project" FOREIGN KEY ("project_id") REFERENCES "forge_projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_forge_events_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_forge_events_amount" CHECK ("amount_wolo" IS NULL OR "amount_wolo" >= 0)
);
CREATE INDEX "ix_forge_events_project_created" ON "forge_events"("project_id", "created_at");
CREATE INDEX "ix_forge_events_type_created" ON "forge_events"("event_type", "created_at");
CREATE INDEX "ix_forge_events_tx_hash" ON "forge_events"("tx_hash");

CREATE OR REPLACE FUNCTION "prevent_forge_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'forge_events is append-only; append a superseding forge event instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "forge_events_append_only"
BEFORE UPDATE OR DELETE ON "forge_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_forge_event_mutation"();
CREATE TRIGGER "forge_events_append_only_truncate"
BEFORE TRUNCATE ON "forge_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_forge_event_mutation"();

CREATE TABLE "oracle_markets" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(100) NOT NULL,
  "question" VARCHAR(240) NOT NULL,
  "summary" VARCHAR(500) NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "outcome_type" VARCHAR(24) NOT NULL DEFAULT 'binary',
  "status" VARCHAR(24) NOT NULL DEFAULT 'trading',
  "closes_at" TIMESTAMP(6) NOT NULL,
  "resolves_at" TIMESTAMP(6) NOT NULL,
  "source_metric_key" VARCHAR(80) NOT NULL,
  "source_label" VARCHAR(160) NOT NULL,
  "current_value" BIGINT,
  "target_value" BIGINT,
  "resolution_rule" TEXT NOT NULL,
  "void_rule" TEXT NOT NULL,
  "max_pool_wolo" BIGINT,
  "seed_yes_marks" INTEGER NOT NULL DEFAULT 0,
  "seed_no_marks" INTEGER NOT NULL DEFAULT 0,
  "result_outcome" VARCHAR(8),
  "result_evidence" TEXT,
  "observed_resolution_value" BIGINT,
  "resolved_by_uid" VARCHAR(100),
  "resolved_at" TIMESTAMP(6),
  "created_by_label" VARCHAR(120) NOT NULL DEFAULT 'The Oracle',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_oracle_markets_resolver" FOREIGN KEY ("resolved_by_uid") REFERENCES "users"("uid") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_oracle_markets_outcome" CHECK ("outcome_type" IN ('binary', 'range', 'date_bucket', 'multiple')),
  CONSTRAINT "ck_oracle_markets_status" CHECK ("status" IN ('draft', 'review', 'approved', 'trading', 'locked', 'resolving', 'challenge', 'settled', 'voided', 'paused')),
  CONSTRAINT "ck_oracle_markets_dates" CHECK ("resolves_at" >= "closes_at"),
  CONSTRAINT "ck_oracle_markets_seed" CHECK ("seed_yes_marks" >= 0 AND "seed_no_marks" >= 0),
  CONSTRAINT "ck_oracle_markets_pool" CHECK ("max_pool_wolo" IS NULL OR "max_pool_wolo" > 0),
  CONSTRAINT "ck_oracle_markets_terminal_result" CHECK (
    (
      "status" = 'settled'
      AND "result_outcome" IS NOT NULL
      AND "result_outcome" IN ('YES', 'NO')
      AND "result_evidence" IS NOT NULL
      AND length(btrim("result_evidence")) >= 20
      AND "resolved_by_uid" IS NOT NULL
      AND length(btrim("resolved_by_uid")) >= 1
      AND "resolved_at" IS NOT NULL
    )
    OR (
      "status" = 'voided'
      AND "result_outcome" IS NOT NULL
      AND "result_outcome" = 'VOID'
      AND "result_evidence" IS NOT NULL
      AND length(btrim("result_evidence")) >= 20
      AND "resolved_by_uid" IS NOT NULL
      AND length(btrim("resolved_by_uid")) >= 1
      AND "resolved_at" IS NOT NULL
    )
    OR (
      "status" NOT IN ('settled', 'voided')
      AND "result_outcome" IS NULL
      AND "result_evidence" IS NULL
      AND "observed_resolution_value" IS NULL
      AND "resolved_by_uid" IS NULL
      AND "resolved_at" IS NULL
    )
  )
);
CREATE UNIQUE INDEX "oracle_markets_public_id_key" ON "oracle_markets"("public_id");
CREATE UNIQUE INDEX "oracle_markets_slug_key" ON "oracle_markets"("slug");
CREATE INDEX "ix_oracle_markets_status_closes" ON "oracle_markets"("status", "closes_at");
CREATE INDEX "ix_oracle_markets_category_status" ON "oracle_markets"("category", "status");

CREATE TABLE "oracle_paper_positions" (
  "id" SERIAL PRIMARY KEY,
  "market_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "side" VARCHAR(12) NOT NULL,
  "amount_marks" INTEGER NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_oracle_paper_positions_market" FOREIGN KEY ("market_id") REFERENCES "oracle_markets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_oracle_paper_positions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_oracle_paper_positions_side" CHECK ("side" IN ('yes', 'no')),
  CONSTRAINT "ck_oracle_paper_positions_amount" CHECK ("amount_marks" BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX "uq_oracle_paper_positions_market_user" ON "oracle_paper_positions"("market_id", "user_id");
CREATE INDEX "ix_oracle_paper_positions_user_updated" ON "oracle_paper_positions"("user_id", "updated_at");
CREATE INDEX "ix_oracle_paper_positions_market_side" ON "oracle_paper_positions"("market_id", "side");

CREATE TABLE "oracle_market_proposals" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "created_by_user_id" INTEGER NOT NULL,
  "question" VARCHAR(240) NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "outcome_type" VARCHAR(24) NOT NULL DEFAULT 'binary',
  "closes_at" TIMESTAMP(6) NOT NULL,
  "resolves_at" TIMESTAMP(6) NOT NULL,
  "source_metric_key" VARCHAR(80) NOT NULL,
  "source_label" VARCHAR(160) NOT NULL,
  "resolution_rule" TEXT NOT NULL,
  "void_rule" TEXT NOT NULL,
  "max_pool_wolo" BIGINT NOT NULL,
  "bond_wolo" INTEGER NOT NULL DEFAULT 100,
  "bond_status" VARCHAR(24) NOT NULL DEFAULT 'not_funded',
  "status" VARCHAR(24) NOT NULL DEFAULT 'proposed',
  "review_note" TEXT,
  "reviewed_by_uid" VARCHAR(100),
  "reviewed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_oracle_market_proposals_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_oracle_market_proposals_outcome" CHECK ("outcome_type" IN ('binary', 'range', 'date_bucket', 'multiple')),
  CONSTRAINT "ck_oracle_market_proposals_status" CHECK ("status" IN ('proposed', 'rule_review', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT "ck_oracle_market_proposals_bond" CHECK ("bond_status" IN ('not_funded', 'pending', 'locked', 'returned', 'slashed')),
  CONSTRAINT "ck_oracle_market_proposals_dates" CHECK ("resolves_at" >= "closes_at"),
  CONSTRAINT "ck_oracle_market_proposals_pool" CHECK ("max_pool_wolo" > 0 AND "bond_wolo" >= 0)
);
CREATE UNIQUE INDEX "oracle_market_proposals_public_id_key" ON "oracle_market_proposals"("public_id");
CREATE INDEX "ix_oracle_market_proposals_status_created" ON "oracle_market_proposals"("status", "created_at");
CREATE INDEX "ix_oracle_market_proposals_creator_created" ON "oracle_market_proposals"("created_by_user_id", "created_at");

CREATE TABLE "oracle_events" (
  "id" SERIAL PRIMARY KEY,
  "market_id" INTEGER,
  "proposal_id" INTEGER,
  "actor_user_id" INTEGER,
  "event_type" VARCHAR(32) NOT NULL,
  "detail" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_oracle_events_market" FOREIGN KEY ("market_id") REFERENCES "oracle_markets"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_oracle_events_proposal" FOREIGN KEY ("proposal_id") REFERENCES "oracle_market_proposals"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "fk_oracle_events_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_oracle_events_target" CHECK ("market_id" IS NOT NULL OR "proposal_id" IS NOT NULL)
);
CREATE INDEX "ix_oracle_events_market_created" ON "oracle_events"("market_id", "created_at");
CREATE INDEX "ix_oracle_events_proposal_created" ON "oracle_events"("proposal_id", "created_at");
CREATE INDEX "ix_oracle_events_type_created" ON "oracle_events"("event_type", "created_at");

CREATE OR REPLACE FUNCTION "prevent_oracle_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'oracle_events is append-only; append a superseding oracle event instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "oracle_events_append_only"
BEFORE UPDATE OR DELETE ON "oracle_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_oracle_event_mutation"();
CREATE TRIGGER "oracle_events_append_only_truncate"
BEFORE TRUNCATE ON "oracle_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_oracle_event_mutation"();

INSERT INTO "round_proposals" ("category", "title", "summary", "body", "created_by_label", "voting_closes_at") VALUES
('forge', 'Ratify the Kingdom Forge founding charter', 'Establish the first-million reward ceiling, named project campaigns, milestone truth, and 10,000 Feature Deeds per project.', 'The first 1,000,000 WOLO per linked identity remains the ordinary product-reward lane. Excess stake may signal support for named Forge campaigns. Every project publishes a target, milestones, provenance, and a 10,000-Deed charter split 70% Patrons, 20% Builders, and 10% Kingdom.', 'Founding Steward', TIMESTAMP '2026-09-01 00:00:00'),
('oracle', 'Open the first Oracle season', 'Authorize exact-rule forecasting markets for Kingdom growth, games, economy, Forge, and civic milestones.', 'The Oracle opens with binary pool markets, visible source definitions, public close times, structured citizen market proposals, and an append-only Chronicle. Battle markets remain in the Betting Hall; the Oracle prices the future of the Kingdom.', 'The Oracle', TIMESTAMP '2026-09-01 00:00:00'),
('chamber', 'Adopt one citizen, one civic ballot', 'Keep Round Chamber civic voting independent from both wealth and WoloChain stake weight.', 'Each signed AoE2WAR account may hold one support or oppose ballot on an open proposal. Ballots remain advisory until a proposal is formally adopted, and every lifecycle transition is preserved in the Chamber Chronicle.', 'Founding Steward', TIMESTAMP '2026-09-01 00:00:00');

INSERT INTO "round_events" ("proposal_id", "event_type", "detail", "metadata")
SELECT "id", 'proposal_opened', 'Founding proposal entered the Round Chamber.', jsonb_build_object('source', 'kingdom-civic-foundation-v1')
FROM "round_proposals";

INSERT INTO "forge_projects" ("slug", "title", "category", "summary", "body", "target_wolo", "development_days", "featured_order", "target_date") VALUES
('battle-cam-ii', 'Battle Cam II', 'streaming', 'Make every watched battle feel like a kingdom event instead of a raw video window.', 'A focused capture, relay, viewer, and production campaign for a richer live battle experience with replay proof beside the action.', 2000000, 120, 100, TIMESTAMP '2026-12-01 00:00:00'),
('academy-intelligence', 'Academy Intelligence', 'academy', 'Turn replay evidence into precise lessons, recurring-pattern diagnosis, and training paths.', 'Build the evidence-bound intelligence layer that helps a warrior understand why a game turned and what to train next.', 1500000, 150, 90, TIMESTAMP '2027-01-15 00:00:00'),
('mobile-watcher', 'Mobile Watcher Command', 'watcher', 'Bring live watcher status, alerts, and battle handoff into a resilient mobile command surface.', 'A mobile-first command companion for watcher attachment truth, active battles, upload proof, and recovery guidance.', 3000000, 180, 80, TIMESTAMP '2027-02-01 00:00:00'),
('replay-recovery-engine', 'Replay Recovery Engine', 'replays', 'Push the unresolved HD archive frontier without inventing winners or rewriting evidence.', 'Fund bounded parser campaigns, compatibility research, and append-only promotion tooling for the hardest preserved recordings.', 1000000, 90, 95, TIMESTAMP '2026-11-15 00:00:00');

INSERT INTO "forge_milestones" ("project_id", "sequence", "title", "summary")
SELECT p."id", m."sequence", m."title", m."summary"
FROM "forge_projects" p
CROSS JOIN (VALUES
  (1, 'Charter', 'Freeze scope, proof requirements, and the project ledger.'),
  (2, 'Prototype', 'Publish the first bounded working surface and its evidence.'),
  (3, 'Field Trial', 'Run the feature with real AoE2WAR workflows and record failures.'),
  (4, 'Forge Seal', 'Ship production truth, provenance, and the completed milestone record.')
) AS m("sequence", "title", "summary");

INSERT INTO "forge_events" ("project_id", "event_type", "detail", "amount_wolo", "metadata")
SELECT "id", 'project_opened', 'Project entered the Kingdom Forge gathering lane.', NULL, jsonb_build_object('deeds', 10000, 'targetWolo', "target_wolo", 'charter', 'feature-deeds-v1')
FROM "forge_projects";

INSERT INTO "oracle_markets" (
  "slug", "question", "summary", "category", "closes_at", "resolves_at",
  "source_metric_key", "source_label", "target_value", "resolution_rule", "void_rule",
  "max_pool_wolo", "seed_yes_marks", "seed_no_marks", "created_by_label"
) VALUES
('three-thousand-citizens', 'Will AoE2WAR reach 3,000 registered citizens before October 1?', 'The Kingdom is closing the gap to its next identity milestone.', 'growth', TIMESTAMP '2026-10-01 00:00:00', TIMESTAMP '2026-10-01 00:05:00', 'registered_citizen_count_v1', 'Kingdom identity ledger', 3000, 'YES resolves if registered_citizen_count_v1 is at least 3,000 in any published snapshot at or before 2026-10-01 00:00:00 UTC.', 'VOID if the identity ledger cannot produce a complete snapshot for the resolution window or the metric definition changes after trading opens.', 250000, 6400, 3600, 'The Oracle'),
('one-thousand-september-games', 'Will September record at least 1,000 verified battles?', 'A full month of replay-backed war record pressure.', 'games', TIMESTAMP '2026-10-01 00:00:00', TIMESTAMP '2026-10-01 00:10:00', 'verified_battles_2026_09_v1', 'Replay corpus ledger', 1000, 'YES resolves if verified_battles_2026_09_v1 is at least 1,000 using effective game timestamps from 2026-09-01 through 2026-09-30 UTC.', 'VOID if the replay corpus cannot be deduplicated under the frozen metric definition. Upload time never substitutes for game time.', 200000, 5700, 4300, 'The Oracle'),
('twenty-five-million-staked', 'Will total citizen stake exceed 25,000,000 WOLO by year-end?', 'A direct test of how much WOLO the Kingdom is willing to commit.', 'economy', TIMESTAMP '2026-12-31 23:59:59', TIMESTAMP '2027-01-01 00:10:00', 'citizen_stake_wolo_v1', 'Mainnet staking ledger', 25000000, 'YES resolves if citizen_stake_wolo_v1 exceeds 25,000,000 WOLO in the final published 2026 snapshot.', 'VOID if the canonical staking wallet or indexed transfer ledger is unavailable for the final snapshot.', 500000, 4800, 5200, 'The Oracle'),
('forge-first-authorization', 'Will Battle Cam II reach Forge Authorization before Academy Intelligence?', 'Two flagship projects race for the first mandate.', 'forge', TIMESTAMP '2026-11-30 23:59:59', TIMESTAMP '2026-12-01 00:10:00', 'forge_authorization_order_v1', 'Kingdom Forge Chronicle', NULL, 'YES resolves if the Battle Cam II project receives an authorization event before Academy Intelligence and before the close time.', 'VOID if both projects are authorized in the same authoritative event transaction or neither has an authorization event by close.', 250000, 6100, 3900, 'The Forge Scribe'),
('one-hundred-chamber-votes', 'Will the Round Chamber record 100 civic ballots before September?', 'The first test of whether the Kingdom will govern in public.', 'community', TIMESTAMP '2026-09-01 00:00:00', TIMESTAMP '2026-09-01 00:05:00', 'round_ballot_count_2026_08_v1', 'Round Chamber Chronicle', 100, 'YES resolves if round_ballot_count_2026_08_v1 is at least 100 before 2026-09-01 00:00:00 UTC.', 'VOID if ballot uniqueness cannot be reconstructed from the append-only Chamber Chronicle.', 100000, 4200, 5800, 'The Round Chamber');

INSERT INTO "oracle_events" ("market_id", "event_type", "detail", "metadata")
SELECT "id", 'market_opened', 'Founding Oracle market opened with exact rules and seeded Oracle Marks.', jsonb_build_object('engine', 'oracle-pools-v1', 'unit', 'oracle_marks')
FROM "oracle_markets";

COMMIT;
