import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { ADMIN_ATLAS_ROUTES, ATLAS_CLUSTERS, NAVIGATION_ATLAS_HREF, PENDING_NAVIGATION, NON_NAVIGABLE_ADMIN_DETAIL_ROUTES } from "../lib/navigationAtlas.ts";
import publicRoutes from "../config/kingdom-index-routes.json" with { type: "json" };

const root = new URL("../", import.meta.url);
const src = (p: string) => readFileSync(new URL(p, root), "utf8");
const dir = new URL("../app/admin/", import.meta.url);
const topLevel = readdirSync(dir, {withFileTypes:true})
  .filter(row => row.isDirectory() && existsSync(new URL(row.name + "/page.tsx", dir)))
  .map(row => "/admin/" + row.name).sort();
function allPagePaths(directory: URL, href: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") found.push(href);
    else if (entry.isDirectory()) found.push(...allPagePaths(new URL(entry.name + "/", directory), href + "/" + entry.name));
  }
  return found;
}
const allAdminPages = allPagePaths(dir, "/admin");
const staticAdminPaths = allAdminPages.filter(p=>!p.includes("[")).sort();
const dynamicAdminPaths = allAdminPages.filter(p=>p.includes("[")).sort();
const JOB_EXCHANGE = "/admin/central-command/job-board";
const WORK_BOARD = "/admin/central-command/work-board";
const LANES = "/admin/central-command/lanes";
const AUTHORIZED_NESTED_ROUTES = [JOB_EXCHANGE, WORK_BOARD, LANES] as const;

