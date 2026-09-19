import type {
  InspectionCategory,
  InspectionCheck,
  InspectionRatio,
  InspectionState,
} from "./types.ts";

export const INSPECTION_CATEGORY_WEIGHTS = {
  speed: [12, 15, 10, 10, 10, 10, 8, 8, 7, 10],
  documentation: [10, 15, 10, 10, 10, 15, 10, 10, 5, 5],
  organization: [15, 15, 10, 10, 10, 15, 10, 5, 5, 5],
  tests: [20, 10, 15, 10, 10, 10, 10, 5, 10],
  release: [15, 15, 15, 10, 10, 10, 10, 15],
  security: [15, 10, 10, 10, 10, 10, 15, 10, 10],
  data: [15, 10, 10, 10, 10, 10, 10, 10, 5, 10],
} as const;

export function stateForFraction(fraction: number): InspectionState {
  if (fraction >= 0.9) return "green";
  if (fraction >= 0.67) return "amber";
  return "red";
}

export function ratioState(ratio: InspectionRatio): InspectionState {
  if (ratio.total <= 0) return "red";
  if (ratio.passed >= ratio.total) return "green";
  return stateForFraction(ratio.passed / ratio.total);
}

export function points(weight: number, fraction: number) {
  return Math.max(0, Math.min(weight, Math.round(weight * fraction * 10) / 10));
}

export function check(
  id: string,
  label: string,
  weight: number,
  fraction: number,
  detail: string,
  options?: { ratio?: InspectionRatio; evidenceAt?: string | null },
): InspectionCheck {
  const earned = points(weight, fraction);
  return {
    id,
    label,
    weight,
    earned,
    state: options?.ratio ? ratioState(options.ratio) : stateForFraction(earned / weight),
    detail,
    ratio: options?.ratio,
    evidenceAt: options?.evidenceAt,
  };
}

export function category(
  id: string,
  title: string,
  description: string,
  checks: InspectionCheck[],
): InspectionCategory {
  const weight = checks.reduce((sum, item) => sum + item.weight, 0);
  if (Math.abs(weight - 100) > 0.001) {
    throw new Error(id + " inspection weights must total 100, got " + weight);
  }
  const score = Math.round(checks.reduce((sum, item) => sum + item.earned, 0));
  return {
    id,
    title,
    description,
    score,
    maxScore: 100,
    state: stateForFraction(score / 100),
    checks,
  };
}

export function freshnessFraction(
  capturedAt: string | null | undefined,
  freshHours: number,
  staleHours: number,
  now = Date.now(),
) {
  if (!capturedAt) return 0;
  const stamp = Date.parse(capturedAt);
  if (!Number.isFinite(stamp)) return 0;
  const ageHours = Math.max(0, (now - stamp) / 3_600_000);
  if (ageHours <= freshHours) return 1;
  if (ageHours >= staleHours) return 0;
  return 1 - (ageHours - freshHours) / (staleHours - freshHours);
}

export function thresholdFraction(
  value: number | null | undefined,
  greenAt: number,
  amberAt: number,
  direction: "lte" | "gte",
) {
  if (value == null || !Number.isFinite(value)) return 0;
  if (direction === "lte") {
    if (value <= greenAt) return 1;
    if (value <= amberAt) return 0.75;
    return Math.max(0, amberAt / value * 0.5);
  }
  if (value >= greenAt) return 1;
  if (value >= amberAt) return 0.75;
  return Math.max(0, value / Math.max(1, amberAt) * 0.5);
}
