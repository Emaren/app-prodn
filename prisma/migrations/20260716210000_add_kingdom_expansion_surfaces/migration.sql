BEGIN;

CREATE TABLE "ai_agents" (
  "id" SERIAL PRIMARY KEY,
  "slug" VARCHAR(64) NOT NULL,
  "runtime_persona_id" VARCHAR(24) NOT NULL DEFAULT 'scribe',
  "name" VARCHAR(100) NOT NULL,
  "avatar_url" VARCHAR(500),
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "public" BOOLEAN NOT NULL DEFAULT TRUE,
  "description" VARCHAR(500) NOT NULL DEFAULT '',
  "role" VARCHAR(160) NOT NULL DEFAULT 'AoE2WAR council voice',
  "specialty" VARCHAR(220) NOT NULL DEFAULT 'AoE2HD community intelligence',
  "introduction" TEXT NOT NULL DEFAULT '',
  "personality_prompt" TEXT NOT NULL DEFAULT '',
  "aoe2_prompt" TEXT NOT NULL DEFAULT '',
  "knowledge_scopes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "allowed_tools" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "requested_model" VARCHAR(80) NOT NULL DEFAULT 'Agent4.1Scribe',
  "fallback_model" VARCHAR(80),
  "temperature" DOUBLE PRECISION,
  "max_context_chars" INTEGER NOT NULL DEFAULT 24000,
  "timeout_ms" INTEGER NOT NULL DEFAULT 45000,
  "max_council_turns" INTEGER NOT NULL DEFAULT 2,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_ai_agents_runtime_persona" CHECK ("runtime_persona_id" IN ('scribe', 'grimer', 'guy')),
  CONSTRAINT "ck_ai_agents_limits" CHECK ("max_context_chars" BETWEEN 2000 AND 100000 AND "timeout_ms" BETWEEN 5000 AND 120000 AND "max_council_turns" BETWEEN 1 AND 4),
  CONSTRAINT "ck_ai_agents_temperature" CHECK ("temperature" IS NULL OR "temperature" BETWEEN 0 AND 2)
);
CREATE UNIQUE INDEX "ai_agents_slug_key" ON "ai_agents"("slug");
CREATE INDEX "ix_ai_agents_enabled_public" ON "ai_agents"("enabled", "public");

CREATE TABLE "ai_request_traces" (
  "id" SERIAL PRIMARY KEY,
  "agent_id" INTEGER,
  "agent_slug_snapshot" VARCHAR(64) NOT NULL,
  "viewer_uid" VARCHAR(100),
  "source" VARCHAR(40) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "requested_model" VARCHAR(80) NOT NULL,
  "context_ms" INTEGER,
  "model_ms" INTEGER,
  "first_token_ms" INTEGER,
  "total_ms" INTEGER NOT NULL,
  "prompt_chars" INTEGER NOT NULL DEFAULT 0,
  "response_chars" INTEGER NOT NULL DEFAULT 0,
  "error_code" VARCHAR(120),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_ai_request_traces_agent" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_ai_request_traces_status" CHECK ("status" IN ('succeeded', 'failed', 'timed_out')),
  CONSTRAINT "ck_ai_request_traces_timings" CHECK ("total_ms" >= 0 AND ("context_ms" IS NULL OR "context_ms" >= 0) AND ("model_ms" IS NULL OR "model_ms" >= 0) AND ("first_token_ms" IS NULL OR "first_token_ms" >= 0))
);
CREATE INDEX "ix_ai_request_traces_agent_created" ON "ai_request_traces"("agent_id", "created_at");
CREATE INDEX "ix_ai_request_traces_viewer_created" ON "ai_request_traces"("viewer_uid", "created_at");
CREATE INDEX "ix_ai_request_traces_status_created" ON "ai_request_traces"("status", "created_at");

