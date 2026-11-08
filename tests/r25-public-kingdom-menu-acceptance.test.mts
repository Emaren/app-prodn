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


test("isolated Chrome integration cannot hide menu failure behind tee", () => {
  const workflow = readFileSync(
    resolve(ROOT, ".github/workflows/navigation-atlas-browser.yml"), "utf8"
  );
  const runner = readFileSync(resolve(ROOT, "scripts/r25_public_kingdom_menu_chrome.cjs"), "utf8");
  assert.match(workflow, /if node scripts\/r25_public_kingdom_menu_chrome\.cjs/);
  assert.match(workflow, /HOLD_PUBLIC_KINGDOM_MENU_REAL_CHROME/);
  assert.match(workflow, /exit 2/);
  assert.match(workflow, /sha256sum [^\n]*public-kingdom-menu\.jsonl/);
  assert.ok(runner.includes("if(process.env.PW_HOME)"));
  assert.ok(runner.indexOf("const menuState=") < runner.indexOf("if(process.env.PW_HOME)"),
    "shared menu-state evaluator must be declared outside the browser-transport branch");
  assert.ok(runner.includes("playwright.chromium.launch"));
  assert.ok(runner.includes("if(!accepted)process.exitCode=2"));
  assert.ok(runner.includes("for(const width of [375,768,1440])"));
});
