CREATE TABLE "live_ticker_messages" (
    "id" SERIAL NOT NULL,
    "text" VARCHAR(180) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_ticker_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ix_live_ticker_messages_enabled_priority"
    ON "live_ticker_messages" ("enabled", "priority", "expires_at");

CREATE INDEX "ix_live_ticker_messages_expires_at"
    ON "live_ticker_messages" ("expires_at");
