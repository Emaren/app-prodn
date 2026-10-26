import type { Metadata } from "next";
import WorkshopBrainPanel from "@/components/workshop/WorkshopBrainPanel";

import WorkshopExperience, {
  type WorkshopDiagnostics,
} from "@/components/workshop/WorkshopExperience";
import { loadPublicKingdomIntelligence } from "@/lib/kingdomIntelligencePublic";
import { buildWorkshopBrainSnapshot } from "@/lib/workshopBrain";
import { loadPublicParserObservatory } from "@/lib/parserObservatory";
import { WATCHER_RELEASE } from "@/lib/watcherRelease";
import {
  loadCachedPublicWorkshop,
} from "@/lib/workshopCached";

import "./workshop-polish.css";
import "./workshop-chronicle-gap-fill.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Workshop",
  description:
    "Follow AoE2WAR's production truth through replay evidence, Watcher activity, observability, build records, adjudication, and settlement boundaries.",
};

const DEFERRED_CHRONICLE = {
  entries: [],
  hasMore: true,
  nextCursor: null,
};

export default async function WorkshopPage() {
  const [data, observatory, kingdomIntelligence] = await Promise.all([
    loadCachedPublicWorkshop().catch(() => null),
    loadPublicParserObservatory().catch(() => null),
    loadPublicKingdomIntelligence().catch(() => null),
  ]);

  const brain = buildWorkshopBrainSnapshot(kingdomIntelligence);

  // The Chronicle and observatory require a readable database. When that
  // dependency is temporarily unavailable, keep the public read-side usable:
  // show only sanitized Brain evidence and a truthful unavailable message,
  // never a synthetic empty corpus or apparent zero activity.
  if (!data || !observatory) {
    return (
      <main aria-label="Workshop operational fallback" className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <WorkshopBrainPanel brain={brain} />
        <p role="status" className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.06] p-5 text-sm text-amber-100">
          Workshop archive and parser diagnostics are temporarily unavailable.
          Historical activity counts and current processes cannot be verified.
          No maintenance or financial operation has been started.
        </p>
      </main>
    );
  }

  // Chronicle history is intentionally not awaited here. The public timeline
  // is below the initial viewport and hydrates itself only as the reader nears it.
  const chronicle = DEFERRED_CHRONICLE;

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
      brain={brain}
    />
  );
}
