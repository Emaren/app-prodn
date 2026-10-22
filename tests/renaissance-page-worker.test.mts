import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import { buildPublicPageAssignment, renderPublicPagePrompt, publicCandidateQueue, redirectAliasDestination, assertCheckoutProvenance } from "../scripts/renaissance_page_worker.mjs";
const sha="184281be67c16e0c3b7013ee7cbbab394b928889";
const catalog=[{href:"/kingdom-index",sourceTree:"src-0123456789abcdef"},{href:"/speed",sourceTree:"src-ffffffffffffffff"}];
const campaign={phases:[{id:"I",routes:["/kingdom-index","/speed","/admin","/game-stats/[id]"]}]};
const maxes={correctness:30,functionality:25,performance:20,maintainability:15,tests:10};
const rubric={maximum:100,version:"test",dimensions:Object.fromEntries(Object.entries(maxes).map(([name,max])=>[name,{weight:max,criteria:Array.from({length:4},(_,i)=>({id:name+"-"+i,max:i?1:max-3,requirement:"Independent proof"}))}]))};
const profiles={routeProfiles:{"/kingdom-index":"index","/speed":"general"},profiles:{index:{gates:[{id:"source-closure",requirement:"closure"},{id:"score-verification",requirement:"proof"},{id:"staleness",requirement:"fresh"}]},general:{gates:[]}}};
const fixture={route:"/kingdom-index",sourceSha:sha,catalog,campaign,rubric,profiles,sourceExists:()=>true,sourceText:()=>"export default function WorkingPage() { return <main>Real content</main>; }"};
test("score is unknown with canonical 20 criteria, 100 max and specialty gates",()=>{
 const result=buildPublicPageAssignment(fixture);
 assert.equal(result.criteria.length,20);assert.equal(result.maximum,100);
 assert.equal(result.criteria.reduce((s,c)=>s+c.maximum,0),100);
 assert.equal(result.score,null);assert.equal(result.certified,false);assert.equal(result.releaseAuthorized,false);
 assert.ok(result.criteria.every(c=>c.earned===null));
 assert.deepEqual(result.gates.map(g=>g.id),["source-closure","score-verification","staleness"]);
});
test("prompt remains scoped and source-bound",()=>{
 const c=buildPublicPageAssignment(fixture),markdown=renderPublicPagePrompt(c);
 for(const token of [sha,"/kingdom-index","P75/P95","source-closure","Central coordinator","UNKNOWN","NO GRADE"])assert.ok(markdown.includes(token),token);
});
test("public queue is phase ordered, unique, excludes protected and dynamic",()=>{
 assert.deepEqual(publicCandidateQueue({...fixture}),[{route:"/kingdom-index",phase:"I",kind:"PAGE",canonicalTarget:null},{route:"/speed",phase:"I",kind:"PAGE",canonicalTarget:null}]);
 assert.throws(()=>publicCandidateQueue({...fixture,catalog:[...catalog,{href:"/missing"}]}),/coverage drift/);
 assert.throws(()=>publicCandidateQueue({...fixture,campaign:{phases:[...campaign.phases,{id:"II",routes:["/speed"]}]}}),/duplicate/);
});
test("refuse unregistered, protected, dynamic, path traversal, bad sha, missing local source",()=>{
 for(const route of ["/admin","/game-stats/[id]","/not-there","/../admin","https://example.org"]){
  assert.throws(()=>buildPublicPageAssignment({...fixture,route}),/RENAISSANCE LAUNCH STOP/);
 }
 assert.throws(()=>buildPublicPageAssignment({...fixture,sourceSha:"main"}),/STOP/);
 assert.throws(()=>buildPublicPageAssignment({...fixture,sourceExists:()=>false}),/STOP/);
 assert.throws(()=>buildPublicPageAssignment({...fixture,catalog:[]}),/STOP/);
});
test("refuse score rubric tampering, unclassified assurance and duplicated gates",()=>{
 const changed=structuredClone(rubric);
 changed.dimensions.correctness.criteria[0].id=changed.dimensions.correctness.criteria[1].id;
 assert.throws(()=>buildPublicPageAssignment({...fixture,rubric:changed}),/STOP/);
 assert.throws(()=>buildPublicPageAssignment({...fixture,profiles:{routeProfiles:{},profiles:{}}}),/STOP/);
 const changedProfiles=structuredClone(profiles);
 changedProfiles.profiles.index.gates[1].id="source-closure";
 assert.throws(()=>buildPublicPageAssignment({...fixture,profiles:changedProfiles}),/STOP/);
});

