CREATE TABLE "clan_message_attachments" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255),
    "mime_type" VARCHAR(120) NOT NULL,
    "storage_ref" VARCHAR(500) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_message_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_clan_message_attachments_kind" CHECK ("kind" IN ('image', 'audio', 'video')),
    CONSTRAINT "ck_clan_message_attachments_size_bytes" CHECK ("size_bytes" > 0)
);

CREATE INDEX "ix_clan_message_attachments_message_id"
    ON "clan_message_attachments"("message_id", "id");

ALTER TABLE "clan_message_attachments"
ADD CONSTRAINT "clan_message_attachments_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "clan_messages"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
