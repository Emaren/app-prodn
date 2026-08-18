import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/market/MarketplaceExpansionStreets.tsx", import.meta.url),
  "utf8"
);

test("Marketplace expansion defers Prisma work until an incoming request", () => {
  assert.match(source, /import \{ connection \} from "next\/server";/);

  const requestBoundary = source.indexOf("await connection();");
  const prismaRead = source.indexOf(
    "loadPublicMarketplaceAwningListings(getPrisma())"
  );

  assert.ok(requestBoundary >= 0, "request-time rendering boundary is missing");
  assert.ok(prismaRead > requestBoundary, "Prisma read must occur after connection()");
});