test("redirect-only /about and /roadmap aliases cannot claim separate page workers",()=>{
 const aliasSource='import { redirect } from "next/navigation";\nexport default function AboutPage() { redirect("/requests#about"); }\n';
 assert.equal(redirectAliasDestination(aliasSource),"/requests#about");
 const aliases=[{href:"/about",sourceTree:"src-1234567890abcdef"},{href:"/roadmap",sourceTree:"src-abc1234567890def"}];
 const extended={...fixture,catalog:[...catalog,...aliases],campaign:{phases:[{id:"I",routes:["/kingdom-index","/about","/roadmap","/speed"]}]},
  sourceText:path=>path==="app/about/page.tsx"?aliasSource:path==="app/roadmap/page.tsx"?aliasSource.replace("#about","#roadmap"):fixture.sourceText(path)};
 const queue=publicCandidateQueue(extended);
 assert.deepEqual(queue.filter(x=>x.kind==="REDIRECT_ALIAS"),[
  {route:"/about",phase:"I",kind:"REDIRECT_ALIAS",canonicalTarget:"/requests#about"},
  {route:"/roadmap",phase:"I",kind:"REDIRECT_ALIAS",canonicalTarget:"/requests#roadmap"}]);
 assert.throws(()=>buildPublicPageAssignment({...extended,route:"/about"}),/redirect-only alias/);
 assert.throws(()=>buildPublicPageAssignment({...extended,route:"/roadmap"}),/redirect-only alias/);
});
test("source must actually be available before any work packet is issued",()=>{
 assert.throws(()=>buildPublicPageAssignment({...fixture,sourceText:()=>null}),/page source unavailable/);
});

test("Renaissance instrument modules extend Phase I without reordering existing entries",()=>{
 const instrument={href:"/renaissance/atlas",sourceTree:"src-9999999999999999"};
 const extended={...fixture, catalog:[...catalog,instrument],
  profiles:{...profiles,routeProfiles:{...profiles.routeProfiles,"/renaissance/atlas":"general"}},
  campaign:{phases:[{id:"I",routes:["/kingdom-index","/speed"]},{id:"II",routes:[]}],
    modules:[{slug:"atlas",href:"/renaissance/atlas"}]}};
 const actual=publicCandidateQueue(extended);
 assert.deepEqual(actual.map(x=>x.route),["/kingdom-index","/speed","/renaissance/atlas"]);
 assert.deepEqual(actual.map(x=>x.phase),["I","I","I"]);
 assert.equal(buildPublicPageAssignment({...extended,route:"/renaissance/atlas"}).phase,"I");
});
test("repository's real indexed route corpus has a complete honest phase queue",()=>{
 const config=name=>JSON.parse(readFileSync(new URL("../config/"+name,import.meta.url),"utf8"));
 const catalog=config("kingdom-index-routes.json"),campaign=config("renaissance-campaign.json");
 const queue=publicCandidateQueue({catalog,campaign,sourceText:relative=>readFileSync(new URL("../"+relative,import.meta.url),"utf8")});
 assert.equal(queue.length,catalog.length);
 assert.deepEqual(queue.slice(0,3).map(x=>x.route),["/kingdom-intelligence","/kingdom-brain","/kingdom-index"]);
 assert.deepEqual(queue.filter(x=>x.route==="/about"||x.route==="/roadmap").map(x=>[x.route,x.kind,x.canonicalTarget]).sort(),
  [["/about","REDIRECT_ALIAS","/requests#about"],["/roadmap","REDIRECT_ALIAS","/requests#roadmap"]]);
 assert.ok(queue.some(x=>x.route==="/renaissance/atlas"&&x.phase==="I"));
 for(const row of queue){
  const file=new URL("../app"+(row.route==="/"?"/":row.route+"/")+"page.tsx",import.meta.url);
  assert.ok(existsSync(file),row.route+" missing backing page");
 }
});

test("CLI provenance guard binds requested SHA to a clean tracked checkout",()=>{
 assert.doesNotThrow(()=>assertCheckoutProvenance({requestedSha:sha,checkoutSha:sha,dirtyTracked:""}));
 assert.throws(()=>assertCheckoutProvenance({requestedSha:sha,checkoutSha:"1".repeat(40),dirtyTracked:""}),/differs from local Git HEAD/);
 assert.throws(()=>assertCheckoutProvenance({requestedSha:"main",checkoutSha:sha,dirtyTracked:""}),/exact 40-character/);
 assert.throws(()=>assertCheckoutProvenance({requestedSha:sha,checkoutSha:sha,dirtyTracked:" M app/page.tsx"}),/tracked checkout changes/);
 assert.throws(()=>assertCheckoutProvenance({requestedSha:sha,checkoutSha:sha}),/tracked checkout changes/);
});
