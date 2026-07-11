ALTER TABLE "direct_messages"
  ADD COLUMN "reply_to_message_id" INTEGER,
  ADD COLUMN "delivered_at" TIMESTAMP(6),
  ADD COLUMN "edited_at" TIMESTAMP(6),
  ADD COLUMN "transcription" TEXT,
  ADD COLUMN "transcription_status" VARCHAR(20);

CREATE INDEX "ix_direct_messages_conversation_id"
  ON "direct_messages"("conversation_id", "id");
CREATE INDEX "ix_direct_messages_reply_to_message_id"
  ON "direct_messages"("reply_to_message_id");

ALTER TABLE "direct_messages"
  ADD CONSTRAINT "direct_messages_reply_to_message_id_fkey"
  FOREIGN KEY ("reply_to_message_id") REFERENCES "direct_messages"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE "direct_message_drafts" (
  "id" SERIAL NOT NULL,
  "conversation_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "body" TEXT,
  "reply_to_message_id" INTEGER,
  "updated_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "direct_message_drafts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_direct_message_drafts_conversation_user"
  ON "direct_message_drafts"("conversation_id", "user_id");
CREATE INDEX "ix_direct_message_drafts_user_updated_at"
  ON "direct_message_drafts"("user_id", "updated_at");
ALTER TABLE "direct_message_drafts"
  ADD CONSTRAINT "direct_message_drafts_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "direct_message_drafts"
  ADD CONSTRAINT "direct_message_drafts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "direct_message_pins" (
  "id" SERIAL NOT NULL,
  "conversation_id" INTEGER NOT NULL,
  "message_id" INTEGER NOT NULL,
  "pinned_by_user_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "direct_message_pins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_direct_message_pins_conversation_message"
  ON "direct_message_pins"("conversation_id", "message_id");
CREATE INDEX "ix_direct_message_pins_conversation_created_at"
  ON "direct_message_pins"("conversation_id", "created_at");
ALTER TABLE "direct_message_pins"
  ADD CONSTRAINT "direct_message_pins_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "direct_message_pins"
  ADD CONSTRAINT "direct_message_pins_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "direct_messages"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "direct_message_pins"
  ADD CONSTRAINT "direct_message_pins_pinned_by_user_id_fkey"
  FOREIGN KEY ("pinned_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "direct_message_translations" (
  "id" SERIAL NOT NULL,
  "message_id" INTEGER NOT NULL,
  "language" VARCHAR(12) NOT NULL,
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "direct_message_translations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_direct_message_translations_message_language"
  ON "direct_message_translations"("message_id", "language");
CREATE INDEX "ix_direct_message_translations_message_id"
  ON "direct_message_translations"("message_id");
ALTER TABLE "direct_message_translations"
  ADD CONSTRAINT "direct_message_translations_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "direct_messages"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
