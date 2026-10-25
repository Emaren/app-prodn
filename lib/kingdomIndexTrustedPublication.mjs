/**
 * Public read-side verifier for a separately approved Kingdom Index score.
 *
 * It cannot create a score, issue a signature, consume a nonce or trust an
 * operator-supplied GitHub URL. Two independently enrolled Ed25519 signers,
 * precommitted ingestion, exact deployed identity, and authenticated raw
 * artifact bytes are all mandatory. The caller must obtain the trust roots,
 * expected release identity, immutable nonce receipt and artifact inspector
 * from outside the publication file.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { requiredProofKindsForCriterion } from "./kingdomIndexCriterionProofPolicy.mjs";

export const PUBLICATION_SCHEMA = "aoe2war.kingdom-index.publication.v1";
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const KINDS=new Set(["source","ci","database","browser","performance","security","production"]);
const SOURCE=["route","template","gitSha","closureSha256","buildId","releaseSha256","assetsSha256"];
const PROOF=["url","sha256","kind","measuredAt","conditions"];
const CANONICAL_WEIGHTS=Object.freeze({
  correctness:30,functionality:25,performance:20,maintainability:15,tests:10,
});
const CANONICAL_CREDIT=Object.freeze({
  authoritative_data:10,business_invariants:8,failure_semantics:6,security_boundaries:6,
  critical_journeys:9,state_consistency:6,accessibility:5,responsive:5,
  measured_latency:7,bounded_data:5,render_efficiency:4,sustained_load:4,
  module_boundaries:5,dependency_visibility:4,documentation:3,safe_extension:3,
  domain_regressions:4,integration:3,browser:2,release_certification:1,
});
const INDEX_GATES=Object.freeze(["score-verification","source-closure","staleness"]);
const stop=(message)=>{throw new Error("KINGDOM PUBLICATION STOP: "+message);};
const hash=(bytes)=>createHash("sha256").update(bytes).digest("hex");
function fields(value,names,label){
  if(!value||typeof value!=="object"||Array.isArray(value)||
    JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...names].sort())) stop("Invalid "+label+" fields");
  return value;
}
function b64(value,max,label){
  if(typeof value!=="string"||value.length<4||value.length>max||!(/^[A-Za-z0-9+/]+={0,2}$/).test(value))
    stop("Invalid "+label+" encoding");
  const bytes=Buffer.from(value,"base64");
  if(bytes.toString("base64")!==value)stop("Noncanonical "+label);
  return bytes;
}
function date(s){
  if(typeof s!=="string"||!(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/).test(s))stop("Invalid timestamp");
  const ms=Date.parse(s);
  if(!Number.isSafeInteger(ms)||new Date(ms).toISOString()!==new Date(s).toISOString())stop("Invalid date");
  return ms;
}
function immutableSignedJson(root){
  // Reject asynchronous proof-inspector mutation of an already signed claim.
  // Bounded input (196 KiB) and iterative walk forbid inspector-controlled
  // changes to criterion points, source tuple or specialized gate verdicts.
  const stack=[root],visited=new Set();
  while(stack.length){
    const value=stack.pop();
    if(!value||typeof value!=="object"||visited.has(value))continue;
    if(visited.size>=4096)stop("Signed proof tree exceeds bounds");
    visited.add(value);
    for(const child of Object.values(value))if(child&&typeof child==="object")stack.push(child);
    Object.freeze(value);
  }
  return root;
}
function validateSource(s,expected){
  fields(s,SOURCE,"source");
  fields(expected,SOURCE,"independent deployed source");
  if(s.route!=="/kingdom-index"||s.template!=="app/kingdom-index/page.tsx"||
    !HEX40.test(s.gitSha)||!HEX64.test(s.closureSha256)||!HEX64.test(s.releaseSha256)||
    !HEX64.test(s.assetsSha256)||typeof s.buildId!=="string"||
    s.buildId.length<5||s.buildId.length>128)stop("Invalid source/build identity");
  for(const key of SOURCE)if(s[key]!==expected[key])stop("Deployed source or asset mismatch: "+key);
}
function proofObject(proof){
  fields(proof,PROOF,"artifact");
  if(typeof proof.url!=="string"||proof.url.length>600||
    !/^https:\/\/github\.com\/Emaren\/(?:app-prodn|api-prodn|aoe2-watcher|wolochain)\//.test(proof.url)||
    !HEX64.test(proof.sha256)||!KINDS.has(proof.kind)||
    typeof proof.conditions!=="string"||!proof.conditions||proof.conditions.length>500)
    stop("Invalid artifact provenance");
  date(proof.measuredAt);
  return proof;
}
/**
 * Checks a FULL 20-criterion, independently approved submission.
 * A validated non-100 score is PROVISIONAL, never CERTIFIED.
 *
 * ctx.trustedKeys: Map<id,{pem,role}> from out-of-band operator enrollment:
 * exactly one release signer and a DISTINCT independent reviewer.
 * ctx.isCommitted: read-only externally durable nonce/digest attestation.
 * ctx.verifyArtifact: separately authenticated raw artifact inspector.
 */
