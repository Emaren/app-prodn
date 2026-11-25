import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clanHallScribeRepliesEnabled, clanHallFeatureEnabled } from "../lib/clanHallFeatures.ts";

test("restricted production advertises human text only without changing baseline feature", () => {
  assert.equal(clanHallFeatureEnabled("mystikal", "hallScribe"), true);
  assert.equal(clanHallScribeRepliesEnabled("mystikal", false), true);
  assert.equal(clanHallScribeRepliesEnabled("mystikal", true), false);
  assert.equal(clanHallScribeRepliesEnabled("unknown", true), false);
});

test("server supplies actual runtime capability; client does not infer it from build environment", () => {
  const page = readFileSync("app/clans/[slug]/page.tsx", "utf8");
  const client = readFileSync("components/clans/ClanHallClient.tsx", "utf8");
  assert.match(page, /restrictedProductionChat=\{usesNonfinancialProductionAuth\(\)\}/);
  assert.match(client, /clanHallScribeRepliesEnabled\(\s*snapshot\.clan\.slug,\s*restrictedProductionChat,/);
  assert.match(client, /\{hallScribeEnabled \? \(/);
});

test("new sends and stale retries use the admitted capability before constructing either request", () => {
  const client = readFileSync("components/clans/ClanHallClient.tsx", "utf8");
  const start = client.indexOf("async function sendMessageDraft(");
  const end = client.indexOf("async function postMessage(", start);
  const send = client.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(send, /const requestScribe = requestedScribe && hallScribeEnabled;/);
  assert.ok(send.indexOf("const requestScribe") < send.indexOf("fetch("));
  assert.match(send, /scribe: requestScribe/);
  assert.match(send, /formData\.set\("scribe", requestScribe \?/);
  assert.match(client, /pending\.requestScribe/);
  const server = readFileSync("app/api/social/clan-text/route.ts", "utf8");
  assert.match(server, /if \(input\.scribe === true\)/);
  assert.match(server, /Restricted production chat accepts human text only/);
});
