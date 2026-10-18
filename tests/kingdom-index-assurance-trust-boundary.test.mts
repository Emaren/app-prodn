import assert from "node:assert/strict";
import test from "node:test";
import profiles from "../config/kingdom-index-assurance-profiles.json" with { type: "json" };
import catalog from "../config/kingdom-index-routes.json" with { type: "json" };
import { classifyPublicKingdomAuditStatus as status, publicObservedKingdomScore, isKingdomObservationStale } from "../lib/kingdomIndexAuditStatus.ts";
import { readFileSync } from "node:fs";

test("all public routes have an explicit, existing assurance profile",()=>{
  const hrefs = catalog.map(row=>row.href);
  assert.deepEqual(
    Object.keys(profiles.routeProfiles).sort(),
    [...hrefs].sort(),
  );
  for(const href of hrefs){
    const profile = profiles.routeProfiles[href];
    assert.ok(profiles.profiles[profile], href);
  }
});
test("risky finance, title, replay and media pages are not silently generic",()=>{
  for(const [href,expected] of Object.entries({
    "/leaderboard":"rankings",
    "/kingdom-bettors":"betting",
    "/market":"betting",
    "/war-chest":"betting",
    "/wolochain":"betting",
    "/kingdom-treasury":"betting",
    "/champions/legacy":"belts",
    "/bounties":"belts",
    "/library":"battlerecords",
    "/watch":"media",
    "/aoe2war-os":"release",
    "/kingdom-index":"index",
  })) assert.equal(profiles.routeProfiles[href],expected,href);
});
test("untrusted certificate claims cannot make any route appear certified",()=>{
  for(const kind of ["source-review","agent","certified"] as const){
    for(const versionAligned of [false,true]){
      for(const stale of [false,true]){
        const result = status({kind,versionAligned,stale});
        assert.notEqual(
          kind === "certified" ? result : "not-applicable",
          "current",
          "unverified claim incorrectly counted as certified"
        );
      }
    }
  }
  assert.equal(status({kind:"certified",versionAligned:true,stale:false}),"provisional");
  assert.equal(status({kind:"source-review",versionAligned:true,stale:false}),"provisional");
  assert.equal(status({kind:"agent",versionAligned:true,stale:false}),"current");
  assert.equal(status({kind:"certified",versionAligned:false,stale:false}),"drifted");
  assert.equal(status({kind:"certified",versionAligned:true,stale:true}),"stale");
  assert.equal(status({kind:null,versionAligned:true,stale:false}),"unmeasured");
});
test("public server entrypoint and display both use the fail-closed boundary",()=>{
  const source = readFileSync(new URL("../lib/kingdomIndex.ts",import.meta.url),"utf8");
  const ui = readFileSync(new URL("../components/kingdom-index/KingdomIndex.tsx",import.meta.url),"utf8");
  assert.match(source,/classifyPublicKingdomAuditStatus/);
  assert.match(source,/p\.status==="current"&&p\.kind==="certified"/);
  assert.match(ui,/CERTIFICATION CLAIM UNVERIFIED/);
  assert.ok(profiles.policy.includes("authenticated"));
});

test("live quality slot never recycles historical or asserted certified scores",()=>{
  assert.equal(publicObservedKingdomScore({status:"drifted",kind:"source-review",score:64}),null);
  assert.equal(publicObservedKingdomScore({status:"provisional",kind:"source-review",score:64}),null);
  assert.equal(publicObservedKingdomScore({status:"stale",kind:"agent",score:82}),null);
  assert.equal(publicObservedKingdomScore({status:"provisional",kind:"certified",score:100}),null);
  assert.equal(publicObservedKingdomScore({status:"current",kind:"agent",score:72}),72);
  assert.equal(publicObservedKingdomScore({status:"current",kind:"agent",score:100}),null);
  assert.equal(publicObservedKingdomScore({status:"current",kind:"agent",score:NaN}),null);
});

test("agent scores expire after fifteen minutes and future timestamps fail closed",()=>{
 const now=Date.parse("2026-10-18T20:00:00Z");
 assert.equal(isKingdomObservationStale({kind:"agent",checkedAtMs:now-14*60_000,nowMs:now}),false);
 assert.equal(isKingdomObservationStale({kind:"agent",checkedAtMs:now-16*60_000,nowMs:now}),true);
 assert.equal(isKingdomObservationStale({kind:"agent",checkedAtMs:now+6*60_000,nowMs:now}),true);
 assert.equal(isKingdomObservationStale({kind:"agent",checkedAtMs:null,nowMs:now}),true);
 assert.equal(isKingdomObservationStale({kind:"source-review",checkedAtMs:now-24*60*60_000,nowMs:now}),false);
});

test("specialized gate requirements are rendered as explicitly unverified proof obligations",()=>{
  const ui = readFileSync(new URL("../components/kingdom-index/KingdomIndex.tsx",import.meta.url),"utf8");
  assert.match(ui,/item\.specializedAssurance\.gates\.map\(/);
  assert.match(ui,/MANDATORY PROOF GATES/);
  assert.match(ui,/gate\.status\.toUpperCase\(\)/);
  assert.match(ui,/gate\.requirement/);
  assert.match(ui,/No gate counts as passed without authenticated source-bound evidence/);
  assert.doesNotMatch(ui,/specializedAssurance\.gates\.filter\([^\n]*=>[^\n]*"verified"/);
});
