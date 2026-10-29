/* Real Chrome contract for the Q12 public page. Synthetic feed fixture only:
 * proves browser interaction, never source/production certification. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(path.join(process.env.PW_HOME, "node_modules/playwright-core"));
const axePath = path.join(process.env.PW_HOME, "node_modules/axe-core/axe.min.js");
const output = process.env.Q12_OUT || "kingdom-progress-browser";
fs.mkdirSync(output, { recursive: true });
const original = [
  "WATCHER 1.6.6", "AUTO BETS / WAR SATCHEL", "TELEVISION WOLO",
  "PARSER / DECODER", "REPLAY TRUTH CLOSURE"
];
const entries = [
  {
    id: "watcher-166", label: "WATCHER 1.6.6", category: "client", source: "aoe2-watcher",
    href: "/download", scopeVersion: "v1", verifiedCount: 6, percent: 100,
    evidenceStatus: "VERIFIED", lastWorkedAt: "2026-10-28T14:00:00.000Z",
    milestones: Array.from({length: 6}, (_, i) => ({id: "step-" + i, label: "Source step " + (i + 1), verified: true}))
  },
  {
    id: "Q12", label: "Kingdom Progress", category: "experience", source: "PUBLIC CAMPAIGN",
    href: "/kingdom-progress", scopeVersion: "v1-20261029", verifiedCount: 1, percent: 33,
    evidenceStatus: "VERIFIED", lastWorkedAt: "2026-10-29T17:07:38.000Z",
    milestones: [
      {id:"source-ui",label:"Public UI",verified:true},
      {id:"source-tests",label:"Source Tests",verified:false},
      {id:"deployed",label:"Deployed",verified:false}
    ]
  }
];
const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:3137";
const widths = [375, 768, 1440];
const outputReport = [];
const capsules = page => page.locator('section[aria-label="Project progress capsules"] > article');
const firstLabel = async page => await capsules(page).first().locator("button").first().innerText();
const ensure = (condition, message) => assert.ok(condition, message);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", err => errors.push(String(err)));
      await page.route("**/api/kingdom-progress", route => route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({schema:1,status:"FRESH",observedAt:"2026-10-29T18:00:00.000Z",readAt:"2026-10-29T18:00:00.000Z",entries})
      }));
      const res = await page.goto(base + "/kingdom-progress", { waitUntil: "domcontentloaded", timeout: 45000 });
      ensure(res && res.status() === 200, "public page failed at width " + width);
      await page.getByRole("button", {name:"Sort latest verified code contribution first"}).waitFor({timeout:12000});
      await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Project progress capsules"] > article').length === 6, null, {timeout:12000});
      ensure(await capsules(page).count() === 6, "five originals plus approved priority");
      const pageText = await page.locator("main").innerText();
      for (const name of original) ensure(pageText.includes(name), "original campaign lost: " + name);
      ensure(!pageText.includes("Private #984"), "raw queue leaked");
      ensure((await firstLabel(page)).includes("Kingdom Progress"), "recent default must rank SHA-backed recent work");
      const most = page.getByRole("button", {name:"Sort most verified complete first"});
      const least = page.getByRole("button", {name:"Sort least verified complete first"});
      const recent = page.getByRole("button", {name:"Sort latest verified code contribution first"});
      await most.focus();
      await page.keyboard.press("Enter");
      ensure(await most.getAttribute("aria-pressed") === "true", "keyboard sort missing");
      ensure((await firstLabel(page)).includes("WATCHER 1.6.6"), "most sort failed");
      await least.click();
      ensure((await firstLabel(page)).includes("Kingdom Progress"), "least sort failed");
      await recent.click();
      ensure((await firstLabel(page)).includes("Kingdom Progress"), "recent sort failed");
      const q12 = capsules(page).filter({hasText: "Kingdom Progress"});
      await q12.locator("button").first().click();
      ensure(await q12.locator("button").first().getAttribute("aria-expanded") === "true", "expand failed");
      await most.click();
      ensure(await capsules(page).filter({hasText:"Kingdom Progress"}).locator("button").first().getAttribute("aria-expanded") === "true", "expand identity lost on reorder");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ensure(overflow <= 8, "mobile horizontal overflow " + overflow + " at " + width);
      await page.addScriptTag({path:axePath});
      const axe = await page.evaluate(async () => await window.axe.run(document.querySelector("main"), {
        runOnly: {type: "tag",values: ["wcag2a","wcag2aa","wcag21a","wcag21aa"]}
      }));
      const serious = axe.violations.filter(v => v.impact === "serious" || v.impact === "critical");
      ensure(serious.length === 0, "axe serious/critical: " + JSON.stringify(serious.map(v=>({id:v.id,impact:v.impact}))));
      ensure(errors.length === 0, "browser JS errors: " + errors.join("; "));
      await page.screenshot({path:path.join(output,"kingdom-progress-" + width + ".png"),fullPage:true});
      outputReport.push({width,capsules:6,keyboard:"PASS",most:"PASS",least:"PASS",recent:"PASS",focusIdentity:"PASS",horizontalOverflow:overflow,axeSerious:0,axeCritical:0});
      await page.close();
    }
    fs.writeFileSync(path.join(output,"acceptance.json"),JSON.stringify({sourceSha:process.env.SOURCE_SHA || null,buildId:process.env.BUILD_ID || null,productionCertified:false,fixture:"SYNTHETIC_PUBLIC_APPROVED_DATA_ONLY",results:outputReport},null,2)+"\n");
    console.log("Q12 GENUINE CHROME INTERACTION PASS", JSON.stringify(outputReport));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
