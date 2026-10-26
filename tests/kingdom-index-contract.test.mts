import assert from "node:assert/strict";
import { readdirSync,readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import catalog from "../config/kingdom-index-routes.json" with { type: "json" };
const root=process.cwd();
const omitted=new Set(["/profile","/wallet","/settings","/connect-wallet","/pending-bets","/offline","/contact-emaren","/past-earnings","/app","/upload","/uploads"]);
function walk(directory,parts=[]) {
  const rows=[];
  for(const child of readdirSync(directory,{withFileTypes:true})){
    if(child.name==="admin" && parts.length===0) continue;
    if(child.isDirectory()){
      if(child.name.startsWith("[")||child.name==="api")continue;
      rows.push(...walk(join(directory,child.name),[...parts,child.name]));
    }else if(child.name==="page.tsx"){
      const href="/"+parts.join("/");
      if(!omitted.has(href))rows.push(href);
    }
  }
  return rows;
}
test("every static public App Router page has exactly one nonprivate Kingdom Index address",()=>{
  const known=walk(join(root,"app")).sort();
  const actual=catalog.map(p=>p.href).sort();
  assert.deepEqual(actual,known);
  assert.equal(new Set(catalog.map(x=>x.href)).size,catalog.length);
  for(const item of catalog) {
    assert.match(item.href,/^\/(?!api\/|admin\/|profile\/|wallet\/)/);
    assert.ok(["citadel","arena","forge","bazaar","commons"].includes(item.district));
  }
});
test("public index uses actual source-attested scores and refuses guessed completion",()=>{
 const source=readFileSync(join(root,"lib/kingdomIndex.ts"),"utf8");
 assert.match(source,/measuredVersion===version/);
 assert.match(source,/status.*unmeasured/);
 assert.match(source,/isKingdomObservationStale/);
 assert.doesNotMatch(source,/score:\s*100/);
});

test("Ledger is the first default mode and stale scores are historical only",()=>{
 const ui=readFileSync(join(root,"components/kingdom-index/KingdomIndex.tsx"),"utf8");
 const server=readFileSync(join(root,"lib/kingdomIndex.ts"),"utf8");
 const api=readFileSync(join(root,"app/api/kingdom-index/route.ts"),"utf8");
 assert.match(ui,/useState<Mode>\("ledger"\)/);
 assert.match(server,/lastReviewScore:lineage\.lastReviewScore/);
 assert.match(server,/score: liveScore/);
 assert.match(server,/const liveScore=publicObservedKingdomScore/);
 assert.match(api,/private, no-store, max-age=0/);
 assert.doesNotMatch(api,/stale-while-revalidate|s-maxage/);
});

test("Index historical ratings are displayed as dated reviews, never promoted to current certification",()=>{
 const ui=readFileSync(join(root,"components/kingdom-index/KingdomIndex.tsx"),"utf8");
 const server=readFileSync(join(root,"lib/kingdomIndex.ts"),"utf8");
 assert.match(ui,/historical=!measured && !provisional && validScore\(entry\.lastReviewScore\)/);
 assert.match(ui,/HISTORICAL SOURCE REVIEW · NOT CURRENT OR CERTIFIED/);
 assert.match(ui,/data-authority=\{historical\?"historical"/);
 assert.match(ui,/Unrated:/);
 assert.match(server,/score: liveScore/);
 assert.match(server,/lastReviewScore:lineage\.lastReviewScore/);
 assert.match(server,/entry\.score=publication\.certified\?100:null/);
});

test("all 68 Index route identities use the canonical CI route census, not stale partial manifest",()=>{
 const source=readFileSync(join(root,"lib/kingdomIndex.ts"),"utf8");
 const legacy=readFileSync(join(root,"lib/pageChangeManifest.generated.ts"),"utf8");
 assert.match(source,/route\.sourceTree/);
 assert.match(source,/sourceVersionAuthority:"route-local-git-census"/);
 assert.doesNotMatch(source,/PAGE_VERSIONS\.get/);
 assert.doesNotMatch(source,/import \{ PAGE_CHANGE_MANIFEST \}/);
 assert.ok(catalog.length>=68);
 for(const r of catalog) assert.match(r.sourceTree,/^src-[a-f0-9]{16}$/,r.href);
 const leader=catalog.find(r=>r.href==="/leaderboard");
 assert.ok(leader);
 assert.ok(!legacy.includes(`version: "${leader.sourceTree}"`),"legacy source authority must not be silently substituted");
});
