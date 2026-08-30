import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

test(
  "instrumentation keeps Node-only WarGraph runtime behind the Node runtime boundary",
  async () => {
    const root =
      await readFile(
        "instrumentation.ts",
        "utf8",
      );

    const node =
      await readFile(
        "instrumentation.node.ts",
        "utf8",
      );

    assert.match(
      root,
      /process\.env\.NEXT_RUNTIME === "nodejs"/,
    );

    assert.match(
      root,
      /import\("\.\/instrumentation\.node"\)/,
    );

    assert.doesNotMatch(
      root,
      /lib\/wargraph\/runtime/,
    );

    assert.match(
      node,
      /lib\/wargraph\/runtime/,
    );

    assert.match(
      node,
      /process\.env\.NODE_ENV === "production"/,
    );

    assert.match(
      node,
      /startWarGraphRuntime\(\)/,
    );
  },
);
