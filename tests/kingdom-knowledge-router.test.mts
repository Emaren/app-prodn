import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  KINGDOM_KNOWLEDGE_REPOSITORIES,
  PUBLIC_KINGDOM_PAGES,
  routeKingdomKnowledgeRepositories,
} from "../lib/kingdomKnowledgeCatalog.ts";

const router = readFileSync("lib/kingdomKnowledgeRouter.ts", "utf8");
const concierge = readFileSync("lib/aiConcierge.ts", "utf8");
const policy = readFileSync("lib/aiPromptPolicy.ts", "utf8");
const hall = readFileSync("lib/clanHallScribe.ts", "utf8");
const config = readFileSync("lib/aiConciergeConfig.ts", "utf8");
const admin = readFileSync(
  "components/admin/ai/AiCommandCenter.tsx",
  "utf8",
);

test("KKR catalogs the major public Kingdom systems", () => {
  const ids = new Set(
    KINGDOM_KNOWLEDGE_REPOSITORIES.map((repository) => repository.id),
  );

  for (const id of [
    "lobby_chat",
    "players",
    "leaderboard",
    "recent_battles",
    "battle_history",
    "rivalries",
    "live_games",
    "tournaments",
    "challenges",
    "honors",
    "clans",
    "forum",
    "betting",
    "wolochain",
    "staking",
    "forge",
    "oracle",
    "bounties",
    "governance",
    "requests",
    "marketplace",
    "radio",
  ]) {
    assert.equal(ids.has(id as never), true, `missing repository ${id}`);
  }

  assert.ok(PUBLIC_KINGDOM_PAGES.length >= 30);
});

test("KKR routes player rivalry questions to player and battle truth", () => {
  const routed = routeKingdomKnowledgeRepositories(
    "How has Zodiac done against Somniosator, including team games?",
  );

  assert.equal(routed.includes("players"), true);
  assert.equal(routed.includes("rivalries"), true);
  assert.equal(
    routed.includes("battle_history") ||
      routed.includes("recent_battles"),
    true,
  );
});

test("KKR routes economy questions to exact domain repositories", () => {
  const staking = routeKingdomKnowledgeRepositories(
    "How much WOLO is staked and what are the staking rewards?",
  );
  assert.equal(staking.includes("staking"), true);
  assert.equal(staking.includes("wolochain"), true);

  const betting = routeKingdomKnowledgeRepositories(
    "What betting markets are open and what is in the War Chest?",
  );
  assert.equal(betting.includes("betting"), true);
});

test("KKR routes Kingdom product systems without a model pre-call", () => {
  const forge = routeKingdomKnowledgeRepositories(
    "What is happening in the Kingdom Forge with deeds and milestones?",
  );
  assert.equal(forge.includes("forge"), true);

  const oracle = routeKingdomKnowledgeRepositories(
    "What prediction markets are live in the Oracle?",
  );
  assert.equal(oracle.includes("oracle"), true);

  assert.doesNotMatch(
    router,
    /requestDirectOpenAiResponse|responses\.create|api\.openai\.com/,
  );
});

