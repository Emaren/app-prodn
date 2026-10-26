import { buildWhyNotGreenReport, type EvidenceStatus } from "./generalInspections/gapReport.ts";
import type { GeneralInspectionsSnapshot } from "./generalInspections/types.ts";

export type KingdomAgentState = "working" | "healthy" | "watch" | "blocked" | "unknown";

export function inspectionAgentState(
  state: "green" | "amber" | "red",
  fraction: number,
  evidenceStatus: EvidenceStatus,
): KingdomAgentState {
  // A score is historical measurement, not an observation-time lease.
  if (evidenceStatus === "STALE" || evidenceStatus === "UNKNOWN") return "unknown";
  if (evidenceStatus === "FAIL") return "blocked";
  if (state === "red") return "blocked";
  if (state === "amber" || !Number.isFinite(fraction) || fraction < 1) return "watch";
  return "healthy";
}

/** Project the existing report, using the read clock after all source I/O.
 * No collection, renewed timestamp, numerical rescore or producer attestation.
 */
export function projectInspectionWatchposts(snapshot: GeneralInspectionsSnapshot, now = Date.now()) {
  let report: ReturnType<typeof buildWhyNotGreenReport> | null = null;
  try {
    report = buildWhyNotGreenReport(snapshot, now);
  } catch {
    // Missing source binding or a malformed score contract cannot authorize
    // healthy watchposts. Preserve the observations for diagnosis only.
  }
  const evidence = new Map(report?.evidenceChecks.map((row) => [row.checkKey, row]));
  return snapshot.categories.flatMap((group) => group.checks.map((check) => {
    const row = evidence.get(group.id + "/" + check.id);
    const evidenceStatus = row?.evidenceStatus ?? "UNKNOWN";
    const points = check.ratio
      ? check.ratio.passed + "/" + check.ratio.total + " checks"
      : String(check.earned) + "/" + check.weight + " points";
    const at = check.evidenceAt;
    return {
      id: "inspection/" + group.id + "/" + check.id,
      name: check.label.slice(0, 110),
      lane: group.title,
      kind: "inspection" as const,
      state: inspectionAgentState(check.state, check.weight > 0 ? check.earned / check.weight : 0, evidenceStatus),
      task: group.description.slice(0, 140),
      signal: evidenceStatus === "PASS" ? points : evidenceStatus + " EVIDENCE · " + points,
      evidenceAt: at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : null,
      source: "General Inspections" as const,
      evidenceStatus,
      evidenceReason: row?.reason ?? "invalid-or-unbound-inspection-snapshot",
    };
  }));
}

export function systemAgentState(state: string, activeProcess: boolean): KingdomAgentState {
  const value = state.toUpperCase();
  if (["FAILED", "FAIL", "BLOCKED", "UNSAFE"].includes(value)) return "blocked";
  if (activeProcess && ["ACTIVE", "RUNNING", "RUNNING_CAPTURE", "RUNNING_TRANSACTION", "CLAIMED", "RESUME_REQUESTED"].includes(value)) return "working";
  if (["PASS", "READY", "HEALTHY", "CERTIFIED", "COMPLETE", "VERIFIED"].includes(value)) return "healthy";
  if (["ATTENTION", "ATTENTION_REQUIRED", "WATCH", "MAINTENANCE_DUE", "WAITING", "ACTIVE", "RUNNING"].includes(value)) return "watch";
  return "unknown";
}
