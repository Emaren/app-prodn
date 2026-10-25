import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../config/kingdom-index-routes.json" with {type:"json"};
import {projectLiveCandidate,readKingdomIndexLiveCandidate} from "../lib/kingdomIndexLiveFeed.mjs";
const now=Date.parse("2026-10-25T19:30:00.000Z");
const make=()=>({
 schema:1,kind:"aoe2war.kingdom-index.candidate-browser-feed.v1",
 authority:"CI_CANDIDATE_ONLY",certified:false,score:null,runId:40219717049,
 runUrl:"https://github.com/Emaren/app-prodn/actions/runs/40219717049",
 sourceSha:"a".repeat(40),buildId:"ExampleBuild-123",
 artifactSha256:"b".repeat(64),coverageSha256:"c".repeat(64),
 observedAt:"2026-10-25T19:20:00.000Z",
 counts:{PASS:88,FAIL:0,UNKNOWN:0,UNMEASURED:0},
 routes:Object.fromEntries(catalog.map(x=>[x.href,"PASS"])),
 accessibility:{scannedRoutes:88,affectedRoutes:19}
});
test("88/88 candidate telemetry never mints any quality score",()=>{
 const p=projectLiveCandidate(make(),now);
 assert.equal(p.status,"CURRENT");assert.equal(p.routeCounts.PASS,88);
 assert.equal(p.routes["/kingdom-index"],"PASS");assert.equal(p.accessibility.affectedRoutes,19);
 assert.equal(p.certifiedScores,null);assert.equal(p.signedCriteriaApproved,null);
 assert.equal(p.certificationAuthority,"NOT_PROVIDED");
});
test("old browser evidence remains visible but stale",()=>{
 const p=projectLiveCandidate(make(),now+37*60*60*1000);
 assert.equal(p.status,"STALE");assert.equal(p.routeCounts.PASS,88);
});
test("invented or missing route and contradictory counts refuse",()=>{
 const a=make();a.counts.PASS=87;assert.equal(projectLiveCandidate(a,now).status,"INVALID");
 const b=make();b.routes["/fake"]="PASS";assert.equal(projectLiveCandidate(b,now).status,"INVALID");
 const c=make();delete c.routes["/academy"];assert.equal(projectLiveCandidate(c,now).status,"INVALID");
});
test("score injection, false URLs, implausible timestamps and bad accessibility refuse",()=>{
 const a=make();a.score=100;assert.equal(projectLiveCandidate(a,now).status,"INVALID");
 const b=make();b.certified=true;assert.equal(projectLiveCandidate(b,now).status,"INVALID");
 const c=make();c.runUrl="https://bad.example";assert.equal(projectLiveCandidate(c,now).status,"INVALID");
 const d=make();d.observedAt="2099-01-01T00:00:00Z";assert.equal(projectLiveCandidate(d,now).status,"INVALID");
 const e=make();e.accessibility.affectedRoutes=99;assert.equal(projectLiveCandidate(e,now).status,"INVALID");
});
test("no private feed is safely unavailable",async()=>{
 const before=process.env.KINGDOM_INDEX_LIVE_PROGRESS_PATH;
 delete process.env.KINGDOM_INDEX_LIVE_PROGRESS_PATH;
 try{assert.equal((await readKingdomIndexLiveCandidate(now)).status,"UNAVAILABLE");}
 finally{if(before!==undefined)process.env.KINGDOM_INDEX_LIVE_PROGRESS_PATH=before;}
});
