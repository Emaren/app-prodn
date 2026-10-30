import assert from "node:assert/strict";
import test from "node:test";
import {projectWorkLedger} from "../lib/centralWorkLedger.ts";
import type {EventFeed,SourceEvent} from "../lib/centralEvents.ts";
const clock=Date.parse("2026-10-29T23:40:00Z"),at="2026-10-29T23:00:00Z",head="a".repeat(40),mergeSha="b".repeat(40),other="c".repeat(40);
const make=(id:string,kind:SourceEvent["kind"],sourceUrl:string,laneId:"G"|"C"|null="G",sha:string|null=head,state:string|null=null):SourceEvent=>
 ({id:"github:Emaren/app-prodn:"+id,kind,sourceUrl,laneId,at,repo:"Emaren/app-prodn",sha,state,authority:"GITHUB_SOURCE"});
const feed=(events:SourceEvent[],status:EventFeed["status"]="FRESH"):EventFeed=>({schema:"aoe2war.central-source-events.v1",events,status,readAt:at,observedAt:at,errorCode:null,sourceCoverage:{accepted:33,expected:33},history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE"});
const url="https://github.com/Emaren/app-prodn/pull/999";
test("six canonical cores, no agent heartbeat or runtime from an issue dispatch",()=>{
 const p=projectWorkLedger(feed([make("comment:9","DISPATCH_PUBLISHED","https://github.com/Emaren/app-prodn/issues/976#issuecomment-9","G",null)]),clock);
 assert.equal(p.schema,"aoe2war.central-work-ledger.v1");assert.deepEqual(p.lanes.map(x=>x.id),["D","G","C","E","F","B"]);
 assert.equal(p.counts.observedEvents,1);assert.equal(p.counts.observedPRs,0);
 assert.equal(p.lanes.find(x=>x.id==="G")?.lastEvent?.kind,"DISPATCH_PUBLISHED");
 assert.ok(p.lanes.every(l=>l.agentPresence==="UNKNOWN"&&l.nativeWitness==="UNKNOWN"&&l.deployedBuildId===null));
 assert.equal(p.queueAuthority.eligibility,"UNKNOWN");assert.equal(p.queueAuthority.writeAccess,false);
 assert.equal(p.host.deployedBuildId,null);
});
test("only exact source PR head correlates concluded CI and review; MERGED_SOURCE_NOT_LIVE",()=>{
 const p=projectWorkLedger(feed([
  make("pr:999:opened","PR_OPENED",url),
  make("pr:999:updated:"+head,"PR_UPDATED",url),
  make("review:42","REVIEW_SUBMITTED",url+"#pullrequestreview-42","G",head,"APPROVED"),
  make("pr:999:merge:"+mergeSha,"MERGE_ACCEPTED",url,"G",mergeSha,"MERGED_SOURCE_NOT_LIVE"),
  make("run:11","HEAD_CI_CONCLUDED","https://github.com/Emaren/app-prodn/actions/runs/11",null,head,"SUCCESS"),
  make("run:12","HEAD_CI_CONCLUDED","https://github.com/Emaren/app-prodn/actions/runs/12",null,other,"FAILURE"),
 ],"PARTIAL"),clock);
 const item=p.items.find(i=>i.number===999);
 assert.ok(item);assert.equal(item.headSha,head);assert.equal(item.ci,"SUCCESS");
 assert.equal(item.review,"APPROVED");assert.equal(item.merge,"MERGED_SOURCE_NOT_LIVE");
 assert.equal(item.deployment,"UNKNOWN");assert.equal(p.status,"PARTIAL");
 assert.equal(p.counts.observedMerges,1);assert.equal(p.counts.successfulConcludedCI,1);
 assert.equal(p.host.state,"UNKNOWN");
});
test("unrelated CI, forged review URL, future and duplicate provider ID cannot complete stages",()=>{
 const invalid:SourceEvent[]=[
  make("run:8","HEAD_CI_CONCLUDED","https://github.com/Emaren/app-prodn/actions/runs/8",null,other,"SUCCESS"),
  make("review:evil","REVIEW_SUBMITTED","https://untrusted.example/Emaren/app-prodn/pull/999","G",head,"APPROVED"),
  {...make("comment:future","COMMENT_PUBLISHED","https://github.com/Emaren/app-prodn/issues/976#issuecomment-99"),at:"2040-01-01T00:00:00Z"},
  {...make("commit:evil","SOURCE_COMMIT_OBSERVED","https://github.com/Emaren/app-prodn/commit/"+head),repo:"Emaren/wolochain"}
 ];
 const p=projectWorkLedger(feed([make("pr:999:opened","PR_OPENED",url),make("pr:999:opened","PR_OPENED",url),...invalid]),clock);
 assert.equal(p.items.length,1);assert.equal(p.items[0].ci,"UNKNOWN");assert.equal(p.items[0].review,"UNKNOWN");
 assert.equal(p.items[0].merge,"UNKNOWN");
 assert.equal(p.events.length,2);assert.equal(p.counts.successfulConcludedCI,1);
 assert.doesNotMatch(JSON.stringify(p),/untrusted\.example|2040-01-01/);
});
test("UNKNOWN or STALE source never emits a fake zero certainty or status promotion",()=>{
 const u=projectWorkLedger(feed([],"UNKNOWN"),clock),s=projectWorkLedger(feed([],"STALE"),clock);
 for(const p of [u,s]){assert.equal(p.items.length,0);assert.equal(p.queueAuthority.eligibility,"UNKNOWN");assert.ok(p.lanes.every(l=>l.lastEvent===null));}
 assert.equal(s.status,"STALE");assert.equal(u.status,"UNKNOWN");
});
test("bounded finite provider depth and malicious PR number fail closed",()=>{
 const base=make("pr:999:opened","PR_OPENED",url);
 const lots=Array.from({length:130},(_,i)=>({...base,id:"github:Emaren/app-prodn:pr:999:"+i}));
 const p=projectWorkLedger(feed([...lots,make("pr:9999999","PR_OPENED","https://github.com/Emaren/app-prodn/pull/9999999")]),clock);
 assert.ok(p.events.length<=60);assert.ok(p.items.length<=20);assert.equal(p.history,"BOUNDED_GITHUB_WINDOW_NOT_DURABLE");
 assert.equal(p.items.some(x=>x.number===9999999),false);
});
