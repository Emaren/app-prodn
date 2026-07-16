BEGIN;

CREATE TABLE "workshop_status" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "is_open" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_live" BOOLEAN NOT NULL DEFAULT FALSE,
  "activity_mode" VARCHAR(32) NOT NULL DEFAULT 'closed',
  "headline" VARCHAR(160) NOT NULL DEFAULT 'THE WORKSHOP RESTS',
  "description" TEXT NOT NULL DEFAULT '',
  "current_project" VARCHAR(160),
  "active_stream_id" INTEGER,
  "updated_by_uid" VARCHAR(100),
  "opened_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_workshop_status_singleton" CHECK ("id" = 1),
  CONSTRAINT "ck_workshop_status_mode" CHECK ("activity_mode" IN ('closed', 'building_live', 'streaming', 'ai_session_live', 'quiet_work', 'major_deployment', 'maintenance', 'special_event')),
  CONSTRAINT "ck_workshop_status_live_open" CHECK (NOT "is_live" OR "is_open")
);
CREATE INDEX "ix_workshop_status_open_live" ON "workshop_status"("is_open", "is_live");

CREATE TABLE "workshop_entries" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entry_type" VARCHAR(32) NOT NULL DEFAULT 'build_note',
  "title" VARCHAR(200) NOT NULL,
  "summary" VARCHAR(500) NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "dialogue" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "lane" VARCHAR(32) NOT NULL DEFAULT 'work_feed',
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "visibility" VARCHAR(24) NOT NULL DEFAULT 'private',
  "media_kind" VARCHAR(32),
  "media_url" VARCHAR(1000),
  "media_alt" VARCHAR(220),
  "link_label" VARCHAR(100),
  "link_url" VARCHAR(1000),
  "pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "featured_order" INTEGER NOT NULL DEFAULT 0,
  "occurred_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(6),
  "created_by_uid" VARCHAR(100),
  "updated_by_uid" VARCHAR(100),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_workshop_entries_type" CHECK ("entry_type" IN ('build_note', 'ai_discussion', 'design_decision', 'screenshot', 'image', 'deployment', 'parser_discovery', 'video', 'livestream', 'audio', 'milestone')),
  CONSTRAINT "ck_workshop_entries_lane" CHECK ("lane" IN ('work_feed', 'on_anvil', 'next_forge', 'fresh_forge', 'legendary')),
  CONSTRAINT "ck_workshop_entries_status" CHECK ("status" IN ('draft', 'published', 'archived')),
  CONSTRAINT "ck_workshop_entries_visibility" CHECK ("visibility" IN ('private', 'public')),
  CONSTRAINT "ck_workshop_entries_publication" CHECK (("status" = 'published' AND "visibility" = 'public' AND "published_at" IS NOT NULL) OR "status" <> 'published' OR "visibility" <> 'public')
);
CREATE UNIQUE INDEX "workshop_entries_public_id_key" ON "workshop_entries"("public_id");
CREATE INDEX "ix_workshop_entries_publication" ON "workshop_entries"("status", "visibility", "published_at");
CREATE INDEX "ix_workshop_entries_lane_order" ON "workshop_entries"("lane", "featured_order", "occurred_at");
CREATE INDEX "ix_workshop_entries_pinned_order" ON "workshop_entries"("pinned", "featured_order");

CREATE TABLE "workshop_artifacts" (
  "id" SERIAL PRIMARY KEY,
  "entry_id" INTEGER NOT NULL,
  "kind" VARCHAR(32) NOT NULL DEFAULT 'image',
  "label" VARCHAR(160) NOT NULL,
  "url" VARCHAR(1000) NOT NULL,
  "alt" VARCHAR(220),
  "mime_type" VARCHAR(120),
  "storage_key" VARCHAR(1000),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_public" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_workshop_artifacts_entry" FOREIGN KEY ("entry_id") REFERENCES "workshop_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "ck_workshop_artifacts_kind" CHECK ("kind" IN ('image', 'video', 'audio', 'document', 'link'))
);
CREATE INDEX "ix_workshop_artifacts_entry_public_order" ON "workshop_artifacts"("entry_id", "is_public", "sort_order");

