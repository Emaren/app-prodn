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


test("Chrome startup allowance is finite and excessive values refuse before launching", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const collector = new URL("../scripts/aoe2_speed_cold_lcp.mjs", import.meta.url);
  await assert.rejects(promisify(execFile)(process.execPath,
    [collector.pathname, "--chrome-startup-ms", "30001"], { timeout: 5000, maxBuffer: 65536 }),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /must be an integer from 1000 to 30000/);
      return true;
    });
  assert.match(source, /performance\.now\(\) < startupDeadline/);
  assert.match(source, /process\.kill\(-child\.pid, name\)/);
});


test("failure after a real debug port appears also reaps its browser process", async () => {
  const { mkdtemp, writeFile, chmod, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const root = await mkdtemp(join(tmpdir(), "chrome-handshake-test-"));
  try {
    const executable = join(root, "browser.cjs"), marker = join(root, "started");
    await writeFile(executable, `#!${process.execPath}
const http=require("node:http"),fs=require("node:fs"),path=require("node:path");
const profile=process.argv.find(a=>a.startsWith("--user-data-dir=")).split("=").slice(1).join("=");
const server=http.createServer((req,res)=>res.end("not CDP JSON"));
server.listen(0,"127.0.0.1",()=>{
 fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));
 fs.writeFileSync(path.join(profile,"DevToolsActivePort"),String(server.address().port));
});
`);
    await chmod(executable, 0o700);
    const collector = new URL("../scripts/aoe2_speed_cold_lcp.mjs", import.meta.url);
    await assert.rejects(promisify(execFile)(process.execPath, [collector.pathname,
      "--chrome", executable, "--url", "http://127.0.0.1:3030/kingdom-index",
      "--samples", "1", "--sample-attempts", "1", "--out-dir", join(root,"output")],
      { timeout: 15000, maxBuffer: 65536 }));
    const pid=Number(await readFile(marker,"utf8"));
    assert.ok(Number.isSafeInteger(pid)&&pid>0);
    assert.throws(()=>process.kill(pid,0), { code:"ESRCH" });
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});