CREATE TABLE "bounty_opportunities" (
  "id" SERIAL PRIMARY KEY,
  "slug" VARCHAR(80) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "category" VARCHAR(40) NOT NULL DEFAULT 'kingdom',
  "description" TEXT NOT NULL,
  "eligibility" TEXT,
  "verification" TEXT,
  "action_label" VARCHAR(100) NOT NULL,
  "action_href" VARCHAR(500) NOT NULL,
  "reward_wolo" INTEGER,
  "status" VARCHAR(24) NOT NULL DEFAULT 'available',
  "featured" BOOLEAN NOT NULL DEFAULT FALSE,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_bounty_opportunities_status" CHECK ("status" IN ('available', 'in_progress', 'locked', 'paid', 'historical')),
  CONSTRAINT "ck_bounty_opportunities_reward" CHECK ("reward_wolo" IS NULL OR "reward_wolo" >= 0)
);
CREATE UNIQUE INDEX "bounty_opportunities_slug_key" ON "bounty_opportunities"("slug");
CREATE INDEX "ix_bounty_opportunities_status_featured_priority" ON "bounty_opportunities"("status", "featured", "priority");

CREATE TABLE "bounty_events" (
  "id" SERIAL PRIMARY KEY,
  "opportunity_id" INTEGER,
  "event_type" VARCHAR(24) NOT NULL,
  "actor_display_name" VARCHAR(120),
  "amount_wolo" INTEGER,
  "memo" TEXT NOT NULL,
  "tx_hash" VARCHAR(128),
  "source_kind" VARCHAR(40) NOT NULL DEFAULT 'operator',
  "source_ref" VARCHAR(180),
  "occurred_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_bounty_events_opportunity" FOREIGN KEY ("opportunity_id") REFERENCES "bounty_opportunities"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "ck_bounty_events_type" CHECK ("event_type" IN ('created', 'claimed', 'locked', 'paid', 'historical', 'note')),
  CONSTRAINT "ck_bounty_events_amount" CHECK ("amount_wolo" IS NULL OR "amount_wolo" >= 0)
);
CREATE UNIQUE INDEX "uq_bounty_events_source_ref" ON "bounty_events"("source_ref");
CREATE INDEX "ix_bounty_events_opportunity_occurred" ON "bounty_events"("opportunity_id", "occurred_at");
CREATE INDEX "ix_bounty_events_type_occurred" ON "bounty_events"("event_type", "occurred_at");
CREATE INDEX "ix_bounty_events_tx_hash" ON "bounty_events"("tx_hash");

CREATE OR REPLACE FUNCTION "prevent_bounty_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'bounty_events is append-only; append a superseding lifecycle event instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "bounty_events_append_only"
BEFORE UPDATE OR DELETE ON "bounty_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_bounty_event_mutation"();

CREATE TABLE "radio_submissions" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "submitter_uid" VARCHAR(100),
  "artist_name" VARCHAR(160) NOT NULL,
  "track_title" VARCHAR(200) NOT NULL,
  "genre" VARCHAR(100),
  "contact_email" VARCHAR(254) NOT NULL,
  "contact_discord" VARCHAR(120),
  "notes" TEXT,
  "rights_accepted" BOOLEAN NOT NULL,
  "rights_statement_version" VARCHAR(64) NOT NULL DEFAULT 'radio-wolo-limited-play-v1',
  "audio_original_filename" VARCHAR(255) NOT NULL,
  "audio_storage_key" VARCHAR(1000) NOT NULL,
  "audio_media_type" VARCHAR(100) NOT NULL,
  "audio_byte_size" BIGINT NOT NULL,
  "artwork_original_filename" VARCHAR(255),
  "artwork_storage_key" VARCHAR(1000),
  "artwork_media_type" VARCHAR(100),
  "artwork_byte_size" BIGINT,
  "status" VARCHAR(24) NOT NULL DEFAULT 'submitted',
  "featured" BOOLEAN NOT NULL DEFAULT FALSE,
  "admin_note" TEXT,
  "scheduled_at" TIMESTAMP(6),
  "published_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_radio_submissions_status" CHECK ("status" IN ('submitted', 'reviewing', 'approved', 'scheduled', 'published', 'declined')),
  CONSTRAINT "ck_radio_submissions_rights" CHECK ("rights_accepted" = TRUE),
  CONSTRAINT "ck_radio_submissions_audio_size" CHECK ("audio_byte_size" > 0),
  CONSTRAINT "ck_radio_submissions_artwork_size" CHECK ("artwork_byte_size" IS NULL OR "artwork_byte_size" > 0)
);
CREATE UNIQUE INDEX "radio_submissions_public_id_key" ON "radio_submissions"("public_id");
CREATE UNIQUE INDEX "radio_submissions_audio_storage_key_key" ON "radio_submissions"("audio_storage_key");
CREATE UNIQUE INDEX "radio_submissions_artwork_storage_key_key" ON "radio_submissions"("artwork_storage_key");
CREATE INDEX "ix_radio_submissions_status_created" ON "radio_submissions"("status", "created_at");
CREATE INDEX "ix_radio_submissions_featured_published" ON "radio_submissions"("featured", "published_at");

