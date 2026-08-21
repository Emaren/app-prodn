import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PUBLIC_KINGDOM_PAGES,
  routeKingdomKnowledgeRepositories,
} from "../lib/kingdomKnowledgeCatalog.ts";

const catalog = readFileSync(
  "lib/kingdomKnowledgeCatalog.ts",
  "utf8",
);
const router = readFileSync(
  "lib/kingdomKnowledgeRouter.ts",
  "utf8",
);
const policy = readFileSync(
  "lib/aiPromptPolicy.ts",
  "utf8",
);
const docs = readFileSync(
  "docs/KINGDOM_KNOWLEDGE_ROUTER.md",
  "utf8",
);

test("Traffic Observatory is a first-class routed KKR repository", () => {
  const routed =
    routeKingdomKnowledgeRepositories(
      "How many confirmed human visitors did we have yesterday?",
      { maxRepositories: 8 },
    );

  assert.equal(
    routed.includes("traffic"),
    true,
    `traffic missing from route: ${routed.join(", ")}`,
  );

  assert.equal(
    PUBLIC_KINGDOM_PAGES.some(
      (page) =>
        page.path === "/traffic" &&
        page.repository === "traffic",
    ),
    true,
  );

  assert.match(
    catalog,
    /id: "traffic"[\s\S]*?completed UTC days[\s\S]*?unique IP addresses/,
  );
  assert.match(
    router,
    /publicJson\("\/api\/traffic\/public"\)/,
  );
  assert.match(
    router,
    /traffic: loadTraffic/,
  );
  assert.match(
    router,
    /latestCompletedUtcDay/,
  );
  assert.match(
    router,
    /previousCompletedUtcDay/,
  );
});

test("Traffic loader reads the public API nested values envelope", () => {
  assert.match(
    router,
    /asEvidenceRecord\(row\.values\) \?\? row/,
  );
  assert.match(
    router,
    /values\.totalTraffic/,
  );
  assert.match(
    router,
    /values\.suspectedHuman/,
  );
  assert.match(
    router,
    /values\.confirmedHuman/,
  );
});

test("shadow online names use canonical request-time public presence", () => {
  assert.match(
    router,
    /looksLikeOnlinePlayerListIntent[\s\S]*?publicJson\("\/api\/user\/online_users"\)/,
  );
  assert.match(
    router,
    /in_game_name/,
  );
  assert.match(
    router,
    /isInternalSystemUid\(uid\)/,
  );
  assert.match(
    router,
    /canonical request-time public presence/,
  );
});

test("Traffic truth never silently becomes unique-person truth", () => {
  assert.match(
    router,
    /Never relabel them as unique people, unique visitors, or unique IPs/,
  );
  assert.match(
    docs,
    /must never be relabeled as unique people, unique visitors, or\s+unique IP addresses/,
  );
});

test("online-player intent exposes human names instead of only a count", () => {
  assert.match(
    router,
    /function looksLikeOnlinePlayerListIntent/,
  );
  assert.match(
    router,
    /humanClaimed[\s\S]*?isInternalSystemUid\(entry\.uid\)/,
  );
  assert.match(
    router,
    /humanOnline[\s\S]*?onlineHumans/,
  );
  assert.match(
    router,
    /onlinePlayers/,
  );
  assert.match(
    router,
    /systemClaimedProfiles/,
  );
});

test("latest-game questions preserve the newest canonical public battle", () => {
  assert.match(
    router,
    /function looksLikeLatestBattleIntent/,
  );
  assert.match(
    router,
    /latestPublicBattle/,
  );
  assert.match(
    router,
    /compactGameEvidence\(archive\.entries\[0\]\)/,
  );
});

test("Marketplace KKR loads live public storefront truth before static configuration", () => {
  assert.match(
    router,
    /async function loadMarketplace\(\)[\s\S]*?MARKETPLACE_CONFIG[\s\S]*?AVATAR_ARCHETYPES[\s\S]*?BELT_PLACEMENTS/,
  );
  assert.match(
    router,
    /async function loadMarketplaceRuntime[\s\S]*?marketplaceShop\.findMany/,
  );
  assert.match(
    router,
    /status: "active"[\s\S]*?displayEnabled: true/,
  );
  assert.match(
    router,
    /publicActiveBusinessCount/,
  );
  assert.match(
    router,
    /marketplace: loadMarketplaceRuntime/,
  );

  const routed =
    routeKingdomKnowledgeRepositories(
      "How many businesses are open in the Marketplace?",
      { maxRepositories: 8 },
    );
  assert.equal(
    routed.includes("marketplace"),
    true,
  );
});

test("Hall Scribe can predict without presenting guesses as facts", () => {
  assert.match(
    policy,
    /prediction, forecast, guess, ranking, or opinion/,
  );
  assert.match(
    policy,
    /never present the prediction as recorded fact/,
  );
});

test("Hall Scribe cannot invent its own conversational history", () => {
  assert.match(
    policy,
    /whether you previously said, greeted, promised, or did something in the Hall/,
  );
  assert.match(
    policy,
    /Never claim a past action unless that history actually shows it/,
  );
});

test("Hall prompt manifest admits that KKR is present", () => {
  const hallAt =
    policy.indexOf(
      'if (source === "clan_hall")',
    );
  const rosterAt =
    policy.indexOf(
      '{ key: "clan_hall_roster"',
      hallAt,
    );
  const routerAt =
    policy.indexOf(
      "kingdomRouter,",
      hallAt,
    );

  assert.ok(hallAt >= 0);
  assert.ok(routerAt > hallAt);
  assert.ok(rosterAt > routerAt);
});