CREATE TABLE "workshop_streams" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(40) NOT NULL DEFAULT 'first_party',
  "source_type" VARCHAR(32) NOT NULL DEFAULT 'external',
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "playback_url" VARCHAR(1000),
  "embed_url" VARCHAR(1000),
  "thumbnail_url" VARCHAR(1000),
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "is_public" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_by_uid" VARCHAR(100),
  "started_at" TIMESTAMP(6),
  "ended_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_workshop_streams_status" CHECK ("status" IN ('draft', 'ready', 'live', 'ended', 'hidden')),
  CONSTRAINT "ck_workshop_streams_source" CHECK ("source_type" IN ('first_party', 'external', 'recorded', 'screen_share')),
  CONSTRAINT "ck_workshop_streams_live_public" CHECK ("status" <> 'live' OR "is_public" = TRUE)
);
CREATE UNIQUE INDEX "workshop_streams_public_id_key" ON "workshop_streams"("public_id");
CREATE INDEX "ix_workshop_streams_public_status" ON "workshop_streams"("status", "is_public", "started_at");
ALTER TABLE "workshop_status"
  ADD CONSTRAINT "fk_workshop_status_active_stream"
  FOREIGN KEY ("active_stream_id") REFERENCES "workshop_streams"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

INSERT INTO "workshop_status" ("id", "is_open", "is_live", "activity_mode", "headline", "description", "current_project", "opened_at")
VALUES (1, TRUE, FALSE, 'quiet_work', 'THE WORKSHOP IS OPEN', 'The forge doors are open. Published build notes, parser discoveries, and deployments appear here only after deliberate operator review.', 'Campaign II · The Workshop', CURRENT_TIMESTAMP);

INSERT INTO "workshop_entries" ("entry_type", "title", "summary", "body", "lane", "status", "visibility", "pinned", "featured_order", "occurred_at", "published_at") VALUES
('milestone', 'The Workshop doors open', 'AoE2WAR now has a public, curated build culture.', 'The Workshop is a deliberate window into the making of the kingdom. It publishes selected milestones, decisions, screenshots, and AI excerpts without exposing private conversations or operator systems.', 'fresh_forge', 'published', 'public', TRUE, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('parser_discovery', 'Jim''s full Engine Room campaign completed', '2,025 preserved artifacts produced 1,689 full candidates and 336 structured failures.', 'The completed campaign was candidate-only and changed no public or financial aggregate. The next recovery pass classifies the remaining failures by format and signature before any new evidence can be promoted.', 'on_anvil', 'published', 'public', TRUE, 95, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('deployment', 'Wave A reached the live kingdom', 'AI Council, Bounty Board, Radio WOLO, and the Parser Observatory are live.', 'The first kingdom expansion shipped as real public and operator surfaces, backed by durable app records and explicit publication boundaries.', 'fresh_forge', 'published', 'public', FALSE, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('parser_discovery', 'First compatibility recovery pass lands', 'Seven of eight body-stream compatibility artifacts now emit full private candidates.', 'The bounded eight-hash pass reduced the latest candidate-failure frontier from 336 to 329. It promoted nothing, changed no public or financial aggregate, and preserved the original failed runs alongside the new version-identified evidence.', 'fresh_forge', 'published', 'public', FALSE, 88, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('design_decision', 'Replay truth keeps its gates', 'Fast or incomplete games never receive invented winners.', 'A replay may be detected, uploaded, archived, and parsed without being result-ready or betting-eligible. The Workshop will report those stages honestly instead of collapsing them into one green light.', 'legendary', 'published', 'public', FALSE, 80, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('build_note', 'Parser recovery classification', 'The 329 current structured failures are separated into saved-game playback, header-range compatibility, and one deeper body-stream review lane.', 'The archive bytes remain immutable. New parser runs remain append-only candidates until their evidence is reviewed.', 'next_forge', 'published', 'public', FALSE, 70, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

COMMIT;
