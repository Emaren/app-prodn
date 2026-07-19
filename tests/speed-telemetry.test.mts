import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SPEED_CORRELATION_STORAGE_KEYS } from "../lib/speed/clientIds.ts";
import { sanitizeSpeedPath } from "../lib/speed/routeSanitizer.ts";

test("Speed path sanitation strips query strings and fragments", () => {
  assert.equal(sanitizeSpeedPath("/contact-emaren?user=secret#message"), "/contact-emaren");
  assert.equal(sanitizeSpeedPath("https://aoe2war.com/rivalries?uid=secret"), "/rivalries");
});

test("Speed reuses the canonical Traffic visitor and session keys", () => {
  assert.equal(SPEED_CORRELATION_STORAGE_KEYS.trafficVisitor, "traffic_visitor_id");
  assert.equal(SPEED_CORRELATION_STORAGE_KEYS.trafficSession, "traffic_session_id");
  assert.equal(SPEED_CORRELATION_STORAGE_KEYS.journeySession, "aoe2hdbets:journey-session-id");
});

test("the same-origin Speed relay owns trusted identity and build enrichment", () => {
  const route = readFileSync(new URL("../app/api/speed/sample/route.ts", import.meta.url), "utf8");
  assert.match(route, /getSessionUid\(request\)/);
  assert.match(route, /user_uid: uid/);
  assert.match(route, /NEXT_PUBLIC_AOE2WAR_BUILD_VERSION/);
  assert.match(route, /host: "aoe2war\.com"/);
  assert.doesNotMatch(route, /user_uid: body\./);
});

test("the flight recorder is wired globally but exposes no Speed UI", () => {
  const shell = readFileSync(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /<SpeedRuntime \/>/);
  assert.match(shell, /<SpeedWebVitals \/>/);
  assert.doesNotMatch(shell, /<SpeedProof \/>/);
});
