import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const rail=readFileSync("components/storage-os/StorageTransportLaneStatus.tsx","utf8");
const page=readFileSync("components/storage-os/StorageHogWorkbench.tsx","utf8");
const steps=["SOURCE VERIFIED","DESTINATION VERIFIED","COPY AUTHORIZED","TRANSFERRED",
             "HASH VERIFIED","RESTORE VERIFIED","RETIREMENT ELIGIBLE"];
test("all seven ordered stages require independent evidence and are NOT ADMITTED",()=>{
 const names=[...rail.matchAll(/name:"([A-Z ]+)",/g)].map(m=>m[1]);
 assert.deepEqual(names,steps);
 assert.match(rail,/STEPS\.map\(/);
 assert.match(rail,/>NOT ADMITTED</);
 assert.doesNotMatch(rail,/\bREADY_FOR_DELETE\b|\bDELETE_APPROVED\b|\bEXECUTE\b/);
});
test("read-only transport view cannot write, upload, delete or invent receipts",()=>{
 assert.doesNotMatch(rail,/\bfetch\s*\(|XMLHttpRequest|FileReader|createObjectURL|method:"POST"|unlinkSync|rmSync/);
 assert.doesNotMatch(rail,/onClick|<button|<form|contentEditable/);
 assert.match(rail,/No per-object Transport OS transition receipts are admitted/);
 assert.match(rail,/A classification is owner intent, never a COPY AUTHORIZED receipt/);
});
test("existing four-plane Explorer drives the rail solely from admitted observations",()=>{
 assert.match(page,/import StorageTransportLaneStatus from "\.\/StorageTransportLaneStatus";/);
 assert.match(page,/<StorageTransportLaneStatus/);
 assert.match(page,/p\.source==="SIGNED_THREE_PLANE_RECEIPT"\|\|p\.source==="WE2_NATIVE_V2_SIGNED_PLANE"/);
 assert.doesNotMatch(page,/activeInventory\.status==="PARTIAL"\?"SIGNED_CAPACITY_ONLY"/);
 assert.match(page,/intel\?\.source==="SIGNED_PRIVATE_RECEIPT"&&intel\.health==="ONLINE"/);
 assert.match(page,/ownerLedgerVerified=\{ledgerStatus==="VERIFIED"&&!!access\?\.ownerBinding\}/);
});
test("source capacity observation cannot promote per-object transport state",()=>{
 assert.match(rail,/A verified source sample never authorizes a transfer/);
 assert.match(rail,/Vault capacity alone does not certify a transport destination/);
 assert.match(rail,/Status remains NOT ADMITTED, not FAILED or completed/);
});


test("five original transport lane IDs map to accountable bounded source/destinations",()=>{
  const ids=[...rail.matchAll(/id:"([a-z0-9-]+)",/g)].map(x=>x[1]);
  assert.deepEqual(ids,[
    "m1-to-hel1-operator",
    "m1-to-intel-factory-v2",
    "hel1-to-intel-old-recovery",
    "hel1-local-root-volume",
    "hel1-direct-intel",
  ]);
  for(const label of ["M1 development Mac","M1 original Factory ZIP cache",
    "HEL1 allowlisted completed historical migration dump",
    "HEL1 production ext4 root /dev/sda1","HEL1 generic historical source"]){
    assert.ok(rail.includes(label));
  }
  assert.match(rail,/Five existing Transport OS lane definitions/);
  assert.match(rail,/Source-class map from the existing M1 registry, NOT a production-authenticated lane-state feed/);
  assert.match(rail,/LIVE TRANSITION RECEIPTS · NOT ADMITTED/);
  assert.match(rail,/UNKNOWN \/ READ ONLY/);
});
test("M1 snapshot never becomes live transport, copied bytes or owner authority",()=>{
  assert.match(rail,/private source SNAPSHOT, not a Bridge-authenticated/);
  assert.match(rail,/Only stable ID\/source\/destination/);
  assert.match(rail,/No approved direct sender\/receiver class enrolled/);
  assert.match(rail,/no reuse of M1 sender credentials/);
  assert.doesNotMatch(rail,/source_succeeded:|transferred_bytes:|new_verified_reclaim_bytes:|copyAuthorized: true/);
});
