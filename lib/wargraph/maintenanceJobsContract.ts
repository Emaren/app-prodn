export const WARGRAPH_GRAVITY_JOB_SCHEMA =
  "aoe2war-wargraph-gravity-job/v1" as const;
export const WARGRAPH_FOSSILIZATION_JOB_SCHEMA =
  "aoe2war-wargraph-fossilization-job/v1" as const;

export type WarGraphMaintenanceJobPayload =
  | {
      kind: "gravity";
      nightId: number;
      triggerContestId: number;
    }
  | {
      kind: "fossilization";
      nightId: number;
      nextPrimeOpensAt: Date;
    };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export function parseWarGraphMaintenanceJobPayload(
  jobType: string,
  value: unknown,
): WarGraphMaintenanceJobPayload | null {
  const payload = record(value);
  if (!payload) return null;
  if (
    jobType === "apply_gravity" &&
    payload.schema === WARGRAPH_GRAVITY_JOB_SCHEMA &&
    positiveInteger(payload.nightId) &&
    positiveInteger(payload.triggerContestId) &&
    Object.keys(payload).every((key) =>
      ["schema", "nightId", "triggerContestId"].includes(key),
    )
  ) {
    return {
      kind: "gravity",
      nightId: payload.nightId,
      triggerContestId: payload.triggerContestId,
    };
  }
  if (
    jobType === "advance_fossilization" &&
    payload.schema === WARGRAPH_FOSSILIZATION_JOB_SCHEMA &&
    positiveInteger(payload.nightId) &&
    typeof payload.nextPrimeOpensAt === "string" &&
    Object.keys(payload).every((key) =>
      ["schema", "nightId", "nextPrimeOpensAt"].includes(key),
    )
  ) {
    const nextPrimeOpensAt = new Date(payload.nextPrimeOpensAt);
    if (
      !Number.isFinite(nextPrimeOpensAt.getTime()) ||
      nextPrimeOpensAt.toISOString() !== payload.nextPrimeOpensAt
    ) {
      return null;
    }
    return {
      kind: "fossilization",
      nightId: payload.nightId,
      nextPrimeOpensAt,
    };
  }
  return null;
}

export function warGraphMaintenanceRetryDelayMs(attemptCount: number): number {
  const normalized = Number.isSafeInteger(attemptCount)
    ? Math.max(1, Math.min(attemptCount, 8))
    : 1;
  return Math.min(5_000 * 2 ** (normalized - 1), 5 * 60_000);
}
