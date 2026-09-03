import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../app/api/replay/upload/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test("replay proxy preserves upstream Retry-After overload guidance", () => {
  assert.match(
    source,
    /upstreamResponse\.headers\.get\("retry-after"\)/,
  );
  assert.match(
    source,
    /responseHeaders\.set\([\s\S]*"retry-after"[\s\S]*retryAfter/,
  );
  assert.match(
    source,
    /status:\s*upstreamResponse\.status/,
  );
});
