import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {classifyApiFixtureRequest,REAL_READONLY}=require("../scripts/renaissance_88_api_policy.cjs");
const base="http://127.0.0.1:3137";
const decide=(route,method="GET",db="REACHABLE")=>
  classifyApiFixtureRequest(base+route,method,base,db);
test("only explicitly audited exact public GET endpoints reach the local Next server",()=>{
 const known=["/api/deployment-version","/api/kingdom-route-census",
    "/api/kingdom-index","/api/players/generation"];
 assert.deepEqual([...REAL_READONLY],known);
 for(const p of known)assert.equal(decide(p),"LOCAL_AUDITED_READONLY");
 assert.equal(decide("/api/players/generation","GET","UNAVAILABLE"),"SYNTHETIC_UNAVAILABLE");
});
test("sensitive APIs, financial reads and header queue remain synthetic",()=>{
 for(const p of ["/api/header-summary","/api/traffic/public","/api/wolo/status",
  "/api/staking/summary","/api/market/invoices/publicId",
  "/api/admin/users","/api/radio/station","/api/bets",
  "/api/players/generation?token=secret","/api/kingdom-index?dirty=yes",
  "/api/kingdom-index/private","/api/user/online_users"]){
  assert.equal(decide(p),"SYNTHETIC_UNAVAILABLE",p);
 }
});
test("no method escalation, external egress, invalid URI or cross-origin API",()=>{
 assert.equal(decide("/api/deployment-version","POST"),"BLOCK_MUTATION");
 assert.equal(decide("/api/kingdom-index","DELETE"),"BLOCK_MUTATION");
 assert.equal(decide("/api/players/generation","HEAD"),"SYNTHETIC_UNAVAILABLE");
 assert.equal(classifyApiFixtureRequest("http://evil.invalid/api/deployment-version","GET",base,"REACHABLE"),"BLOCK_EXTERNAL");
 assert.equal(classifyApiFixtureRequest("not url","GET",base,"REACHABLE"),"BLOCK_UNPARSABLE");
 assert.equal(decide("/kingdom"),"NOT_API");
});