INSERT INTO "ai_agents" ("slug", "runtime_persona_id", "name", "description", "role", "specialty", "introduction", "personality_prompt", "aoe2_prompt", "knowledge_scopes", "allowed_tools", "requested_model", "max_council_turns") VALUES
('scribe', 'scribe', 'The AI Scribe', 'The kingdom''s grounded match and archive voice.', 'Historian, guide, and match scribe', 'Replay truth, rivalries, player form, WOLO product guidance', 'Ask the Scribe to read the war record, explain the kingdom, or frame a serious AoE2HD question.', 'Sharp, concise, grounded, and socially aware. Prefer evidence over theatre.', 'Use supplied AoE2HD replay, player, rivalry, bounty, and kingdom context. Never invent a result or payout state.', '["replays","players","rivalries","bounties","wolo"]'::jsonb, '["read_app_context"]'::jsonb, 'Agent4.1Scribe', 2),
('grimer', 'grimer', 'Grimer', 'A darker tactical sidecar with a useful bite.', 'Rivalry provocateur and tactical critic', 'Counterpoints, pressure tests, recurring mistakes, dark humour', 'Bring Grimer a plan that needs pressure-testing or a rivalry that needs sharper teeth.', 'Wry, playful, concise, slightly ruthless, never hateful or reckless.', 'Challenge assumptions using supplied AoE2HD evidence. Never manufacture statistics, payouts, or personal claims.', '["replays","rivalries","players"]'::jsonb, '["read_app_context"]'::jsonb, 'Agent4.1Grimer', 2),
('guy', 'guy', 'Guy of Moxica', 'The council''s rare velvet-knife voice.', 'Selective council commentator', 'Strategic intrigue, high-signal final turns, kingdom theatre', 'Guy appears sparingly when the council needs one elegant final twist.', 'Sly, elegant, amused, selective, and concise.', 'Stay grounded in supplied AoE2HD and kingdom evidence. Never turn theatre into fake truth.', '["kingdom","rivalries"]'::jsonb, '["read_app_context"]'::jsonb, 'Agent4.1Guy', 1);

