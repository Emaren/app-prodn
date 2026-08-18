CREATE TABLE "marketplace_shops" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" VARCHAR(24) NOT NULL DEFAULT 'player',
  "owner_user_id" INTEGER,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "offer" TEXT NOT NULL,
  "proprietor_label" VARCHAR(120) NOT NULL,
  "street_key" VARCHAR(40) NOT NULL,
  "slot" INTEGER NOT NULL,
  "display_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "charter_amount_wolo" INTEGER NOT NULL DEFAULT 100,
  "charter_state" VARCHAR(24) NOT NULL DEFAULT 'unpaid',
  "charter_tx_hash" VARCHAR(128),
  "charter_paid_at" TIMESTAMP(6),
  "source_proposal_event_id" INTEGER,
  "source_message_id" INTEGER,
  "hero_image_url" VARCHAR(500),
  "href" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_shops_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_marketplace_shops_public_id" ON "marketplace_shops"("public_id");
CREATE UNIQUE INDEX "uq_marketplace_shops_slug" ON "marketplace_shops"("slug");
CREATE UNIQUE INDEX "uq_marketplace_shops_street_slot" ON "marketplace_shops"("street_key", "slot");
CREATE UNIQUE INDEX "uq_marketplace_shops_charter_tx_hash" ON "marketplace_shops"("charter_tx_hash");
CREATE UNIQUE INDEX "uq_marketplace_shops_source_proposal_event_id" ON "marketplace_shops"("source_proposal_event_id");
CREATE UNIQUE INDEX "uq_marketplace_shops_source_message_id" ON "marketplace_shops"("source_message_id");
CREATE INDEX "ix_marketplace_shops_owner_status" ON "marketplace_shops"("owner_user_id", "status");
CREATE INDEX "ix_marketplace_shops_display_status" ON "marketplace_shops"("display_enabled", "status");

CREATE TABLE "marketplace_inquiries" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" INTEGER NOT NULL,
  "kind" VARCHAR(32) NOT NULL DEFAULT 'customer_request',
  "requester_user_id" INTEGER NOT NULL,
  "recipient_user_id" INTEGER NOT NULL,
  "requester_uid_snapshot" VARCHAR(100) NOT NULL,
  "requester_display_name_snapshot" VARCHAR(120) NOT NULL,
  "recipient_uid_snapshot" VARCHAR(100) NOT NULL,
  "recipient_display_name_snapshot" VARCHAR(120) NOT NULL,
  "request_text" TEXT NOT NULL,
  "amount_wolo" INTEGER NOT NULL DEFAULT 100,
  "tax_rate_bps" INTEGER NOT NULL DEFAULT 1000,
  "tax_amount_wolo" INTEGER NOT NULL DEFAULT 10,
  "recipient_address_snapshot" VARCHAR(100) NOT NULL,
  "memo" VARCHAR(255) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'awaiting_payment',
  "direct_message_id" INTEGER,
  "paid_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_inquiries_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "marketplace_shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_marketplace_inquiries_public_id" ON "marketplace_inquiries"("public_id");
CREATE UNIQUE INDEX "uq_marketplace_inquiries_memo" ON "marketplace_inquiries"("memo");
CREATE UNIQUE INDEX "uq_marketplace_inquiries_direct_message_id" ON "marketplace_inquiries"("direct_message_id");
CREATE INDEX "ix_marketplace_inquiries_shop_kind_status_created" ON "marketplace_inquiries"("shop_id", "kind", "status", "created_at");
CREATE INDEX "ix_marketplace_inquiries_requester_created" ON "marketplace_inquiries"("requester_user_id", "created_at");
CREATE INDEX "ix_marketplace_inquiries_recipient_created" ON "marketplace_inquiries"("recipient_user_id", "created_at");

CREATE TABLE "marketplace_invoices" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" INTEGER NOT NULL,
  "inquiry_id" INTEGER NOT NULL,
  "issuer_user_id" INTEGER NOT NULL,
  "customer_user_id" INTEGER NOT NULL,
  "issuer_uid_snapshot" VARCHAR(100) NOT NULL,
  "issuer_display_name_snapshot" VARCHAR(120) NOT NULL,
  "customer_uid_snapshot" VARCHAR(100) NOT NULL,
  "customer_display_name_snapshot" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "tax_rate_bps" INTEGER NOT NULL DEFAULT 1000,
  "tax_amount_wolo" INTEGER NOT NULL,
  "recipient_address_snapshot" VARCHAR(100) NOT NULL,
  "memo" VARCHAR(255) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'awaiting_payment',
  "direct_message_id" INTEGER,
  "paid_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_invoices_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "marketplace_shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "marketplace_invoices_inquiry_id_fkey"
    FOREIGN KEY ("inquiry_id") REFERENCES "marketplace_inquiries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_marketplace_invoices_public_id" ON "marketplace_invoices"("public_id");
CREATE UNIQUE INDEX "uq_marketplace_invoices_memo" ON "marketplace_invoices"("memo");
CREATE UNIQUE INDEX "uq_marketplace_invoices_direct_message_id" ON "marketplace_invoices"("direct_message_id");
CREATE INDEX "ix_marketplace_invoices_shop_status_created" ON "marketplace_invoices"("shop_id", "status", "created_at");
CREATE INDEX "ix_marketplace_invoices_customer_created" ON "marketplace_invoices"("customer_user_id", "created_at");
CREATE INDEX "ix_marketplace_invoices_issuer_created" ON "marketplace_invoices"("issuer_user_id", "created_at");