test("all 32 approved static admin pages have an exact authenticated navigation edge", () => {
  assert.equal(topLevel.length, 28, "Unexpected top-level admin source changes must be reviewed");
  assert.ok(existsSync(new URL("app/admin/central-command/job-board/page.tsx", root)),
    "Accepted G Job Exchange source must exist");
  for (const href of AUTHORIZED_NESTED_ROUTES) {
    assert.ok(existsSync(new URL("app" + href + "/page.tsx", root)),
      "Approved nested private admin source is absent: " + href);
    const code = src("app" + href + "/page.tsx");
    assert.match(code, /await requireServerAdmin\(\)/,
      "Every new private source page requires its own admin gate: " + href);
  }
  const approvedStaticRoutes = ["/admin",...topLevel,...AUTHORIZED_NESTED_ROUTES].sort();
  assert.equal(approvedStaticRoutes.length, 32);
  assert.deepEqual(staticAdminPaths, approvedStaticRoutes,
    "No missing, invented or orphaned nested static admin page; investigate route policy first");
  assert.deepEqual(ADMIN_ATLAS_ROUTES.map(route=>route.href).sort(), approvedStaticRoutes,
    "No missing, stale or fabricated authenticated navigation edge");
  assert.equal(new Set(ADMIN_ATLAS_ROUTES.map(route=>route.href)).size, ADMIN_ATLAS_ROUTES.length);
  assert.ok(ADMIN_ATLAS_ROUTES.every(route=>route.visibility==="admin" && route.href.startsWith("/admin") &&
    !route.href.includes("?") && !route.href.includes("#") && !route.href.includes("[") ));
  assert.equal(ATLAS_CLUSTERS.length,6);
  assert.ok(ATLAS_CLUSTERS.every(group=>ADMIN_ATLAS_ROUTES.some(route=>route.cluster===group.id)));
  assert.deepEqual(dynamicAdminPaths, [...NON_NAVIGABLE_ADMIN_DETAIL_ROUTES].sort(),
    "Dynamic admin detail pages require explicit classification and real IDs; do not fabricate global links");
  assert.ok(NON_NAVIGABLE_ADMIN_DETAIL_ROUTES.every(p=>!ADMIN_ATLAS_ROUTES.some(r=>r.href===p)));
});
test("the 88 accepted public pages remain intact, no admin entries in public index",()=>{
  assert.equal(publicRoutes.length,88);
  assert.ok(publicRoutes.every(row => !row.href.startsWith("/admin")));
  for(const path of ["/kingdom-index","/workshop","/kingdom-progress","/kingdom-systems"]){
    assert.ok(publicRoutes.some(row=>row.href===path), "missing public featured source "+path);
  }
  assert.match(src("app/AppShell.tsx"), /KINGDOM_PRIMARY_HREFS/);
  assert.match(src("app/AppShell.tsx"), /showMoreKingdom/);
  assert.ok(src("components/HeaderMenu.tsx").includes('adminOnly: true, featured: true'));
});
test("all original Command Tower controls survive and missing links come from canonical allowlist",()=>{
  const tower=src("components/admin/command-tower/AdminCommandTowerPage.tsx");
  const original=tower.match(/const ADMIN_NAV_LINKS = \[([\s\S]*?)\] as const;/);
  assert.ok(original);
  const before=(original[1].match(/href: "/g)||[]).length;
  assert.equal(before,19, "Original 16 controls plus approved Job Exchange, Work Board and Six Lanes");
  assert.match(tower,/COMPLETE_ADMIN_NAV_LINKS/);
  assert.match(tower,/ADMIN_ATLAS_ROUTES/);
  assert.match(tower,/NAVIGATION_ATLAS_HREF/);
  assert.match(tower,/Living Job Exchange · Six Brains/);
  assert.match(tower,/Living Work Board/);
  assert.match(tower,/Six-Lane Evidence Ledger/);
  for (const href of AUTHORIZED_NESTED_ROUTES) {
    assert.ok(src("app/admin/page.tsx").includes('href="' + href + '"'), "missing Admin Home link: " + href);
  }
  for (const [href, label] of [[JOB_EXCHANGE, "Job Exchange"], [WORK_BOARD, "Work Board"], [LANES, "Six-Lane Ledger"]]) {
    assert.ok(src("components/HeaderMenu.tsx").includes('href: "' + href + '", label: "' + label + '", icon: Network, adminOnly: true'),
      "Private castle menu missing guard for " + href);
  }
  assert.match(tower,/User health, honors/);
  assert.match(src("app/admin/page.tsx"),/Navigation Atlas · All Command Links/);
  assert.match(src("app/admin/aoe2war-os/page.tsx"),/<AdminNavigationAtlas \/>/);
});
test("private hub remains protected by actual server-admin guard and never claims deployment",()=>{
  const layout=src("app/admin/layout.tsx");
  const os=src("app/admin/aoe2war-os/page.tsx");
  const atlas=src("components/navigation-atlas/AdminNavigationAtlas.tsx");
  assert.match(layout,/await requireServerAdmin\(\)/);
  assert.match(os,/import AdminNavigationAtlas/);
  assert.equal(NAVIGATION_ATLAS_HREF,"/admin/aoe2war-os#navigation-atlas");
  assert.match(atlas,/LIVE STATUS UNVERIFIED/);
  assert.match(atlas,/source routes/);
  assert.doesNotMatch(atlas,/productionCertified:\s*true|LIVE VERIFIED|DEPLOYED SUCCESS/);
  assert.ok(ADMIN_ATLAS_ROUTES.some(route=>route.href===JOB_EXCHANGE && route.visibility==="admin"));
  assert.equal(PENDING_NAVIGATION.length,0,"All three G source pages now exist; no false pending notices");
  assert.ok(AUTHORIZED_NESTED_ROUTES.every(href=>ADMIN_ATLAS_ROUTES.some(route=>route.href===href && route.visibility==="admin")));
  assert.match(atlas,/PENDING_NAVIGATION.length > 0/);
  const board=src("app/admin/central-command/job-board/page.tsx");
  assert.match(board,/await requireServerAdmin\(\)/);
  assert.match(board,/JobExchangeClient/);
});
test("private admin mobile dock is collapsible without changing global user preference",()=>{
  const dock=src("components/pwa/MobileFloatingNav.tsx");
  assert.match(dock,/pathname === "\/admin" \|\| pathname\?\.startsWith\("\/admin\/"\)/);
  assert.match(dock,/useState<NavMode>\("hidden"\)/);
  assert.match(dock,/const effectiveMode = isPrivateAdmin \? adminMode : mode/);
  assert.match(dock,/if \(isPrivateAdmin\) \{/);
  assert.match(dock,/setAdminMode\(nextMode\)/);
  assert.match(dock,/window\.localStorage\.setItem\(STORAGE_KEY, nextMode\)/);
  assert.match(dock,/aria-label="Show app navigation"/);
  assert.match(dock,/aria-label="Hide app navigation"/);
  assert.match(dock,/pathname === "\/admin\/central-command\/job-board"/);
  assert.match(dock,/pathname === "\/admin\/central-command\/work-board"/);
  assert.match(dock,/pathname === "\/admin\/central-command\/lanes"\) return null/);
  assert.match(src("app/admin/central-command/job-board/page.tsx"),/await requireServerAdmin\(\)/);
});

test("G A2 Job Exchange and G A3 Work Board/Lanes are source-backed private admin routes",()=>{
  assert.ok(!topLevel.includes("/admin/job-board"));
  assert.equal(ADMIN_ATLAS_ROUTES.filter(route=>route.href===JOB_EXCHANGE).length,1);
  assert.match(src("components/navigation-atlas/AdminNavigationAtlas.tsx"),/data-atlas-href=\{route.href\}/);
  assert.equal(ADMIN_ATLAS_ROUTES.filter(route=>AUTHORIZED_NESTED_ROUTES.includes(route.href as (typeof AUTHORIZED_NESTED_ROUTES)[number])).length,3);
  assert.match(src("components/central-command/WorkObservatoryClient.tsx"),/aria-label="Six original source evidence cores"/);
  assert.ok(AUTHORIZED_NESTED_ROUTES.every(href=>!src("app/AppShell.tsx").includes('href: "' + href + '"')),
    "Global public Kingdom shell must not import private nested routes");
  assert.ok(!src("app/AppShell.tsx").includes('href: "/admin/central-command/job-board"'),
    "Public Kingdom menu must not disclose private G route");
});
