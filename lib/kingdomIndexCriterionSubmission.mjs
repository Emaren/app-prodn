/**
 * Renaissance signed-criterion ingestion boundary. OFFLINE and NOT wired to
 * the public Kingdom Index: signature != independently demonstrated fact.
 * All signing keys, artifact inspection, exact candidate identity and durable
 * nonce storage must come from separately governed operator authorities.
 */
import { createHash, createPublicKey, verify } from "node:crypto";

export const SCHEMA="aoe2war.kingdom-index.signed-criteria.v1";
const HEX40=/^[a-f0-9]{40}$/, HEX64=/^[a-f0-9]{64}$/;
const URL=/^https:\/\/github\.com\/Emaren\/(?:app-prodn|api-prodn|aoe2-watcher|wolochain)\//;
const DIMENSIONS=["correctness","functionality","performance","maintainability","tests"];
const stop=m=>{throw Error("KINGDOM CRITERION STOP: "+m)};
const fields=(x,n,name)=>{
 if(!x||typeof x!=="object"||Array.isArray(x)||JSON.stringify(Object.keys(x).sort())!==JSON.stringify([...n].sort()))stop("Invalid "+name+" fields");
 return x;
};
const stamp=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s;
const str=(s,max=256)=>typeof s==="string"&&s.length>0&&s.length<=max;
const base64=b=>{
 if(typeof b!=="string"||b.length>180000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b))stop("Noncanonical base64");
 const raw=Buffer.from(b,"base64");if(raw.toString("base64")!==b)stop("Noncanonical base64 bytes");return raw;
};
function criteriaFromRubric(rubric){
 if(rubric?.maximum!==100||JSON.stringify(Object.keys(rubric.dimensions??{}))!==JSON.stringify(DIMENSIONS))stop("Rubric mismatch");
 const criteria=new Map();let full=0;
 for(const [dimension,entry] of Object.entries(rubric.dimensions)){
  if(!Array.isArray(entry.criteria)||!Number.isInteger(entry.weight))stop("Invalid rubric");
  let sum=0;
  for(const c of entry.criteria){
   if(!str(c.id)||!Number.isInteger(c.max)||c.max<=0||criteria.has(c.id))stop("Criterion contract mismatch");
   criteria.set(c.id,{dimension,max:c.max});sum+=c.max;
  }
  if(sum!==entry.weight)stop("Dimension weight mismatch");full+=sum;
 }
 if(criteria.size!==20||full!==100)stop("Rubric totals mismatch");
 return criteria;
}
function checkProof(p){
 fields(p,["url","sha256","kind","measuredAt","conditions"],"proof");
 if(!str(p.url,600)||!URL.test(p.url)||!HEX64.test(p.sha256)||
 !["source","ci","database","browser","performance","security","production"].includes(p.kind)||
 !stamp(p.measuredAt)||!str(p.conditions,500))stop("Invalid proof provenance");
 return p;
}
/**
 * A successful return is a verified SUBMISSION, never publication/certification.
 * ctx: { trustedKeys: Map<id,{pem:public PEM,actor:enrolled identity,routes:allowed exact routes}>, expected:{route,template,gitSha,
 * closureSha256,buildId,releaseSha256}, rubric, profile, nowMs,
 * verifyArtifact: async (proof,payload)=>true ONLY after content verification,
 * consumeNonce: async (namespace,nonce,digest)=>true ONLY for durable atomic first use;
 * (namespace,nonce) must be UNIQUE even if an attacker changes digest. }.
 */
