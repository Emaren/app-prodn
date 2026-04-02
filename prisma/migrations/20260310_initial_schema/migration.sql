CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "uid" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100),
    "in_game_name" VARCHAR,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "wallet_address" VARCHAR(100),
    "lock_name" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" VARCHAR(128),
    "last_seen" TIMESTAMP(6),
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "steam_id" VARCHAR(32),
    "steam_persona_name" VARCHAR(255),
    "verification_level" INTEGER NOT NULL DEFAULT 0,
    "verification_method" VARCHAR(32) NOT NULL DEFAULT 'none',
    "verified_at" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'watcher',
    "key_prefix" VARCHAR(12) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(6),
    "revoked_at" TIMESTAMP(6),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "game_stats" (
    "id" SERIAL NOT NULL,
    "user_uid" VARCHAR(100),
    "replay_file" VARCHAR(500) NOT NULL,
    "replay_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "game_version" VARCHAR(50),
    "map" JSONB,
    "game_type" VARCHAR(50),
    "duration" INTEGER,
    "game_duration" INTEGER,
    "winner" VARCHAR(100),
    "players" JSONB,
    "event_types" JSONB,
    "key_events" JSONB,
    "timestamp" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "played_on" TIMESTAMP(6),
    "parse_iteration" INTEGER NOT NULL DEFAULT 0,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "disconnect_detected" BOOLEAN NOT NULL DEFAULT false,
    "parse_source" VARCHAR(20) NOT NULL DEFAULT 'unknown',
    "parse_reason" VARCHAR(50) NOT NULL DEFAULT 'unspecified',
    "original_filename" VARCHAR(255),

    CONSTRAINT "game_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournaments" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "format" VARCHAR(80) NOT NULL DEFAULT '1v1 AoE2HD showcase',
    "status" VARCHAR(20) NOT NULL DEFAULT 'planning',
    "starts_at" TIMESTAMP(6),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" INTEGER,
    "chat_room_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournament_entries" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'joined',
    "note" VARCHAR(160),
    "joined_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_rooms" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "scope" VARCHAR(20) NOT NULL DEFAULT 'lobby',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alembic_version" (
    "version_num" VARCHAR(32) NOT NULL,

    CONSTRAINT "alembic_version_pkc" PRIMARY KEY ("version_num")
);

CREATE UNIQUE INDEX "users_uid_key" ON "users"("uid");
CREATE UNIQUE INDEX "ix_users_email" ON "users"("email");
CREATE UNIQUE INDEX "users_in_game_name_key" ON "users"("in_game_name");
CREATE UNIQUE INDEX "uq_users_steam_id" ON "users"("steam_id");

CREATE UNIQUE INDEX "api_keys_key_prefix_key" ON "api_keys"("key_prefix");
CREATE INDEX "ix_api_keys_user_id" ON "api_keys"("user_id");
CREATE INDEX "ix_api_keys_prefix" ON "api_keys"("key_prefix");

CREATE INDEX "ix_game_stats_user_uid" ON "game_stats"("user_uid");
CREATE INDEX "ix_replay_hash_iteration" ON "game_stats"("replay_hash", "parse_iteration");
CREATE INDEX "ix_replay_iteration" ON "game_stats"("replay_file", "parse_iteration");
CREATE UNIQUE INDEX "uq_replay_final" ON "game_stats"("replay_hash", "is_final");

CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments"("slug");
CREATE UNIQUE INDEX "uq_tournaments_chat_room_id" ON "tournaments"("chat_room_id");
CREATE INDEX "ix_tournaments_featured_starts_at" ON "tournaments"("featured", "starts_at");
CREATE INDEX "ix_tournaments_status_starts_at" ON "tournaments"("status", "starts_at");

CREATE INDEX "ix_tournament_entries_user_id" ON "tournament_entries"("user_id");
CREATE INDEX "ix_tournament_entries_tournament_joined_at" ON "tournament_entries"("tournament_id", "joined_at");
CREATE UNIQUE INDEX "uq_tournament_entries_tournament_user" ON "tournament_entries"("tournament_id", "user_id");

CREATE UNIQUE INDEX "chat_rooms_slug_key" ON "chat_rooms"("slug");
CREATE INDEX "ix_chat_messages_room_created_at" ON "chat_messages"("room_id", "created_at");
CREATE INDEX "ix_chat_messages_user_created_at" ON "chat_messages"("user_id", "created_at");

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "game_stats"
  ADD CONSTRAINT "game_stats_user_uid_fkey"
  FOREIGN KEY ("user_uid") REFERENCES "users"("uid")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "tournaments"
  ADD CONSTRAINT "tournaments_chat_room_id_fkey"
  FOREIGN KEY ("chat_room_id") REFERENCES "chat_rooms"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "tournaments"
  ADD CONSTRAINT "tournaments_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "tournament_entries"
  ADD CONSTRAINT "tournament_entries_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "tournament_entries"
  ADD CONSTRAINT "tournament_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
