CREATE TABLE "bet_market_wallets" (
    "id" SERIAL NOT NULL,
    "market_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "wallet_address" VARCHAR(100) NOT NULL,
    "side" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bet_market_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_bet_market_wallets_market_wallet"
    ON "bet_market_wallets"("market_id", "wallet_address");

CREATE INDEX "ix_bet_market_wallets_market_side"
    ON "bet_market_wallets"("market_id", "side");

CREATE INDEX "ix_bet_market_wallets_user_id"
    ON "bet_market_wallets"("user_id");

ALTER TABLE "bet_market_wallets"
    ADD CONSTRAINT "bet_market_wallets_market_id_fkey"
    FOREIGN KEY ("market_id") REFERENCES "bet_markets"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "bet_market_wallets"
    ADD CONSTRAINT "bet_market_wallets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
