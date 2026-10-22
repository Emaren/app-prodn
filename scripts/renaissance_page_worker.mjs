#!/usr/bin/env node
// Renaissance worker handoff generator. Read-only, no locks/grades/releases.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fail=m=>{throw Error('RENAISSANCE WORKER STOP: '+m);};
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'config',n),'utf8'));
const dims=[['correctness',30],['functionality',25],['performance',20],['maintainability',15],['tests',10]];
export function makeContract({route,sha,catalog,inventory,rubric,profiles}){
 if(typeof route!=='string'||!/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(route))fail('invalid route');
 if(typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha))fail('exact 40-character Git SHA required');
 const page=inventory?.pages?.find(x=>x.href===route), publicRow=catalog?.find(x=>x.href===route);
 if(!page||page.scope!=='public-index'||!publicRow)fail('not a registered PUBLIC static page; protected/dynamic templates require operator authority');
 if(page.entrypoint!=='app/'+(route==='/'?'':route.slice(1)+'/')+'page.tsx')fail('source entrypoint mismatch');
 const profileId=profiles?.routeProfiles?.[route],profile=profiles?.profiles?.[profileId];
 if(!profile||!Array.isArray(profile.gates)||rubric?.maximum!==100)fail('assurance/rubric missing');
 const seen=new Set(), criteria=[];
 for(const [name,max] of dims){
  const d=rubric.dimensions?.[name];
  if(!d||d.weight!==max||!Array.isArray(d.criteria)||d.criteria.reduce((s,c)=>s+c.max,0)!==max)fail('rubric dimension drift: '+name);
  for(const c of d.criteria){
   if(!c.id||seen.has(c.id)||!Number.isInteger(c.max)||c.max<1||!c.requirement)fail('invalid rubric criterion');
   seen.add(c.id);criteria.push({id:c.id,dimension:name,max:c.max,requirement:c.requirement,earned:null});
  }
 }
 if(criteria.length!==20)fail('expected exactly 20 criteria');
 const gates=profile.gates.map(x=>({id:x.id,requirement:x.requirement,status:'UNVERIFIED'}));
 if(gates.some(g=>!g.id||!g.requirement)||new Set(gates.map(g=>g.id)).size!==gates.length)fail('invalid gates');
 const slug=route==='/'?'home':route.slice(1).replaceAll('/','-');
 return {kind:'aoe2war.renaissance.public-worker.v1',route,entrypoint:page.entrypoint,scope:page.scope,sourceSha:sha,
  routeLocalFingerprint:publicRow.sourceTree??null,assuranceProfile:profileId,
  suggestedBranch:'renaissance/page-'+slug+'-'+sha.slice(0,10),rubricVersion:rubric.version,
  maximum:100,score:null,certified:false,publicationAuthorized:false,criteria,gates};
}
export function makePrompt(x){
 const lines=['# RENAISSANCE PAGE WORKER: '+x.route,'',
  'Source baseline (recheck): '+x.sourceSha,'Template: '+x.entrypoint,
  'Suggested isolated branch (check uniqueness): '+x.suggestedBranch,
  'Route-local source marker (NOT full closure): '+x.routeLocalFingerprint,
  'Assurance profile: '+x.assuranceProfile,'Current score: UNKNOWN, not 0 or 100.','',
  'TASK: Own ONLY this page/template. Coordinate shared source changes with central Renaissance control. Do not modify Codex financial branches, WoloChain, protected release logic, common rubric, other page sessions or production.','',
  'CANONICAL 20 CRITERIA (100 maximum; points remain unknown until independently verified):'];
 for(const [name,max] of dims){
  lines.push('',name.toUpperCase()+' / '+max);
  for(const c of x.criteria.filter(c=>c.dimension===name))lines.push('- '+c.id+' ('+c.max+'): '+c.requirement);
 }
 lines.push('','MANDATORY PROFILE GATES (not bonus points):');
 for(const g of x.gates)lines.push('- '+g.id+': '+g.requirement);
 lines.push('','EXECUTION: (1) Recheck source/main and exact deployed build, linked APIs/DB/async jobs, truthful authorities and existing dossier. (2) Baseline real defects; fix correctness, performance, accessibility, state, error telemetry and objective issues before cosmetic styling. (3) Run adversarial, integration, real-browser and cold/warm P75/P95 budget tests; retain raw source-bound receipts. (4) Open a scoped draft PR with exact SHAs, test evidence, criterion-by-criterion earned or unknown points and gates. (5) Hand integration, private data checks, independent sign-off, score publication and protected production release to the central coordinator.','',
  'DELIVER: route and source SHA, PR, CI, functional/browser/performance receipts, source dependency closure, remaining unknowns and release/rollback proposal.',
  'No 100/100 claim, credential permission, independent proof, live branch lock, merge or financial/release authority is conveyed by this generated prompt.');
 return lines.join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),opts={};
  for(let i=0;i<args.length;i+=2){if(!['--route','--sha','--format'].includes(args[i])||!args[i+1]||opts[args[i]])fail('usage: --route /kingdom-index --sha <40-hex> [--format json|markdown]');opts[args[i]]=args[i+1];}
  if(opts['--format']&&!['json','markdown'].includes(opts['--format']))fail('invalid format');
  const contract=makeContract({route:opts['--route'],sha:opts['--sha'],catalog:read('kingdom-index-routes.json'),
   inventory:read('kingdom-index-inventory.json'),rubric:read('kingdom-index-quality-rubric.json'),
   profiles:read('kingdom-index-assurance-profiles.json')});
  process.stdout.write((opts['--format']==='json'?JSON.stringify(contract,null,2):makePrompt(contract))+'\n');
 }catch(error){console.error(error.message);process.exitCode=2;}
}
