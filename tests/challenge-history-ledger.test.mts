import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const challengesSource = readFileSync(
  new URL("../lib/challenges.ts", import.meta.url),
  "utf8"
);
const historyRouteSource = readFileSync(
  new URL("../app/api/challenges/history/route.ts", import.meta.url),
  "utf8"
);
const workspaceSource = readFileSync(
  new URL("../components/challenge/ChallengeWorkspace.tsx", import.meta.url),
  "utf8"
);

test("commissioners receive the global challenge ledger while regular users stay participant scoped", () => {
  assert.match(
    challengesSource,
    /loadChallengeHistoryRows\(prisma, viewer\.id, viewer\.isAdmin\)/
  );
  assert.match(
    challengesSource,
    /historyScope: viewer\.isAdmin \? "global" : "participant"/
  );
  assert.match(
    challengesSource,
    /includeGlobal\s*\? \{\}\s*: \{[\s\S]*?challengerUserId: viewerUserId[\s\S]*?challengedUserId: viewerUserId/
  );
  assert.match(historyRouteSource, /select: \{ id: true, isAdmin: true \}/);
  assert.match(historyRouteSource, /includeGlobal: viewer\.isAdmin/);
});

test("challenge ledger pagination is stable by descending Match ID and follows API cursors", () => {
  assert.match(challengesSource, /function compareHistoryTileOrder[\s\S]*?return right\.id - left\.id/);
  assert.match(challengesSource, /id: \{ lt: options\.cursor \}/);
  assert.doesNotMatch(challengesSource, /cursor: \{ id: options\.cursor \}/);
  assert.match(workspaceSource, /cursor: String\(historyNextCursor\)/);
  assert.match(workspaceSource, /setHistoryNextCursor\(nextCursor\)/);
  assert.doesNotMatch(workspaceSource, /Math\.min\(\.\.\.all\.map/);
  assert.match(workspaceSource, /sort\(\(left, right\) => right\.challengeId - left\.challengeId\)/);
});

test("challenge history and activity auto-load without truncating events before grouping", () => {
  assert.doesNotMatch(challengesSource, /return items\.slice\(/);
  assert.match(historyRouteSource, /activities: page\.activities/);
  assert.match(workspaceSource, /new IntersectionObserver/);
  assert.match(workspaceSource, /ref=\{activitySentinelRef\}/);
  assert.match(workspaceSource, /ref=\{historySentinelRef\}/);
  assert.match(workspaceSource, /historyHasMore && historyAutoLoadFailed/);

  const groupedActivitySource = workspaceSource.slice(
    workspaceSource.indexOf("const recentChallengeRecords"),
    workspaceSource.indexOf("const acceptanceDeadlinePreview")
  );
  assert.doesNotMatch(groupedActivitySource, /\.slice\(/);
});

test("challenge candidates include newly registered humans without requiring Steam", () => {
  assert.doesNotMatch(challengesSource, /steamId:\s*\{\s*not:\s*null/);
  assert.match(challengesSource, /verificationMethod:\s*\{\s*not:\s*"system"/);
  assert.match(challengesSource, /take: 80/);
});
