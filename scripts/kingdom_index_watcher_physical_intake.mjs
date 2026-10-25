/**
 * Read-only desktop Watcher PHYSICAL evidence preflight.
 * Actual Windows/macOS/Linux measurements are not supplied by GitHub. This
 * validates source/version and receipt shapes without granting a desktop score.
 * A separately governed installed-client + signer/approval pathway is required.
 */
const HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/;
const PLATFORMS=["windows","macos","linux"];
const ALL_PLATFORMS=new Set([
 "source-and-release-drift","idle-cpu-memory-wakeups",
 "update-and-rollback","release-specific-regression-tests"
]);
const stop=m=>{throw Error("WATCHER INTAKE STOP: "+m)};
const exact=(r,keys)=>{
 if(!r||typeof r!=="object"||Array.isArray(r)||
  JSON.stringify(Object.keys(r).sort())!==JSON.stringify([...keys].sort()))
  stop("Invalid or self-awarding receipt fields");
 return r;
};
const stamp=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&
 Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s;
/**
 * expectedArtifactDigests is a separately supplied map of platform release
 * artifact SHA-256 digests, not a self-declared installer digest.
 * It cannot substitute for reading installed executable bytes or a physical
 * independent assessor signature.
 */
export function prepareWatcherPhysicalIntake({
 companions,review,receipts=[],expectedArtifactDigests=new Map(),nowMs=Date.now()
}){
 const watcher=companions?.companions?.find(x=>x.id==="aoe2-watcher");
 if(!watcher||watcher.version!=="1.6.5"||!HEX40.test(watcher.releaseSourceSha)||
    !Array.isArray(watcher.gates)||watcher.gates.length!==9||
    new Set(watcher.gates.map(x=>x.id)).size!==9||
    review?.companionId!==watcher.id||review.publishedReleaseStill!=="1.6.5"||
    review.candidateVersion!=="1.6.6"||review.candidateState!=="DRAFT_UNRELEASED"||
    review.scoreAuthority!=="AI_ASSISTED_SOURCE_TRIAGE_UNCERTIFIED")
  stop("Published v1.6.5 or unpublished v1.6.6 authority drift");
 if(!Array.isArray(receipts)||receipts.length>72||
   !(expectedArtifactDigests instanceof Map)||!Number.isSafeInteger(nowMs))
  stop("Unbounded physical evidence input");
 const byGate=new Map(),used=new Set(),seenProofs=new Set();
 for(const item of receipts){
  exact(item,["gateId","platform","installedVersion","releaseSourceSha",
    "releaseArtifactSha256","installedBinarySha256","collectedAt","proofSha256","proofRef"]);
  const gate=watcher.gates.find(x=>x.id===item.gateId);
  const independent=expectedArtifactDigests.get(item.platform);
  if(!gate||!PLATFORMS.includes(item.platform)||
    item.installedVersion!=="1.6.5"||item.releaseSourceSha!==watcher.releaseSourceSha||
    !HEX64.test(item.releaseArtifactSha256)||
    item.releaseArtifactSha256!==independent||
    !HEX64.test(item.installedBinarySha256)||!HEX64.test(item.proofSha256)||
    !stamp(item.collectedAt)||typeof item.proofRef!=="string"||
    !/^https:\/\/github\.com\/Emaren\/(?:aoe2-watcher|app-prodn)\//.test(item.proofRef)||
    item.proofRef.length>600)
   stop("Missing independent published artifact/source or malformed installed evidence");
  const age=nowMs-Date.parse(item.collectedAt);
  const limit=item.gateId==="idle-cpu-memory-wakeups"?48*3600000:30*86400000;
  if(age<0||age>limit)stop("Future or stale physical-client evidence");
  const identity=item.gateId+":"+item.platform;
  if(used.has(identity))stop("Conflicting/duplicated platform gate receipt");
  if(seenProofs.has(item.proofSha256))stop("Same physical proof cannot close multiple gates");
  used.add(identity);seenProofs.add(item.proofSha256);
  if(!byGate.has(item.gateId))byGate.set(item.gateId,[]);
  byGate.get(item.gateId).push(Object.freeze({
   platform:item.platform,
   proofSha256:item.proofSha256,
   installedBinarySha256:item.installedBinarySha256,
   ageHours:Math.round(age/360000)/10,
   status:"UNVERIFIED_PHYSICAL_CLAIM"
  }));
 }
 return Object.freeze({
  schema:1,kind:"aoe2war.watcher.physical-gate-evidence-intake.v1",
  publishedVersion:"1.6.5",publishedSourceSha:watcher.releaseSourceSha,
  candidateVersion:"1.6.6",candidateState:"DRAFT_UNRELEASED",
  publishedScore:null,certified:false,verifiedGates:0,totalGates:9,
  gates:watcher.gates.map(g=>{
   const claims=byGate.get(g.id)??[];
   const requiredPlatforms=ALL_PLATFORMS.has(g.id)?PLATFORMS:[...PLATFORMS];
   const missingPlatforms=requiredPlatforms.filter(p=>!claims.some(x=>x.platform===p));
   return {
    id:g.id,dimension:g.dimension,requirement:g.requirement,
    status:"UNVERIFIED",certified:false,
    candidateCoverage:claims.length,
    requiredPlatforms,missingPlatforms,
    receipts:claims,
    nextAction:missingPlatforms.length?
     "Capture actual installed release-client proof on missing physical platform(s); independently check binary/download hashes":
     "Independently validate physical measurements, source/binary identity, external approvals and signer/nonce/release controls"
   };
  }),
  limitations:"Published 1.6.5 remains UNMEASURED; a matching GitHub digest or client-generated report does not prove executable provenance, real measurements, human approval or desktop 100. Unreleased 1.6.6 source estimate never becomes a release grade."
 });
}
