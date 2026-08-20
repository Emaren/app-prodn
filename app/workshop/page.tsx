import type { Metadata } from "next";

import WorkshopExperience, {
  type WorkshopDiagnostics,
} from "@/components/workshop/WorkshopExperience";
import { loadPublicParserObservatory } from "@/lib/parserObservatory";
import { WATCHER_RELEASE } from "@/lib/watcherRelease";
import {
  loadCachedPublicWorkshop,
  loadCachedWorkshopChronicleFirstPage,
} from "@/lib/workshop";

import "./workshop-polish.css";
import "./workshop-chronicle-gap-fill.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Workshop",
  description:
    "Follow AoE2WAR's production truth through replay evidence, Watcher activity, observability, build records, adjudication, and settlement boundaries.",
};

export default async function WorkshopPage() {
  const [data, chronicle, observatory] = await Promise.all([
    loadCachedPublicWorkshop(),
    loadCachedWorkshopChronicleFirstPage(),
    loadPublicParserObservatory(),
  ]);

  const diagnostics: WorkshopDiagnostics = {
    generatedAt: observatory.generatedAt,
    watcherVersion: WATCHER_RELEASE.version,
    watcherReleasedOn: WATCHER_RELEASE.releasedOn,
    corpus: {
      finalReplayRecords: observatory.corpus.finalReplayRecords,
      publicBattleRecords: observatory.corpus.publicBattleRecords,
      uniqueLogicalBattles: observatory.corpus.uniqueLogicalBattles,
      duplicateBattleRecords: observatory.corpus.duplicateBattleRecords,
      logicalResultResolved: observatory.corpus.logicalResultResolved,
      logicalResultUnresolved: observatory.corpus.logicalResultUnresolved,
      logicalRosterComplete: observatory.corpus.logicalRosterComplete,
      logicalRosterIncomplete: observatory.corpus.logicalRosterIncomplete,
      logicalBattleTruthComplete: observatory.corpus.logicalBattleTruthComplete,
      logicalBattleTruthIncomplete: observatory.corpus.logicalBattleTruthIncomplete,
      logicalNeedsResultOnly: observatory.corpus.logicalNeedsResultOnly,
      logicalNeedsRosterOnly: observatory.corpus.logicalNeedsRosterOnly,
      logicalNeedsBoth: observatory.corpus.logicalNeedsBoth,
      logicalResultCoverageBps: observatory.corpus.logicalResultCoverageBps,
      logicalRosterCoverageBps: observatory.corpus.logicalRosterCoverageBps,
      logicalBattleTruthCoverageBps: observatory.corpus.logicalBattleTruthCoverageBps,
      excludedFinalRecords: observatory.corpus.excludedFinalRecords,
      resolvedResults: observatory.corpus.resolvedResults,
      unresolvedResults: observatory.corpus.unresolvedResults,
      resultCoverageBps: observatory.corpus.resultCoverageBps,
      resolvedTeams: observatory.corpus.resolvedTeams,
      teamCoverageBps: observatory.corpus.teamCoverageBps,
      reviewRequired: observatory.corpus.reviewRequired,
      archivedArtifacts: observatory.corpus.archivedArtifacts,
      archivedBytes: observatory.corpus.archivedBytes,
      parseableAtAnyLevelArtifacts:
        observatory.corpus.parseableAtAnyLevelArtifacts,
      physicalArchiveAvailable: observatory.corpus.physicalArchiveAvailable,
      physicalArchiveObjects: observatory.corpus.physicalArchiveObjects,
      physicalArchiveBytes: observatory.corpus.physicalArchiveBytes,
      physicalRecordedObjects: observatory.corpus.physicalRecordedObjects,
      physicalSavedCheckpointObjects:
        observatory.corpus.physicalSavedCheckpointObjects,
      recoveryQueueArtifacts: observatory.corpus.recoveryQueueArtifacts,
      confirmedIrrecoverableArtifacts:
        observatory.corpus.confirmedIrrecoverableArtifacts,
      replayBackedSteamAccounts:
        observatory.corpus.replayBackedSteamAccounts,
      provisionalWarriors: observatory.corpus.provisionalWarriors,
      steamAccountsWithMultipleNames:
        observatory.corpus.steamAccountsWithMultipleNames,
      nameOnlyIdentityBuckets: observatory.corpus.nameOnlyIdentityBuckets,
      profileOnlyPlatformAccounts:
        observatory.corpus.profileOnlyPlatformAccounts,
      observedDisplayNames: observatory.corpus.observedDisplayNames,
      namesUsedByMultipleSteamAccounts:
        observatory.corpus.namesUsedByMultipleSteamAccounts,
      proposedPlatformLinks: observatory.corpus.proposedPlatformLinks,
      activePlatformLinks: observatory.corpus.activePlatformLinks,
      proposedWarriorClaims: observatory.corpus.proposedWarriorClaims,
      activeWarriorClaims: observatory.corpus.activeWarriorClaims,
      identityPublications: observatory.corpus.identityPublications,
    },
    parser: {
      totalRuns: observatory.parser.totalRuns,
      observations: observatory.parser.observations,
      totalActions: observatory.parser.totalActions,
      frontier: {
        artifacts: observatory.parser.frontier.artifacts,
        completed: observatory.parser.frontier.completed,
        failed: observatory.parser.frontier.failed,
        recordedGameCandidates:
          observatory.parser.frontier.recordedGameCandidates,
        savedSnapshots: observatory.parser.frontier.savedSnapshots,
        effectiveResultCorrections:
          observatory.parser.frontier.effectiveResultCorrections,
      },
    },
  };

  return (
    <WorkshopExperience
      data={data}
      chronicle={chronicle}
      diagnostics={diagnostics}
    />
  );
}
