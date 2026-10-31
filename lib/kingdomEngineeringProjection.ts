/**
 * R25 G P3 — pure source-backed, bounded Kingdom Engineering visual projection.
 * Imported JSON is proposed/source evidence, never a runtime poll, worker heartbeat,
 * financial admission or authenticated physical release receipt.
 */
import registry from "@/config/aoe2war-os-registry.v1.json";
import bindings from "@/config/central-agent-os-bindings.v1.json";
import seed from "@/docs/central-agent-ledger/r25-seed.json";

export type EvidenceState = "UNKNOWN" | "OWNER_REPORTED" | "SOURCE_ONLY" | "PROPOSED";
export type EngineeringLane = {
  id: string;
  osIds: string[];
  evidence: "ASSIGNED_UNVERIFIED";
  activeWorkerVerified: false;
};
export type EngineeringOs = {
  id: string;
  name: string;
  lifecycle: string;
  workerEvidence: "UNKNOWN";
};
export type EngineeringPhase = { id: string; state: EvidenceState; at: string | null };
export type EngineeringProjection = {
  schema: "aoe2war.kingdom-engineering.visual.v1";
  audience: "public" | "admin";
  sourceCutoff: string;
  sourceOnly: true;
  liveObservation: false;
  registrySource: string;
  canonicalRegistrySha: string;
  os: EngineeringOs[];
  lanes: EngineeringLane[];
  roles: { id: string; name: string; lifecycle: string }[];
  phases: EngineeringPhase[];
  admin?: {
    originalCandidateSha: string;
    domainBindings: { lane: string; rationale: string; osIds: string[] }[];
    assignments: { lane: string; scope: string; sourceRef: string; result: string }[];
    buildStagedEvidence: "UNKNOWN";
    candidate3031RunningEvidence: "UNKNOWN";
    publicCutoverEvidence: "UNKNOWN";
  };
};

const PIPELINE = [
  "SOURCE_RECEIVED", "SOURCE_EXTRACTED", "BUILD_STAGED",
  "FINANCIALLY_ISOLATED", "PARALLEL_RUNNING", "ROUTE_READY",
  "PUBLIC_ROUTED", "LIVE_VERIFIED",
] as const;
const registrySource = "https://github.com/Emaren/app-prodn/pull/1090";
const allowedRoles = new Set(["system-doctor", "system-shepherd", "system-composer"]);

export function buildEngineeringProjection(audience: "public" | "admin"): EngineeringProjection {
  if (registry.schema !== "aoe2war.os.census.v1" ||
      bindings.schema !== "aoe2war.central-agent-os-bindings.v1" ||
      seed.schema !== "aoe2war.central-agent-ledger.seed.v1") {
    throw new Error("KINGDOM_VISUAL_SOURCE_REGISTRY_MISMATCH");
  }
  const os = registry.subordinate_os.map(item => ({
    id: item.id,
    name: item.name,
    lifecycle: item.status,
    workerEvidence: "UNKNOWN" as const,
  }));
  const ids = new Set(os.map(item => item.id));
  if (ids.size !== 14 || !ids.has("orchestra") || !ids.has("central-command")) {
    throw new Error("KINGDOM_VISUAL_OS_IDENTITY_DRIFT");
  }
  const roles = registry.supervisory_roles
    .filter(item => allowedRoles.has(item.id))
    .map(item => ({ id: item.id, name: item.name, lifecycle: item.status }));
  if (roles.length !== 3) throw new Error("KINGDOM_VISUAL_ROLE_DRIFT");
  const laneIds = new Set(seed.assignments.map(item => item.lane));
  if (seed.dispatch.active_sessions_verified !== false ||
      laneIds.size !== 6 || ["B", "C", "D", "E", "F", "G"].some(id => !laneIds.has(id))) {
    throw new Error("KINGDOM_VISUAL_ASSIGNMENT_NOT_WORKER");
  }
  const lanes = bindings.bindings.map(item => {
    if (!laneIds.has(item.lane) || item.os_ids.some(id => !ids.has(id))) {
      throw new Error("KINGDOM_VISUAL_UNKNOWN_OS_BINDING");
    }
    return {
      id: item.lane,
      osIds: item.os_ids.slice(),
      evidence: "ASSIGNED_UNVERIFIED" as const,
      activeWorkerVerified: false as const,
    };
  });
  const phases = PIPELINE.map(id => ({
    id,
    state: (id === "SOURCE_EXTRACTED" ? "OWNER_REPORTED" : "UNKNOWN") as EvidenceState,
    at: id === "SOURCE_EXTRACTED" ? seed.dispatch.recorded_at : null,
  }));
  const result: EngineeringProjection = {
    schema: "aoe2war.kingdom-engineering.visual.v1",
    audience,
    sourceCutoff: seed.dispatch.recorded_at,
    sourceOnly: true,
    liveObservation: false,
    registrySource,
    canonicalRegistrySha: bindings.source_registry_sha,
    os,
    lanes,
    roles,
    phases,
  };
  if (audience === "admin") {
    result.admin = {
      originalCandidateSha: seed.dispatch.candidate_sha,
      domainBindings: bindings.bindings.map(item => ({
        lane: item.lane,
        rationale: item.rationale,
        osIds: item.os_ids.slice(),
      })),
      assignments: seed.assignments.map(item => ({
        lane: item.lane,
        scope: item.assignment,
        sourceRef: item.source,
        result: item.result,
      })),
      buildStagedEvidence: "UNKNOWN",
      candidate3031RunningEvidence: "UNKNOWN",
      publicCutoverEvidence: "UNKNOWN",
    };
  }
  return result;
}
