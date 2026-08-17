import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "lib/aiConcierge.ts",
  "utf8",
);

function sliceFrom(
  token: string,
) {
  const start =
    source.indexOf(token);

  assert.notEqual(
    start,
    -1,
    `${token} must exist`,
  );

  return source.slice(start);
}

function sliceBetween(
  startToken: string,
  endTokens: string[],
) {
  const start =
    source.indexOf(startToken);

  assert.notEqual(
    start,
    -1,
    `${startToken} must exist`,
  );

  const ends =
    endTokens
      .map((token) =>
        source.indexOf(
          token,
          start + startToken.length,
        ),
      )
      .filter((value) =>
        value > start,
      );

  assert.ok(
    ends.length > 0,
    "function end anchor must exist",
  );

  return source.slice(
    start,
    Math.min(...ends),
  );
}

const requestSource =
  sliceFrom(
    "export async function requestAiConciergeReply(",
  );

const promptSource =
  sliceBetween(
    "function buildUserPrompt(",
    [
      "\nexport async function ensureAiPersonaUser(",
      "\nexport async function requestAiConciergeReply(",
    ],
  );

test("Clan Hall skips generic lobby leaderboard work beside KKR", () => {
  assert.match(
    requestSource,
    /args\.source === "clan_hall"\s*\?\s*Promise\.resolve\(getFallbackLeaderboard\(\)\)\s*:\s*loadLobbyLeaderboard\(args\.prisma\)/s,
  );
});

test("Clan Hall skips generic recent-match work beside KKR", () => {
  assert.match(
    requestSource,
    /args\.source === "clan_hall"\s*\?\s*Promise\.resolve\(\[\] as LobbyMatchRow\[\]\)\s*:\s*loadRecentMatchesForAi\(\)/s,
  );
});

test("Clan Hall still loads KKR as current public-site evidence", () => {
  assert.match(
    requestSource,
    /loadKingdomKnowledgeContext\(\{[\s\S]*?prisma:\s*args\.prisma,[\s\S]*?source:\s*args\.source,[\s\S]*?message:/s,
  );
});

test("Hall prompt delegates generic leaderboard truth to KKR", () => {
  assert.match(
    promptSource,
    /args\.source === "clan_hall"[\s\S]*?Generic lobby leaderboard snapshot: intentionally excluded from the Clan Hall lane; use current Kingdom Knowledge Router evidence\./s,
  );

  assert.match(
    promptSource,
    /:\s*formatLeaderboardContext\(context\.leaderboard\)/s,
  );
});

test("Hall prompt delegates generic recent-match truth to KKR", () => {
  assert.match(
    promptSource,
    /args\.source === "clan_hall"[\s\S]*?Generic recent-match snapshot: intentionally excluded from the Clan Hall lane; use current Kingdom Knowledge Router battle evidence\./s,
  );

  assert.match(
    promptSource,
    /:\s*formatRecentMatchesContext\(context\.recentMatches\)/s,
  );
});

test("non-Hall AI lanes retain both existing generic loaders", () => {
  assert.match(
    requestSource,
    /:\s*loadLobbyLeaderboard\(args\.prisma\)/,
  );

  assert.match(
    requestSource,
    /:\s*loadRecentMatchesForAi\(\)/,
  );
});
