CREATE TABLE "clan_hall_settings" (
    "clan_id" INTEGER NOT NULL,
    "default_chat_view" VARCHAR(2) NOT NULL DEFAULT 'v1',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_hall_settings_pkey" PRIMARY KEY ("clan_id"),
    CONSTRAINT "ck_clan_hall_settings_default_chat_view"
        CHECK ("default_chat_view" IN ('v1', 'v2', 'v3', 'v4', 'v5')),
    CONSTRAINT "clan_hall_settings_clan_id_fkey"
        FOREIGN KEY ("clan_id") REFERENCES "clans"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);
