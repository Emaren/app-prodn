import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isAuthoritativePairRivalryIntent,
} from "../lib/kingdomKnowledgePairIntent.ts";

test("focused rivalry questions qualify for rivalry-only execution", () => {
  assert.equal(
    isAuthoritativePairRivalryIntent(
      "How has Zodiac done against somniosator, including team games?",
    ),
    true,
  );

  assert.equal(
    isAuthoritativePairRivalryIntent(
      "Did Zodiac and somniosator ever meet?",
    ),
    true,
  );

  assert.equal(
    isAuthoritativePairRivalryIntent(
      "Zodiac vs somniosator head-to-head",
    ),
    true,
  );
});

test("leaderboard/profile/rating requests preserve normal KKR fanout", () => {
  assert.equal(
    isAuthoritativePairRivalryIntent(
      "Compare Zodiac and somniosator leaderboard ranks",
    ),
    false,
  );

  assert.equal(
    isAuthoritativePairRivalryIntent(
      "Show profiles for Zodiac and somniosator",
    ),
    false,
  );

  assert.equal(
    isAuthoritativePairRivalryIntent(
      "Zodiac vs somniosator ratings and ELO",
    ),
    false,
  );
});

test("generic two-name comparison does not collapse to rivalry-only execution", () => {
  assert.equal(
    isAuthoritativePairRivalryIntent(
      "Compare Zodiac and somniosator",
    ),
    false,
  );
});

test("router gates rivalry-only execution through the semantic helper", () => {
  const source = readFileSync(
    "lib/kingdomKnowledgeRouter.ts",
    "utf8",
  );

  assert.match(
    source,
    /pairTerms\.length\s*===\s*2[\s\S]*?routedRepositories\.includes\("rivalries"\)[\s\S]*?isAuthoritativePairRivalryIntent\([A-Za-z_$][A-Za-z0-9_$]*\.message\)/,
  );
});
