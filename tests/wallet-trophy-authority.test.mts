import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  "app/api/wolo/wallet-dashboard/route.ts",
  "utf8",
);
const client = readFileSync(
  "components/wolo/WalletDashboardClient.tsx",
  "utf8",
);

test("wallet Trophy rows start from canonical public current-state authority", () => {
  assert.match(route, /loadPublicTrophies\(prisma\)/);
  assert.match(route, /projectTrophyChallengeAuthority\(trophy\)/);
  assert.match(route, /authority\.custodyConsistent/);
  assert.match(route, /authority\.currentHolderWoloAddress/);
  assert.match(route, /authority\.guardianHolderWoloAddress/);
  assert.doesNotMatch(route, /prisma\.trophy\.findMany/);
});

test("wallet Trophy association separates app custody from chain-owner evidence", () => {
  assert.match(route, /appCustodyRole/);
  assert.match(route, /"holder" as const/);
  assert.match(route, /"guardian" as const/);
  assert.match(route, /const isChainOwner = addressesMatch\(trophy\.chainOwnerAddress, address\)/);
  assert.match(route, /if \(!appCustodyRole && !isChainOwner\)/);
  assert.match(route, /guardianHolderDisplayName/);
  assert.match(route, /guardianHolderWoloAddress/);
});

test("wallet Trophy presentation uses projected economics and canonical media/routes", () => {
  assert.match(route, /currentBountyWolo: projectedTrophyBounty\(trophy\)/);
  assert.match(route, /managedMediaPublicUrl\(/);
  assert.match(route, /seededTrophyDefinition\(trophy\.trophyId\)/);
  assert.match(route, /routeHref: definition\?\.routeHref \|\| "\/champions"/);

  assert.match(client, /href=\{trophy\.routeHref\}/);
  assert.doesNotMatch(client, /href="\/champions\/nations\/canada"/);
});

test("wallet UI never equates recorded chain ownership with current title custody", () => {
  assert.match(client, /Championship assets tied to this wallet/);
  assert.match(client, /Recorded chain owner/);
  assert.match(client, /Current holder/);
  assert.match(client, /Guardian custody/);
  assert.match(
    client,
    /A recorded chain owner does not by itself mean this wallet currently holds the title\./,
  );
  assert.doesNotMatch(client, /Belts held by this wallet/);
  assert.doesNotMatch(client, /No belts or artifacts are assigned to this wallet yet/);
});
