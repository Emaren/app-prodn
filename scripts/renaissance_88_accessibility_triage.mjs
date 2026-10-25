#!/usr/bin/env node
/* Source-bound, non-scoring, bounded Chrome axe evidence aggregation. */
import {readFile,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const OWNER_HINTS={
 "/academy":"app/academy/page.tsx",
 "/bets":"app/bets/page.tsx",
 "/champions/legacy":"app/champions/legacy/page.tsx",
 "/download":"app/download/page.tsx",
 "/forum":"app/forum/page.tsx",
 "/hd-replay-engine":"components/replay-engine/HdReplayEngine.tsx",
 "/kingdom-forge":"components/kingdom-forge/KingdomForgeClient.tsx",
 "/kingdom-intelligence":"app/kingdom-intelligence/page.tsx",
 "/kingdom":"app/kingdom/page.tsx",
 "/realm":"app/kingdom/page.tsx",
 "/leaderboard":"components/leaderboard/ModernLeaderboardPage.tsx",
 "/library":"components/library/LibraryActivityBoard.tsx",
 "/oracle":"components/oracle/OracleClient.tsx",
 "/renaissance":"app/renaissance/page.tsx",
 "/renaissance/atlas":"app/renaissance/atlas/page.tsx",
 "/replay-laboratory":"components/kingdom-instruments/KingdomInstruments.tsx",
 "/speed":"app/speed/page.tsx",
 "/wolochain":"app/wolochain/page.tsx",
 "/wolomania":"app/wolomania/page.tsx"
};
const SHA=/^[0-9a-f]{40}$/;
const BUILD=/^[a-zA-Z0-9_-]{5,128}$/;
function fail(reason){throw new Error("88 AXE TRIAGE HOLD: "+reason);}
export function makeAxeTriage(plan,records){
 if(plan?.schema!=="aoe2war.renaissance.public88.factory-plan.v1"||
    !SHA.test(plan.source_sha)||!BUILD.test(plan.build?.build_id)||plan.routes?.length!==88)
   fail("Plan missing exact 88 source/build binding");
 const all=new Set(plan.routes.map(x=>x.route));
 if(all.size!==88||records.length!==88)fail("All 88 exact route receipts required");
 const seen=new Set(),findings=[],unknown=[],gates=[];
 for(const receipt of records){
  if(!all.has(receipt.route)||seen.has(receipt.route)||receipt.source_sha!==plan.source_sha||
    receipt.build_id!==plan.build.build_id)fail("Duplicate, unknown or stale route");
  seen.add(receipt.route);
  if(!["PASS","FAIL","UNKNOWN"].includes(receipt.status)||receipt.views?.length!==2)
   fail("Malformed browser receipt");
  const viewports=new Set();
  for(const view of receipt.views){
   if(!["mobile","desktop"].includes(view.viewport)||viewports.has(view.viewport)||view.sample!==1)
    fail("Both single-sample viewport observations required");
   viewports.add(view.viewport);
   const scan=view.accessibilityScan;
   if(scan?.status!=="MEASURED"){unknown.push({route:receipt.route,viewport:view.viewport,state:scan?.status||"UNKNOWN"});continue;}
   for(const rule of scan.violations||[]){
    if(!["serious","critical"].includes(rule.impact))continue;
    if(typeof rule.id!=="string"||rule.id.length>90||!Number.isInteger(rule.nodes)||rule.nodes<1||
       !Array.isArray(rule.selectors))fail("Missing bounded selector proof");
    const selectors=rule.selectors.slice(0,30).map(node=>{
      if(!Array.isArray(node.target)||node.target.some(t=>typeof t!=="string"||t.length>240))fail("Unsafe selector");
      return {target:node.target,summary:String(node.failureSummary||"").slice(0,300),
              related:(node.related||[]).slice(0,4).map(x=>String(x).slice(0,160))};
    });
    if(!selectors.length)fail("Serious rule missing selector samples");
    findings.push({route:receipt.route,viewport:view.viewport,rule:rule.id,impact:rule.impact,
      affected_dom_nodes:rule.nodes,selectors,
      owner_hint:OWNER_HINTS[receipt.route]||null,owner_verified:false,
      source_sha:plan.source_sha,build_id:plan.build.build_id,
      meaning:"AUTOMATED_AXE_LOCAL_CANDIDATE_NOT_WCAG_CERTIFIED"});
   }
  }
  gates.push({route:receipt.route,navigation:receipt.status,accessibility:
    unknown.some(x=>x.route===receipt.route)?"UNKNOWN":findings.some(x=>x.route===receipt.route)?
    "ACTION_REQUIRED":"NO_SERIOUS_CRITICAL_AXE_OBSERVED",
    score:null,certified:false});
 }
 const rules={};
 for(const f of findings){
  const key=f.rule+"|"+f.impact;
  const r=rules[key]||(rules[key]={rule:f.rule,impact:f.impact,routes:[],totalNodes:0,observations:0});
  if(!r.routes.includes(f.route))r.routes.push(f.route);
  r.observations++;
  r.totalNodes+=f.affected_dom_nodes;
 }
 const byRule=Object.values(rules).map(x=>({...x,routes:x.routes.sort()}))
   .sort((a,b)=>b.routes.length-a.routes.length||a.rule.localeCompare(b.rule));
 return {schema:"aoe2war.renaissance88.axe-selector-triage.v1",
  source_sha:plan.source_sha,build_id:plan.build.build_id,
  route_count:88,viewport_observations:176,affected_routes:new Set(findings.map(x=>x.route)).size,
  serious_or_critical_rule_observations:findings.length,unmeasured_scans:unknown,
  groups:byRule,findings,gates,score:null,certified:false,
  cautions:["Owner hints are inferred file entrypoints, not proven DOM component ownership",
  "Automated axe rules can miss keyboard/screenreader issues; no WCAG or Index points awarded",
  "Routes that share a destination (e.g. /realm and /kingdom) may share the same DOM fault",
  "Any future source/build change invalidates these observations",
  "No financial, account-role or custody assertion derives from this scan"]};
}
export async function main(args){
 if(args.length!==6||args[0]!=="--plan"||args[2]!=="--directory"||args[4]!=="--output")
   fail("Expected --plan PLAN --directory DIR --output FILE");
 const plan=JSON.parse(await readFile(args[1],"utf8")),rows=[];
 for(const p of plan.routes){
  if(!/^\/(?:[a-z0-9/_-]*)$/.test(p.route))fail("Unsafe public route path");
  const file="route-"+(p.route==="/"? "root":p.route.slice(1).replace(/[^A-Za-z0-9_-]/g,"_"))+".json";
  const bytes=await readFile(join(args[3],file));
  if(bytes.length>500000)fail("Oversized receipt");
  rows.push(JSON.parse(bytes));
 }
 const triage=makeAxeTriage(plan,rows);
 await writeFile(args[5],JSON.stringify(triage,null,2)+"\n");
 console.log("AXE EXACT SOURCE "+triage.source_sha+" BUILD "+triage.build_id+
   " affected_routes="+triage.affected_routes+" scans_unmeasured="+triage.unmeasured_scans.length);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
 main(process.argv.slice(2)).catch(e=>{console.error(String(e));process.exitCode=2;});