export async function verifyKingdomIndexPublication(envelope,ctx){
  if(!ctx||!(ctx.trustedKeys instanceof Map)||
    typeof ctx.verifyArtifact!=="function"||typeof ctx.isCommitted!=="function"||
    !Number.isSafeInteger(ctx.nowMs))stop("External read-only authorities absent");
  fields(envelope,["schema","payloadBase64","signatures"],"envelope");
  if(envelope.schema!==PUBLICATION_SCHEMA||!Array.isArray(envelope.signatures)||
    envelope.signatures.length!==2)stop("Missing dual attestation");
  const bytes=b64(envelope.payloadBase64,196608,"payload");
  let payload;
  try{payload=JSON.parse(bytes.toString("utf8"));}catch{stop("Invalid canonical publication JSON");}
  if(Buffer.from(JSON.stringify(payload),"utf8").compare(bytes)!==0)
    stop("Noncanonical or repeated JSON fields");
  immutableSignedJson(payload);
  fields(payload,["schema","source","nonce","issuedAt","expiresAt","criteria","gates"],"payload");
  if(payload.schema!==PUBLICATION_SCHEMA||
    typeof payload.nonce!=="string"||!/^[A-Za-z0-9_-]{16,128}$/.test(payload.nonce))
    stop("Invalid publication identity");
  validateSource(payload.source,ctx.expected);
  const issued=date(payload.issuedAt),expires=date(payload.expiresAt);
  if(issued>ctx.nowMs+60000||expires<=ctx.nowMs||
    expires<=issued||expires-issued>48*3600000)stop("Publication outside approved freshness window");
  const keyIds=new Set(),roles=new Set(),fingerprints=new Set();
  for(const sig of envelope.signatures){
    fields(sig,["keyId","signatureBase64"],"endorsement");
    if(typeof sig.keyId!=="string"||sig.keyId.length>128||keyIds.has(sig.keyId))
      stop("Repeated signer");
    keyIds.add(sig.keyId);
    const signer=ctx.trustedKeys.get(sig.keyId);
    if(!signer)stop("Untrusted endorsement");
    fields(signer,["pem","role","route","notBefore","notAfter"],"trust enrollment");
    if(!["release","reviewer"].includes(signer.role)||roles.has(signer.role))
      stop("Separate release and reviewer roles required");
    if(signer.route!==payload.source.route)
      stop("Signer not enrolled for this exact route");
    const notBefore=date(signer.notBefore),notAfter=date(signer.notAfter);
    if(notAfter<=notBefore||notAfter-notBefore>366*86400000||
       issued<notBefore||expires>notAfter||ctx.nowMs<notBefore||ctx.nowMs>=notAfter)
      stop("Issuer authority expired, revoked or not yet effective");
    roles.add(signer.role);
    const key=createPublicKey(signer.pem);
    if(key.asymmetricKeyType!=="ed25519")stop("Unsupported endorsement key");
    const fingerprint=hash(key.export({type:"spki",format:"der"}));
    if(fingerprints.has(fingerprint))stop("Shared signer key");
    fingerprints.add(fingerprint);
    if(!verify(null,bytes,key,b64(sig.signatureBase64,128,"signature")))
      stop("Invalid detached endorsement signature");
  }
  if(roles.size!==2||!roles.has("release")||!roles.has("reviewer"))
    stop("Missing independent release review");
  const dimensions=ctx.rubric?.dimensions,profile=ctx.profile;
  if(!dimensions||typeof dimensions!=="object"||
    ctx.rubric.maximum!==100||!Array.isArray(profile?.gates))
    stop("Missing canonical rubric or assurance profile");
  if(ctx.rubric.version!=="2026-10-18-v1" ||
    JSON.stringify(Object.keys(dimensions).sort())!==JSON.stringify(Object.keys(CANONICAL_WEIGHTS).sort()) ||
    JSON.stringify(profile.gates.map(g=>g.id).sort())!==JSON.stringify([...INDEX_GATES].sort()))
    stop("Canonical rubric or three Index assurance gates drifted");
  const canonical=new Map();
  for(const [dimension,data] of Object.entries(dimensions)){
    if(!Array.isArray(data.criteria)||data.weight!==CANONICAL_WEIGHTS[dimension]||data.criteria.reduce((n,c)=>n+c.max,0)!==data.weight)
      stop("Invalid canonical rubric");
    for(const row of data.criteria){
      if(canonical.has(row.id)||CANONICAL_CREDIT[row.id]!==row.max)stop("Unknown or altered criterion weight");
      canonical.set(row.id,{dimension,max:row.max});
    }
  }
  if(canonical.size!==20||!Array.isArray(payload.criteria)||
    payload.criteria.length!==20||!Array.isArray(payload.gates)||
    payload.gates.length!==profile.gates.length)stop("Incomplete canonical evidence");
  const scores=Object.fromEntries(Object.keys(dimensions).map(k=>[k,0]));
  const seen=new Set(),usedProofs=new Set(),assignments=[];
  for(const row of payload.criteria){
    fields(row,["id","dimension","earned","evidence"],"criterion");
    const expected=canonical.get(row.id);
    if(!expected||seen.has(row.id)||expected.dimension!==row.dimension||
      !Number.isInteger(row.earned)||row.earned<0||row.earned>expected.max||
      !Array.isArray(row.evidence)||row.evidence.length<1||row.evidence.length>8)
      stop("Unknown or unmeasured criterion");
    seen.add(row.id);
    const kinds=[];
    for(const proof of row.evidence){
      proofObject(proof);kinds.push(proof.kind);
      if(usedProofs.has(proof.sha256))stop("Artifact double credit");
      usedProofs.add(proof.sha256);
      assignments.push(Object.freeze({proof,criterionId:row.id,earned:row.earned}));
    }
    if(!kinds.some(k=>requiredProofKindsForCriterion(row.id).includes(k)))
      stop("Insufficient criterion proof kind");
    scores[row.dimension]+=row.earned;
  }
  const gateResults=[],seenGates=new Set();
  for(const row of payload.gates){
    fields(row,["id","result","evidence"],"gate");
    if(!profile.gates.some(g=>g.id===row.id)||seenGates.has(row.id)||
      !["pass","fail"].includes(row.result)||!Array.isArray(row.evidence)||
      row.evidence.length<1||row.evidence.length>8)stop("Missing or repeated gate");
    seenGates.add(row.id);gateResults.push({id:row.id,result:row.result});
    for(const proof of row.evidence){
      proofObject(proof);
      if(usedProofs.has(proof.sha256))stop("Gate artifact double credit");
      usedProofs.add(proof.sha256);
      assignments.push(Object.freeze({proof,gateId:row.id,result:row.result}));
    }
  }
  if(assignments.length>192)stop("Evidence limit exceeded");
  for(const assignment of assignments){
    const proof=assignment.proof,at=date(proof.measuredAt);
    const maxAge=["performance","browser","production"].includes(proof.kind)?48*3600000:30*86400000;
    if(at>ctx.nowMs+60000||at<ctx.nowMs-maxAge)stop("Expired or future raw measurement");
    // A detached issuer endorsement cannot have reviewed evidence collected
    // after its signed issuance. Verification-time freshness alone is weaker.
    if(at>issued)stop("Measurement postdates signed publication issuance");
    const source=Object.freeze(Object.fromEntries(Object.entries(payload.source).filter(([key])=>key!=="assetsSha256")));
    let valid=false;
    try{valid=(await ctx.verifyArtifact(proof,{source},assignment))===true;}catch{}
    if(!valid)stop("Unverified raw artifact bytes");
  }
  const evidenceSha256=hash(bytes);
  let committed=false;
  try{committed=(await ctx.isCommitted(payload.source,payload.nonce,evidenceSha256))===true;}catch{}
  if(!committed)stop("Missing independent durable ingestion receipt");
  const score=Object.values(scores).reduce((a,b)=>a+b,0);
  const gatesPassed=gateResults.every(g=>g.result==="pass");
  const fullCredit=[...canonical].every(([id,entry])=>payload.criteria.some(c=>c.id===id&&c.earned===entry.max));
  const certified=score===100&&fullCredit&&gatesPassed;
  return Object.freeze({
    score,dimensions:Object.freeze({...scores}),certified,
    status:certified?"current":"provisional",
    evidenceSha256,issuedAt:payload.issuedAt,expiresAt:payload.expiresAt,
    source:Object.freeze({...payload.source}),
    criteriaVerified:20,artifactsVerified:assignments.length,
    // This projection is produced ONLY after all signed approvals, independently
    // inspected raw bytes, source/build parity and committed nonce have passed.
    // Preserve authentic 0 earned; never infer credit from a candidate receipt.
    criteria:Object.freeze(payload.criteria.map(row=>Object.freeze({
      id:row.id,dimension:row.dimension,earned:row.earned,
      proofKinds:Object.freeze(row.evidence.map(p=>p.kind)),
      proofDigests:Object.freeze(row.evidence.map(p=>p.sha256)),
    }))),
    gates:Object.freeze(gateResults.map(g=>Object.freeze({...g}))),
  });
}
