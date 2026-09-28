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
    assert.match(
      node,
      /installRuntimeCrashDiagnostics\(\)/,
    );

    const diagnostics =
      await readFile(
        "lib/runtimeCrashDiagnostics.ts",
        "utf8",
      );

    assert.match(
      diagnostics,
      /uncaughtExceptionMonitor/,
    );

    assert.match(
      diagnostics,
      /ERR_INVALID_STATE/,
    );

    assert.match(
      diagnostics,
      /Controller is already closed/,
    );

    assert.match(
      diagnostics,
      /process\.getActiveResourcesInfo/,
    );

    assert.match(
      diagnostics,
      /process\.memoryUsage\(\)/,
    );

    assert.doesNotMatch(
      diagnostics,
      /process\.on\(\s*"uncaughtException"/,
    );
  },
);
