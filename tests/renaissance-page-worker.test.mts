import test from 'node:test';
import assert from 'node:assert/strict';
import {makeContract,makePrompt} from '../scripts/renaissance_page_worker.mjs';
const sha='3f1f26808c7c68961f376921e5a97b2bdd361af3';
const catalog=[{href:'/kingdom-index',sourceTree:'src-a25647c21c61a28d'}];
const inventory={pages:[{href:'/kingdom-index',entrypoint:'app/kingdom-index/page.tsx',scope:'public-index'},
{href:'/admin',entrypoint:'app/admin/page.tsx',scope:'admin-path'},
{href:'/game-stats/[id]',entrypoint:'app/game-stats/[id]/page.tsx',scope:'dynamic-template'}]};
const maxima={correctness:30,functionality:25,performance:20,maintainability:15,tests:10};
const rubric={version:'fixture',maximum:100,dimensions:Object.fromEntries(Object.entries(maxima).map(([n,m])=>[n,{weight:m,criteria:Array.from({length:4},(_,i)=>({id:n+i,max:i===0?m-3:1,requirement:'Independently observed'}))}]))};
const profiles={routeProfiles:{'/kingdom-index':'index'},profiles:{index:{gates:[{id:'source-closure',requirement:'Closed'},{id:'score-verification',requirement:'Authenticated'},{id:'staleness',requirement:'Current'}]}}};
const args={route:'/kingdom-index',sha,catalog,inventory,rubric,profiles};
test('complete original 100-point contract earns no scores',()=>{
 const c=makeContract(args);assert.equal(c.criteria.length,20);
 assert.equal(c.criteria.reduce((n,x)=>n+x.max,0),100);
 assert.equal(c.score,null);assert.equal(c.certified,false);assert.equal(c.publicationAuthorized,false);
 assert.ok(c.criteria.every(x=>x.earned===null));assert.equal(c.gates.length,3);
});
test('worker prompt is source-pinned and refuses unilateral publication',()=>{
 const prompt=makePrompt(makeContract(args));
 for(const value of ['/kingdom-index',sha,'source-closure','P75/P95','no 100/100 claim','central coordinator'])assert.ok(prompt.toLowerCase().includes(value.toLowerCase()));
});
test('private, dynamic, unknown, invalid and tampered rubric requests fail closed',()=>{
 for(const route of ['/admin','/game-stats/[id]','/not-here','https://attacker.invalid','/../admin'])assert.throws(()=>makeContract({...args,route}),/STOP/);
 assert.throws(()=>makeContract({...args,sha:'main'}),/STOP/);
 assert.throws(()=>makeContract({...args,catalog:[]}),/STOP/);
 assert.throws(()=>makeContract({...args,rubric:{...rubric,maximum:90}}),/STOP/);
 assert.throws(()=>makeContract({...args,profiles:{routeProfiles:{},profiles:{}}}),/STOP/);
 const broken=structuredClone(rubric);broken.dimensions.correctness.criteria[1].id=broken.dimensions.correctness.criteria[0].id;
 assert.throws(()=>makeContract({...args,rubric:broken}),/STOP/);
});