export async function inspectSignedCriterionSubmission(envelope,ctx){
 if(!ctx||!(ctx.trustedKeys instanceof Map)||typeof ctx.verifyArtifact!=="function"||
 typeof ctx.consumeNonce!=="function"||!Number.isSafeInteger(ctx.nowMs))stop("Independent authorities absent");
 const expected=fields(ctx.expected,["route","template","gitSha","closureSha256","buildId","releaseSha256"],"expected");
 if(!str(expected.route,200)||!str(expected.template,300)||!HEX40.test(expected.gitSha)||
 !HEX64.test(expected.closureSha256)||!str(expected.buildId,128)||!HEX64.test(expected.releaseSha256))stop("Invalid independent source/build identity");
 fields(envelope,["schema","keyId","payloadBase64","signatureBase64"],"envelope");
 if(envelope.schema!==SCHEMA||!str(envelope.keyId,64))stop("Unsupported schema/key id");
 const signer=ctx.trustedKeys.get(envelope.keyId);
 if(!signer)stop("Untrusted key id");
 fields(signer,["pem","actor","routes"],"trusted signer enrollment");
 if(!str(signer.pem,16000)||!str(signer.actor,160)||
  !Array.isArray(signer.routes)||signer.routes.length===0||signer.routes.length>144||
  !signer.routes.every(r=>str(r,200)&&r.startsWith("/")&&!r.includes("?")&&!r.includes("#"))||
  new Set(signer.routes).size!==signer.routes.length)stop("Invalid trusted signer enrollment");
 if(!signer.routes.includes(expected.route))stop("Signer not authorized for this route");
 const payloadBytes=base64(envelope.payloadBase64),signature=base64(envelope.signatureBase64);
 if(payloadBytes.length<100||payloadBytes.length>128000||signature.length!==64)stop("Signature/payload bounds");
 let key;try{key=createPublicKey(signer.pem)}catch{stop("Invalid trusted public key")}
 if(key.asymmetricKeyType!=="ed25519"||!verify(null,payloadBytes,key,signature))stop("Signature authentication");
 // Canonical public-key identity, not a mutable key alias, is the replay namespace.
 const signerSha256=createHash("sha256").update(key.export({format:"der",type:"spki"})).digest("hex");
 let p;try{p=JSON.parse(payloadBytes.toString("utf8"))}catch{stop("Invalid signed JSON")}
 // Exact JSON.stringify form disallows duplicate keys and noncanonical spellings.
 if(JSON.stringify(p)!==payloadBytes.toString("utf8"))stop("Ambiguous signed JSON");
 fields(p,["schema","actor","nonce","issuedAt","expiresAt","source","criteria","gates"],"payload");
 if(p.schema!==SCHEMA||!str(p.actor,160)||!str(p.nonce,128)||!stamp(p.issuedAt)||!stamp(p.expiresAt))stop("Invalid signed metadata");
 if(p.actor!==signer.actor)stop("Signed actor does not match enrolled signer");
 const start=Date.parse(p.issuedAt),end=Date.parse(p.expiresAt);
 if(end<=start||end-start>30*60000||start>ctx.nowMs+60000||end<ctx.nowMs)stop("Expired/future receipt");
 fields(p.source,Object.keys(expected),"source");
 for(const k of Object.keys(expected))if(expected[k]!==p.source[k])stop("Source or deployed build mismatch: "+k);
 const required=criteriaFromRubric(ctx.rubric);
 if(!Array.isArray(p.criteria)||p.criteria.length!==20)stop("Every criterion must be measured; unknown is not zero");
 const scores=Object.fromEntries(DIMENSIONS.map(k=>[k,0]));
 const refs=[],usedCriteria=new Set();
 for(const row of p.criteria){
  fields(row,["id","dimension","earned","evidence"],"criterion");
  const c=required.get(row.id);
  if(!c||usedCriteria.has(row.id)||c.dimension!==row.dimension||
  !Number.isInteger(row.earned)||row.earned<0||row.earned>c.max||
  !Array.isArray(row.evidence)||row.evidence.length<1||row.evidence.length>8)stop("Invalid, missing or duplicate criterion evidence");
  usedCriteria.add(row.id);scores[row.dimension]+=row.earned;
  refs.push(...row.evidence.map(checkProof));
 }
 const obligations=ctx.profile?.gates;
 if(!Array.isArray(obligations)||!Array.isArray(p.gates)||p.gates.length!==obligations.length)stop("Incomplete route-specific gates");
 const gates=[],usedGates=new Set();
 for(const row of p.gates){
  fields(row,["id","result","evidence"],"gate");
  if(!obligations.some(g=>g.id===row.id)||usedGates.has(row.id)||
   !["pass","fail"].includes(row.result)||!Array.isArray(row.evidence)||
   row.evidence.length<1||row.evidence.length>8)stop("Unknown, repeated or unproved gate");
  usedGates.add(row.id);gates.push({id:row.id,result:row.result});
  refs.push(...row.evidence.map(checkProof));
 }
 if(refs.length>192)stop("Evidence limit exceeded");
 const uniques=new Set();
 for(const ref of refs){
  const evidenceIdentity=ref.sha256;
  if(uniques.has(evidenceIdentity))stop("Same proof bytes reused for unrelated criteria");
  uniques.add(evidenceIdentity);
  const at=Date.parse(ref.measuredAt);
  if(at>ctx.nowMs+60000||at<start-30*86400000)stop("Stale/future evidence");
  let independentlyValid=false;
  try{independentlyValid=(await ctx.verifyArtifact(ref,p))===true}catch{}
  if(!independentlyValid)stop("External evidence bytes were not independently verified");
 }
 const awarded=Object.values(scores).reduce((a,b)=>a+b,0);
 // A 100/100 is a separate independently authenticated certification event:
 // the provisional ingest path cannot make that assertion, even if signed.
 if(awarded===100)stop("100 requires independent production/browser certification");
 const evidenceSha256=createHash("sha256").update(payloadBytes).digest("hex");
 const namespace=signerSha256+":"+expected.gitSha+":"+expected.buildId;
 let accepted=false;
 try{accepted=(await ctx.consumeNonce(namespace,p.nonce,evidenceSha256))===true}catch{}
 if(!accepted)stop("Repeated or non-durable nonce");
 return Object.freeze({
  status:"VALIDATED_PROVISIONAL_SUBMISSION",
  evidenceSha256,actor:signer.actor,source:Object.freeze({...expected}),
  dimensions:Object.freeze({...scores}),score:awarded,
  gateResults:Object.freeze(gates.map(g=>Object.freeze({...g}))),
  specializedGatesPassed:gates.every(g=>g.result==="pass"),
  certified:false,current:false,
  limitations:"Only an offline evidence submission; separately audited source/runtime observers, key enrollment, artifact verifier, nonce store and release attestation remain required before public projection."
 });
}
