import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {
 projectCentralSignedPulse,SIGNED_PULSE_PLANES,SIGNED_PULSE_TTL_MS,
} from "../lib/centralSignedPulse.ts";
import {
 readPrivateStorageVisual,signVisualPayloadForTests,
 type StorageVisualView,
} from "../lib/storageVisualPrivate.ts";

const NOW=Date.parse("2026-10-29T12:00:00.000Z");
const KEY="a".repeat(64);
const stamp=(n:number)=>new Date(n).toISOString();
const plain=(at:number,status:"RECEIPT"|"STALE"="RECEIPT"):StorageVisualView=>({
 authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",
 source:"SIGNED_PRIVATE_RECEIPT",
 planes:[{id:"mac",observedAt:stamp(at),status,coverage:"PARTIAL",hogs:[],events:[]}],
});

test("no receipt, missing plane or failed HMAC never invent a healthy observer",()=>{
 assert.deepEqual([...SIGNED_PULSE_PLANES],["mac","hel1-root","hel1-volume-105319120"]);
 const empty=projectCentralSignedPulse(null,NOW);
 assert.ok(empty.planes.every(p=>p.state==="UNKNOWN"&&p.reason==="NO_AUTHENTICATED_RECEIPT"));
 const partial=projectCentralSignedPulse(plain(NOW),NOW);
 assert.equal(partial.planes[0].state,"FRESH");
 assert.equal(partial.planes[0].reason,"SIGNED_OBSERVATION_WITHIN_36H");
 assert.deepEqual(partial.planes.slice(1).map(p=>p.reason),[
  "PLANE_NOT_IN_AUTHENTICATED_RECEIPT","PLANE_NOT_IN_AUTHENTICATED_RECEIPT",
 ]);
 const invalid=projectCentralSignedPulse(plain(NOW),NOW,true);
 assert.ok(invalid.planes.every(p=>p.state==="UNKNOWN"&&p.reason==="RECEIPT_INVALID_OR_UNREADABLE"));
 assert.equal(invalid.authority,"SIGNED_GROSS_STORAGE_OBSERVATION_ONLY_NOT_AGENT_LIVENESS");
});

test("36-hour TTL, replay clock and contradictory status fail closed",()=>{
 assert.equal(SIGNED_PULSE_TTL_MS,36*3600_000);
 const boundary=projectCentralSignedPulse(plain(NOW-SIGNED_PULSE_TTL_MS),NOW);
 assert.equal(boundary.planes[0].state,"FRESH");
 const old=projectCentralSignedPulse(plain(NOW-SIGNED_PULSE_TTL_MS-1,"STALE"),NOW);
 assert.equal(old.planes[0].state,"STALE");
 assert.equal(old.planes[0].reason,"SIGNED_OBSERVATION_EXPIRED_36H");
 assert.equal(old.planes[0].observedAt,stamp(NOW-SIGNED_PULSE_TTL_MS-1));
 assert.equal(projectCentralSignedPulse(plain(NOW-SIGNED_PULSE_TTL_MS-1),NOW).planes[0].state,"UNKNOWN");
 assert.equal(projectCentralSignedPulse(plain(NOW,"STALE"),NOW).planes[0].reason,"SOURCE_STATUS_CONTRADICTS_OBSERVATION");
 assert.equal(projectCentralSignedPulse(plain(NOW+60_001),NOW).planes[0].reason,"OBSERVATION_FUTURE_DATED");
 assert.equal(projectCentralSignedPulse(plain(NOW),Number.NaN).planes[0].state,"UNKNOWN");
 const bad=plain(NOW);
 bad.planes[0].observedAt="not-a-date";
 assert.equal(projectCentralSignedPulse(bad,NOW).planes[0].reason,"OBSERVATION_TIME_INVALID");
});

test("actual HMAC readback cannot renew stale producer observation with a fresh wrapper",async()=>{
 const root=mkdtempSync(path.join(tmpdir(),"central-signed-health-"));
 mkdirSync(path.join(root,"state"),{mode:0o700});
 const priorRoot=process.env.AOE2WAR_OS_STORE_DIR,priorKey=process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY;
 process.env.AOE2WAR_OS_STORE_DIR=root;
 process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY=KEY;
 try{
  const old=NOW-SIGNED_PULSE_TTL_MS-1;
  const payload={schema:"aoe2war.storage-visual.private.v1",
   generated_at:stamp(NOW),planes:[{
    id:"mac",observed_at:stamp(old),coverage:"PARTIAL",
    hogs:[],events:[],
   }]};
  const envelope={schema:"aoe2war.storage-visual.signed.v1",payload,
   signature_hmac_sha256:signVisualPayloadForTests(payload,KEY)};
  const file=path.join(root,"state","storage-visual.v1.json");
  writeFileSync(file,JSON.stringify(envelope)+"\n",{mode:0o600});
  const verified=await readPrivateStorageVisual(new Date(NOW));
  assert.equal(verified.source,"SIGNED_PRIVATE_RECEIPT");
  assert.equal(verified.planes[0].status,"STALE");
  assert.equal(projectCentralSignedPulse(verified,NOW).planes[0].state,"STALE");
  // Forged bytes fail the actual HMAC reader; Central must show UNKNOWN,
  // never keep a previous FRESH value or expose the parsing exception.
  writeFileSync(file,JSON.stringify({...envelope,payload:{...payload,generated_at:stamp(NOW+1)}})+"\n",{mode:0o600});
  await assert.rejects(readPrivateStorageVisual(new Date(NOW)),/VISUAL_SIGNATURE_INVALID/);
  const failed=projectCentralSignedPulse(null,NOW,true);
  assert.ok(failed.planes.every(x=>x.state==="UNKNOWN"));
 }finally{
  if(priorRoot===undefined)delete process.env.AOE2WAR_OS_STORE_DIR;
  else process.env.AOE2WAR_OS_STORE_DIR=priorRoot;
  if(priorKey===undefined)delete process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY;
  else process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY=priorKey;
  rmSync(root,{recursive:true,force:true});
 }
});

test("only the existing authenticated private reader drives Central freshness; no active repair API",()=>{
 const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const server=read("lib/centralCommandPrivate.ts");
 const page=read("components/central-command/CentralCommandView.tsx");
 const route=read("app/api/admin/central-command/route.ts");
 assert.match(server,/await readPrivateStorageVisual\(new Date\(signedReadClock\)\)/);
 assert.match(server,/projectCentralSignedPulse\(\s*signedView,signedReadClock,signedReadFailed/);
 assert.match(server,/signedReadFailed=true/);
 assert.doesNotMatch(server,/githubObservedAt.*signedStoragePulse/);
 assert.match(page,/Signed storage observation freshness/);
 assert.match(page,/FRESH means a signed observation within 36 hours, NOT a healthy observer/);
 assert.match(page,/state==="FRESH"\?"text-cyan-200"/);
 assert.doesNotMatch(route,/export async function (POST|PUT|PATCH|DELETE)/);
 assert.match(route,/requireAdmin\(request\)/);
 assert.match(route,/private, no-store, max-age=0/);
});
