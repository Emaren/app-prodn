/** UI-only, bounded projection of a C-authenticated, server-admitted transfer.
 * It never authenticates receipts. That belongs to independent C/E/D ingress.
 * An absent verifier or source/receiver proof must be represented as null.
 */
export const TRANSFER_STEPS = [
  "DISCOVER","SNAPSHOT","COMPRESS","AGE ENCRYPT","TRANSFER","READBACK","ISOLATED RESTORE"
] as const;
export type TransferStep = typeof TRANSFER_STEPS[number];
export type HostAlias="mac"|"hel1-root"|"hel1-volume-105319120"|"intel";
export type CohortState="UNKNOWN"|"WAITING"|"ACTIVE"|"VERIFIED"|"HOLD";
export type TransferSample={at:string;bytesSent:number};
export type ReclaimProof={bytes:number;filesystem:"APFS"|"EXT4"|"OTHER";observedAt:string;approvedOriginal:boolean};
export type TransferCohort={
 id:string;label:string;campaignId:string;
 source:Exclude<HostAlias,"intel">;destination:"intel";protectedLevel:1|2|3|4|5;
 originalBytes:number|null;compressedBytes:number|null;codec:string|null;
 ciphertextBytes:number|null;ciphertextSha256:string|null;
 ageRecipientFingerprint:string|null;
 bytesSent:number|null;bytesReadback:number|null;
 stage:Partial<Record<TransferStep,CohortState>>;
 samples:TransferSample[];
 sourceObservedAt:string|null;receiverObservedAt:string|null;expiresAt:string|null;
 senderAuthenticated:boolean;receiverAuthenticated:boolean;
 sourceHashMatched:boolean;receiverReadbackMatched:boolean;
 independentRestore:{verified:boolean;failureDomainId:string|null;observedAt:string|null}|null;
 sourceReclaim:ReclaimProof|null;receiptDigest:string|null;
};
export type TransferPublication={
 schema:"aoe2war.storage-transfer.admitted-publication.v1";
 campaignId:string;observedAt:string;expiresAt:string;
 issuer:"C_NATIVE_SENDER_RECEIVER_VERIFIER";
 cohorts:TransferCohort[];
 intelFreeBytes:number|null;intelReserveBytes:number|null;
};
export type TransferReadModel={
 status:"UNKNOWN"|"STALE"|"VERIFIED";campaignId:string|null;
 cohorts:TransferCohort[];
 verifiedArchives:number|null;independentRestores:number|null;
 transferredBytes:number|null;readbackBytes:number|null;reclaimedBytes:number|null;
 intelFreeBytes:number|null;intelReserveBytes:number|null;
};

