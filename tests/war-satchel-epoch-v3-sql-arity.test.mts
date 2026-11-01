import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Source-only, fail-closed contract for currently HELD native/PG adapter.
// No network, database, credential, native verifier, or finance activation.
const source=readFileSync(new URL("../lib/warSatchelEpochV3NativePgIngest.ts",import.meta.url),"utf8");
test("native epoch-v3 receipts and certificates bind every SQL placeholder exactly",()=>{
 const cases:[string,number][]=[["epoch_v3.receipts",12],["epoch_v3.native_proof_certificates",25]];
 for(const [table,count] of cases){
  const line=source.split("\n").find(x=>x.includes('await writer.query("INSERT INTO '+table+' '));
  assert.ok(line,"missing immutable native ingest insertion for "+table);
  const binding=line.match(/\$([0-9]+)/g)?.map(x=>Number(x.slice(1)))||[];
  assert.deepEqual([...new Set(binding)].sort((a,b)=>a-b),
   Array.from({length:count},(_,i)=>i+1),table+" placeholder sequence");
  const suffix=source.slice(source.indexOf(line)+line.length).split("\n",1)[0];
  const argsLine=source.split("\n")[source.split("\n").indexOf(line)+1];
  assert.ok(argsLine?.trim().startsWith("["),table+" supplied bindings missing");
  const argumentsList=argsLine.trim().slice(1,argsLine.trim().lastIndexOf("]")).split(",");
  assert.equal(argumentsList.length,count,table+" SQL binding count must match supplied values");
 }
 assert.match(source,/EPOCH_V3_NATIVE_PG_FINANCIAL_ENABLED = false/);
});
