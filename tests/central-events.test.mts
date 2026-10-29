import assert from "node:assert/strict";
import test from "node:test";
import {parseComments,parsePr,parseCommits,parseRuns,parseReviews,dedupeEvents,validAt,validSha} from "../lib/centralEvents.ts";
const when="2026-10-29T20:00:00Z",now=Date.parse("2026-10-29T23:00:00Z"),sha="a".repeat(40),base="b".repeat(40);
test("source identity, time, future and forged SHA fail closed",()=>{
 assert.equal(validSha("x".repeat(40)),null);
 assert.equal(validAt("2026-11-30T20:00:00Z",now),null);
 assert.equal(validAt("2026-10-29",now),null);
 const commits=parseCommits("Emaren/app-prodn","G",[{sha,commit:{author:{date:when},committer:{date:"2026-10-29T21:00:00Z"}}}],now);
 assert.equal(commits.length,1);
 assert.equal(commits[0].at,"2026-10-29T21:00:00.000Z");
 assert.equal(commits[0].sourceUrl,"https://github.com/Emaren/app-prodn/commit/"+sha);
 assert.equal(parseCommits("Emaren/evil","G",[{sha,commit:{committer:{date:when}}}],now).length,0);
});
test("owner-published dispatch does not equal waking a ChatGPT session",()=>{
 const list=parseComments("Emaren/app-prodn",976,"G",[
 {id:6509196728,created_at:when,user:{login:"Emaren"},body:"## CENTRAL WORK ORDER — Q09-A1"},
 {id:6509196729,created_at:when,user:{login:"stranger"},body:"## CENTRAL WORK ORDER — pretend"},
 {id:6509196730,created_at:when,user:{login:"Emaren"},body:"ordinary source return"},
 {id:6509196728+10,created_at:when,user:{login:"Emaren"},body:"## ⚔️ CENTRAL — LATEST POST-W1 SOURCE BASE / G Q09-A1 IMPLEMENT IMMEDIATELY"}
 ],now);
 assert.equal(list.length,4);assert.equal(list[0].kind,"DISPATCH_PUBLISHED");
 assert.equal(list[1].kind,"COMMENT_PUBLISHED");assert.equal(list[2].kind,"COMMENT_PUBLISHED");assert.equal(list[3].kind,"DISPATCH_PUBLISHED");
 assert.equal(JSON.stringify(list).includes("pretend"),false);
 assert.equal(JSON.stringify(list).includes("OWNER_WOKE"),false);
});
test("PR merge requires signed shape and exact merge SHA, never runtime",()=>{
 const x={number:988,head:{sha},base:{sha:base},created_at:when,updated_at:when,merged_at:when,merge_commit_sha:base};
 const list=parsePr("Emaren/app-prodn",988,"G",x,now);
 assert.equal(list.length,3);assert.equal(list[2].kind,"MERGE_ACCEPTED");
 assert.equal(list[2].state,"MERGED_SOURCE_NOT_LIVE");
 assert.equal(parsePr("Emaren/app-prodn",988,"G",{...x,head:{sha:"bad"}},now).length,0);
 assert.equal(parsePr("Emaren/app-prodn",989,"G",x,now).length,0);
});
test("workflow events demand head sha, completed conclusion, vetted path/name",()=>{
 const row={id:40952916496,name:"AoE2WAR CI",path:".github/workflows/ci.yml@main",head_sha:sha,status:"completed",conclusion:"success",updated_at:when};
 const p={workflow_runs:[row,{...row,id:1,path:".github/workflows/evil.yml@main"},{...row,id:2,head_sha:"bad"},{...row,id:3,status:"in_progress"},{...row,id:4,conclusion:"fake"},{...row,id:5,updated_at:"2050-01-01T00:00:00Z"}]};
 const out=parseRuns("Emaren/app-prodn",p,now);
 assert.equal(out.length,1);assert.equal(out[0].state,"SUCCESS");
 assert.equal(out[0].sha,sha);assert.equal(out[0].kind,"HEAD_CI_CONCLUDED");
 assert.equal(out[0].id,"github:Emaren/app-prodn:run:40952916496","real GitHub Actions IDs exceed the former invalid 10B cap");
});
test("current A3 workflow run is source-valid only when exact name and path agree",()=>{
 const row={id:40974594654,head_sha:sha,name:"Q09 A3 Work Board and six-lane real Chrome",path:".github/workflows/central-work-ledger-browser.yml",status:"completed",conclusion:"success",updated_at:when};
 const e=parseRuns("Emaren/app-prodn",{workflow_runs:[row,{...row,id:40974594655,path:".github/workflows/evil.yml"},{...row,id:40974594656,name:"AoE2WAR CI"}]},now);
 assert.equal(e.length,1);assert.equal(e[0].id,"github:Emaren/app-prodn:run:40974594654");
 assert.equal(e[0].state,"SUCCESS");assert.equal(e[0].sha,sha);
});
test("review preserves authored submission timestamp and source id, no false independent certification",()=>{
 const rows=parseReviews("Emaren/app-prodn",988,"G",[{id:5703747430,commit_id:sha,user:{login:"Emaren"},submitted_at:when,state:"APPROVED",body:"secret"}],now);
 assert.equal(rows.length,1);assert.equal(rows[0].kind,"REVIEW_SUBMITTED");
 assert.equal(rows[0].at,"2026-10-29T20:00:00.000Z");
 assert.doesNotMatch(JSON.stringify(rows),/secret|independent/i);
});
test("repeated source pages idempotently dedupe; events bounded and ordered",()=>{
 const e=parseComments("Emaren/app-prodn",976,"G",[{id:10,created_at:when,user:{login:"Emaren"},body:"hi"}],now)[0];
 assert.equal(dedupeEvents([e,e]).length,1);
 assert.equal(dedupeEvents(new Array(100).fill(e)).length,1);
 assert.equal(dedupeEvents([],60).length,0);
});
