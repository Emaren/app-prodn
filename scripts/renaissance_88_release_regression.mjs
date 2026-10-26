#!/usr/bin/env node
/**
 * Builds a source-bound, NONEXECUTING post-release smoke checklist.
 * Every live GET, auth case and release identity needs independent approval.
 */
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const HIGH_VALUE=[
 "/", "/kingdom-index", "/requests", "/kingdom-intelligence",
 "/workshop", "/betting-mechanics", "/watch", "/kingdom",
 "/leaderboard", "/players", "/library", "/speed",
 "/traffic", "/hd-replay-engine", "/replay-parser", "/wolochain"
];
const PROHIBITED_PATH=/\/(?:admin|api|auth|wallet|settings|profile)(?:\/|$)/;
export function makeReleaseSmokePlan(plan){
 if(plan?.schema!=="aoe2war.renaissance.public88.factory-plan.v1"||
   !/^[a-f0-9]{40}$/.test(plan.source_sha)||plan.routes?.length!==88)
   throw new Error("HOLD: Exact 88-route source plan required");
 const allow=new Set(plan.routes.map(x=>x.route));
 if(allow.size!==88||HIGH_VALUE.some(p=>!allow.has(p)||PROHIBITED_PATH.test(p)))
   throw new Error("HOLD: High-value routes must match actual public index");
 const routes=HIGH_VALUE.map((route,order)=>({
   order:order+1,route,method:"GET",query_params:null,
   expected_source_sha:plan.source_sha,expected_build_id:plan.build?.build_id||null,
   actual_release_build_id:null,
   acceptance:"NOT_EXECUTED",actual_http:null,
   route_ready:"UNMEASURED",keyboard:"UNMEASURED",mobile:"UNMEASURED",
   runtime_errors:"UNMEASURED",speed_proof:"UNMEASURED",
   gray_dot_policy:"SOURCE_ONLY",living_realm:"SOURCE_ONLY",
   theme_exclusions:"SOURCE_ONLY",
   auth:"ANONYMOUS_ONLY",
   allowed_actions:["navigate","inspect_dom","keyboard_tab","measure_navigation"],
   forbidden_actions:["wallet_connect","sign","bet","payout","fund","broadcast",
       "submit","stake","unstake","admin_mutation","login","api_write","reconcile"]
 }));
 return {
   schema:"aoe2war.renaissance88.postrelease-readonly-smoke.v1",
   generated_from_sha:plan.source_sha,
   candidate_build_id:plan.build?.build_id||null,
   release_sha:null,release_build_id:null,
   plan_status:"NOT_EXECUTED_UNAUTHORIZED",
   run_mode:"AUTHORIZED_POST_RELEASE_SHADOW_OR_READONLY_BROWSER",
   requires:["approved_release_sha","independent deployed_build_id",
      "authorized environment URL","strict no-external-auth/custody writes",
      "approved GET-only route list","owner approval for backend GET side effects"],
   all_public_routes_covered_by_factory:88,
   smoke_routes:routes,
   constraints:{max_routes:16,viewports:["desktop","mobile"],
      max_page_nav_ms:8000,max_total_duration_ms:240000,
      max_server_api_responses_sampled:16,
      sample_minimum_for_performance_certification:10,
      performance_gate:"UNMEASURED",
      actual_production_nonmutation:"UNMEASURED",
      scoring_authority:"TAB_A_ONLY"},
   excluded:["protected pages","financial API routes","authenticated write flows",
     "wallet or broadcast interactions","production form submissions"],
   notes:["This JSON is a DRY-RUN PLAN, not an active smoke execution",
      "Source candidate BUILD_ID cannot attest the deployed server",
      "Read-only browser page GET may still trigger server writes; require owner review",
      "Speed/Gray/Living/Seasonal overlays require separate actual runtime observations",
      "Production errors, P75/P95, custody and complete WCAG remain UNMEASURED"]
 };
}
export async function main(args){
 if(args.length!==4||args[0]!=="--plan"||args[2]!=="--output")
    throw new Error("Expected --plan FILE --output FILE");
 const plan=JSON.parse(await readFile(args[1],"utf8"));
 const record=makeReleaseSmokePlan(plan);
 await writeFile(args[3],JSON.stringify(record,null,2)+"\n");
 console.log("RELEASE SMOKE PLAN "+record.smoke_routes.length+" high-value routes; NOT EXECUTED");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main(process.argv.slice(2)).catch(e=>{console.error(String(e));process.exitCode=2;});
