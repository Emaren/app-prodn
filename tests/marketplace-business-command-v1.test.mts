import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ownerLib =
  fs.readFileSync(
    "lib/marketplaceOwnerControl.ts",
    "utf8",
  );

const ownerApi =
  fs.readFileSync(
    "app/api/market/admin/route.ts",
    "utf8",
  );

const sponsorApi =
  fs.readFileSync(
    "app/api/market/admin/sponsor/route.ts",
    "utf8",
  );

const shadow =
  fs.readFileSync(
    "scripts/aoe2_shadow.py",
    "utf8",
  );

test(
  "Kingdom-sponsored business still costs real 100 WOLO",
  () => {
    assert.match(
      sponsorApi,
      /candidate\.role ===\s*"treasury"/,
    );

    assert.match(
      sponsorApi,
      /expectedAmountWolo:\s*MARKETPLACE_STANDARD_WOLO/,
    );

    assert.match(
      sponsorApi,
      /marketplacePaymentMemo\(\s*"shop_proposal"/,
    );

    assert.match(
      sponsorApi,
      /verifyWoloTransfer/,
    );
  },
);

test(
  "beneficiary owns sponsored proposal instead of paying admin",
  () => {
    assert.match(
      sponsorApi,
      /userId:\s*beneficiary\.id/,
    );

    assert.match(
      sponsorApi,
      /sponsorship:\s*"kingdom_admin"/,
    );

    assert.match(
      sponsorApi,
      /sponsoredByUid:\s*resolved\.owner\.uid/,
    );
  },
);

test(
  "real sponsorship is impossible from local shadow",
  () => {
    assert.match(
      sponsorApi,
      /isLocalShadow/,
    );

    assert.match(
      sponsorApi,
      /Real WOLO sponsorship is disabled/,
    );
  },
);

test(
  "Marketplace owner can assign businesses to registered citizens",
  () => {
    assert.match(
      ownerLib,
      /citizens:\s*citizens\.map/,
    );

    assert.match(
      ownerApi,
      /action === "assign"/,
    );

    assert.match(
      ownerApi,
      /ownerUserId:\s*proprietor\.id/,
    );
  },
);

test(
  "authorization card preserves charter payment truth",
  () => {
    assert.match(
      ownerLib,
      /amountWolo:\s*MARKETPLACE_STANDARD_WOLO/,
    );

    assert.match(
      ownerLib,
      /Kingdom-sponsored charter · 100 WOLO verified/,
    );
  },
);

test(
  "shadow preserves Marketplace profile and operator truth",
  () => {
    for (
      const table of [
        "marketplace_shops",
        "marketplace_inquiries",
        "marketplace_invoices",
        "marketplace_payments",
        "marketplace_tax_payments",
        "managed_media_assets",
      ]
    ) {
      assert.match(
        shadow,
        new RegExp(
          `"${table}"`,
        ),
      );
    }

    assert.match(
      shadow,
      /REQUIRED_ACTIVITY_TYPES/,
    );

    assert.match(
      shadow,
      /market_shop_proposal/,
    );

    assert.match(
      shadow,
      /stream_required_activity_events/,
    );
  },
);

const ownerUi =
  fs.readFileSync(
    "components/market/MarketplaceOwnerConsole.tsx",
    "utf8",
  );

const adminMarketplace =
  fs.readFileSync(
    "app/admin/marketplace/page.tsx",
    "utf8",
  );

const adminHome =
  fs.readFileSync(
    "app/admin/page.tsx",
    "utf8",
  );

test(
  "Marketplace Command exposes paid sponsored-business UI only in command mode",
  () => {
    assert.match(
      ownerUi,
      /commandMode/,
    );

    assert.match(
      ownerUi,
      /payMarketplaceRequestOnChain/,
    );

    assert.match(
      ownerUi,
      /Pay 100 WOLO & Create/,
    );

    assert.match(
      ownerUi,
      /\/api\/market\/admin\/sponsor/,
    );

    assert.match(
      ownerUi,
      /paymentEnabled/,
    );
  },
);

test(
  "Marketplace Command supports proprietor reassignment",
  () => {
    assert.match(
      ownerUi,
      /Assign proprietor/,
    );

    assert.match(
      ownerUi,
      /action: "assign"/,
    );

    assert.match(
      ownerUi,
      /citizens\.map/,
    );
  },
);

test(
  "dedicated Marketplace Command is reachable from Admin",
  () => {
    assert.match(
      adminMarketplace,
      /MarketplaceOwnerConsole commandMode/,
    );

    assert.match(
      adminMarketplace,
      /Kingdom Business Command/,
    );

    assert.match(
      adminHome,
      /href="\/admin\/marketplace"/,
    );
  },
);