INSERT INTO "bounty_opportunities" ("slug", "title", "category", "description", "eligibility", "verification", "action_label", "action_href", "featured", "priority") VALUES
('upload-a-game', 'Recover a Battle', 'archive', 'Upload a viable AoE2HD recorded game and help rebuild the permanent war record.', 'Any warrior with an original HD replay file.', 'Archive receipt and parser intake must exist. A result is not required for the upload action itself.', 'Upload a replay', '/upload', TRUE, 100),
('download-watcher', 'Join the Watch', 'watcher', 'Install the AoE2 Watcher so future battles can reach the archive with explicit upload and finality telemetry.', 'Any AoE2HD player using a supported Windows setup.', 'Watcher registration or download telemetry, depending on the active campaign.', 'Download Watcher', '/download', TRUE, 95),
('bet-own-battle', 'Back Your Own Banner', 'betting', 'Place a verified wallet-backed wager on an eligible battle you are playing.', 'Only when a real market is open and the wallet signing rail accepts the stake.', 'Verified stake transaction and accepted wager record.', 'Open betting hall', '/bets', TRUE, 90),
('spectator-bet', 'Read the Field', 'betting', 'Back an eligible battle from the spectator rail.', 'Any signed-in warrior with a connected WOLO wallet and an open market.', 'Verified stake transaction and accepted wager record.', 'Scout open markets', '/bets', FALSE, 80),
('buy-avatar', 'Claim a New Face', 'market', 'Support a kingdom artist or shop by acquiring an avatar from the Marketplace.', 'Subject to the live listing and payment terms.', 'Marketplace order and its actual settlement evidence.', 'Enter Marketplace', '/market', FALSE, 65),
('academy-lesson', 'Train at the Academy', 'academy', 'Take a lesson and turn replay evidence into a better next battle.', 'Subject to the active teacher and lesson listing.', 'Confirmed Academy booking or completed lesson evidence.', 'Visit Academy', '/academy', FALSE, 70),
('forum-post', 'Add to the War Room', 'community', 'Create a useful forum dispatch, guide, challenge, or historical note.', 'Signed-in community members following forum rules.', 'Published forum record. Low-effort spam never qualifies automatically.', 'Open War Room', '/forum', FALSE, 55),
('chronicle-article', 'Write the Chronicle', 'community', 'Contribute a substantial AoE2HD history, strategy, player, or kingdom article.', 'Authors with original work and permission for submitted media.', 'Published Chronicle record and operator acceptance.', 'Enter the Kingdom', '/kingdom', FALSE, 60),
('batch-upload', 'Open the Old Vault', 'archive', 'Batch upload an old replay collection so lost HD history can be catalogued.', 'Replay owners or custodians with lawful access to the files.', 'Immutable archive receipts and a bounded parser manifest.', 'Start batch upload', '/upload', TRUE, 92),
('suggest-emaren', 'Send a Kingdom Proposal', 'community', 'Make a concrete suggestion to Emaren that can improve the surviving HD infrastructure.', 'Any signed-in warrior with a specific, constructive proposal.', 'Accepted request or operator acknowledgement. Submission alone does not promise payment.', 'Send a proposal', '/contact-emaren', FALSE, 50),
('claim-belt', 'Claim a Vacant Belt', 'champions', 'Meet the live title rules and claim an eligible vacant championship.', 'Defined by the current title and challenge rules.', 'Canonical trophy event plus any required match proof.', 'See championships', '/champions', TRUE, 85),
('claim-artifact', 'Recover an Artifact', 'champions', 'Pursue a kingdom artifact whose current rules permit a claim.', 'Defined by the artifact''s live custody rules.', 'Canonical trophy or artifact event evidence.', 'Scout artifacts', '/champions', FALSE, 62),
('defend-belt', 'Defend the Crown', 'champions', 'Answer a valid challenge and preserve a championship reign.', 'Current holder facing a valid challenge.', 'Final match proof and canonical trophy event.', 'Open challenge hall', '/challenge', FALSE, 75),
('steal-artifact', 'Take the Relic', 'champions', 'Win an eligible artifact challenge under its published custody rules.', 'Qualified challengers under the current artifact rule set.', 'Final match proof and canonical custody event.', 'Find a challenge', '/challenge', FALSE, 68),
('light-national-flame', 'Light the Nation''s Flame', 'nations', 'Represent a nation and advance its live champion beacon.', 'Defined by the national championship rules.', 'Canonical national-title or beacon event.', 'Enter Nations', '/national-champions', TRUE, 72),
('join-clan', 'Take a Clan Banner', 'clans', 'Join an existing clan and strengthen its hall.', 'Subject to clan membership rules and acceptance.', 'Canonical clan membership record.', 'Browse clans', '/clans', FALSE, 45),
('found-clan', 'Found a House', 'clans', 'Create a durable clan identity for your AoE2HD group.', 'Signed-in founders following current naming and membership rules.', 'Canonical clan and founding membership records.', 'Found a clan', '/clans', FALSE, 52),
('raise-market-awning', 'Raise a Market Awning', 'market', 'Open a real kingdom service or creative business in the Marketplace.', 'Creators and service providers with a clear offer.', 'Approved live listing. Proposal submission is not itself a paid bounty.', 'Open a business', '/market', FALSE, 48);

COMMIT;
