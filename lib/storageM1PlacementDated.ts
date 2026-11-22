import "server-only";

/**
 * DATED OWNER-NATIVE READ-ONLY OBSERVATION, NOT A SIGNED FILESYSTEM CENSUS.
 * Source: bounded M1 UID501 statvfs/diskutil/du 2026-11-22T23:27–23:32Z,
 * and the PRE-EXISTING 16-file Factory full-SHA manifest, revalidated by
 * exact dev/inode/size/st_blocks metadata (no new full-content hashing).
 *
 * Source code carries ONLY sanitized class labels, never private absolute
 * filesystem paths, private receipts, keys, file bodies or owner identity.
 * NEVER use this projection as copy, cleanup, release or retirement authority.
 */
export const M1_PLACEMENT_SCHEMA = "aoe2war.storage.m1-dated-placement.v1" as const;
export type Placement = "KEEP_HOT" | "KEEP_WARM" |
  "INTEL_COLD" | "SAFE_TO_RECREATE" | "UNKNOWN";
export type RecoveryState = "REPRESENTATIVE_RESTORE_ONLY" |
  "FIVE_PRIOR_INTEL_RESTORES" | "NOT_PROVEN" | "NOT_APPLICABLE";
export type PlacementItem = {
  opaqueId:string;
  label:string;
  disposition:Placement;
  allocatedGrossBytes:number;
  apfsExclusiveReclaimBytes:null;
  expectedReclaimBytes:null;
  actualReclaimedBytes:0;
  recovery:RecoveryState;
  dependencies:string;
  proposedDestination:string;
  approvalLevel:"L1_CONDITIONAL"|"L4_EXACT_OWNER"|"L5_PROTECTED"|"UNKNOWN";
  actionAuthorized:false;
  lastVerifiedAt:string;
  scanCoverage:"BOUNDED_PARTIAL";
  source:string;
};
const observation="2026-11-22T23:32:03Z";
const oldCache="2026-11-22T10:20:00Z";
const item=(v:Omit<PlacementItem,
 "apfsExclusiveReclaimBytes"|"expectedReclaimBytes"|"actualReclaimedBytes"|
 "actionAuthorized"|"scanCoverage">):PlacementItem=>({
 ...v,apfsExclusiveReclaimBytes:null,expectedReclaimBytes:null,
 actualReclaimedBytes:0,actionAuthorized:false,scanCoverage:"BOUNDED_PARTIAL"
});
/** Three disjoint 16-ZIP cohorts sum to exactly 9,868,439,552 gross bytes.
 * Do not add their total to the parent Factory ZIP cache a second time. */
