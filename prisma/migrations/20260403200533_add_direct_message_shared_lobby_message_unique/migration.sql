/*
  Warnings:

  - You are about to alter the column `label` on the `tournament_matches` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(80)`.
  - You are about to alter the column `status` on the `tournament_matches` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - A unique constraint covering the columns `[shared_lobby_message_id]` on the table `direct_messages` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "tournament_matches" DROP CONSTRAINT "tournament_matches_player_one_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "tournament_matches" DROP CONSTRAINT "tournament_matches_player_two_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "tournament_matches" DROP CONSTRAINT "tournament_matches_source_game_stats_id_fkey";

-- DropForeignKey
ALTER TABLE "tournament_matches" DROP CONSTRAINT "tournament_matches_tournament_id_fkey";

-- DropForeignKey
ALTER TABLE "tournament_matches" DROP CONSTRAINT "tournament_matches_winner_entry_id_fkey";

-- DropIndex
DROP INDEX "uq_direct_messages_shared_lobby_message_id";

-- DropIndex
DROP INDEX "ix_user_activity_events_type_created_at";

-- DropIndex
DROP INDEX "ix_user_activity_events_user_created_at";

-- AlterTable
ALTER TABLE "bet_markets" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "bet_wagers" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "community_request_comments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "community_request_votes" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "community_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "direct_conversations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "scheduled_matches" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tournament_matches" ALTER COLUMN "round" SET DEFAULT 1,
ALTER COLUMN "position" SET DEFAULT 1,
ALTER COLUMN "label" SET DATA TYPE VARCHAR(80),
ALTER COLUMN "status" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "scheduled_at" SET DATA TYPE TIMESTAMP(6),
ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMP(6),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(6),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(6);

-- AlterTable
ALTER TABLE "user_appearance_preferences" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "uq_direct_messages_shared_lobby_message_id" ON "direct_messages"("shared_lobby_message_id");

-- CreateIndex
CREATE INDEX "ix_user_activity_events_user_created_at" ON "user_activity_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_user_activity_events_type_created_at" ON "user_activity_events"("type", "created_at");

-- RenameForeignKey
ALTER TABLE "direct_messages" RENAME CONSTRAINT "fk_direct_messages_shared_lobby_message_id" TO "direct_messages_shared_lobby_message_id_fkey";

-- RenameForeignKey
ALTER TABLE "user_activity_events" RENAME CONSTRAINT "fk_user_activity_events_user_id" TO "user_activity_events_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "user_appearance_preferences" RENAME CONSTRAINT "fk_user_appearance_preferences_user_id" TO "user_appearance_preferences_user_id_fkey";

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_source_game_stats_id_fkey" FOREIGN KEY ("source_game_stats_id") REFERENCES "game_stats"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_player_one_entry_id_fkey" FOREIGN KEY ("player_one_entry_id") REFERENCES "tournament_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_player_two_entry_id_fkey" FOREIGN KEY ("player_two_entry_id") REFERENCES "tournament_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_entry_id_fkey" FOREIGN KEY ("winner_entry_id") REFERENCES "tournament_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
