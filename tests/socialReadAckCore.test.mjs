import test from "node:test";
import assert from "node:assert/strict";
import {executeSocialReadAck as call} from "../lib/socialReadAckCore.mjs";
const input={targetUid:"Emaren",messageIds:[12,13]};
const good={status:200,body:{ok:true,updatedCount:2}};
function fixture({decision=good,commitError=false,rollbackError=false,actor="WarScribe",sqlError=null}={}){
 const events=[];const db={async query(q,p){events.push([q,p]);if(q.startsWith("SELECT")){if(sqlError)throw Object.assign(Error(),{code:sqlError});return {rows:[{decision}]};}if(q==="COMMIT"&&commitError)throw Error();if(q==="ROLLBACK"&&rollbackError)throw Error();},release(discard){events.push(["release",discard]);}};
 return {events,args:{pool:{connect:async()=>db},verifySession:async()=>actor,sessionToken:"x".repeat(40),input}};
}
test("authenticated recipient and exact message IDs, commit precedes success",async()=>{const {events,args}=fixture();assert.deepEqual(await call(args),good);assert.deepEqual(events.find(e=>e[0].startsWith("SELECT"))[1],["WarScribe","Emaren",[12,13]]);assert.deepEqual(events.slice(-2),[["COMMIT",undefined],["release",false]]);});
test("duplicate, invalid, extra actor, empty and oversized IDs rejected before DB",async()=>{for(const i of [{...input,messageIds:[12,12]},{...input,messageIds:[0]},{...input,actor:"admin"},{...input,messageIds:[]},{...input,messageIds:Array.from({length:51},(_,i)=>i+1)}]){const {events,args}=fixture();assert.equal((await call({...args,input:i})).status,400);assert.equal(events.length,0);}});
test("invalid session and self acknowledgement denied",async()=>{let f=fixture();assert.equal((await call({...f.args,sessionToken:"bad"})).status,401);assert.equal(f.events.length,0);f=fixture({actor:"Emaren"});assert.equal((await call(f.args)).status,403);assert.equal(f.events.length,0);});
test("foreign or nonexistent IDs denied by RPC, rollback",async()=>{const {events,args}=fixture({decision:{status:404,body:{detail:"DIRECT_READ_ACK_NOT_FOUND"}}});assert.equal((await call(args)).status,404);assert.ok(events.some(e=>e[0]==="ROLLBACK"));assert.ok(!events.some(e=>e[0]==="COMMIT"));});
test("repeat idempotent acknowledgement with zero updates accepted",async()=>{const {args}=fixture({decision:{status:200,body:{ok:true,updatedCount:0}}});assert.equal((await call(args)).body.updatedCount,0);});
test("impossible RPC count fails closed",async()=>{const {events,args}=fixture({decision:{status:200,body:{ok:true,updatedCount:3}}});assert.equal((await call(args)).status,503);assert.ok(!events.some(e=>e[0]==="COMMIT"));});
test("commit failure never returns success; failed rollback discards connection",async()=>{const {events,args}=fixture({commitError:true,rollbackError:true});assert.equal((await call(args)).status,503);assert.deepEqual(events.at(-1),["release",true]);});
test("serialization conflict is retryable",async()=>{const {args}=fixture({sqlError:"40001"});assert.equal((await call(args)).status,409);});