test("KKR loads repositories concurrently and with bounded failure", () => {
  assert.match(router, /Promise\.all\(/);
  assert.match(router, /DEFAULT_REPOSITORY_TIMEOUT_MS = 4_000/);
  assert.match(router, /Promise\.race\(/);
  assert.match(router, /maxRepositories/);
  assert.match(router, /maxContextChars/);
});

test("all AI agents receive KKR in the parallel context load before the provider call", () => {
  assert.match(
    concierge,
    /kingdomKnowledge,\s*\n\s*\] = await Promise\.all/,
  );
  assert.match(
    concierge,
    /loadKingdomKnowledgeContext\(\{/,
  );
  assert.match(
    concierge,
    /kingdomKnowledgeContext: kingdomKnowledge\.context/,
  );

  const knowledgeAt = concierge.indexOf(
    "loadKingdomKnowledgeContext({",
  );
  const providerAt = Math.max(
    concierge.indexOf("await requestDirectOpenAiResponse", knowledgeAt),
    concierge.indexOf("fetch(LLAMA_CHAT_GATEWAY_URL", knowledgeAt),
  );

  assert.ok(knowledgeAt >= 0);
  assert.ok(providerAt > knowledgeAt);
});

test("Hall Scribe gets full KKR plus additive audience-filtered Hall history", () => {
  assert.match(
    hall,
    /Recent visible Hall conversation before the current message/,
  );
  assert.match(
    hall,
    /hallScribeVisibleAudiences/,
  );
  assert.match(
    concierge,
    /context\.kingdomKnowledgeContext/,
  );
});

test("universal AI instructions are answer-first instead of domain-dump prompts", () => {
  assert.match(
    policy,
    /Answer the user's actual question first/,
  );
  assert.match(
    policy,
    /Kingdom Knowledge Router supplies current AoE2WAR evidence/,
  );
  assert.doesNotMatch(
    policy,
    /The 2% betting fee is split 50\/50/,
  );
  assert.doesNotMatch(
    policy,
    /stakingWeight is time-weighted accounting, not extra WOLO balance/,
  );
});

test("Hall Scribe is pinned to its dedicated v2 provider prompt", () => {
  assert.match(
    config,
    /pmpt_6a8231b331348197b5858fb46dabc6aa0a74c246f54e8741/,
  );
  assert.match(
    config,
    /AOE2WAR_HALL_SCRIBE_PROMPT_VERSION\?\.trim\(\) \|\| "2"/,
  );
});

test("Hall Scribe staging defaults describe an assistant, not a lore character", () => {
  assert.match(admin, /AoE2WAR Hall assistant/);
  assert.match(admin, /kingdom_public_all/);
  assert.match(admin, /clan_hall_history/);
  assert.match(
    admin,
    /Do not force lore, jokes, roleplay, or personality/,
  );
});


test("KKR understands natural staking language variants", () => {
  const cases = [
    "How much WOLO is currently staked and who are the largest stakers?",
    "Who has the biggest WOLO stake?",
    "What happens when I unstake WOLO?",
    "How does WOLO staking work?",
    "What is happening with staking compounding?",
  ];

  for (const query of cases) {
    const routed = routeKingdomKnowledgeRepositories(query, {
      maxRepositories: 8,
    });

    assert.equal(
      routed.includes("staking"),
      true,
      `expected staking repository for: ${query}; got ${routed.join(", ")}`,
    );
  }

  const combined = routeKingdomKnowledgeRepositories(
    "How much WOLO is currently staked and who are the largest stakers?",
    { maxRepositories: 8 },
  );

  assert.equal(combined.includes("staking"), true);
  assert.equal(combined.includes("wolochain"), true);
});


test("KKR routes human-facing public page names to their owning repositories", () => {
  const cases = [
    {
      query: "What is happening in the Founders Cup?",
      expected: "tournaments",
    },
    {
      query: "Who is playing in the Founders Cup?",
      expected: "tournaments",
    },
    {
      query: "What is happening in the Round Chamber?",
      expected: "governance",
    },
    {
      query: "What does the Battle Archive show?",
      expected: "battle_history",
    },
    {
      query: "What is happening in the Kingdom Forge?",
      expected: "forge",
    },
  ];

  for (const { query, expected } of cases) {
    const routed = routeKingdomKnowledgeRepositories(query, {
      maxRepositories: 8,
    });

    assert.equal(
      routed.includes(expected as never),
      true,
      `expected ${expected} for "${query}", got ${routed.join(", ")}`,
    );
  }
});


test("KKR page-label routing avoids substring collisions", () => {
  const wolomania = routeKingdomKnowledgeRepositories(
    "What tournaments or Wolomania events are active?",
    { maxRepositories: 8 },
  );

  assert.equal(wolomania.includes("tournaments"), true);
  assert.equal(
    wolomania.includes("wolochain"),
    false,
    `Wolomania must not trigger WOLO page-label matching: ${wolomania.join(", ")}`,
  );

  const wolo = routeKingdomKnowledgeRepositories(
    "What is happening with WOLO right now?",
    { maxRepositories: 8 },
  );

  assert.equal(
    wolo.includes("wolochain"),
    true,
    `Exact WOLO wording should still route to wolochain: ${wolo.join(", ")}`,
  );

  const foundersCup = routeKingdomKnowledgeRepositories(
    "What is happening in the Founders Cup?",
    { maxRepositories: 8 },
  );

  assert.equal(foundersCup.includes("tournaments"), true);
});
