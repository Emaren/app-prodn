import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {EPOCH_V3_GO_WIRE_EXECUTION_ENABLED,
 buildHeldWoloV3RequestMessage,heldWoloV3Fingerprint
} from "../lib/warSatchelEpochV3GoWire.ts";
const epoch="epoch_20261026_scope_1",owner="wolo1"+"q".repeat(38),
vault="wolo1"+"p".repeat(38),escrow="wolo1"+"r".repeat(38);
const sha="a".repeat(64),tx="B".repeat(64),src="c".repeat(40);
const w=()=>({wager_id:1,market_id:77,ticket_id:200,leg_id:11,
 owner_uid:"warrior:alpha",side:"left",principal_uwolo:"100000000",
 funding_tx_hash:tx,funding_message_index:0});
const reserve=()=>({account:escrow,liabilities_uwolo:"100000000",
 maximum_unknown_outflow_uwolo:"100",gas_reserve_uwolo:"100",
 operating_floor_uwolo:"100",inventory_sha256:sha,nonoverlap_sha256:sha});
const req=()=>({
 bank_state_height:2001,bank_commit_height:2002,bank_commit_hash:tx,bank_app_hash:tx,
 protocol:"aoe2war/escrow-epoch/v3",command:"epoch.escrow.return.execute.v3",
 chain_id:"wolo-1",denom:"uwolo",epoch_id:epoch,
 operation_id:"satchel:e3:"+epoch+":entitlement:77:200:11:return",
 original_operation_id:"satchel:e3:"+epoch+":200",
 entitlement_id:"satchel:e3:"+epoch+":entitlement:77:200:11",
 owner_uid:"warrior:alpha",owner_wallet:owner,
 owner_public_key_hex:"02"+"a".repeat(64),original_mandate_sha256:sha,
 wager_id:1,ticket_id:200,market_id:77,leg_id:11,funding_tx_hash:tx,
 funding_message_index:0,sender:escrow,recipient:vault,amount_uwolo:"100000000",
 memo:"aoe2war/satchel/epoch-v3/"+epoch+"/return/satchel:e3:"+epoch+":entitlement:77:200:11",
 policy_sha256:sha,source_commit:src,binary_sha256:sha,config_sha256:sha,
 plan:{epoch_id:epoch,market_id:77,resolution:"left",wagers:[w()]},
 resolution_evidence_sha256:sha,vault_reserve:{...reserve(),account:vault},
 escrow_reserve:reserve(),nonce:sha,reviewer_permit_id:"permit_20261026",
 issued_at:1793069000,expires_at:1793069100,
 owner_signature:"synthetic-disallowed-as-authority",
 reviewer_signature:"synthetic-disallowed-as-authority"
});
test("Codex #115 ordered Go v3 RequestMessage domain has unsigned, non-money identity",()=>{
 const m=buildHeldWoloV3RequestMessage(req());
 const arr=JSON.parse(m.preimageUtf8);
 assert.equal(arr.length,2);
 assert.equal(arr[0],"aoe2war/escrow-epoch/v3");
 const r=arr[1];
 assert.deepEqual(Object.keys(r).slice(0,5),["bank_state_height","bank_commit_height","bank_commit_hash","bank_app_hash","protocol"]);
 assert.equal(r.owner_signature,"");assert.equal(r.reviewer_signature,"");
 assert.equal(r.plan.wagers[0].funding_message_index,0);
 assert.equal(r.vault_reserve.account,vault);
 assert.equal(r.escrow_reserve.account,escrow);
 assert.equal(m.executionAuthorized,false);
 assert.equal(EPOCH_V3_GO_WIRE_EXECUTION_ENABLED,false);
});
test("signature bytes are stable despite caller map order and signature contents",()=>{
 const a=req(),b=Object.fromEntries(Object.entries(a).reverse());
 b.owner_signature="X";b.reviewer_signature="Y";
 assert.equal(buildHeldWoloV3RequestMessage(a).preimageUtf8,
  buildHeldWoloV3RequestMessage(b).preimageUtf8);
 const m=buildHeldWoloV3RequestMessage(a);
 const expected=createHash("sha256").update(JSON.stringify([
  "aoe2war/escrow-epoch/v3",m.preimageUtf8]),"utf8").digest("hex");
 assert.equal(heldWoloV3Fingerprint(a),expected);
});
test("wrong old settlement domain and v1 claim ID/extra field are refused",()=>{
 for(const mutation of [
  {command:"/settlement/v1/runs"},{chain_id:"wolo-2"},
  {protocol:"aoe2war/satchel/claim-return/v1"}, {extra:"hidden"},
 ]){
  assert.throws(()=>buildHeldWoloV3RequestMessage({...req(),...mutation}),/EPOCH_V3_GO_WIRE_HOLD/);
 }
});
test("reject unsafe JS uint64, HTMLEscape and non-ASCII Go marshal mismatch",()=>{
 assert.throws(()=>buildHeldWoloV3RequestMessage({...req(),wager_id:Number.MAX_SAFE_INTEGER+1}),/unsafe_go_integer/);
 assert.throws(()=>buildHeldWoloV3RequestMessage({...req(),owner_uid:"<legacy>"}),/noncanonical_go_string/);
 assert.throws(()=>buildHeldWoloV3RequestMessage({...req(),owner_uid:"测试"}),/noncanonical_go_string/);
});
test("wager, reserve, plan require exactly the native Go fields",()=>{
 const a=req();
 assert.throws(()=>buildHeldWoloV3RequestMessage({...a,plan:{...a.plan,wagers:[]}}),/wager_count/);
 assert.throws(()=>buildHeldWoloV3RequestMessage({...a,escrow_reserve:{...a.escrow_reserve,nonce:"unsafe"}}),/missing_or_extra_reserve/);
 assert.throws(()=>buildHeldWoloV3RequestMessage({...a,plan:{...a.plan,wagers:[{...w(),status:"unknown"}]}}),/missing_or_extra_wager/);
});
test("same safe shape supports the separate native fee v3 domain, never old 8092",()=>{
 const a=req();const r={...a,command:"epoch.escrow.fee.execute.v3",
   operation_id:a.entitlement_id+":fee",recipient:"wolo1"+"s".repeat(38)};
 const m=buildHeldWoloV3RequestMessage(r);
 assert.match(m.preimageUtf8,/epoch\.escrow\.fee\.execute\.v3/);
 assert.equal(m.executionAuthorized,false);
 assert.doesNotMatch(m.preimageUtf8,/settlement\/v1\/runs/);
});
