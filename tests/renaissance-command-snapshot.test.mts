import test from "node:test";
import assert from "node:assert/strict";
import {
 parseSnapshotArgs,validateRenaissanceSnapshot,renderSnapshot,collectLiveSnapshot
} from "../scripts/renaissance_command_snapshot.mjs";

const main="a".repeat(40),head="b".repeat(40),base="c".repeat(40),other="d".repeat(40);
const pr={number:802,title:"Index",state:"open",draft:true,mergeable:true,changed_files:43,
 head:{sha:head},base:{sha:base,ref:"main"}};
const run={id:39849197289,name:"AoE2WAR CI",status:"completed",conclusion:"failure",head_sha:head};
const runs={total_count:1,workflow_runs:[run]};
const fields=()=>({repo:"Emaren/app-prodn",mainBefore:{sha:main},mainAfter:{sha:main},
 requested:[802],prs:[pr],runsByPr:[runs],confirmedHeads:[pr]});
test("CLI requires bounded distinct PRs, a concrete repo, and a known format",()=>{
 const o=parseSnapshotArgs(["--repo","Emaren/app-prodn","--prs","802,805,807","--format","json"]);
 assert.deepEqual(o.prs,[802,805,807]);assert.equal(o.format,"json");
 assert.throws(()=>parseSnapshotArgs(["--repo","x","--prs","802"]),/specific GitHub/);
 assert.throws(()=>parseSnapshotArgs(["--repo","Emaren/app-prodn","--prs","802,802"]),/distinct/);
 assert.throws(()=>parseSnapshotArgs(["--repo","Emaren/app-prodn","--prs","0"]),/positive/);
 assert.throws(()=>parseSnapshotArgs(["--repo","Emaren/app-prodn","--prs","802","--format","html"]),/format/);
});
test("failed CI stays failed even when PR is mergeable",()=>{
 const r=validateRenaissanceSnapshot(fields());
 assert.equal(r.mainSha,main);assert.equal(r.prs[0].headSha,head);
 assert.equal(r.prs[0].mergeable,true);
 assert.equal(r.prs[0].workflowObservation,"HAS_NON_SUCCESS_RUNS");
 assert.equal(r.score,null);assert.equal(r.mergeAuthorized,false);
 assert.equal(r.independentlyCertified,false);assert.equal(r.releaseAuthorized,false);
 assert.match(renderSnapshot(r),/HAS_NON_SUCCESS_RUNS/);
 assert.match(renderSnapshot(r),/UNKNOWN/);
});
test("no exact-head runs are UNKNOWN, not inferred success",()=>{
 const f=fields();f.runsByPr=[{total_count:0,workflow_runs:[]}];
 const r=validateRenaissanceSnapshot(f);assert.equal(r.prs[0].workflowObservation,"NO_EXACT_HEAD_RUN_OBSERVED");
});
test("one queued workflow prohibits green even when another passed",()=>{
 const f=fields();f.runsByPr=[{total_count:2,workflow_runs:[
  {...run,conclusion:"success"}, {...run,id:run.id+1,status:"queued",conclusion:null}
 ]}];
 const r=validateRenaissanceSnapshot(f);
 assert.equal(r.prs[0].workflowObservation,"INCOMPLETE");
});
test("main or PR changing during snapshot fails closed",()=>{
 const f=fields();f.mainAfter={sha:other};
 assert.throws(()=>validateRenaissanceSnapshot(f),/main changed/);
 const g=fields();g.confirmedHeads=[{...pr,head:{sha:other}}];
 assert.throws(()=>validateRenaissanceSnapshot(g),/PR #802 changed/);
});
test("missing, partial or foreign workflow data fails closed",()=>{
 const a=fields();a.runsByPr=[{total_count:2,workflow_runs:[run]}];
 assert.throws(()=>validateRenaissanceSnapshot(a),/incomplete exact-head/);
 const b=fields();b.runsByPr=[{total_count:100,workflow_runs:Array.from({length:100},()=>run)}];
 assert.throws(()=>validateRenaissanceSnapshot(b),/incomplete exact-head/);
 const c=fields();c.runsByPr=[{total_count:1,workflow_runs:[{...run,head_sha:other}]}];
 assert.throws(()=>validateRenaissanceSnapshot(c),/mismatched workflow/);
 const d=fields();d.prs=[{...pr,head:{sha:"main"}}];
 assert.throws(()=>validateRenaissanceSnapshot(d),/incomplete PR metadata/);
});
test("collector re-reads main and PR heads around exact-head workflows",()=>{
 const seen=[];
 const api=(repo,suffix)=>{
  seen.push(suffix);
  if(suffix==="commits/main")return {sha:main};
  if(suffix==="pulls/802")return pr;
  if(suffix==="actions/runs?head_sha="+head+"&per_page=100")return runs;
  throw Error("unexpected API route");
 };
 const result=collectLiveSnapshot({repo:"Emaren/app-prodn",prs:[802]},api);
 assert.equal(result.prs[0].headSha,head);
 assert.deepEqual(seen,["commits/main","pulls/802","actions/runs?head_sha="+head+"&per_page=100","pulls/802","commits/main"]);
});
test("snapshot never upgrades successful source-only workflows into a score",()=>{
 const f=fields();
 f.runsByPr=[{total_count:1,workflow_runs:[{...run,conclusion:"success"}]}];
 const r=validateRenaissanceSnapshot(f);
 assert.equal(r.prs[0].workflowObservation,"OBSERVED_RUNS_SUCCESS");
 assert.equal(r.score,null);assert.equal(r.independentlyCertified,false);
 assert.match(renderSnapshot(r),/No merge, certification or production release approved/);
});
