import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../app/api/challenges/route.ts");
const service = read("../lib/challenges.ts");
const ui = read("../components/challenge/ChallengeWorkspace.tsx");

test("GET responds with the authoritative snapshot before commissioner notice retry", () => {
  const getStart = route.indexOf("export async function GET(request:");
  const postStart = route.indexOf("export async function POST(request:", getStart);
  assert.ok(getStart >= 0 && postStart > getStart);
  const handler = route.slice(getStart, postStart);
  assert.match(handler, /await loadChallengeHubSnapshot\(prisma, viewerUid\)/);
  assert.match(handler, /after\(async \(\) => \{/);
  assert.ok(handler.includes('await retryChallengeCommissionerNotices(prisma, challengeIds)'));
  assert.match(handler, /return NextResponse\.json\(payload\)/);
  assert.match(handler, /challengeIds\.length > 0/);
});

test("empty challenge board requires neither live-session polling nor reconciliation writes", () => {
  assert.match(service, /historySnapshot\.rows\.length > 0\s*\? loadLiveSessionSnapshot\(prisma\)/);
  assert.match(service, /\{ activeSessions: \[\], recentlyCompletedSessions: \[\] \}/);
  assert.ok(service.includes("const [sessionSnapshot, watcherReadinessByUserId] = await Promise.all(["));
  assert.match(service, /INITIAL_CHALLENGE_HISTORY_LIMIT = 8/);
  assert.match(service, /if \(scheduledMatchIds\.length === 0\)/);
});

test("recent activity renders compact faded preview and cannot initiate hidden history pagination", () => {
  assert.match(ui, /Recent Challenge Activity/);
  assert.match(ui, /max-h-\[14\.5rem\]/);
  assert.match(ui, /mask-image:linear-gradient/);
  assert.doesNotMatch(ui, /activitySentinelRef/);
  assert.match(ui, /observe\(historyScrollRef\.current, historySentinelRef\.current\)/);
  assert.match(ui, /onClick=\{\(\) => void loadOlderHistory\(\)\}/);
});
