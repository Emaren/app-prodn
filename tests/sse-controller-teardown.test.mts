import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("direct-message SSE treats closed controllers as teardown", () => {
  const route = source("app/api/contact-emaren/events/route.ts");

  assert.match(route, /let closed = false/);
  assert.match(route, /const cleanup = \(\) =>/);
  assert.match(route, /const safeEnqueue = \(payload: Uint8Array\) =>/);
  assert.match(route, /closed \|\| request\.signal\.aborted/);
  assert.match(route, /try \{\s*controller\.enqueue\(payload\)/);
  assert.match(route, /catch \{[\s\S]*cleanup\(\)/);
  assert.match(route, /request\.signal\.addEventListener\("abort", cleanup, \{ once: true \}\)/);
  assert.doesNotMatch(route, /controllerRef\?\.close\(\)/);
  assert.match(route, /heartbeat\.unref\?\.\(\)/);
  assert.doesNotMatch(
    route,
    /heartbeat = setInterval\(\(\) => \{\s*controller\.enqueue/,
  );
});

test("Clan Hall SSE uses the same fail-closed write contract", () => {
  const route = source("app/api/clans/[slug]/events/route.ts");

  assert.match(route, /let closed = false/);
  assert.match(route, /const cleanup = \(\) =>/);
  assert.match(route, /const safeEnqueue = \(payload: Uint8Array\) =>/);
  assert.match(route, /closed \|\| request\.signal\.aborted/);
  assert.match(route, /try \{\s*controller\.enqueue\(payload\)/);
  assert.match(route, /catch \{\s*cleanup\(\)/);
  assert.match(route, /request\.signal\.addEventListener\("abort", cleanup, \{ once: true \}\)/);
  assert.doesNotMatch(route, /controllerRef\?\.close\(\)/);
  assert.match(route, /heartbeat\.unref\?\.\(\)/);
  assert.doesNotMatch(
    route,
    /heartbeat = setInterval\(\(\) => \{\s*if \(closed\) return;\s*controller\.enqueue/,
  );
});

test("request abort releases app state without manually closing response controllers", () => {
  const routes = [
    source("app/api/contact-emaren/events/route.ts"),
    source("app/api/clans/[slug]/events/route.ts"),
    source("app/api/kingdom-presence/events/route.ts"),
  ];

  for (const route of routes) {
    assert.match(
      route,
      /request\.signal\.addEventListener\("abort", cleanup, \{ once: true \}\)/,
    );
    assert.match(
      route,
      /if \(request\.signal\.aborted\) cleanup\(\)/,
    );
    assert.doesNotMatch(route, /controllerRef/);
    assert.doesNotMatch(
      route,
      /request\.signal[\s\S]{0,500}controller\.close\(/,
    );
  }
});

test("request abort releases app state without manually closing response controllers", () => {
  const routes = [
    source("app/api/contact-emaren/events/route.ts"),
    source("app/api/clans/[slug]/events/route.ts"),
    source("app/api/kingdom-presence/events/route.ts"),
  ];

  for (const route of routes) {
    assert.match(
      route,
      /request\.signal\.addEventListener\("abort", cleanup, \{ once: true \}\)/,
    );
    assert.match(
      route,
      /if \(request\.signal\.aborted\) cleanup\(\)/,
    );
    assert.doesNotMatch(route, /controllerRef/);
  }
});

test("all long-lived public SSE routes guard controller writes", () => {
  const routes = [
    source("app/api/contact-emaren/events/route.ts"),
    source("app/api/clans/[slug]/events/route.ts"),
    source("app/api/kingdom-presence/events/route.ts"),
    source("app/api/lobby/stream/route.ts"),
  ];

  for (const route of routes) {
    assert.match(route, /closed/);
    assert.match(route, /try \{/);
    assert.match(route, /controller\.enqueue/);
    assert.match(route, /catch/);
  }
});


test("Radio Wolo range stream treats disconnects as normal teardown", () => {
  const stream = source("lib/radioWoloFileStream.ts");

  assert.match(stream, /function closeController/);
  assert.match(stream, /function errorController/);
  assert.match(stream, /try \{\s*controller\.close\(\)/);
  assert.match(stream, /try \{\s*controller\.error\(error\)/);
  assert.match(
    stream,
    /try \{\s*controller\.enqueue\([\s\S]*?\} catch \{\s*cancelled = true;/,
  );
});