const ALIAS=/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
const SHA=/^[a-f0-9]{64}$/;
function safeBytes(n:unknown):n is number{return typeof n==="number"&&Number.isSafeInteger(n)&&n>=0;}
function recent(t:string|null,now:number,windowMs=15*60_000){
 if(!t)return false;
 const stamp=Date.parse(t);
 return Number.isFinite(stamp)&&stamp<=now+60_000&&now-stamp<=windowMs;
}
function cleanCohort(c:TransferCohort,now:number):boolean{
 if(!c||typeof c!=="object"||typeof c.id!=="string"||typeof c.campaignId!=="string"||
 typeof c.label!=="string"||!c.stage||typeof c.stage!=="object"||
 !ALIAS.test(c.id)||!ALIAS.test(c.campaignId)||!ALIAS.test(c.label.replace(/ /g,"_"))||
 c.destination!=="intel"||!["mac","hel1-root","hel1-volume-105319120"].includes(c.source)||
 ![1,2,3,4,5].includes(c.protectedLevel)||!Array.isArray(c.samples)||c.samples.length>32||
 !c.senderAuthenticated||!c.receiverAuthenticated||
 !recent(c.sourceObservedAt,now)||!recent(c.receiverObservedAt,now)||
 !c.expiresAt||Date.parse(c.expiresAt)<=now)return false;
 if(c.originalBytes!==null&&!safeBytes(c.originalBytes))return false;
 for(const v of [c.compressedBytes,c.ciphertextBytes,c.bytesSent,c.bytesReadback]){
  if(v!==null&&!safeBytes(v))return false;
 }
 if(c.samples.some((x)=>!x||typeof x!=="object"||!safeBytes(x.bytesSent)||
 !Number.isFinite(Date.parse(x.at))))return false;
 if(Object.entries(c.stage).some(([step,state])=>!TRANSFER_STEPS.includes(step as TransferStep)||
 !["UNKNOWN","WAITING","ACTIVE","VERIFIED","HOLD"].includes(state)))return false;
 if(c.bytesSent!==null&&c.ciphertextBytes!==null&&c.bytesSent>c.ciphertextBytes)return false;
 if(c.bytesReadback!==null&&c.bytesSent!==null&&c.bytesReadback>c.bytesSent)return false;
 if(c.ciphertextSha256!==null&&!SHA.test(c.ciphertextSha256))return false;
 if(!c.sourceHashMatched||!c.receiverReadbackMatched) {
  // Partial cohorts are still visible, but cannot claim readback/restore.
  if(c.stage["READBACK"]==="VERIFIED"||c.stage["ISOLATED RESTORE"]==="VERIFIED")return false;
 }
 if(c.independentRestore?.verified&&!c.independentRestore.failureDomainId)return false;
 if(c.sourceReclaim&&(!safeBytes(c.sourceReclaim.bytes)||
   !c.sourceReclaim.approvedOriginal||!c.independentRestore?.verified))return false;
 return true;
}
export function projectTransferPublication(raw:TransferPublication|null, now=new Date()):TransferReadModel {
 const empty:TransferReadModel={status:"UNKNOWN",campaignId:null,cohorts:[],
  verifiedArchives:null,independentRestores:null,transferredBytes:null,
  readbackBytes:null,reclaimedBytes:null,intelFreeBytes:null,intelReserveBytes:null};
 if(!raw||raw.schema!=="aoe2war.storage-transfer.admitted-publication.v1"||
 raw.issuer!=="C_NATIVE_SENDER_RECEIVER_VERIFIER"||typeof raw.campaignId!=="string"||
 !ALIAS.test(raw.campaignId)||!Array.isArray(raw.cohorts)||
 raw.cohorts.length>24||typeof raw.observedAt!=="string"||
 typeof raw.expiresAt!=="string")return empty;
 if(!recent(raw.observedAt,now.getTime())||Date.parse(raw.expiresAt)<=now.getTime())
  return {...empty,status:"STALE"};
 const seen=new Set<string>();
 const cohorts:TransferCohort[]=[];
 for(const cohort of raw.cohorts){
  if(seen.has(cohort.id)||cohort.campaignId!==raw.campaignId||
   !cleanCohort(cohort,now.getTime()))return empty;
  seen.add(cohort.id);cohorts.push(cohort);
 }
 const sum=(get:(c:TransferCohort)=>number|null):number|null=>{
  if(!cohorts.length)return null;
  const values=cohorts.map(get);
  if(values.some(v=>v===null))return null;
  const total=values.reduce<number>((a,b)=>a+(b||0),0);
  return Number.isSafeInteger(total)?total:null;
 };
 return {status:"VERIFIED",campaignId:raw.campaignId,cohorts,
  verifiedArchives:cohorts.filter(c=>c.sourceHashMatched&&c.receiverReadbackMatched).length,
  independentRestores:cohorts.filter(c=>c.independentRestore?.verified&&c.sourceHashMatched&&c.receiverReadbackMatched).length,
  transferredBytes:sum(c=>c.bytesSent),
  readbackBytes:sum(c=>c.bytesReadback),
  reclaimedBytes:sum(c=>c.sourceReclaim?.bytes??null),
  intelFreeBytes:safeBytes(raw.intelFreeBytes)?raw.intelFreeBytes:null,
  intelReserveBytes:safeBytes(raw.intelReserveBytes)?raw.intelReserveBytes:null};
}
/** ETA is only displayed with known ciphertext total, >=3 fresh strictly
 * monotonic sender samples, and a nonzero stable rolling rate.
 * Loss of monotonic sequence, inactivity, or rate variance => MEASURING.
 */
export function measuredProgress(c:TransferCohort,now=new Date()):{
 percent:number|null;bytesPerSecond:number|null;etaSeconds:number|null;label:string
}{
 const unknown={percent:null,bytesPerSecond:null,etaSeconds:null,label:"UNMEASURED"};
 if(!safeBytes(c.ciphertextBytes)||!c.ciphertextBytes||!safeBytes(c.bytesSent)||
 c.bytesSent>c.ciphertextBytes)return unknown;
 const percent=100*c.bytesSent/c.ciphertextBytes;
 const base={percent,bytesPerSecond:null,etaSeconds:null,label:"MEASURING"};
 if(c.samples.length<3)return base;
 const latest=c.samples.slice(-5);
 let rates:number[]=[];
 for(let i=1;i<latest.length;i++){
  const prev=latest[i-1],next=latest[i];
  const dt=(Date.parse(next.at)-Date.parse(prev.at))/1000;
  if(!Number.isFinite(dt)||dt<5||dt>90||!safeBytes(prev.bytesSent)||
  !safeBytes(next.bytesSent)||next.bytesSent<=prev.bytesSent)return base;
  rates.push((next.bytesSent-prev.bytesSent)/dt);
 }
 const last=latest[latest.length-1];
 if(!recent(last.at,now.getTime(),90_000)||last.bytesSent!==c.bytesSent)return base;
 const rate=rates.reduce((a,b)=>a+b,0)/rates.length;
 if(rate<=0||!Number.isFinite(rate)||
  rates.some(r=>Math.abs(r-rate)>rate*.5))return base;
 const remain=c.ciphertextBytes-c.bytesSent;
 const eta=remain/rate;
 if(!Number.isFinite(eta)||eta>30*24*3600)return base;
 return {percent,bytesPerSecond:rate,etaSeconds:Math.ceil(eta),label:remain===0?"COMPLETE":"ESTIMATED"};
}
export function byteLabel(n:number|null|undefined):string {
 if(n===null||n===undefined||!safeBytes(n))return "—";
 if(n<1024)return n+" B";
 const units=["B","KiB","MiB","GiB","TiB","PiB"];
 const power=Math.min(Math.floor(Math.log(n)/Math.log(1024)),units.length-1);
 return (n/1024**power).toFixed(2)+" "+units[power];
}
