import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const router = readFileSync("lib/kingdomKnowledgeRouter.ts", "utf8");
const policy = readFileSync("lib/aiPromptPolicy.ts", "utf8");
const docs = readFileSync("docs/KINGDOM_KNOWLEDGE_ROUTER.md", "utf8");

test("KKR strips sensitive fields from public repository serialization", () => {
  for (const key of [
    "email",
    "token",
    "contactEmail",
    "contactDiscord",
    "adminNote",
    "rawRequest",
    "rawResponse",
    "walletAddress",
  ]) {
    assert.match(router, new RegExp(`"${key}"`));
  }
});

test("KKR is public knowledge while private viewer rails remain surface-gated", () => {
  assert.match(
    docs,
    /Viewer-private wallet, wager, claim, staking, session, direct-message and\s+Profile War Archive document context remains outside KKR/,
  );
  assert.match(
    docs,
    /Private War\s+Archive bytes are never promoted into the public Kingdom knowledge plane/,
  );
  assert.match(policy, /allowViewerMoneyContext/);
  assert.match(policy, /allowViewerStakingContext/);
});

test("Hall remains additive rather than a separate knowledge architecture", () => {
  assert.match(
    docs,
    /Hall Scribe uses the same public Kingdom Knowledge Router/,
  );
  assert.match(
    docs,
    /current Hall roster and audience-filtered Hall history/,
  );
});

test("admin router inspector is read-only", () => {
  const route = readFileSync(
    "app/api/admin/ai-knowledge/route.ts",
    "utf8",
  );

  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function PATCH/);
  assert.doesNotMatch(route, /export async function DELETE/);
});


