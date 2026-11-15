/**
 * Exact dated facts supplied by the independent VPSSentry/Storage owner in
 * app-prodn issue #1360 comment #6887923735 and earlier #6887673620.
 *
 * NOT a current feed, NOT independently signed, NOT a risk certification.
 * Never interpret this as live status or as permission to run a second scan.
 * Current live state stays UNKNOWN until the separate publisher is admitted.
 */
export const KINGDOM_ATLAS_HISTORY = {
  schema: "aoe2war.product.kingdom-atlas-dated-handoff.v1",
  trust: "HISTORICAL_OWNER_HANDOFF",
  liveSource: "UNKNOWN",
  macObservedAt: "2026-11-15T01:44:00Z",
  estateObservedAt: "2026-11-15T02:25:08.899756Z",
  sourceComment: "https://github.com/Emaren/app-prodn/issues/1360#issuecomment-6887923735",
  atlasComment: "https://github.com/Emaren/app-prodn/issues/1360#issuecomment-6887673620",
  storageSource: "https://github.com/Emaren/VPSSentry/issues/48#issuecomment-6887920219",
  sourceHead: "8ab1c484fc47fc7010a72bc9f87b8d7c63d592e3",
  mac: {
    job: "com.aoe2war.mac-storage-pulse",
    phase: "ADOPTED_FIRST_STARTUP_PASS",
    naturalDailyRunsAccepted: 0,
    naturalDailyRunsRequired: 2,
    trackedPaths: 4171,
    readableUtf8Files: 3124,
    sourceLines: 821867,
    unicodeCharacters: 40226527,
    staticImportStrings: 11233,
    ownerDirtyIndexEntries: 1,
    modeMismatches: 0,
  },
  hel1: {
    estateObserver: "HOLD_NOT_NATIVE_ADOPTED",
    volumeEffectivePercent: 87.85,
    volumeCeilingPercent: 88,
    rootNextStageReserve: "HOLD",
    boundedFourHostScanSec: 8.05,
    financialAuthorized: false,
  },
} as const;
