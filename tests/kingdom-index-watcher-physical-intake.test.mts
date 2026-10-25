import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import companion from "../config/kingdom-index-companions.json" with {type:"json"};
import review from "../config/kingdom-index-watcher-166-source-review.json" with {type:"json"};
import {prepareWatcherPhysicalIntake} from "../scripts/kingdom_index_watcher_physical_intake.mjs";

const nowMs=Date.parse("2026-10-25T14:00:00.000Z");
const sha=s=>createHash("sha256").update(s).digest("hex");
const digests=new Map(["windows","macos","linux"].map(x=>[x,sha("published artifact "+x)]));
const base={companions:companion,review,expectedArtifactDigests:digests,nowMs};
const make=(gateId,platform,nonce)=>({
 gateId,platform,installedVersion:"1.6.5",
 releaseSourceSha:companion.companions[0].releaseSourceSha,
 releaseArtifactSha256:digests.get(platform),
 installedBinarySha256:sha("real installed executable is NOT supplied "+platform),
 collectedAt:"2026-10-25T13:30:00.000Z",
 proofSha256:sha(nonce),proofRef:"https://github.com/Emaren/aoe2-watcher/releases/tag/v1.6.5"
});
const run=(receipts,more={})=>prepareWatcherPhysicalIntake({...base,receipts,...more});
test("published desktop remains null, draft remains unreleased, nine specialized gates never invented",()=>{
 const report=run([]);
 assert.equal(report.publishedVersion,"1.6.5");
 assert.equal(report.candidateVersion,"1.6.6");
 assert.equal(report.candidateState,"DRAFT_UNRELEASED");
 assert.equal(report.publishedScore,null);
 assert.equal(report.certified,false);
 assert.equal(report.totalGates,9);
 assert.equal(report.verifiedGates,0);
 assert.equal(report.gates.length,9);
 for(const gate of report.gates){
  assert.equal(gate.status,"UNVERIFIED");
  assert.equal(gate.candidateCoverage,0);
  assert.deepEqual(gate.missingPlatforms,["windows","macos","linux"]);
 }
});
test("even all 27 synthetic platform claims across nine gates cannot certify",()=>{
 const records=companion.companions[0].gates.flatMap(g=>
  ["windows","macos","linux"].map(platform=>make(g.id,platform,g.id+":"+platform)));
 const report=run(records);
 assert.equal(report.gates.length,9);
 assert.equal(report.gates.every(g=>g.candidateCoverage===3&&g.missingPlatforms.length===0),true);
 assert.equal(report.publishedScore,null);
 assert.equal(report.verifiedGates,0);
 assert.equal(report.certified,false);
});
test("missing independently referenced published binary, wrong source, draft candidate, reused platform and fake score refuse",()=>{
 const x=make("source-and-release-drift","windows","one");
 assert.throws(()=>run([x],{expectedArtifactDigests:new Map()}),/independent published artifact/);
 assert.throws(()=>run([{...x,releaseArtifactSha256:sha("forged")}]),/independent published artifact/);
 assert.throws(()=>run([{...x,releaseSourceSha:"0".repeat(40)}]),/artifact\/source/);
 assert.throws(()=>run([{...x,installedVersion:"1.6.6"}]),/artifact\/source/);
 assert.throws(()=>run([x,x]),/Conflicting\/duplicated/);
 assert.throws(()=>run([{...x,score:100}]),/self-awarding/);
});
test("stale, future, foreign gate and missing signature-of-truth cannot turn physical claims green",()=>{
 const x=make("idle-cpu-memory-wakeups","linux","old");
 assert.throws(()=>run([{...x,collectedAt:"2026-10-20T13:00:00.000Z"}]),/stale/);
 assert.throws(()=>run([{...x,collectedAt:"2026-10-25T15:00:00.000Z"}]),/Future/);
 assert.throws(()=>run([{...x,gateId:"fabricated-score"}]),/malformed/);
 const y=structuredClone(review);y.candidateState="PUBLISHED";
 assert.throws(()=>run([],{review:y}),/authority drift/);
});
