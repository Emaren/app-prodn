import test from "node:test";
import assert from "node:assert/strict";
import {aggregateCohort,publicEvent,safeDestination,safeEvent,summarizeUser} from "../lib/adminLivingKingdom/projection.ts";

const instant=(m:number)=>new Date(Date.UTC(2026,9,25,12,m)).toISOString();
function event(id:number,type:string,path:string|null,at:string,metadata:unknown=null,label:string|null="SECRET VALUE") {
 return safeEvent({id,type,path,createdAt:at,metadata,label});
}
function required<T>(value:T|null):T {assert.ok(value);return value;}

test("private, wallet, API, encoded, query and external paths cannot leak",()=>{
 for(const value of ["/admin/user-list","/wallet/secret","/profile","/api/admin/secrets",
  "/market/invoices/private?token=secret","https://example.com/path","//remote.site","/players/%2e%2e",
  "/settings?jwt=private","/auth/reset","/connect-wallet"]){
  assert.equal(safeDestination(value),"Protected / unclassified",value);
 }
 assert.equal(safeDestination("/players/a-b_c"),"/players/[detail]");
 assert.equal(safeDestination("/kingdom-intelligence"),"/kingdom-intelligence");
 assert.equal(safeDestination("/"),"/");
});
test("historical raw click targets, metadata and session keys are stripped",()=>{
 const row=required(event(1,"click","/lobby","2026-10-25T12:00:00Z",{
  journeySessionId:"sessionTEST_12345678",targetTag:"button",targetLabel:"password 123",
  href:"/wallet?privateKey=real",secret:"top-secret"
 },"Typed a sensitive secret"));
 assert.equal(row.label,"Button click");
 assert.equal(row.destination,"/lobby");
 assert.equal(event(8,"click","/admin/wallet",instant(0)),null);
 assert.equal(event(9,"page_view","/market/invoices/private",instant(0)),null);
 const published=JSON.stringify(publicEvent(row));
 for(const secret of ["sessionTEST","password","privateKey","top-secret","Typed a sensitive secret"])
  assert.ok(!published.includes(secret));
 assert.ok(!("session" in publicEvent(row)));
});
test("one event produces unknown dwell not invented zero duration",()=>{
 const r=summarizeUser([required(event(1,"page_view","/lobby",instant(0)))],false);
 assert.equal(r.estimatedActiveSeconds,null);
 assert.equal(r.estimateConfidence,"Unknown");
 assert.equal(r.views,1);
 assert.equal(r.clicks,0);
 assert.equal(r.returning,false);
});
test("session split and capped gap do not count a long idle as dwell",()=>{
 const rows=[
  required(event(1,"page_view","/lobby",instant(0),{journeySessionId:"sameSession_1"})),
  required(event(2,"click","/lobby",instant(1),{journeySessionId:"sameSession_1"})),
  required(event(3,"page_view","/leaderboard",instant(29),{journeySessionId:"different_2"})),
 ];
 const r=summarizeUser(rows,false);
 assert.equal(r.estimatedActiveSeconds,60);
 assert.equal(r.sessions,2);
 assert.equal(r.lastPath,"/leaderboard");
 assert.equal(r.previousPath,"/lobby");
});
test("second UTC visit date is observed return and clipped one-day is UNKNOWN",()=>{
 const a=required(event(1,"page_view","/lobby","2026-10-24T00:00:00Z"));
 const b=required(event(2,"page_view","/lobby","2026-10-25T00:00:00Z"));
 assert.equal(summarizeUser([a,b],true).returning,true);
 assert.equal(summarizeUser([b],true).returning,null);
});
test("cohort aggregate displays ONLY selected users, not whole-site counts",()=>{
 const x=required(event(1,"page_view","/lobby",instant(0)));
 const y=required(event(2,"page_view","/leaderboard",instant(1)));
 const r=aggregateCohort([
  {uid:"user1",events:[x,y],truncated:false},
  {uid:"user2",events:[],truncated:false}
 ],new Date("2026-10-25T13:00:00Z"),7);
 assert.equal(r.cohortUsers,2);
 assert.equal(r.views,2);
 assert.deepEqual(r.transitions,[{label:"/lobby → /leaderboard",count:1}]);
 assert.equal(r.scope,"PAGINATED_USER_COHORT_ONLY");
 assert.equal(r.daily[0].visitors,1);
 assert.equal(r.dwellUserSamples,1);
});
test("missing, malformed and non-journey events do not fabricate history",()=>{
 assert.equal(event(1,"scroll","/players",instant(0)),null);
 assert.equal(event(1,"page_view","/players","nonsense"),null);
 assert.equal(safeDestination("/players/id?email=test"),"Protected / unclassified");
 const row=required(event(2,"page_view","/players/a",instant(0)));
 assert.equal(row.destination,"/players/[detail]");
 assert.equal(JSON.stringify(publicEvent(row)).includes("/players/a"),false);
});
