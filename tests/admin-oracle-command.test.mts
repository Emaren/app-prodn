import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("Oracle admin command owns markets, proposals, lifecycle, deletion, and page controls", () => {
  const page = source("app/admin/oracle/page.tsx");
  const client = source("components/admin/oracle/OracleAdminCommand.tsx");
  const route = source("app/api/admin/oracle/route.ts");
  const admin = source("app/admin/page.tsx");
  const tower = source("components/admin/command-tower/AdminCommandTowerPage.tsx");
  const oracle = source("components/oracle/OraclePremiumFloor.tsx");

  assert.match(page, /OracleAdminCommand/);
  assert.match(client, /Command the future market\./);
  assert.match(client, /Delete all legacy stock/);
  assert.match(client, /Citizen proposal queue/);
  assert.match(client, /Oracle audit wire/);
  assert.match(client, /Edit pre-trading contract/);
  assert.match(client, /Settlement stage/);
  assert.match(route, /LEGACY_STOCK_SLUGS/);
  assert.match(route, /DELETE LEGACY STOCK/);
  assert.match(route, /eventType: "market_deleted"/);
  assert.match(route, /paperStage: true/);
  assert.match(route, /market_contract_edited/);
  assert.match(route, /AOE2WAR_PROD_DB_PREVIEW/);
  assert.match(admin, /href="\/admin\/oracle"/);
  assert.match(tower, /href: "\/admin\/oracle"/);
  assert.match(oracle, /data-oracle-market-toolbar="unified"/);
  assert.doesNotMatch(
    oracle,
    /flex flex-wrap items-center justify-end gap-2"[\s\S]*?data-oracle-market-toolbar/,
  );
});
