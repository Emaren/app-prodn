import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("AoE2WAR is the only realtime flagship hall", () => {
  const features = read("lib/clanHallFeatures.ts");

  assert.match(features, /aoe2war: AOE2WAR_FLAGSHIP_FEATURES/);
  assert.match(
    features,
    /AOE2WAR_FLAGSHIP_FEATURES[\s\S]*realtime: true/,
  );
  assert.match(
    features,
    /AOE2WAR_FLAGSHIP_FEATURES[\s\S]*optimisticMessages: true/,
  );
  assert.match(
    features,
    /BASELINE_CLAN_HALL_FEATURES[\s\S]*realtime: false/,
  );
  assert.doesNotMatch(features, /mystikal:/);
  assert.doesNotMatch(features, /jims-clan:/);
  assert.doesNotMatch(features, /legend-clan:/);
});

test("live Hall stream carries invalidation signals, not message bodies", () => {
  const events = read("lib/clanHallEvents.ts");
  const route = read("app/api/clans/[slug]/events/route.ts");

  assert.match(events, /ClanHallEventType/);
  assert.doesNotMatch(events, /body:/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /subscribeToClanHallEvents/);
  assert.match(route, /X-Accel-Buffering/);
});

test("Clan mutations wake connected AoE2WAR Hall clients", () => {
  const route = read("app/api/clans/[slug]/route.ts");

  assert.match(route, /publishClanHallEvent/);
  assert.match(route, /type: "message"/);
  assert.match(route, /type: "reaction"/);
  assert.match(route, /type: "message_updated"/);
  assert.match(route, /type: "message_deleted"/);
  assert.match(route, /type: "policy"/);
});

test("AoE2WAR client uses SSE with a safety poll and baseline halls keep polling", () => {
  const client = read("components/clans/ClanHallClient.tsx");

  assert.match(client, /new EventSource\(`\$\{endpoint\}\/events`\)/);
  assert.match(client, /BASELINE_POLL_INTERVAL_MS = 10_000/);
  assert.match(client, /REALTIME_SAFETY_POLL_INTERVAL_MS = 60_000/);
  assert.match(client, /realtimeEnabled/);
  assert.match(client, /Live Hall link connected/);
});

test("optimistic Hall messages can visibly fail and retry", () => {
  const client = read("components/clans/ClanHallClient.tsx");

  assert.match(client, /PendingClanMessage/);
  assert.match(client, /status: "sending"/);
  assert.match(client, /status: "failed"/);
  assert.match(client, /retryPendingMessage/);
  assert.match(client, /Not sent/);
  assert.match(client, /Sending/);
});
