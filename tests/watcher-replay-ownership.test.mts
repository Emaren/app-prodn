import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const uploadSource = fs.readFileSync(
  new URL("../app/api/replay/upload/route.ts", import.meta.url),
  "utf8",
);

const telemetrySource = fs.readFileSync(
  new URL("../lib/watcherTelemetry.ts", import.meta.url),
  "utf8",
);

test("Watcher replay ownership is server-resolved from the API key", () => {
  assert.match(
    uploadSource,
    /resolveWatcherTelemetryIdentity\(prisma, suppliedApiKey\)/,
  );
  assert.match(
    uploadSource,
    /const uid =\s*[\s\S]*?watcherIdentity\?\.userUid/,
  );
  assert.match(
    uploadSource,
    /headers\.set\("x-user-uid", uid\)/,
  );
  assert.match(
    uploadSource,
    /Watcher key is not authorized\./,
  );

  assert.doesNotMatch(
    uploadSource,
    /const uid = watcherUid \|\| sessionUid/,
  );
  assert.doesNotMatch(
    uploadSource,
    /const uid = suppliedUid \|\| sessionUid/,
  );
});

test("Internal replay proxy remains distinct from Watcher authority", () => {
  assert.match(
    uploadSource,
    /const isInternalProxyUpload = Boolean\(/,
  );
  assert.match(
    uploadSource,
    /suppliedApiKey === internalApiKey/,
  );
  assert.match(
    uploadSource,
    /isInternalProxyUpload \? suppliedUid : sessionUid/,
  );
});

test("Watcher key format detection stays centralized", () => {
  assert.match(
    telemetrySource,
    /export function isWatcherApiKeyCandidate/,
  );
  assert.match(
    telemetrySource,
    /WATCHER_KEY_RE/,
  );
});
