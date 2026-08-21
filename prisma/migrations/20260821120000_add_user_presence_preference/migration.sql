CREATE TABLE "user_presence_preferences" (
    "user_id" INTEGER NOT NULL,
    "mode" VARCHAR(24) NOT NULL DEFAULT 'off',
    "enabled_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_presence_preferences_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "ck_user_presence_preferences_mode"
        CHECK ("mode" IN ('off', 'public_coarse'))
);

ALTER TABLE "user_presence_preferences"
ADD CONSTRAINT "user_presence_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
