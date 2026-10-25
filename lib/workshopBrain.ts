import type { PublicKingdomIntelligence } from "@/lib/kingdomIntelligencePublic";

export type WorkshopBrainSnapshot = {
  available: boolean;
  stale: boolean;
  operatingState: string;
  warDate: string | null;
  sourceExact: boolean;
  certificationStatus: string;
  productionRelease: string | null;
  doctorScore: number | null;
  doctorStatus: string;
  p0: number | null;
  p1: number | null;
  directiveTitle: string | null;
  invariantPassCount: number;
  invariantCount: number;
  activeSystemCount: number;
  attentionSystemCount: number;
};

const ACTIVE_STATES = new Set([
  "ACTIVE",
  "RUNNING",
  "RUNNING_CAPTURE",
  "RUNNING_TRANSACTION",
  "RESUME_REQUESTED",
  "CLAIMED",
]);

const ATTENTION_STATES = new Set([
  "ATTENTION",
  "ATTENTION_REQUIRED",
  "WATCH",
  "BLOCKED",
  "FAILED",
  "UNSAFE",
  "MAINTENANCE_DUE",
]);

export function buildWorkshopBrainSnapshot(
  data: PublicKingdomIntelligence | null | undefined,
): WorkshopBrainSnapshot {
  if (!data?.available) {
    return {
      available: false,
      stale: true,
      operatingState: "UNKNOWN",
      warDate: null,
      sourceExact: false,
      certificationStatus: "UNKNOWN",
      productionRelease: null,
      doctorScore: null,
      doctorStatus: "UNKNOWN",
      p0: null,
      p1: null,
      directiveTitle: null,
      invariantPassCount: 0,
      invariantCount: 0,
      activeSystemCount: 0,
      attentionSystemCount: 0,
    };
  }

  const state = (value: string | null | undefined) =>
    String(value || "UNKNOWN").toUpperCase();

  // A responding bridge and its self-reported source.exact flag are not
  // independently certified production authority. P0/P1 are usable only
  // when the existing sanitized adapter has both genuinely observed counters
  // in a current, internally consistent source report. Preserve real zeroes.
  const severityObserved = !data.stale &&
    data.health?.observation?.status === "SOURCE_REPORTED" &&
    typeof data.health.p0 === "number" && Number.isSafeInteger(data.health.p0) && data.health.p0 >= 0 &&
    typeof data.health.p1 === "number" && Number.isSafeInteger(data.health.p1) && data.health.p1 >= 0;
  const stateReported = state(data.operatingState);
  const operatingState = !severityObserved && ["HEALTHY", "PASS", "CERTIFIED"].includes(stateReported)
    ? "UNKNOWN" : data.operatingState;

  return {
    available: true,
    stale: data.stale,
    operatingState,
    warDate: data.warDate,
    // Workshop has no independent certified release SHA/BUILD_ID reader.
    // Never promote the bridge's own assertion to an exact-source badge.
    sourceExact: false,
    certificationStatus: "UNVERIFIED",
    productionRelease: data.source?.productionRelease ?? null,
    doctorScore: severityObserved ? data.health?.doctorScore ?? null : null,
    doctorStatus: severityObserved ? data.health?.doctorStatus ?? "UNKNOWN" : "UNKNOWN",
    p0: severityObserved ? data.health?.p0 ?? null : null,
    p1: severityObserved ? data.health?.p1 ?? null : null,
    directiveTitle: data.directive?.title ?? null,
    invariantPassCount: data.invariants.filter(
      (item) => state(item.status) === "PASS",
    ).length,
    invariantCount: data.invariants.length,
    activeSystemCount: data.systemAgents.filter((item) =>
      ACTIVE_STATES.has(state(item.state)),
    ).length,
    attentionSystemCount: data.systemAgents.filter((item) =>
      ATTENTION_STATES.has(state(item.state)),
    ).length,
  };
}
