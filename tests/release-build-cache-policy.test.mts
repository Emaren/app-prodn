import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../next.config.js", import.meta.url),
  "utf8",
);

test(
  "isolated .next-release builds do not materialize disposable webpack cache",
  () => {
    assert.match(
      source,
      /process\.env\.NEXT_DIST_DIR\s*===\s*["']\.next-release["']/,
    );

    assert.match(
      source,
      /config\.cache\s*=\s*false/,
    );

    assert.match(
      source,
      /distDir:\s*process\.env\.NEXT_DIST_DIR\s*\|\|\s*["']\.next["']/,
    );
  },
);
