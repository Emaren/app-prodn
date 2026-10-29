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
// Defense-in-depth: even a malformed upstream JSON response must not add
// arbitrary lowercase lookalikes or out-of-contract uppercase priority IDs.
entries.push(
  {...entries[1], id:"q12", label:"FORGED LOWERCASE LOOKALIKE"},
  {...entries[1], id:"Q30", label:"FORGED OUT OF RANGE PRIORITY"},
  {...entries[1], id:"Q00", label:"FORGED ZERO PRIORITY"}
);
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
      // This is a REAL DOM assertion after the client has parsed the fetched
      // payload. It catches the previous lowercase-only filter regression.
      const q12Rendered = page.locator('article[data-campaign-id="Q12"]');
      ensure(await q12Rendered.count() === 1, "approved uppercase Q12 not rendered");
      ensure(await q12Rendered.locator("strong").first().innerText() === "Kingdom Progress",
        "approved Q12 label not visible");
      ensure((await q12Rendered.innerText()).includes("33%"),
        "source-backed Q12 1/3 percentage not rendered");
      for (const forbidden of ["q12", "Q00", "Q30"]) {
        ensure(await page.locator('article[data-campaign-id="' + forbidden + '"]').count() === 0,
          "unapproved campaign ID rendered: " + forbidden);
      }
      const pageText = await page.locator("main").innerText();
      for (const name of original) ensure(pageText.includes(name), "original campaign lost: " + name);
      ensure((await page.locator('article[data-campaign-id="parser-engine"]').innerText()).includes("REPLAY / MACHINERY"),
        "original parser premium label drifted");
      ensure((await page.locator('article[data-campaign-id="replay-truth"]').innerText()).includes("REPLAY / CERTAINTY"),
        "original replay premium label drifted");
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
      ensure((await q12.innerText()).includes("PUBLIC UI"), "approved milestone not rendered");
      ensure((await q12.innerText()).includes("1 ACCEPTED"), "finite verified milestone count missing");
      ensure((await q12.innerText()).includes("UNVERIFIED"), "unverified gates mislabeled");
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
      // The real client must retain the original five when the public feed
      // genuinely becomes UNKNOWN; never invent zero-percent receipts.
      await page.route("**/api/kingdom-progress", route => route.fulfill({
        status:200, contentType:"application/json",
        body:JSON.stringify({schema:1,status:"UNKNOWN",observedAt:null,
          readAt:"2026-10-29T18:00:00.000Z",entries:[]})
      }));
      await page.getByRole("button", {name:"Refresh engineering source signal"}).click();
      await page.waitForFunction(() =>
        document.querySelectorAll('section[aria-label="Project progress capsules"] > article').length === 5,
        null, {timeout:12000});
      ensure((await capsules(page).count()) === 5, "original five not retained on UNKNOWN");
      for (const row of await capsules(page).all()) {
        ensure((await row.innerText()).includes("MILESTONE EVIDENCE PENDING"),
          "UNKNOWN campaign was rendered with a fabricated completion");
      }
      outputReport.push({width,capsules:6,approvedQ12:"RENDERED",invalidIds:"REJECTED",unknownFallback:"ORIGINAL_FIVE",keyboard:"PASS",most:"PASS",least:"PASS",recent:"PASS",focusIdentity:"PASS",horizontalOverflow:overflow,axeSerious:0,axeCritical:0});
      await page.close();
    }
    fs.writeFileSync(path.join(output,"acceptance.json"),JSON.stringify({sourceSha:process.env.SOURCE_SHA || null,buildId:process.env.BUILD_ID || null,productionCertified:false,fixture:"SYNTHETIC_PUBLIC_APPROVED_DATA_ONLY",results:outputReport},null,2)+"\n");
    console.log("Q12 GENUINE CHROME INTERACTION PASS", JSON.stringify(outputReport));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
