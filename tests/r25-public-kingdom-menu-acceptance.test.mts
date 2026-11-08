import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("physical Kingdom menu acceptance guard has isolated passing and failing fixtures", () => {
  const run = spawnSync(
    process.execPath,
    ["scripts/r25_public_kingdom_menu_chrome.cjs", "--selftest"],
    { cwd: ROOT, encoding: "utf8", timeout: 15000 },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /PASS_PUBLIC_KINGDOM_MENU_GUARD_FIXTURES/);
});

test("production checker enforces the original 39-route catalog and all viewport failures", () => {
  const code = readFileSync(resolve(ROOT, "scripts/r25_public_kingdom_menu_chrome.cjs"), "utf8");
  assert.match(code, /EXPECTED_39_CANONICAL_LINKS/);
  assert.ok(code.includes("for(const width of [375,768,1440])"));
  assert.ok(code.includes("results.length===3&&results.every(r=>r.passed)"));
  assert.match(code, /HOLD_PUBLIC_KINGDOM_MENU_COLLAPSED_OR_REORDERED/);
  assert.match(code, /financialAuthorized:false, productionMutation:false, fullSiteRelease:false/);
  assert.match(code, /http:\/\/127\.0\.0\.1:8094/);
});
