import "server-only";

import { buildGeneralInspectionsSnapshot } from "@/lib/generalInspections/serverSnapshot";
import { loadPublicKingdomIntelligence } from "@/lib/kingdomIntelligencePublic";
import type { InspectionState } from "@/lib/generalInspections/types";

export type KingdomAgentState = "working" | "healthy" | "watch" | "blocked" | "unknown";
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
};

export type KingdomAgentPublicSnapshot = {
  schema: 1;
  observedAt: string;
  releaseSha: string | null;
  sources: { intelligence: boolean; inspections: boolean; intelligenceStale: boolean };
  readinessScore: number | null;
  doctorScore: number | null;
  directive: { title: string; level: string } | null;
  agents: KingdomAgentPublic[];
  activity: { id: string; name: string; status: string; at: string; system: string }[];
};

function statusFromInspection(state: InspectionState, fraction: number): KingdomAgentState {
  if (state === "red") return "blocked";
  if (state === "amber" || fraction < 1) return "watch";
  return "healthy";
}

function statusFromSystem(state: string, activeProcess: boolean): KingdomAgentState {
  const value = state.toUpperCase();
  if (["FAILED", "FAIL", "BLOCKED", "UNSAFE"].includes(value)) return "blocked";
  if (activeProcess && ["ACTIVE", "RUNNING", "RUNNING_CAPTURE", "RUNNING_TRANSACTION", "CLAIMED", "RESUME_REQUESTED"].includes(value)) return "working";
  if (["PASS", "READY", "HEALTHY", "CERTIFIED", "COMPLETE", "VERIFIED"].includes(value)) return "healthy";
  if (["ATTENTION", "ATTENTION_REQUIRED", "WATCH", "MAINTENANCE_DUE", "WAITING", "ACTIVE"].includes(value)) return "watch";
  return "unknown";
}

function safeDate(value: string | null | undefined): string | null {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

// Single public projection of existing, separately owned telemetry.
// An inspection check is an evidence watchpost, NOT a spawned AI process.
// No shell, database mutation, secrets, or privileged control surface.
export async function buildKingdomAgentsPublicSnapshot(): Promise<KingdomAgentPublicSnapshot> {
  const [inspectionResult, intelligenceResult] = await Promise.allSettled([
    Promise.resolve().then(() => buildGeneralInspectionsSnapshot()),
    loadPublicKingdomIntelligence(),
  ]);
  const inspection = inspectionResult.status === "fulfilled" ? inspectionResult.value : null;
  const intelligence = intelligenceResult.status === "fulfilled" ? intelligenceResult.value : null;
  const intelligenceCurrent = Boolean(intelligence?.available && !intelligence.stale);
  const agents: KingdomAgentPublic[] = [];

  if (intelligence?.available) {
    for (const system of intelligence.systemAgents) {
      const state = intelligenceCurrent
        ? statusFromSystem(system.state, system.activeProcess)
        : "unknown";
      agents.push({
        id: "system/" + system.key,
        name: system.label,
        lane: "COMMAND",
        kind: "system",
        state,
        task: system.summary.slice(0, 150),
        signal: intelligenceCurrent ? system.state : "STALE SIGNAL",
        evidenceAt: safeDate(intelligence.generatedAt),
        source: "Kingdom Intelligence",
      });
    }
  }

  if (inspection) {
    for (const group of inspection.categories) {
      for (const check of group.checks) {
        const fraction = check.weight > 0 ? check.earned / check.weight : 0;
        agents.push({
          id: "inspection/" + group.id + "/" + check.id,
          name: check.label.slice(0, 110),
          lane: group.title,
          kind: "inspection",
          state: statusFromInspection(check.state, fraction),
          task: group.description.slice(0, 140),
          signal: check.ratio
            ? check.ratio.passed + "/" + check.ratio.total + " checks"
            : check.earned.toFixed(1).replace(/\\.0$/, "") + "/" + check.weight + " points",
          evidenceAt: safeDate(check.evidenceAt),
          source: "General Inspections",
        });
      }
    }
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
    releaseSha: inspection?.releaseSha?.slice(0, 12) ?? intelligence?.source?.productionRelease ?? null,
    sources: {
      intelligence: Boolean(intelligence?.available),
      intelligenceStale: !intelligenceCurrent,
      inspections: Boolean(inspection),
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
