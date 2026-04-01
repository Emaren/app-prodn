ALTER TABLE "direct_messages"
ADD COLUMN "shared_lobby_message_id" INTEGER;

CREATE UNIQUE INDEX "uq_direct_messages_shared_lobby_message_id"
ON "direct_messages"("shared_lobby_message_id")
WHERE "shared_lobby_message_id" IS NOT NULL;

ALTER TABLE "direct_messages"
ADD CONSTRAINT "fk_direct_messages_shared_lobby_message_id"
FOREIGN KEY ("shared_lobby_message_id")
REFERENCES "chat_messages"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;
