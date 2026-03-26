CREATE TABLE IF NOT EXISTS "direct_conversations" (
    "id" SERIAL NOT NULL,
    "pair_key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_direct_conversations_pair_key"
    ON "direct_conversations"("pair_key");

CREATE TABLE IF NOT EXISTS "direct_conversation_participants" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(6),

    CONSTRAINT "direct_conversation_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_direct_conversation_participants_conversation_user"
    ON "direct_conversation_participants"("conversation_id", "user_id");

CREATE INDEX IF NOT EXISTS "ix_direct_conversation_participants_user_last_read_at"
    ON "direct_conversation_participants"("user_id", "last_read_at");

CREATE INDEX IF NOT EXISTS "ix_direct_conversation_participants_conversation_id"
    ON "direct_conversation_participants"("conversation_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'direct_conversation_participants_conversation_id_fkey'
    ) THEN
        ALTER TABLE "direct_conversation_participants"
            ADD CONSTRAINT "direct_conversation_participants_conversation_id_fkey"
            FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'direct_conversation_participants_user_id_fkey'
    ) THEN
        ALTER TABLE "direct_conversation_participants"
            ADD CONSTRAINT "direct_conversation_participants_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "direct_messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "sender_user_id" INTEGER NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_direct_messages_conversation_created_at"
    ON "direct_messages"("conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_direct_messages_sender_created_at"
    ON "direct_messages"("sender_user_id", "created_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'direct_messages_conversation_id_fkey'
    ) THEN
        ALTER TABLE "direct_messages"
            ADD CONSTRAINT "direct_messages_conversation_id_fkey"
            FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'direct_messages_sender_user_id_fkey'
    ) THEN
        ALTER TABLE "direct_messages"
            ADD CONSTRAINT "direct_messages_sender_user_id_fkey"
            FOREIGN KEY ("sender_user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_badges" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "note" VARCHAR(160),
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_badges_user_label"
    ON "user_badges"("user_id", "label");

CREATE INDEX IF NOT EXISTS "ix_user_badges_created_by_user_id"
    ON "user_badges"("created_by_user_id");

CREATE INDEX IF NOT EXISTS "ix_user_badges_user_created_at"
    ON "user_badges"("user_id", "created_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_badges_user_id_fkey'
    ) THEN
        ALTER TABLE "user_badges"
            ADD CONSTRAINT "user_badges_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_badges_created_by_user_id_fkey'
    ) THEN
        ALTER TABLE "user_badges"
            ADD CONSTRAINT "user_badges_created_by_user_id_fkey"
            FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_gifts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" VARCHAR(40) NOT NULL DEFAULT 'WOLO',
    "amount" INTEGER,
    "note" VARCHAR(160),
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_gifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_user_gifts_user_created_at"
    ON "user_gifts"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_user_gifts_kind_created_at"
    ON "user_gifts"("kind", "created_at");

CREATE INDEX IF NOT EXISTS "ix_user_gifts_created_by_user_id"
    ON "user_gifts"("created_by_user_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_gifts_user_id_fkey'
    ) THEN
        ALTER TABLE "user_gifts"
            ADD CONSTRAINT "user_gifts_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_gifts_created_by_user_id_fkey'
    ) THEN
        ALTER TABLE "user_gifts"
            ADD CONSTRAINT "user_gifts_created_by_user_id_fkey"
            FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;