CREATE TABLE "marketplace_payments" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" VARCHAR(24) NOT NULL,
  "shop_id" INTEGER NOT NULL,
  "inquiry_id" INTEGER,
  "invoice_id" INTEGER,
  "payer_user_id" INTEGER NOT NULL,
  "payee_user_id" INTEGER,
  "payer_uid_snapshot" VARCHAR(100) NOT NULL,
  "payer_display_name_snapshot" VARCHAR(120) NOT NULL,
  "payee_uid_snapshot" VARCHAR(100),
  "payee_display_name_snapshot" VARCHAR(120) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
  "tax_amount_wolo" INTEGER NOT NULL DEFAULT 0,
  "sender_address_snapshot" VARCHAR(100) NOT NULL,
  "recipient_address_snapshot" VARCHAR(100) NOT NULL,
  "memo" VARCHAR(255) NOT NULL,
  "tx_hash" VARCHAR(128) NOT NULL,
  "proof_url" VARCHAR(500),
  "verified_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_payments_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "marketplace_shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "marketplace_payments_inquiry_id_fkey"
    FOREIGN KEY ("inquiry_id") REFERENCES "marketplace_inquiries"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT "marketplace_payments_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "marketplace_invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_marketplace_payments_public_id" ON "marketplace_payments"("public_id");
CREATE UNIQUE INDEX "uq_marketplace_payments_inquiry_id" ON "marketplace_payments"("inquiry_id");
CREATE UNIQUE INDEX "uq_marketplace_payments_invoice_id" ON "marketplace_payments"("invoice_id");
CREATE UNIQUE INDEX "uq_marketplace_payments_memo" ON "marketplace_payments"("memo");
CREATE UNIQUE INDEX "uq_marketplace_payments_tx_hash" ON "marketplace_payments"("tx_hash");
CREATE INDEX "ix_marketplace_payments_shop_verified" ON "marketplace_payments"("shop_id", "verified_at");
CREATE INDEX "ix_marketplace_payments_payer_verified" ON "marketplace_payments"("payer_user_id", "verified_at");
CREATE INDEX "ix_marketplace_payments_payee_verified" ON "marketplace_payments"("payee_user_id", "verified_at");
CREATE INDEX "ix_marketplace_payments_kind_verified" ON "marketplace_payments"("kind", "verified_at");

CREATE TABLE "marketplace_tax_payments" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" INTEGER NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "treasury_address_snapshot" VARCHAR(100) NOT NULL,
  "memo" VARCHAR(255) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'awaiting_payment',
  "payment_id" INTEGER,
  "paid_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_tax_payments_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "marketplace_shops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "marketplace_tax_payments_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "marketplace_payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_marketplace_tax_payments_public_id" ON "marketplace_tax_payments"("public_id");
CREATE UNIQUE INDEX "uq_marketplace_tax_payments_memo" ON "marketplace_tax_payments"("memo");
CREATE UNIQUE INDEX "uq_marketplace_tax_payments_payment_id" ON "marketplace_tax_payments"("payment_id");
CREATE INDEX "ix_marketplace_tax_payments_shop_status_created" ON "marketplace_tax_payments"("shop_id", "status", "created_at");

INSERT INTO "marketplace_shops" (
  "kind", "owner_user_id", "slug", "name", "offer", "proprietor_label",
  "street_key", "slot", "display_enabled", "status", "charter_amount_wolo",
  "charter_state", "charter_tx_hash", "charter_paid_at", "source_proposal_event_id",
  "source_message_id", "hero_image_url", "href"
)
SELECT
  'player', u."id", 'onager-repair', 'Onager Repair', 'Make and repair siege onagers.', 'Jim',
  'second-street', 1, FALSE, 'active', 100,
  'verified', 'EF4CB5EBAE05EA0710679455A482A9CE082C6D43134CA94F57B16758C0F99D6A',
  TIMESTAMP '2026-07-17 02:27:52', 49185, 3670,
  '/market/shops/onager-repair.png', '/market/shops/onager-repair'
FROM "users" u
WHERE u."uid" = 'u_0df73bdbb64646c19e4a9bfd225b3285'
ON CONFLICT DO NOTHING;

INSERT INTO "marketplace_shops" (
  "kind", "owner_user_id", "slug", "name", "offer", "proprietor_label",
  "street_key", "slot", "display_enabled", "status", "charter_amount_wolo",
  "charter_state", "hero_image_url", "href"
)
VALUES
  ('kingdom', NULL, 'aoe2war-chronicle', 'The AoE2WAR Chronicle',
   'Dispatches, reports, arguments, and the written record of the kingdom.', 'Kingdom press',
   'second-street', 2, TRUE, 'active', 100, 'kingdom_founding', NULL, '/forum'),
  ('kingdom', NULL, 'workshop', 'The Workshop',
   'Request features, back useful work, and help build the kingdom.', 'AoE2WAR builders',
   'second-street', 3, TRUE, 'active', 100, 'kingdom_founding', NULL, '/workshop')
ON CONFLICT DO NOTHING;
