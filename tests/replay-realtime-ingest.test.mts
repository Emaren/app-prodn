import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proxySource = readFileSync(
  new URL("../app/api/replay/upload/route.ts", import.meta.url),
  "utf8"
);
const bridgeSource = readFileSync(
  new URL("../app/api/replay/post-ingest/route.ts", import.meta.url),
  "utf8"
);
const recoverySource = readFileSync(
  new URL("../app/api/admin/replay-auto-recovery/route.ts", import.meta.url),
  "utf8"
);
const postIngestCoordinatorSource = readFileSync(
  new URL("../lib/replayPostIngest.ts", import.meta.url),
  "utf8"
);
const recentMatchesSource = readFileSync(
  new URL("../lib/lobbyRecentMatches.ts", import.meta.url),
  "utf8"
);

test("web-proxied uploads declare the post-ingest owner", () => {
  assert.match(proxySource, /x-post-ingest-owner/);
  assert.match(proxySource, /web_proxy/);
});

test("direct API final receipts enter the idempotent web coordinator", () => {
  assert.match(bridgeSource, /INTERNAL_API_KEY/);
  assert.match(bridgeSource, /classifyReplayIngestReceipt/);
  assert.match(bridgeSource, /coordinateReplayPostIngest/);
  assert.match(bridgeSource, /queueBetMarketEnsure/);
  assert.match(bridgeSource, /Cache-Control/);
  assert.match(bridgeSource, /replayPostIngestReportSucceeded/);
  assert.match(
    bridgeSource,
    /report\.financial\.markets\.succeeded === false/
  );
});

test("post-ingest financial work requires a pass started after commit", () => {
  const dependencyStart = postIngestCoordinatorSource.indexOf(
    "async function defaultReplayPostIngestDependencies"
  );
  const dependencyEnd = postIngestCoordinatorSource.indexOf(
    "function acceptedFinalGameIds",
    dependencyStart
  );
  const dependencyBlock = postIngestCoordinatorSource.slice(
    dependencyStart,
    dependencyEnd
  );

  assert.ok(dependencyStart >= 0);
  assert.ok(dependencyEnd > dependencyStart);
  assert.match(dependencyBlock, /\{ ensureBetMarketsAfterCommit \}/);
  assert.match(dependencyBlock, /ensureBetMarketsAfterCommit\(/);
  assert.doesNotMatch(dependencyBlock, /\{ ensureBetMarkets \}/);
});

test("automatic replay recovery repairs identity projection after parsing", () => {
  const parserIndex = recoverySource.indexOf("runLatestReplayParserForGame");
  const resultIndex = recoverySource.indexOf(
    "reconcileAutomaticWatcherTerminalResults",
    parserIndex
  );
  const identityIndex = recoverySource.indexOf(
    "ensureReplayIdentityProjections",
    resultIndex
  );

  assert.ok(parserIndex >= 0);
  assert.ok(resultIndex > parserIndex);
  assert.ok(identityIndex > resultIndex);
  assert.match(recoverySource, /identityProjection/);
});

test("exact parser runs remain eligible for bounded recurrent output repair", () => {
  assert.match(recoverySource, /REPLAY_AUTO_RECONCILE_BATCH_SIZE/);
  assert.match(recoverySource, /exactContractRunRequired:\s*true/);
  assert.match(recoverySource, /hasAcceptedIdentityProjection/);
  assert.match(recoverySource, /missingIdentityProjection/);
  assert.match(recoverySource, /hasAcceptedResult/);
  assert.match(recoverySource, /missingAcceptedResult/);
  assert.match(recoverySource, /staleIdentityResultProjection/);
  assert.match(recoverySource, /identityGapsFirst:\s*true/);
  assert.match(recoverySource, /identityGapsRotate:\s*true/);
  assert.match(recoverySource, /resultOnlyGapsRotate:\s*true/);
  assert.match(recoverySource, /selectRecurrentReplayRecoveryBatch/);

  const recurrentLoop = recoverySource.indexOf(
    "const reconciliationResults"
  );
  const resultIndex = recoverySource.indexOf(
    "reconcileAutomaticWatcherTerminalResults",
    recurrentLoop
  );
  const identityIndex = recoverySource.indexOf(
    "ensureReplayIdentityProjections",
    resultIndex
  );

  assert.ok(recurrentLoop >= 0);
  assert.ok(resultIndex > recurrentLoop);
  assert.ok(identityIndex > resultIndex);
  assert.equal(
    recoverySource.indexOf("runLatestReplayParserForGame", recurrentLoop),
    -1,
    "the recurrent output lane must not rerun the parser"
  );
});

test("recent-match polling requests a bounded upstream window", () => {
  assert.match(recentMatchesSource, /const upstreamLimit/);
  assert.match(
    recentMatchesSource,
    /Math\.max\(\s*(?:64|160),/
  );
  assert.doesNotMatch(recentMatchesSource, /game_stats\?limit=160/);
});
