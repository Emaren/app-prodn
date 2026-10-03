import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const load = `import sys,json,importlib.util
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'scripts'))
spec=importlib.util.spec_from_file_location('recovery',Path.cwd()/'scripts/census-replay-recovery-v2.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
`;

test("observer bundles local classifier and exact preserved snapshot SQL without deploying modules", () => {
  const directory = mkdtempSync(join(tmpdir(), "aoe2war-census-test-"));
  try {
    const program = execFileSync("python3", ["-c", load + "print(m.bundle_observer())"], { encoding: "utf8" });
    assert.match(program, /data:text\/javascript;base64,/);
    assert.match(program, /aoe2war-modern-receipt-source\/v1/);
    assert.match(program, /REPEATABLE READ READ ONLY/);
    assert.match(program, /replay_hash=ANY\(\$1::text\[\]\)/);
    assert.match(program, /platform_match_id.*ANY\(\$2::text\[\]\)/);
    assert.doesNotMatch(program, /where: \{ is_final: false \}/);
    assert.doesNotMatch(program, /__RECOVERY_HELPER_MODULE_URL__|__RECEIPT_SNAPSHOT_SQL__|__SOURCE_FINGERPRINTS__/);
    const path = join(directory, "observer.mjs");
    writeFileSync(path, program);
    execFileSync("node", ["--check", path]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("immutable census receipts cannot overwrite a prior observation and their bytes rehash exactly", () => {
  const result = JSON.parse(execFileSync("python3", ["-c", load + `
import tempfile,hashlib,os
with tempfile.TemporaryDirectory() as d:
 report={'schema':2,'databaseWrites':0,'authorityGranted':False}
 receipt=m.persist(report,Path(d))
 body=Path(receipt['path']).read_bytes()
 try:
  m.persist(report,Path(d))
  raise AssertionError('existing receipt overwritten')
 except FileExistsError: pass
 assert os.stat(receipt['path']).st_mode & 0o777 == 0o400
 print(json.dumps({'hash':hashlib.sha256(body).hexdigest(),'receipt':receipt,'report':json.loads(body)}))
`], { encoding: "utf8" }));
  assert.equal(result.hash, result.receipt.sha256);
  assert.equal(result.report.databaseWrites, 0);
  assert.equal(result.report.authorityGranted, false);
});

test("census rejects apply and incomplete modern runtime options before observing production", () => {
  for (const args of [["--apply"], ["--api-root", "/tmp/api"]]) {
    assert.throws(() => execFileSync("python3", ["scripts/census-replay-recovery-v2.py", ...args],
      { encoding: "utf8", stdio: "pipe" }), (error: { status?: number; stderr?: string }) =>
      error.status === 2 && /unrecognized arguments|all three absolute runtime paths/.test(String(error.stderr)));
  }
  assert.doesNotMatch(readFileSync("scripts/replay_recovery_census_remote.mjs", "utf8"),
    /\b(?:tx|prisma|db)\.\w+\.(create|update|delete|upsert)\(/);
});
