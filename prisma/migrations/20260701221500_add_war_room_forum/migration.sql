CREATE TABLE IF NOT EXISTS "forum_threads" (
  "id" SERIAL PRIMARY KEY,
  "slug" VARCHAR(180) NOT NULL,
  "seed_key" VARCHAR(100),
  "channel" VARCHAR(60) NOT NULL,
  "tag" VARCHAR(48) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "excerpt" VARCHAR(320) NOT NULL,
  "body" TEXT NOT NULL,
  "author_user_id" INTEGER,
  "author_label" VARCHAR(100),
  "author_role" VARCHAR(80),
  "is_pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_featured" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_hot" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_locked" BOOLEAN NOT NULL DEFAULT FALSE,
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_threads_author_user_id_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "forum_threads_slug_key"
  ON "forum_threads"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "forum_threads_seed_key_key"
  ON "forum_threads"("seed_key");
CREATE INDEX IF NOT EXISTS "ix_forum_threads_channel_updated_at"
  ON "forum_threads"("channel", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_forum_threads_featured_updated_at"
  ON "forum_threads"("is_featured", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_forum_threads_author_updated_at"
  ON "forum_threads"("author_user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "forum_posts" (
  "id" SERIAL PRIMARY KEY,
  "thread_id" INTEGER NOT NULL,
  "seed_key" VARCHAR(140),
  "author_user_id" INTEGER,
  "author_label" VARCHAR(100),
  "author_role" VARCHAR(80),
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_posts_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "forum_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "forum_posts_author_user_id_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "forum_posts_seed_key_key"
  ON "forum_posts"("seed_key");
CREATE INDEX IF NOT EXISTS "ix_forum_posts_thread_created_at"
  ON "forum_posts"("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_forum_posts_author_created_at"
  ON "forum_posts"("author_user_id", "created_at");

CREATE TABLE IF NOT EXISTS "forum_thread_bookmarks" (
  "id" SERIAL PRIMARY KEY,
  "thread_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_thread_bookmarks_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "forum_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "forum_thread_bookmarks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_forum_thread_bookmarks_thread_user"
  ON "forum_thread_bookmarks"("thread_id", "user_id");
CREATE INDEX IF NOT EXISTS "ix_forum_thread_bookmarks_user_created_at"
  ON "forum_thread_bookmarks"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "forum_thread_reactions" (
  "id" SERIAL PRIMARY KEY,
  "thread_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "emoji" VARCHAR(24) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_thread_reactions_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "forum_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "forum_thread_reactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_forum_thread_reactions_thread_user_emoji"
  ON "forum_thread_reactions"("thread_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "ix_forum_thread_reactions_thread_created_at"
  ON "forum_thread_reactions"("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_forum_thread_reactions_user_created_at"
  ON "forum_thread_reactions"("user_id", "created_at");
