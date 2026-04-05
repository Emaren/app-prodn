-- AlterTable
ALTER TABLE "user_appearance_preferences" ADD COLUMN     "time_display_mode" VARCHAR(20) NOT NULL DEFAULT 'utc',
ADD COLUMN     "timezone_override" VARCHAR(80);

-- CreateTable
CREATE TABLE "scheduled_match_activities" (
    "id" SERIAL NOT NULL,
    "scheduled_match_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER,
    "event_type" VARCHAR(32) NOT NULL,
    "detail" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_match_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_scheduled_match_activities_match_created_at" ON "scheduled_match_activities"("scheduled_match_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_scheduled_match_activities_actor_created_at" ON "scheduled_match_activities"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_scheduled_match_activities_type_created_at" ON "scheduled_match_activities"("event_type", "created_at");

-- AddForeignKey
ALTER TABLE "scheduled_match_activities" ADD CONSTRAINT "scheduled_match_activities_scheduled_match_id_fkey" FOREIGN KEY ("scheduled_match_id") REFERENCES "scheduled_matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scheduled_match_activities" ADD CONSTRAINT "scheduled_match_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
