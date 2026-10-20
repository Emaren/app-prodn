import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const routes = JSON.parse(read("config/kingdom-index-routes.json"));
const assurances = JSON.parse(read("config/kingdom-index-assurance-profiles.json"));
const modules = JSON.parse(read("config/wolo-machine-capabilities.json"));
const cohort = read("docs/audits/performance-route-cohort-v2.txt").split("\n");
const instruments = [
  ["kingdom-sensors", "sensors", "index"],
  ["kingdom-tests", "tests", "index"],
  ["kingdom-recovery", "recovery", "release"],
  ["kingdom-systems", "systems", "release"],
  ["replay-laboratory", "replay", "battlerecords"],
  ["wolo-machine", "wolo", "betting"],
] as const;

test("six independent information pages have one canonical navigation and source authority", () => {
  const titles = read("app/AppShell.tsx");
  const menu = read("components/HeaderMenu.tsx");
  const hrefs = routes.map((r: {href: string}) => r.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const [name, kind, profile] of instruments) {
    const route = "/" + name;
    assert.ok(hrefs.includes(route));
    assert.equal(assurances.routeProfiles[route],profile);
    assert.ok(cohort.includes(route));
    assert.ok(titles.includes('href: "' + route + '"'));
    assert.ok(menu.includes('href: "' + route + '"'));
    const page = read("app/" + name + "/page.tsx");
    assert.ok(page.includes('kind="' + kind + '"'));
    assert.ok(page.includes('canonical: "' + route + '"'));
    assert.ok(existsSync(new URL("../app/" + name + "/page.tsx", import.meta.url)));
  }
});

test("all six instrument variants consume owned existing read-only data contracts", () => {
  const component = read("components/kingdom-instruments/KingdomInstruments.tsx");
  for (const name of ["sensors","tests","recovery","systems","replay","wolo"]) {
    assert.ok(component.includes(name + ': ["/api/'), name + " missing source");
  }
  for (const path of ["/api/kingdom-index","/api/general-inspections","/api/kingdom-intelligence","/api/kingdom-patrol","/api/kingdom-route-census","/api/wolo/status","/api/hd-replay-engine"]) {
    assert.ok(component.includes('"' + path + '"'));
    assert.ok(existsSync(new URL("../app" + path + "/route.ts",import.meta.url)), "missing producer " + path);
  }
  assert.match(component, /cache:"no-store"/);
  assert.match(component, /document\.visibilityState/);
  assert.match(component, /AbortController/);
  assert.match(component, /90000/);
  assert.doesNotMatch(component, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(component, /\/api\/admin\//);
  assert.doesNotMatch(component, /process\.env|execFile|child_process/);
});

test("Wolo Machine is HD-first, DE is explicitly inert and money proof remains UNKNOWN", () => {
  assert.equal(modules.mainnetId, "wolo-1");
  assert.equal(modules.audience, "HD_INTERNAL");
  assert.match(modules.semantics, /NOT_LIVE_DEPLOYMENT_PROOF/);
  const all = modules.modules;
  assert.equal(new Set(all.map((m: {key:string})=>m.key)).size,all.length);
  assert.ok(all.some((m: {key:string})=>m.key === "de" && m.kind === "external" && m.neighbors.length === 0));
  for(const m of all)for(const neighbor of m.neighbors)assert.ok(all.some((n:{key:string})=>n.key===neighbor));
  const source=read("components/kingdom-instruments/KingdomInstruments.tsx");
  assert.match(source, /NO FINANCIAL CERTIFICATION FEED/);
  assert.match(source, /WOLO RELEASE GATE/);
  assert.match(source, /"UNVERIFIED"/);
  assert.doesNotMatch(source, /aoe2dewarwagers|fetch\(.{0,80}\bDE\b/i);
  assert.doesNotMatch(source, /financialReleaseAuthorized:\s*true|financialProducersFenced:\s*true/);
});

test("no unrelated pre-existing page implementation or any financial executor belongs to the instrument routes", () => {
  const client = read("components/kingdom-instruments/KingdomInstruments.tsx");
  assert.ok(!/SigningStargateClient|DirectSecp256k1HdWallet|sendTokens|signAndBroadcast/.test(client));
  assert.ok(!/WOLO_.*MNEMONIC|AUTH_TOKEN|privateKey/.test(client));
  assert.ok(read("app/wolo-1/page.tsx").includes('redirect("/wolo")'), "preserve canonical legacy redirect");
  assert.ok(read("app/wolochain/page.tsx").includes("WoloHeroTile"), "preserve public blockchain explainer");
  assert.ok(read("app/hd-replay-engine/page.tsx").includes("HdReplayEngine"), "preserve parser observatory");
});
