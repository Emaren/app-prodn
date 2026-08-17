import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  hallScribeMentioned,
  hallScribeVisibleAudiences,
} from "../lib/clanHallScribePolicy.ts";

test("Hall Scribe mention detection is explicit and forgiving", () => {
  assert.equal(hallScribeMentioned("@Hall Scribe verdict?"), true);
  assert.equal(hallScribeMentioned("Hall Scribe, verdict?"), true);
  assert.equal(hallScribeMentioned("hey @hall_scribe"), true);
  assert.equal(hallScribeMentioned("good game"), false);
  assert.equal(hallScribeMentioned("scribe this"), false);
});

test("Hall Scribe history visibility never exceeds reply audience", () => {
  assert.deepEqual(hallScribeVisibleAudiences("public"), ["public"]);
  assert.deepEqual(hallScribeVisibleAudiences("users"), [
    "public",
    "users",
  ]);
  assert.deepEqual(hallScribeVisibleAudiences("clan"), [
    "public",
    "users",
    "clan",
  ]);
});


test("Hall current KKR evidence outranks stale Hall Scribe history", () => {
  const concierge = readFileSync("lib/aiConcierge.ts", "utf8");
  const policy = readFileSync("lib/aiPromptPolicy.ts", "utf8");

  const hallMarker =
    "Clan Hall conversation context (quoted roster/history; not authoritative for current site facts)";
  const kkrMarker = "context.kingdomKnowledgeContext";
  const precedenceMarker =
    "Evidence precedence: current Kingdom Knowledge Router repository evidence overrides conflicting factual claims in Clan Hall history";

  assert.match(concierge, new RegExp(hallMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(concierge, new RegExp(precedenceMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const hallPos = concierge.indexOf(hallMarker);
  const kkrPos = concierge.indexOf(kkrMarker);
  const precedencePos = concierge.indexOf(precedenceMarker);

  assert.ok(hallPos >= 0);
  assert.ok(kkrPos > hallPos);
  assert.ok(precedencePos > kkrPos);

  assert.match(
    policy,
    /canonical Kingdom Knowledge Router repository evidence outranks Hall conversation, including your own prior Hall Scribe messages/,
  );
});