export const M1_PLACEMENT_ITEMS:readonly PlacementItem[]=[
 item({
  opaqueId:"m1-sep-recovery",label:"Historical encrypted survival recovery",
  disposition:"KEEP_WARM",allocatedGrossBytes:30_458_478_592,
  recovery:"REPRESENTATIVE_RESTORE_ONLY",
  dependencies:"Replay originals, Wolo consensus and private media recovery",
  proposedDestination:"Intel cold — exact restored copy only; retain independent original",
  approvalLevel:"L5_PROTECTED",lastVerifiedAt:observation,source:"OWNER_NATIVE_BOUNDED_DU"
 }),
 item({
  opaqueId:"m1-factory-hot-five",label:"Factory archives — active, hot and live writers (5)",
  disposition:"KEEP_HOT",allocatedGrossBytes:3_086_176_256,
  recovery:"NOT_PROVEN",
  dependencies:"Current/hot Factory rollback lineage and independent writer runtimes",
  proposedDestination:"M1 / current Factory controller",
  approvalLevel:"L4_EXACT_OWNER",lastVerifiedAt:observation,
  source:"WE4_EXISTING_16_FULLSHA_PLUS_OWNER_16_OF_16_STAT_READBACK"
 }),
 item({
  opaqueId:"m1-factory-restored-five",label:"Factory archives — five historically Intel-restored",
  disposition:"KEEP_WARM",allocatedGrossBytes:3_080_011_776,
  recovery:"FIVE_PRIOR_INTEL_RESTORES",
  dependencies:"Original Factory ancestry and unresolved L4 consumer/exclusivity review",
  proposedDestination:"Existing Intel cold proofs; M1 original retirement NOT permitted",
  approvalLevel:"L4_EXACT_OWNER",lastVerifiedAt:observation,
  source:"WE4_EXISTING_16_FULLSHA_PLUS_OWNER_16_OF_16_STAT_READBACK"
 }),
 item({
  opaqueId:"m1-factory-intel-six",label:"Factory archives — six need independent cold copies",
  disposition:"INTEL_COLD",allocatedGrossBytes:3_702_251_520,
  recovery:"NOT_PROVEN",
  dependencies:"Exact source/BUILD_ID, source owner, receiver class and rollback checks",
  proposedDestination:"Intel FileVault — COPY pending original one-use authority",
  approvalLevel:"L4_EXACT_OWNER",lastVerifiedAt:observation,
  source:"WE4_EXISTING_16_FULLSHA_PLUS_OWNER_16_OF_16_STAT_READBACK"
 }),
 item({
  opaqueId:"m1-vps-context-tgz",label:"VPSSentry context TGZ history",
  disposition:"KEEP_WARM",allocatedGrossBytes:3_178_029_056,
  recovery:"NOT_PROVEN",
  dependencies:"Original source, governance and recovery evidence",
  proposedDestination:"Intel cold candidate after per-original proof",
  approvalLevel:"L5_PROTECTED",lastVerifiedAt:observation,source:"OWNER_NATIVE_BOUNDED_DU"
 }),
 item({
  opaqueId:"m1-vps-parity",label:"VPSSentry repository parity backups",
  disposition:"KEEP_WARM",allocatedGrossBytes:2_410_860_544,
  recovery:"NOT_PROVEN",dependencies:"Source history and recovery inverses",
  proposedDestination:"Intel cold candidate after exact owner review",
  approvalLevel:"L5_PROTECTED",lastVerifiedAt:observation,source:"OWNER_NATIVE_BOUNDED_DU"
 }),
 item({
  opaqueId:"m1-financial-cache",label:"AoE2WAR C01/chain verification work cache",
  disposition:"KEEP_WARM",allocatedGrossBytes:3_323_686_912,
  recovery:"NOT_PROVEN",
  dependencies:"Financial/chain gate rehearsal and source provenance",
  proposedDestination:"M1 until WE1 confirms independent regenerability",
  approvalLevel:"L5_PROTECTED",lastVerifiedAt:observation,source:"OWNER_NATIVE_BOUNDED_DU"
 }),
 item({
  opaqueId:"m1-codex-cache",label:"Codex primary and previous runtimes",
  disposition:"UNKNOWN",allocatedGrossBytes:2_343_841_792,
  recovery:"NOT_PROVEN",dependencies:"Toolchain and runtime rollback linkage UNKNOWN",
  proposedDestination:"Owner review; no direct bulk prune",
  approvalLevel:"UNKNOWN",lastVerifiedAt:observation,source:"OWNER_NATIVE_BOUNDED_DU"
 }),
 item({
  opaqueId:"m1-live-worktrees",label:"AoE2HDBets source worktrees",
  disposition:"KEEP_HOT",allocatedGrossBytes:4_834_238_464,
  recovery:"NOT_APPLICABLE",
  dependencies:"Potentially dirty app, watcher, financial and Wolo source",
  proposedDestination:"M1 live source; inspect exact worktree before any relocation",
  approvalLevel:"L5_PROTECTED",lastVerifiedAt:observation,source:"OWNER_NATIVE_BOUNDED_DU"
 }),
 item({
  opaqueId:"m1-chrome-cache",label:"Chrome browser-managed Default cache (older sample)",
  disposition:"SAFE_TO_RECREATE",allocatedGrossBytes:1_337_253_888,
  recovery:"NOT_APPLICABLE",
  dependencies:"Active Emaren/Scribe Chrome sessions; only cache, NEVER profile/cookies",
  proposedDestination:"Recreate locally after browser shutdown and exact owner action",
  approvalLevel:"L1_CONDITIONAL",lastVerifiedAt:oldCache,
  source:"WE4_EXISTING_FIVE_EXACT_L1_CANDIDATES"
 }),
 item({
  opaqueId:"m1-capture-staging",label:"VPSSentry historical context staging",
  disposition:"UNKNOWN",allocatedGrossBytes:503_771_136,
  recovery:"NOT_PROVEN",dependencies:"Prior history producer/consumer not verified",
  proposedDestination:"Owner exact-source review before any decision",
  approvalLevel:"UNKNOWN",lastVerifiedAt:observation,source:"OWNER_NATIVE_BOUNDED_DU"
 })
] as const;

export function getDatedM1Placement(){
  return {
    schema:M1_PLACEMENT_SCHEMA,
    authority:"ADMIN_READ_ONLY_DATED_UNCERTIFIED_NO_OPERATION",
    observedAt:observation,
    capacityObservedAt:"2026-11-22T23:29:55Z",
    apfsContainerTotalBytes:494_384_795_648,
    apfsContainerAvailableBytes:5_964_894_208,
    minimumScratchTargetBytes:25*1024**3,
    preferredDevTargetBytes:40*1024**3,
    filesystem:"M1 APFS disk3 (Data volume disk3s5)",
    coverage:"PARTIAL_SCOPED_OWNER_READ_ONLY",
    wholeFilesystemCertified:false,
    filesEnumeratedAndMatched:16,
    originalFactoryZipGrossBytes:9_868_439_552,
    originalFactoryZipManifestUsed:true,
    currentOwnerPermitIssued:false,
    transfersAuthorized:false,
    newPhysicalReclaimBytes:0,
    uniqueReclaimBytes:null,
    unattributedBytes:null,
    ownerPrivatePathsExposed:false,
    // Rows deliberately may overlap with broader retained trees. Never sum
    // them into a fake filesystem-wide decomposition or remaining footprint.
    rows:M1_PLACEMENT_ITEMS
  } as const;
}
