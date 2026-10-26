import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/aoe2_speed_cold_lcp.mjs", import.meta.url),
  "utf8",
);

test("cold LCP harness bounds CDP commands and retries poisoned fresh-browser samples", () => {
  assert.match(source, /command-timeout-ms/);
  assert.match(source, /CDP command timed out after/);
  assert.match(source, /pending\.delete\(id\)/);
  assert.match(source, /sample-attempts/);
  assert.match(source, /for \(let attempt = 1; attempt <= sampleAttempts; attempt \+= 1\)/);
  assert.match(source, /row\.harnessAttempt = attempt/);
  assert.match(source, /retriedSamples:/);
});

test("cold LCP harness keeps retries bounded", () => {
  assert.match(
    source,
    /const sampleAttempts = Math\.max\(1, Math\.min\(3, Number\(args\["sample-attempts"\] \|\| 2\)\)\)/,
  );
});


test("failed Chrome startup reports a bounded cause without echoing stderr or publishing evidence", async () => {
  const { mkdtemp, writeFile, chmod, rm, access } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const root = await mkdtemp(join(tmpdir(), "chrome-startup-test-"));
  try {
    const executable = join(root, "browser");
    await writeFile(executable, "#!/bin/sh\nprintf '%s\\n' 'No usable sandbox; DO_NOT_ECHO_STARTUP_BYTES' >&2\nexit 39\n");
    await chmod(executable, 0o700);
    const collector = new URL("../scripts/aoe2_speed_cold_lcp.mjs", import.meta.url);
    const out = join(root, "output");
    await assert.rejects(promisify(execFile)(process.execPath, [collector.pathname,
      "--chrome", executable, "--url", "http://127.0.0.1:3030/kingdom-index",
      "--samples", "1", "--sample-attempts", "1", "--out-dir", out],
      { timeout: 15000, maxBuffer: 65536 }), (error: unknown) => {
        assert.ok(error instanceof Error && "stderr" in error && "killed" in error);
        assert.equal(typeof error.stderr, "string");
        assert.match(String(error.stderr), /SANDBOX_UNAVAILABLE/);
        assert.doesNotMatch(String(error.stderr), /DO_NOT_ECHO_STARTUP_BYTES/);
        assert.equal(error.killed, false);
        return true;
      });
    await assert.rejects(access(join(out, "receipt.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