test("shadow honors uses realtime production public trophy truth", () => {
  assert.match(
    router,
    /async function loadHonors\(args: RepositoryArgs\) \{[\s\S]*?if \(isShadowMode\(\)\) \{[\s\S]*?return publicJson\("\/api\/trophies"\);/,
  );

  assert.match(
    router,
    /loadHonors[\s\S]*?prisma\.trophy/,
  );
});


test("shadow clans read the current public clan directory while production keeps canonical Prisma", () => {
  assert.match(
    router,
    /async function loadClans\(args: RepositoryArgs\) \{[\s\S]*?if \(isShadowMode\(\)\) \{[\s\S]*?return loadPageBundle\(\["\/clans"\]\);/,
  );
  assert.match(
    router,
    /loadClans[\s\S]*?loadClanDirectory\(args\.prisma\)/,
  );
});

test("shadow parity review distinguishes environment-independent and already-public loaders", () => {
  assert.match(
    router,
    /async function loadSiteMap\(\)[\s\S]*?PUBLIC_KINGDOM_PAGES/,
  );

  assert.match(
    router,
    /async function loadLobbyChat[\s\S]*?publicJson\("\/api\/lobby\/chat\?limit=80"\)/,
  );

  assert.match(
    router,
    /async function loadMarketplace\(\)[\s\S]*?MARKETPLACE_CONFIG[\s\S]*?AVATAR_ARCHETYPES[\s\S]*?BELT_PLACEMENTS/,
  );

  assert.match(
    router,
    /loadPublicPageText/,
  );
});


test("tournament public surfaces use real deployed routes", () => {
  const catalog = readFileSync(
    "lib/kingdomKnowledgeCatalog.ts",
    "utf8",
  );

  assert.doesNotMatch(
    catalog,
    /\{ path: "\/tournaments", label: "Tournaments"/,
  );

  assert.match(
    catalog,
    /\{ path: "\/tournaments\/founders-cup", label: "Founders Cup", repository: "tournaments" \}/,
  );

  assert.match(
    router,
    /return loadPageBundle\(\["\/tournaments\/founders-cup", "\/wolomania"\]\);/,
  );
});


test("KKR focuses named player evidence before repository truncation", () => {
  assert.match(
    router,
    /function focusPublicLeaderboardPayload[\s\S]*?focusEvidenceItems\(entries, args, 24\)/,
  );

  assert.match(
    router,
    /loadPlayers[\s\S]*?publicJson\("\/api\/lobby\/leaderboard\?limit=600"\)/,
  );

  assert.match(
    router,
    /loadPlayers[\s\S]*?focusPublicLeaderboardPayload\(\s*payload,\s*args,\s*\)/,
  );

  assert.match(
    router,
    /function compactPlayerEvidence[\s\S]*?steamRmRating[\s\S]*?steamDmRating[\s\S]*?wins[\s\S]*?losses[\s\S]*?totalMatches[\s\S]*?nameHistory/,
  );
});

test("KKR focuses battle evidence by actual participants before serialization", () => {
  assert.match(
    router,
    /function playerNameTextFromGame[\s\S]*?record\.players/,
  );

  assert.match(
    router,
    /loadRecentBattles[\s\S]*?focusPublicGamePayload\([\s\S]*?recent-matches\?limit=60/,
  );

  assert.match(
    router,
    /loadBattleHistory[\s\S]*?focusPublicGamePayload\([\s\S]*?game_stats\?limit=220/,
  );
});

test("bounded rivalry evidence cannot justify an absolute no-record claim", () => {
  assert.match(
    router,
    /Absence of a pair from this bounded corpus does not prove there is no historical public record/,
  );

  assert.match(
    router,
    /never make an absolute no-record claim from bounded evidence/,
  );
});


test("downstream AI context preserves focused KKR evidence", () => {
  const concierge = readFileSync("lib/aiConcierge.ts", "utf8");

  assert.match(
    concierge,
    /maxContextChars:\s*28_000/,
  );

  assert.match(
    concierge,
    /const maxContextChars = Math\.max\(\s*40_000,\s*Math\.min\(100_000, agentConfig\?\.maxContextChars \?\? 40_000\),?\s*\);/,
  );
});

test("old downstream context ceilings cannot silently drop rivalry evidence", () => {
  const concierge = readFileSync("lib/aiConcierge.ts", "utf8");

  assert.doesNotMatch(
    concierge,
    /Math\.floor\(\(agentConfig\?\.maxContextChars \?\? 24_000\) \* 0\.65\)/,
  );

  assert.doesNotMatch(
    concierge,
    /Math\.min\(100_000, agentConfig\?\.maxContextChars \?\? 24_000\)/,
  );
});


test("KKR filters stop words before singularization", () => {
  const flatMap = router.indexOf(
    ".flatMap((value) => normalizeEvidenceTerm(value).split(/\\s+/))",
  );
  const firstFilter = router.indexOf(
    "!KKR_EVIDENCE_STOP_TERMS.has(value)",
    flatMap,
  );
  const singularize = router.indexOf(
    '.map((value) => value.replace(/s$/, ""))',
    firstFilter,
  );
  const secondFilter = router.indexOf(
    "!KKR_EVIDENCE_STOP_TERMS.has(value)",
    firstFilter + 1,
  );

  assert.ok(flatMap >= 0, "normalized-term split stage must exist");
  assert.ok(firstFilter > flatMap, "stop-word filter must follow normalization");
  assert.ok(
    singularize > firstFilter,
    "singularization must occur only after raw stop words are removed",
  );
  assert.ok(
    secondFilter > singularize,
    "transformed terms must be filtered again after singularization",
  );
});

test("two-player rivalry questions use targeted player archives before global rivalry scans", () => {
  const targeted = router.indexOf(
    "async function loadTargetedPairArchive(",
  );
  const rivalry = router.indexOf(
    "async function loadRivalries(",
  );
  const fastPath = router.indexOf(
    "await loadTargetedPairArchive(args)",
    rivalry,
  );

  assert.ok(targeted >= 0);
  assert.ok(rivalry > targeted);
  assert.ok(fastPath > rivalry);
  assert.doesNotMatch(
    router,
    /\/api\/player-profile\/matches\?kind=replay&name=\$\{encodeURIComponent\(queryPlayer\)\}&limit=200/,
  );
  assert.match(
    router,
    /pairArchivePublicMatchPath\(/,
  );
  assert.match(
    router,
    /resolveTargetedPairArchiveProfileIdentity\([\s\S]*?loadTargetedPairProfileMatchPage\([\s\S]*?profileIdentity/,
  );
});


test("KKR player focusing isolates historical composite aliases", () => {
  assert.match(
    router,
    /matchesPublicPlayerSearchTerms/,
  );

  assert.doesNotMatch(
    router,
    /entryMatchesTerms\(\s*entry\.name\s*,\s*entry\.aliases\s*,\s*args\.terms\s*\)/,
  );
});
