import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign,createHash} from "node:crypto";
import {
 PROSPECTIVE_EPOCH_MAINNET_AUTHORIZED,PROSPECTIVE_EPOCH_REQUIRED_ROLES,
 prospectiveEpochSignBytes,reviewProspectiveEpoch,prospectiveDepositBoundaryIssue,
 type ProspectiveEpochManifest,
} from "../lib/warSatchelProspectiveEpoch.ts";

const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const vault="wolo1"+"q".repeat(38);
const base:ProspectiveEpochManifest={
 schema:"aoe2war.satchel.prospective-epoch.v1",chain_id:"wolo-1",
 epoch_id:"isolated_future_epoch",start_height:"3000000",
 start_app_hash:hash("future-root"),vault_address:vault,source_commit:hash("source"),
 legacy_claims_digest:hash("immutable"),legacy_liability_containment_digest:hash("held"),
 custody_segregation_digest:hash("new-vault"),hd_de_snapshot_digest:hash("snapshots"),
 created_at_utc:"2026-10-24T21:00:00.000Z",expires_at_utc:"2026-10-24T21:01:00.000Z",
};
function fixture(){
 const keys={} as Record<string,string>,privateKeys={} as Record<string,ReturnType<typeof generateKeyPairSync>["privateKey"]>;
 for(const role of PROSPECTIVE_EPOCH_REQUIRED_ROLES){
  const pair=generateKeyPairSync("ed25519");const der=pair.publicKey.export({format:"der",type:"spki"}) as Buffer;
  keys[role]=der.subarray(-32).toString("hex");privateKeys[role]=pair.privateKey;
 }
 function make(x=base){return PROSPECTIVE_EPOCH_REQUIRED_ROLES.map(role=>({
  role,signature_hex:sign(null,prospectiveEpochSignBytes(x),privateKeys[role]).toString("hex"),
 }))}
 return {keys,make};
}
const now=Date.parse("2026-10-24T21:00:30.000Z");
test("five distinct Ed25519 signatures structurally verify but NEVER authorize custody",()=>{
 const f=fixture();const review=reviewProspectiveEpoch({manifest:base,signatures:f.make(),
  trustedReviewerPublicKeys:f.keys,expectedSourceCommit:base.source_commit,
  expectedVault:vault,nowMs:now});
 assert.equal(review.status,"REVIEW_ONLY");
 assert.equal(review.startHeight,3000000n);
 assert.equal(PROSPECTIVE_EPOCH_MAINNET_AUTHORIZED,false);
 assert.equal(prospectiveDepositBoundaryIssue({reviewed:review,txHeight:3000001n,
  txVault:vault,bankHeight:3000003n,bankVault:vault}),"live_financial_epoch_hold");
});
test("reject changed chain root, signing scope, vault, timestamp and duplicate signer",()=>{
 const f=fixture(),go=(manifest:unknown,sigs:unknown,keys:unknown=f.keys)=>
  reviewProspectiveEpoch({manifest,signatures:sigs,trustedReviewerPublicKeys:keys,
    expectedSourceCommit:base.source_commit,expectedVault:vault,nowMs:now});
 assert.throws(()=>go({...base,start_app_hash:hash("other")},f.make()),/signature/);
 assert.throws(()=>go({...base,source_commit:hash("other")},f.make()),/untrusted_epoch/);
 assert.throws(()=>go({...base,vault_address:"wolo1"+"p".repeat(38)},f.make()),/untrusted_epoch/);
 assert.throws(()=>go({...base,expires_at_utc:"2026-10-24T21:00:20.000Z"},f.make()),/expired/);
 assert.throws(()=>go(base,[...f.make().slice(0,4),f.make()[0]]),/duplicate_or_unknown_role/);
 const duplicate={...f.keys,finance:f.keys.owner};
 assert.throws(()=>go(base,f.make(),duplicate),/duplicate_or_untrusted_review_key|signature/);
 assert.throws(()=>go({...base,extra:true},f.make()),/noncanonical_fields/);
 assert.throws(()=>go(base,[]),/five_distinct_reviews/);
});
