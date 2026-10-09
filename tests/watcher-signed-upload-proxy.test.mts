import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("web proxy keeps cryptographically signed Watcher sender UID separate from authenticated account owner", () => {
  const source = readFileSync(
    new URL("../app/api/replay/upload/route.ts", import.meta.url), "utf8"
  );
  assert.match(source, /const uid =\s*watcherIdentity\?\.userUid/);
  assert.match(source, /headers\.set\("x-user-uid", uid\)/);
  assert.match(source, /if \(isWatcherProxyUpload && suppliedApiKey\)/);
  assert.match(source, /const originalSignedUid = readHeader\(request, "x-user-uid"\)/);
  assert.match(source, /headers\.set\("x-watcher-client-uid", originalSignedUid\)/);
  // Never take account UID from the untrusted Watcher's signed pseudonym.
  assert.doesNotMatch(source, /const uid =\s*readHeader\(request, "x-user-uid"\)/);
});
