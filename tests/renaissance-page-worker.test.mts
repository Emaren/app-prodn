import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicPageAssignment, renderPublicPagePrompt, publicCandidateQueue } from "../scripts/renaissance_page_worker.mjs";
const sha="184281be67c16e0c3b7013ee7cbbab394b928889";
const catalog=[{href:"/kingdom-index",sourceTree:"src-0123456789abcdef"},{href:"/speed",sourceTree:"src-ffffffffffffffff"}];
const campaign={phases:[{id:"I",routes:["/kingdom-index","/speed","/admin","/game-stats/[id]"]}]};
const maxes={correctness:30,functionality:25,performance:20,maintainability:15,tests:10};
const rubric={maximum:100,version:"test",dimensions:Object.fromEntries(Object.entries(maxes).map(([name,max])=>[name,{weight:max,criteria:Array.from({length:4},(_,i)=>({id:name+"-"+i,max:i?1:max-3,requirement:"Independent proof"}))}]))};
const profiles={routeProfiles:{"/kingdom-index":"index","/speed":"general"},profiles:{index:{gates:[{id:"source-closure",requirement:"closure"},{id:"score-verification",requirement:"proof"},{id:"staleness",requirement:"fresh"}]},general:{gates:[]}}};
const fixture={route:"/kingdom-index",sourceSha:sha,catalog,campaign,rubric,profiles,sourceExists:()=>true};
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
 assert.deepEqual(publicCandidateQueue({catalog,campaign}),[{route:"/kingdom-index",phase:"I"},{route:"/speed",phase:"I"}]);
 assert.throws(()=>publicCandidateQueue({catalog:[...catalog,{href:"/missing"}],campaign}),/coverage drift/);
 assert.throws(()=>publicCandidateQueue({catalog,campaign:{phases:[...campaign.phases,{id:"II",routes:["/speed"]}]}}),/duplicate/);
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
