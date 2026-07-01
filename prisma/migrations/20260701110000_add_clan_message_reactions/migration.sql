CREATE TABLE IF NOT EXISTS "clan_message_reactions" (
  "id" SERIAL PRIMARY KEY,
  "message_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "emoji" VARCHAR(24) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clan_message_reactions_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "clan_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "clan_message_reactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_clan_message_reactions_message_user_emoji"
  ON "clan_message_reactions"("message_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "ix_clan_message_reactions_message_id"
  ON "clan_message_reactions"("message_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_clan_message_reactions_user_id"
  ON "clan_message_reactions"("user_id", "created_at");
