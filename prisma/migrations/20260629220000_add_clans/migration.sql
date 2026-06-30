CREATE TABLE IF NOT EXISTS "clans" (
  "id" SERIAL PRIMARY KEY,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "tagline" VARCHAR(180),
  "description" TEXT,
  "crest_url" VARCHAR(500),
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "chat_audience_policy" VARCHAR(20) NOT NULL DEFAULT 'public',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "clans_slug_key" ON "clans"("slug");
CREATE INDEX IF NOT EXISTS "ix_clans_status_name" ON "clans"("status", "name");

CREATE TABLE IF NOT EXISTS "clan_members" (
  "id" SERIAL PRIMARY KEY,
  "clan_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "role" VARCHAR(20) NOT NULL DEFAULT 'member',
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "joined_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clan_members_clan_id_fkey"
    FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "clan_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_clan_members_clan_user"
  ON "clan_members"("clan_id", "user_id");
CREATE INDEX IF NOT EXISTS "ix_clan_members_user_status"
  ON "clan_members"("user_id", "status");
CREATE INDEX IF NOT EXISTS "ix_clan_members_clan_status_role"
  ON "clan_members"("clan_id", "status", "role");

CREATE TABLE IF NOT EXISTS "clan_messages" (
  "id" SERIAL PRIMARY KEY,
  "clan_id" INTEGER NOT NULL,
  "author_user_id" INTEGER NOT NULL,
  "body" VARCHAR(1200) NOT NULL,
  "audience" VARCHAR(20) NOT NULL DEFAULT 'clan',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clan_messages_clan_id_fkey"
    FOREIGN KEY ("clan_id") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "clan_messages_author_user_id_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "ix_clan_messages_clan_created_at"
  ON "clan_messages"("clan_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_clan_messages_clan_audience_created"
  ON "clan_messages"("clan_id", "audience", "created_at");
CREATE INDEX IF NOT EXISTS "ix_clan_messages_author_created"
  ON "clan_messages"("author_user_id", "created_at");

INSERT INTO "clans" (
  "slug",
  "name",
  "tagline",
  "description",
  "crest_url",
  "status",
  "chat_audience_policy"
)
VALUES (
  'mystikal',
  'Mystikal Clan',
  'The old Deathmatch band enters the clan hall.',
  'A home for the Mystikal players, their allies, their rivals, and the AoE2 HD stories that keep the band together.',
  '/clans/mystikal-crest.webp',
  'active',
  'public'
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "tagline" = EXCLUDED."tagline",
  "description" = EXCLUDED."description",
  "crest_url" = EXCLUDED."crest_url",
  "status" = EXCLUDED."status";

INSERT INTO "clan_members" ("clan_id", "user_id", "role", "status")
SELECT clan."id", app_admin."id", 'admin', 'active'
FROM "clans" clan
JOIN "users" app_admin ON app_admin."is_admin" = TRUE
WHERE clan."slug" = 'mystikal'
ON CONFLICT ("clan_id", "user_id") DO NOTHING;
