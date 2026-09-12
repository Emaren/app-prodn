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
  p0: number;
  p1: number;
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
      p0: 0,
      p1: 0,
      directiveTitle: null,
      invariantPassCount: 0,
      invariantCount: 0,
      activeSystemCount: 0,
      attentionSystemCount: 0,
    };
  }

  const state = (value: string | null | undefined) =>
    String(value || "UNKNOWN").toUpperCase();

  return {
    available: true,
    stale: data.stale,
    operatingState: data.operatingState,
    warDate: data.warDate,
    sourceExact: data.source?.exact ?? false,
    certificationStatus: data.source?.certificationStatus ?? "UNKNOWN",
    productionRelease: data.source?.productionRelease ?? null,
    doctorScore: data.health?.doctorScore ?? null,
    doctorStatus: data.health?.doctorStatus ?? "UNKNOWN",
    p0: data.health?.p0 ?? 0,
    p1: data.health?.p1 ?? 0,
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
