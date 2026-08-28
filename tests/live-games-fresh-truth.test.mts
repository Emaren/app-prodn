import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public live snapshot exposes an explicit fresh path", () => {
  const source = readFileSync("lib/liveGamesPublicSnapshot.ts", "utf8");

  assert.match(source, /loadLiveGamesSnapshotFresh/);
  assert.match(
    source,
    /options:\s*\{\s*fresh\?: boolean\s*\}\s*=\s*\{\}/,
  );
  assert.match(
    source,
    /options\.fresh[\s\S]*?loadLiveGamesSnapshotFresh\(prisma\)[\s\S]*?:\s*await loadLiveGamesSnapshot\(prisma\)/,
  );
});

test("live API and SSR share the coalesced snapshot path", () => {
  const route = readFileSync("app/api/live-games/route.ts", "utf8");
  const page = readFileSync("app/live-games/page.tsx", "utf8");

  assert.match(
    route,
    /loadPublicLiveGamesSnapshot\(prisma\)/,
  );
  assert.doesNotMatch(route, /fresh:\s*true/);

  assert.match(
    page,
    /loadPublicLiveGamesSnapshot\(getPrisma\(\)\)/,
  );

  assert.doesNotMatch(
    page,
    /loadPublicLiveGamesSnapshot\(getPrisma\(\),\s*\{\s*fresh:\s*true\s*\}\)/,
  );
});

test("KKR live-games repository consumes fresh public live truth", () => {
  const router = readFileSync("lib/kingdomKnowledgeRouter.ts", "utf8");

  assert.match(
    router,
    /loadPublicLiveGamesSnapshot\(args\.prisma,\s*\{\s*fresh:\s*true\s*\}\)/,
  );
});
