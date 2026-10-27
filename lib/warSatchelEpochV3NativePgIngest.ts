/**
 * Phase7 HD native-to-PG bridge (held).
 * There is NO Go epochescrow verify CLI or independent signer in Wolo #115.
 * Therefore finance activation stays compile-time FALSE and NO production
 * API imports this module. This is the implementation contract for the
 * independently reviewed native Comet/ICS23 verifier Codex must supply.
 *
 * Do not accept an HTTP response, externally signed JSON, or a prebuilt
 * VerifiedEvidence object as financial authority.
 */
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import path from "node:path";

export const EPOCH_V3_NATIVE_PG_FINANCIAL_ENABLED = false as const;
export const EPOCH_V3_NATIVE_SOURCE_PIN="ae9f0277b58f2288e7b1fc25b03eef2a30271577" as const;
const HEX64=/^[a-f0-9]{64}$/,TX=/^[A-F0-9]{64}$/,UID=/^[a-zA-Z0-9_.:-]{1,100}$/;
const LEGACY_BINARIES=new Set([
 "4b77f622191db7550cb87cafb8f1886a0aadebee3eb6565f9f90036f809e61d3",
 "040126a2884946caf1651a50b7d8115c5a6fb2d5aa94fcbbe150694602d451a5"
]);
function hold(reason:string):never{throw Error("EPOCH_V3_NATIVE_INGEST_HOLD:"+reason);}
type Queryable={query:(sql:string,params?:unknown[])=>Promise<{rows:Record<string,unknown>[]}>};
export type NativeVerifierInstall=Readonly<{
 binaryPath:string; binarySha256:string; trustAnchorSha256:string;
 observedWoloSource:string; expectedEpoch:string; expectedOwnerUid:string;
 expectedTxHash:string; expectedMessageIndex:0;
}>;
type NativeVerdict=Record<string,unknown>;
function account(a:unknown,role:string,h:number,block:string,app:string){
 if(!a||typeof a!=="object"||Array.isArray(a))hold("missing_"+role+"_bank");
 const v=a as Record<string,unknown>;
 if(v.account_role!==role||v.bank_state_height!==h||
 v.bank_commit_height!==h+1||v.block_sha256!==block||
 v.app_sha256!==app||!v.proof_sha256||!HEX64.test(String(v.proof_sha256)))
 hold("bank_root_mismatch_"+role);
 for(const k of ["bank_balance_uwolo","liabilities_uwolo",
   "maximum_unknown_outflow_uwolo","gas_uwolo","operating_floor_uwolo"]){
  if(typeof v[k]!=="string"||!/^(0|[1-9][0-9]{0,38})$/.test(v[k] as string))
   hold("noncanonical_"+role+"_"+k);
 }
 const total=BigInt(v.liabilities_uwolo as string)+
 BigInt(v.maximum_unknown_outflow_uwolo as string)+BigInt(v.gas_uwolo as string)+
 BigInt(v.operating_floor_uwolo as string);
 if(BigInt(v.bank_balance_uwolo as string)<total)hold("reserve_deficit_"+role);
 return v;
}
function validateVerifiedOutput(o:unknown,cfg:NativeVerifierInstall,rawSha:string){
 if(!o||typeof o!=="object"||Array.isArray(o))hold("invalid_native_verdict");
 const v=o as NativeVerdict;
 if(v.protocol!=="aoe2war/escrow-epoch/v3"||
 v.native_verdict!=="COMET_ICS23_NATIVE_VERIFIED"||
 v.legacy_payment_authorized!==false||
 v.chain_id!=="wolo-1"||v.denom!=="uwolo"||
 v.epoch_id!==cfg.expectedEpoch||v.owner_uid!==cfg.expectedOwnerUid||
 v.tx_hash!==cfg.expectedTxHash||v.message_index!==0||
 v.native_verifier_source!==cfg.observedWoloSource||
 v.native_verifier_binary_sha256!==cfg.binarySha256||
 v.trust_anchor_sha256!==cfg.trustAnchorSha256||
 v.raw_proof_bundle_sha256!==rawSha||v.owner_mandate_authenticated!==true)
 hold("native_evidence_identity_or_owner_not_verified");
 const h=v.bank_state_height,commit=v.bank_commit_height;
 if(typeof h!=="number"||typeof commit!=="number"||
 !Number.isSafeInteger(h)||!Number.isSafeInteger(commit)||
 Number(commit)!==Number(h)+1||!Number.isSafeInteger(v.funding_height)||
 Number(h)<Number(v.funding_height)+2||
 typeof v.block_sha256!=="string"||!TX.test(v.block_sha256)||
 typeof v.app_sha256!=="string"||!TX.test(v.app_sha256))
 hold("BANK_PROOF_STALE");
 const now=Date.now(),observed=Date.parse(String(v.observed_at)),expires=Date.parse(String(v.expires_at));
 if(!Number.isFinite(observed)||!Number.isFinite(expires)||
 observed>now||expires<=now||expires-observed>120000)
 hold("BANK_PROOF_STALE");
 if(!["deposit","wager_funding","escrow_return","withdrawal","fee"].includes(String(v.purpose))||
 !UID.test(String(v.owner_uid))||typeof v.sender!=="string"||
 typeof v.recipient!=="string"||typeof v.memo!=="string"||
 !/^[1-9][0-9]{0,37}$/.test(String(v.amount_uwolo))||
 !HEX64.test(String(v.proof_sha256))||
 !HEX64.test(String(v.verification_record_sha256))||
 (typeof v.funding_height!=="number"||!Number.isSafeInteger(v.funding_height))||Number(v.funding_height)<=0)
 hold("invalid_native_transfer_identity");
 const vault=account(v.vault_bank,"vault",h as number,String(v.block_sha256),String(v.app_sha256));
 const escrow=account(v.escrow_bank,"escrow",h as number,String(v.block_sha256),String(v.app_sha256));
 if(v.vault_address!==vault.account||v.escrow_address!==escrow.account||
 v.vault_address===v.escrow_address)hold("signer_or_account_collision");
 if((v.purpose==="wager_funding"&&
 (v.sender!==v.vault_address||v.recipient!==v.escrow_address))||
 (v.purpose==="escrow_return"&&
 (v.sender!==v.escrow_address||v.recipient!==v.vault_address)))
 hold("native_effect_wrong_account");
 return {v,vault,escrow};
}
function assertPinnedVerifier(cfg:NativeVerifierInstall){
 if(!path.isAbsolute(cfg.binaryPath)||cfg.binaryPath.includes("/tmp/")||
 cfg.observedWoloSource!==EPOCH_V3_NATIVE_SOURCE_PIN||
 !HEX64.test(cfg.binarySha256)||LEGACY_BINARIES.has(cfg.binarySha256)||
 !HEX64.test(cfg.trustAnchorSha256)||!TX.test(cfg.expectedTxHash)||
 !UID.test(cfg.expectedOwnerUid)||cfg.expectedMessageIndex!==0)
 hold("unqualified_native_verifier_config");
 let st;
 try{st=lstatSync(cfg.binaryPath)}catch{hold("NEW_ESCROW_NATIVE_VERIFIER_ABSENT");}
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o022)!==0)
 hold("native_verifier_not_root_owned_or_writable");
 const actual=createHash("sha256").update(readFileSync(cfg.binaryPath)).digest("hex");
 if(actual!==cfg.binarySha256)hold("native_verifier_digest_mismatch");
}
export async function ingestNativeVerifiedV3Receipt(
 cfg:NativeVerifierInstall, portableProofRawUtf8:string,
 writer:Queryable,
):Promise<Readonly<{physicalReceipt:string;status:"PERSISTED_UNCREDITED"}>>{
 // This gate can only change through a new independently reviewed source SHA
 // after Codex publishes a *real* portable native proof-verification executable
 // and live owner, source/binary, bank, writer-fence and role enrollment.
 if(!EPOCH_V3_NATIVE_PG_FINANCIAL_ENABLED)hold("NEW_ESCROW_NATIVE_VERIFIER_ABSENT");
 assertPinnedVerifier(cfg);
 if(typeof portableProofRawUtf8!=="string"||portableProofRawUtf8.length>512*1024)
 hold("native_proof_bundle_unbounded");
 const rawSha=createHash("sha256").update(portableProofRawUtf8,"utf8").digest("hex");
 const proc=spawnSync(cfg.binaryPath,["--verify-epoch-v3-portable-proof","--json-stdin"],{
  input:portableProofRawUtf8,encoding:"utf8",timeout:5000,maxBuffer:256*1024,
  cwd:"/",env:{PATH:"/usr/bin:/bin",HOME:"/nonexistent"}
 });
 if(proc.error||proc.status!==0||!proc.stdout||!proc.stdout.trim())
 hold("native_go_verifier_rejected_proofs");
 let output:unknown;
 try{output=JSON.parse(proc.stdout)}catch{hold("native_verifier_invalid_wire");}
 const {v,vault,escrow}=validateVerifiedOutput(output,cfg,rawSha);
 await writer.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
 try{
  const identity=(await writer.query("SELECT current_user AS role")).rows[0]?.role;
  if(identity!=="epoch_v3_proof_writer")hold("independent_native_proof_role_not_enrolled");
  const check=await writer.query("SELECT vault_address,escrow_address FROM epoch_v3.epochs WHERE epoch_id=$1",
   [cfg.expectedEpoch]);
  if(check.rows.length!==1||check.rows[0].vault_address!==v.vault_address||
     check.rows[0].escrow_address!==v.escrow_address)hold("epoch_account_mismatch");
  await writer.query("INSERT INTO epoch_v3.receipts (chain_id,tx_hash,message_index,epoch_id,owner_uid,kind,sender,recipient,memo,amount_uwolo,chain_height,native_proof_sha256,proof_verified_at,chain_time) VALUES ('wolo-1',$1,0,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
   [v.tx_hash,cfg.expectedEpoch,v.owner_uid,v.purpose,v.sender,v.recipient,v.memo,v.amount_uwolo,v.funding_height,v.proof_sha256,v.observed_at,v.chain_time]);
  await writer.query("INSERT INTO epoch_v3.native_proof_certificates (chain_id,tx_hash,message_index,epoch_id,owner_uid,purpose,denom,sender,recipient,memo,amount_uwolo,funding_height,bank_state_height,bank_commit_height,root_app_sha256,root_block_sha256,vault_account,escrow_account,vault_bank_balance_uwolo,escrow_bank_balance_uwolo,proof_sha256,native_verifier_source,native_verifier_binary_sha256,trust_anchor_sha256,verification_record_sha256,observed_at,expires_at,issuer_provenance) VALUES ('wolo-1',$1,0,$2,$3,$4,'uwolo',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)",
   [v.tx_hash,cfg.expectedEpoch,v.owner_uid,v.purpose,v.sender,v.recipient,v.memo,v.amount_uwolo,v.funding_height,v.bank_state_height,v.bank_commit_height,v.app_sha256,v.block_sha256,v.vault_address,v.escrow_address,vault.bank_balance_uwolo,escrow.bank_balance_uwolo,v.proof_sha256,cfg.observedWoloSource,cfg.binarySha256,cfg.trustAnchorSha256,v.verification_record_sha256,v.observed_at,v.expires_at,"root-owned-native-go-verifier"]);
  for(const b of [vault,escrow]){
   await writer.query("INSERT INTO epoch_v3.native_account_reserve_evidence (epoch_id,account_role,chain_id,bank_state_height,bank_commit_height,block_sha256,app_sha256,bank_balance_uwolo,liabilities_uwolo,maximum_unknown_outflow_uwolo,gas_uwolo,operating_floor_uwolo,inventory_sha256,nonoverlap_sha256,proof_sha256,observed_at,expires_at) VALUES ($1,$2,'wolo-1',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT DO NOTHING",
    [cfg.expectedEpoch,b.account_role,b.bank_state_height,b.bank_commit_height,b.block_sha256,b.app_sha256,b.bank_balance_uwolo,b.liabilities_uwolo,b.maximum_unknown_outflow_uwolo,b.gas_uwolo,b.operating_floor_uwolo,b.inventory_sha256,b.nonoverlap_sha256,b.proof_sha256,v.observed_at,v.expires_at]);
  }
  await writer.query("COMMIT");
  return Object.freeze({physicalReceipt:"wolo-1:"+cfg.expectedTxHash+":0",status:"PERSISTED_UNCREDITED" as const});
 }catch(e){await writer.query("ROLLBACK");throw e;}
}
