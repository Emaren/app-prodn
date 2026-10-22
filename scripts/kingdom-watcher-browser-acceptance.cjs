#!/usr/bin/env node
"use strict";

/**
 * Source-only PR qualification for the public Watcher Observatory.
 * Runs against a throwaway localhost Next production build with a deliberately
 * UNAVAILABLE database. No user identities, production cookies or credentials.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.PW_HOME || "/tmp/watcher-playwright", "node_modules/playwright"));

const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:3137";
const out = process.env.WATCHER_BROWSER_EVIDENCE || "/tmp/watcher-browser-evidence";
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    for (const viewport of [{width:1440,height:990},{width:390,height:844}]) {
      const context = await browser.newContext({
        viewport, reducedMotion:"reduce",
        locale:"en-CA", permissions:[],
        ignoreHTTPSErrors:false,
      });
      // Browser is strictly localhost-only: no third-party web, Steam or
      // production account traffic. Server-side official GitHub sizes may be
      // unavailable and must fail closed without breaking the exhibition.
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort("blockedbyclient");
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror",error => errors.push(String(error)));
      const response = await page.goto(base+"/kingdom-watcher",{
        waitUntil:"domcontentloaded",timeout:45_000,
      });
      assert.equal(response?.status(),200,"Visitor route must return 200");
      await page.getByRole("heading",{name:/kingdom\s*watcher/i}).waitFor({timeout:20_000});
      assert.equal(await page.locator('a[href="/download"]').count() >= 1,true);
      assert.equal(await page.getByText("THE LIVING WATCHER GRID").count() >= 1,true);
      assert.equal(await page.getByText("THE RELEASE EVOLUTION").count() >= 1,true);
      assert.equal(await page.getByText("THE STREAM PULSE").count() >= 1,true);
      assert.equal(await page.getByText("INSIDE THE MACHINE").count() >= 1,true);
      assert.equal(await page.getByText("NOT YET CERTIFIED").count() >= 1,true);
      const api = await context.request.get(base+"/api/kingdom-watcher",{timeout:30_000});
      assert.equal(api.status(),200,"Anonymous safe failure-state API must return 200");
      assert.match(api.headers()["cache-control"]||"",/no-store/);
      const snapshot = await api.json();
      assert.equal(snapshot.schema,1);
      assert.equal(snapshot.release.current,"1.6.5");
      assert.equal(snapshot.release.previous,"1.6.4");
      assert.equal(snapshot.build.certification,"not-certified");
      assert.equal(snapshot.available,false,"isolated offline DB cannot fabricate live Watcher fleet");
      assert.equal(snapshot.fleet.active,null,"unobserved fleet is null, not zero");
      assert.deepEqual(snapshot.fleet.signals,[]);
      const json = JSON.stringify(snapshot);
      for(const forbidden of ["ipAddress","userUid","sessionId","watcherId","apiKey","replayFile","password","secret","steamId"]){
        assert.equal(json.includes('"'+forbidden+'":'),false,"private payload key "+forbidden);
      }
      await page.getByRole("button",{name:/BATCH IMPORT/i}).first().click();
      await page.getByRole("button",{name:/ALL STATES/i}).first().click();
      await page.getByRole("button",{name:/CAPTURE/i}).first().click();
      await page.getByText("Replay snapshots, batch imports and game-state recognition").waitFor();
      await page.getByRole("button",{name:/WATCH/i}).last().click();
      const width = await page.evaluate(() => ({
        doc:document.documentElement.scrollWidth,window:window.innerWidth,
      }));
      assert.ok(width.doc <= width.window+3,"No horizontal clipping: "+JSON.stringify(width));
      assert.deepEqual(errors,[],"Browser JavaScript crashes");
      await page.screenshot({path:path.join(out,viewport.width+"-watcher.png"),fullPage:true,animations:"disabled"});
      console.log("KINGDOM_WATCHER_BROWSER_PASS "+viewport.width+"px; status=200; real offline API; privacy; filters; atlas; no overflow");
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error("KINGDOM_WATCHER_BROWSER_STOP",error);process.exitCode=1});
