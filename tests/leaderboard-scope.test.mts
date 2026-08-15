import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL(
    "../components/leaderboard/ModernLeaderboardPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

const route = readFileSync(
  new URL(
    "../app/api/lobby/leaderboard/route.ts",
    import.meta.url,
  ),
  "utf8",
);

const loader = readFileSync(
  new URL(
    "../lib/lobbyLeaderboard.ts",
    import.meta.url,
  ),
  "utf8",
);

const cache = readFileSync(
  new URL(
    "../lib/leaderboardLaneClientCache.ts",
    import.meta.url,
  ),
  "utf8",
);

test("leaderboard exposes an accessible full versus claimed-profile scope", () => {
  assert.match(
    page,
    /aria-label="Leaderboard players"/,
  );
  assert.match(
    page,
    />\s*Warriors\s*</,
  );
  assert.match(
    page,
    />\s*Kingdom\s*</,
  );
  assert.match(
    page,
    /aria-pressed=/,
  );
});

test("scope is sent on every page request and normalized by the API", () => {
  assert.match(
    page,
    /new URLSearchParams\(\{[\s\S]*scope,/,
  );
  assert.match(
    route,
    /searchParams\.get\(\s*"scope"/,
  );
  assert.match(
    route,
    /normalizeLeaderboardScope/,
  );
  assert.match(
    route,
    /scope,[\s\S]*query,/,
  );
});

test("a failed scope reset cannot expose stale rows from the previous scope", () => {
  const resetPosition =
    page.indexOf(
      "if (!preserveRows)",
      page.indexOf(
        "const loadPage",
      ),
    );
  const failurePosition =
    page.indexOf(
      "} catch {",
      resetPosition,
    );
  const resetBlock =
    page.slice(
      resetPosition,
      failurePosition,
    );

  assert.match(
    resetBlock,
    /setEntries\(\[\]\)/,
  );
  assert.match(
    resetBlock,
    /setTrackedPlayers\(0\)/,
  );
  assert.match(
    resetBlock,
    /setNextOffset\(0\)/,
  );
  assert.match(
    resetBlock,
    /setHasMore\(false\)/,
  );
});

test("a mismatched API scope or lane fails before rows are applied", () => {
  const loadPagePosition =
    page.indexOf(
      "const loadPage",
    );
  const validationPosition =
    page.indexOf(
      "payload.scope !==",
      loadPagePosition,
    );
  const requestedScopePosition =
    page.indexOf(
      "requestedScope",
      validationPosition,
    );
  const laneValidationPosition =
    page.indexOf(
      "payload.lane !==",
      requestedScopePosition,
    );
  const applyPosition =
    page.indexOf(
      "setEntries(",
      laneValidationPosition,
    );

  assert.ok(
    validationPosition >= 0,
  );
  assert.ok(
    requestedScopePosition >
      validationPosition,
  );
  assert.ok(
    laneValidationPosition >
      requestedScopePosition,
  );
  assert.ok(
    applyPosition >
      laneValidationPosition,
  );
});

test("scope filtering precedes search, sorting, and pagination", () => {
  const scopePosition =
    loader.indexOf(
      "const scopedEntries",
      loader.indexOf(
        "function buildLeaderboardSelection",
      ),
    );
  const searchPosition =
    loader.indexOf(
      "const filteredEntries",
      scopePosition,
    );
  const pagePosition =
    loader.indexOf(
      "searchableEntries.slice(",
      searchPosition,
    );

  assert.ok(scopePosition >= 0);
  assert.ok(searchPosition > scopePosition);
  assert.ok(pagePosition > searchPosition);
  assert.match(
    loader,
    /scope === "claimed"[\s\S]*entry\.claimed/,
  );
});

test("featured rows are opt-in and dedicated leaderboard callers disable enrichment", () => {
  assert.match(
    loader,
    /options\.includeFeaturedClaimed \?\? false/,
  );
  assert.match(
    route,
    /includeFeaturedClaimed:\s*false/,
  );
  assert.match(
    page,
    /scope,[\s\S]*offset:/,
  );
});

test("client and server caches isolate lane plus scope", () => {
  assert.match(
    cache,
    /return `\$\{lane\}:\$\{scope\}`/,
  );
  assert.match(
    cache,
    /scope:\s*normalizedScope/,
  );
  assert.match(
    loader,
    /scope:\s*normalizeLeaderboardScope/,
  );
});

test("system accounts are removed before census and selection", () => {
  const exclusionPosition =
    loader.indexOf(
      "isLeaderboardExcludedSystemUid",
      loader.indexOf(
        "const candidates",
      ),
    );
  const censusPosition =
    loader.indexOf(
      "const identityRows",
      exclusionPosition,
    );
  const selectionPosition =
    loader.indexOf(
      "buildLeaderboardSelection(",
      censusPosition,
    );

  assert.ok(exclusionPosition >= 0);
  assert.ok(censusPosition > exclusionPosition);
  assert.ok(selectionPosition > censusPosition);
});
