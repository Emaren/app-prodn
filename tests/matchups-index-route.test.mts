import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the documented matchups index resolves through the canonical rivalry board", () => {
  const source = readFileSync(
    new URL("../next.config.js", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /source:\s*"\/matchups"[\s\S]*?destination:\s*"\/rivalries"[\s\S]*?permanent:\s*true/,
  );
  assert.doesNotMatch(source, /loadPublicRivalryBoards|findMany|queryRaw/);
});
