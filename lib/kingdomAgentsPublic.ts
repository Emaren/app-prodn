import "server-only";

import { buildGeneralInspectionsSnapshot } from "@/lib/generalInspections/serverSnapshot";
import type { GeneralInspectionsSnapshot } from "@/lib/generalInspections/types.ts";
import { loadPublicKingdomIntelligence } from "@/lib/kingdomIntelligencePublic";
import { projectInspectionWatchposts, systemAgentState, type KingdomAgentState } from "@/lib/kingdomAgentPolicy";
import type { EvidenceStatus } from "@/lib/generalInspections/gapReport";
import { reconcileKingdomReleaseEvidence, type KingdomReleaseAlignment } from "@/lib/kingdomReleaseEvidence";

export type KingdomAgentKind = "system" | "inspection";

export type KingdomAgentPublic = {
  id: string;
  name: string;
  lane: string;
  kind: KingdomAgentKind;
  state: KingdomAgentState;
  task: string;
  signal: string;
  evidenceAt: string | null;
  source: "Kingdom Intelligence" | "General Inspections";
  evidenceStatus?: EvidenceStatus;
  evidenceReason?: string;
};

export type KingdomAgentPublicSnapshot = {
  schema: 1;
  observedAt: string;
  releaseSha: string | null;
  sources: { intelligence: boolean; inspections: boolean; intelligenceStale: boolean; releaseAlignment: KingdomReleaseAlignment };
  readinessScore: number | null;
  doctorScore: number | null;
  directive: { title: string; level: string } | null;
  agents: KingdomAgentPublic[];
  activity: { id: string; name: string; status: string; at: string; system: string }[];
};

function safeDate(value: string | null | undefined): string | null {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

// Single public projection of existing, separately owned telemetry.
// An inspection check is an evidence watchpost, NOT a spawned AI process.
// No shell, database mutation, secrets, or privileged control surface.
export async function buildKingdomAgentsPublicSnapshot(
  options: { inspectionSource?: PromiseLike<GeneralInspectionsSnapshot | null> | GeneralInspectionsSnapshot | null } = {},
): Promise<KingdomAgentPublicSnapshot> {
  // A single OS request needs one coherent inspection snapshot. Standalone
  // agent requests still perform their own scan, preserving existing behavior.
  // Null means the caller's read failed; never retry or synthesize a green read.
  const inspectionSource = Object.prototype.hasOwnProperty.call(options, "inspectionSource")
    ? Promise.resolve(options.inspectionSource ?? null)
    : Promise.resolve().then(() => buildGeneralInspectionsSnapshot());
  const [inspectionResult, intelligenceResult] = await Promise.allSettled([
    inspectionSource,
    loadPublicKingdomIntelligence(),
  ]);
  const inspection = inspectionResult.status === "fulfilled" ? inspectionResult.value : null;
  const intelligence = intelligenceResult.status === "fulfilled" ? intelligenceResult.value : null;
  const releaseAlignment = reconcileKingdomReleaseEvidence(
    inspection?.releaseSha, intelligence?.source?.productionRelease,
  );
  const intelligenceCurrent = Boolean(intelligence?.available && !intelligence.stale && releaseAlignment === "aligned");
  const agents: KingdomAgentPublic[] = [];

  if (intelligence?.available) {
    for (const system of intelligence.systemAgents) {
      const state = intelligenceCurrent
        ? systemAgentState(system.state, system.activeProcess)
        : "unknown";
      agents.push({
        id: "system/" + system.key,
        name: system.label,
        lane: "COMMAND",
        kind: "system",
        state,
        task: system.summary.slice(0, 150),
        signal: intelligenceCurrent ? system.state : releaseAlignment === "mismatch"
          ? "RELEASE MISMATCH" : intelligence?.stale ? "STALE SIGNAL" : "RELEASE UNVERIFIED",
        evidenceAt: safeDate(intelligence.generatedAt),
        source: "Kingdom Intelligence",
      });
    }
  }

  if (inspection) {
    agents.push(...projectInspectionWatchposts(inspection, Date.now()));
  }

  const activity = intelligenceCurrent
    ? intelligence!.liveActivity.slice(0, 12).map((event, index) => ({
        id: event.id ?? "event/" + index + "/" + event.requestedAt,
        name: event.label.slice(0, 110),
        status: event.status,
        at: event.completedAt ?? event.requestedAt,
        system: event.system,
      }))
    : [];

  return {
    schema: 1,
    observedAt: new Date().toISOString(),
    releaseSha: releaseAlignment === "aligned" ? inspection?.releaseSha?.slice(0, 12) ?? null : null,
    sources: {
      intelligence: Boolean(intelligence?.available),
      intelligenceStale: !intelligence?.available || Boolean(intelligence.stale),
      inspections: Boolean(inspection),
      releaseAlignment,
    },
    readinessScore: inspection?.overallScore ?? null,
    doctorScore: intelligenceCurrent ? intelligence?.health?.doctorScore ?? null : null,
    directive: intelligenceCurrent && intelligence?.directive
      ? { title: intelligence.directive.title.slice(0, 140), level: intelligence.directive.level }
      : null,
    agents,
    activity,
  };
}
