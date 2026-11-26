import assert from "node:assert/strict";
import test from "node:test";
import {executeSocialDeliveryWrite} from "../lib/socialDeliveryWriterCore.mjs";
const input={targetUid:"bob",messageIds:[1,2]},sessionToken="T".repeat(64);
function harness(decision={status:200,body:{ok:true,updatedCount:2}},error){
 const calls=[];
 const pool={connect:async()=>({query:async(q,a)=>{
  calls.push([q,a]);if(q.startsWith("SELECT")){if(error)throw error;return {rows:[{decision}]};}
  return {rows:[]};},release(){}})};
 return {calls,run:(override={})=>executeSocialDeliveryWrite({pool,input,sessionToken,verifySession:async()=>"alice",...override})};
}
test("delivery uses fixed SQL actor and bounded observed IDs, commits actual count",async()=>{
 const h=harness();assert.deepEqual(await h.run(),{status:200,body:{ok:true,updatedCount:2}});
 assert.deepEqual(h.calls.find(([q])=>q.startsWith("SELECT"))[1],["alice","bob",[1,2]]);
 assert.equal(h.calls.at(-1)[0],"COMMIT");
 const zero=harness({status:200,body:{ok:true,updatedCount:0}});assert.equal((await zero.run()).body.updatedCount,0);
});
test("delivery refuses foreign supplied actor, duplicate/oversize/noninteger/self and unsigned requests before DB",async()=>{
 const h=harness();
 for(const [override,status] of [[{input:{...input,actorUid:"bob"}},400],[{input:{...input,messageIds:[1,1]}},400],[{input:{...input,messageIds:Array.from({length:51},(_,i)=>i+1)}},400],[{input:{...input,messageIds:[0]}},400],[{input:{...input,messageIds:[2147483648]}},400],[{input:{...input,targetUid:"alice"}},403],[{verifySession:async()=>{throw Error()}},401]])assert.equal((await h.run(override)).status,status);
 assert.equal(h.calls.length,0);
});
test("denial and bad decision roll back, serialization returns retryable status",async()=>{
 const denied=harness({status:403,body:{detail:"DIRECT_DELIVERY_DENIED"}});
 assert.equal((await denied.run()).status,403);assert.equal(denied.calls.at(-1)[0],"ROLLBACK");
 const bad=harness({status:200,body:{ok:true,updatedCount:3}});assert.equal((await bad.run()).status,503);assert.equal(bad.calls.at(-1)[0],"ROLLBACK");
 const race=harness(null,{code:"40001"});assert.equal((await race.run()).status,409);assert.equal(race.calls.at(-1)[0],"ROLLBACK");
});
