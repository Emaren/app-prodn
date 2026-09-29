import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../app/api/wolo/wallet-dashboard/route.ts", import.meta.url),
  "utf8"
);
const client = readFileSync(
  new URL("../components/wolo/WalletDashboardClient.tsx", import.meta.url),
  "utf8"
);

test("wallet Trophy API starts from canonical public Trophy authority", () => {
  assert.match(route, /loadPublicTrophies\(prisma\)/);
  assert.doesNotMatch(route, /prisma\.trophy\.findMany/);
  assert.match(route, /projectedTrophyBounty\(trophy\)/);
  assert.match(route, /seededTrophyDefinition\(trophy\.trophyId\)/);
  assert.match(route, /managedMediaPublicUrl/);
});

test("wallet Trophy association keeps app custody separate from chain records", () => {
  assert.match(route, /currentHolderWoloAddress === address/);
  assert.match(route, /guardianHolderWoloAddress === address/);
  assert.match(route, /chainOwnerAddress === address/);
  assert.match(route, /appCustodyRole/);
  assert.match(route, /hasRecordedChainAssociation/);
  assert.match(route, /"app_custody"/);
  assert.match(route, /"chain_record"/);
  assert.match(route, /"both"/);
});

test("wallet Trophy UI describes custody accurately", () => {
  assert.match(client, /Championship assets linked to this wallet/);
  assert.match(client, /App custody is current title authority/);
  assert.match(client, /do not by themselves make this wallet the current champion/);
  assert.match(client, /Current app holder/);
  assert.match(client, /Guardian custody/);
  assert.match(client, /Chain record only/);
  assert.match(client, /not the current app custodian/);
});

test("wallet Trophy navigation follows the actual title route", () => {
  assert.match(client, /href=\{trophy\.routeHref\}/);
  assert.doesNotMatch(
    client,
    /href="\/champions\/nations\/canada"/
  );
  assert.match(route, /routeHref: definition\?\.routeHref \|\| "\/champions"/);
});
