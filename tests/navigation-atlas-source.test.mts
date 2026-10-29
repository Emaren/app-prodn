import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { ADMIN_ATLAS_ROUTES, ATLAS_CLUSTERS, NAVIGATION_ATLAS_HREF, PENDING_NAVIGATION } from "../lib/navigationAtlas.ts";
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
const staticAdminPaths = allPagePaths(dir, "/admin").filter(p=>!p.includes("[")).sort();

test("all 28 actual admin pages + admin root are exactly catalogued, zero orphan navigation", () => {
  assert.equal(topLevel.length, 28, "The source census must be updated if new pages are approved");
  assert.deepEqual(staticAdminPaths, ["/admin", ...topLevel].sort(),
    "Deep static admin pages have no source-approved navigation edge. Coordinate with G before exposing them.");
  assert.deepEqual(
    ADMIN_ATLAS_ROUTES.map(route=>route.href).sort(),
    ["/admin",...topLevel].sort(),
    "Missing, stale, or fabricated private command destination"
  );
  assert.equal(new Set(ADMIN_ATLAS_ROUTES.map(route=>route.href)).size, ADMIN_ATLAS_ROUTES.length);
  assert.ok(ADMIN_ATLAS_ROUTES.every(route=>route.visibility==="admin" && route.href.startsWith("/admin") &&
    !route.href.includes("?") && !route.href.includes("#") && !route.href.includes("[") ));
  assert.equal(ATLAS_CLUSTERS.length,6);
  assert.ok(ATLAS_CLUSTERS.every(group=>ADMIN_ATLAS_ROUTES.some(route=>route.cluster===group.id)));
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
  assert.equal(before,16);
  assert.match(tower,/COMPLETE_ADMIN_NAV_LINKS/);
  assert.match(tower,/ADMIN_ATLAS_ROUTES/);
  assert.match(tower,/NAVIGATION_ATLAS_HREF/);
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
  assert.ok(PENDING_NAVIGATION.every(item=>!ADMIN_ATLAS_ROUTES.some(route=>route.href.includes("job-board"))));
});
test("approved direct page references cannot be fabricated as Job Exchange before G source integration",()=>{
  assert.ok(!topLevel.includes("/admin/job-board"));
  assert.ok(!ADMIN_ATLAS_ROUTES.some(route=>route.href.includes("job-board")));
  assert.ok(!src("components/HeaderMenu.tsx").includes('href: "/admin/central-command/job-board"'));
});
