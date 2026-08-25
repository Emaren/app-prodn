export const WARGRAPH_RESOLVE_ADVANCE_JOB_TYPE = "resolve_advance" as const;
export const WARGRAPH_RESOLVE_PAIRING_JOB_TYPE = "resolve_pairing" as const;

export const WARGRAPH_RESOLVE_ADVANCE_JOB_SCHEMA =
  "aoe2war-wargraph-resolve-advance-job/v1" as const;
export const WARGRAPH_RESOLVE_PAIRING_JOB_SCHEMA =
  "aoe2war-wargraph-resolve-pairing-job/v1" as const;

export type WarGraphDeadlineJobType =
  | typeof WARGRAPH_RESOLVE_ADVANCE_JOB_TYPE
  | typeof WARGRAPH_RESOLVE_PAIRING_JOB_TYPE;

export type WarGraphAdvanceDeadlinePayload = {
  schema: typeof WARGRAPH_RESOLVE_ADVANCE_JOB_SCHEMA;
  advanceId: string;
};

export type WarGraphPairingDeadlinePayload = {
  schema: typeof WARGRAPH_RESOLVE_PAIRING_JOB_SCHEMA;
  pairingId: string;
};

export type WarGraphDeadlinePayload =
  | WarGraphAdvanceDeadlinePayload
  | WarGraphPairingDeadlinePayload;

export type WarGraphPairingDeadlineKind =
  | "DEFENDER_NO_START_DEFAULT"
  | "CHALLENGER_ABANDONMENT"
  | "TECHNICAL_VOID"
  | "MUTUAL_NO_START"
  | "SYSTEM_VOID";

export type WarGraphPairingDeadlineDecision =
  | {
      kind: "retry";
      code: "WARGRAPH_PAIRING_DEADLINE_PENDING";
      availableAt: Date;
    }
  | {
      kind: "exact_game";
    }
  | {
      kind: "terminal";
    }
  | {
      kind: "resolve";
      resolutionKind: WarGraphPairingDeadlineKind;
      aggressorAction: 0 | 1;
      defenderAction: 0 | 1;
      seatClaim: boolean;
      punishmentApplied: boolean;
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

/** Strictly binds durable job type, schema, and public aggregate identity. */
export function parseWarGraphDeadlineJobPayload(
  jobType: unknown,
  payload: unknown,
): WarGraphDeadlinePayload | null {
  if (!isRecord(payload)) return null;

  if (jobType === WARGRAPH_RESOLVE_ADVANCE_JOB_TYPE) {
    if (
      !exactKeys(payload, ["schema", "advanceId"]) ||
      payload.schema !== WARGRAPH_RESOLVE_ADVANCE_JOB_SCHEMA ||
      typeof payload.advanceId !== "string" ||
      !UUID.test(payload.advanceId)
    ) {
      return null;
    }
    return {
      schema: WARGRAPH_RESOLVE_ADVANCE_JOB_SCHEMA,
      advanceId: payload.advanceId,
    };
  }

  if (jobType === WARGRAPH_RESOLVE_PAIRING_JOB_TYPE) {
    if (
      !exactKeys(payload, ["schema", "pairingId"]) ||
      payload.schema !== WARGRAPH_RESOLVE_PAIRING_JOB_SCHEMA ||
      typeof payload.pairingId !== "string" ||
      !UUID.test(payload.pairingId)
    ) {
      return null;
    }
    return {
      schema: WARGRAPH_RESOLVE_PAIRING_JOB_SCHEMA,
      pairingId: payload.pairingId,
    };
  }

  return null;
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Pure V1 accepted-pairing deadline matrix. Persistence performs the frozen
 * graph-state checks; any uncertainty supplied here is deliberately punitive-
 * free and wins over READY evidence.
 */
export function decideWarGraphPairingDeadline(input: {
  now: Date;
  launchDeadlineAt: Date;
  pairingStatus: string;
  aggressorReady: boolean;
  defenderReady: boolean;
  exactGameDetected: boolean;
  systemUncertain: boolean;
}): WarGraphPairingDeadlineDecision {
  if (!validDate(input.now) || !validDate(input.launchDeadlineAt)) {
    return {
      kind: "resolve",
      resolutionKind: "SYSTEM_VOID",
      aggressorAction: 0,
      defenderAction: 0,
      seatClaim: false,
      punishmentApplied: false,
    };
  }

  if (input.pairingStatus === "settled" || input.pairingStatus === "voided") {
    return { kind: "terminal" };
  }

  if (input.exactGameDetected) return { kind: "exact_game" };

  if (input.now < input.launchDeadlineAt) {
    return {
      kind: "retry",
      code: "WARGRAPH_PAIRING_DEADLINE_PENDING",
      availableAt: new Date(input.launchDeadlineAt),
    };
  }

  if (
    input.systemUncertain ||
    !["accepted", "engaged"].includes(input.pairingStatus)
  ) {
    return {
      kind: "resolve",
      resolutionKind: "SYSTEM_VOID",
      aggressorAction: 0,
      defenderAction: 0,
      seatClaim: false,
      punishmentApplied: false,
    };
  }

  if (input.aggressorReady && input.defenderReady) {
    return {
      kind: "resolve",
      resolutionKind: "TECHNICAL_VOID",
      aggressorAction: 0,
      defenderAction: 0,
      seatClaim: false,
      punishmentApplied: false,
    };
  }
  if (input.aggressorReady) {
    return {
      kind: "resolve",
      resolutionKind: "DEFENDER_NO_START_DEFAULT",
      aggressorAction: 1,
      defenderAction: 1,
      seatClaim: true,
      punishmentApplied: true,
    };
  }
  if (input.defenderReady) {
    return {
      kind: "resolve",
      resolutionKind: "CHALLENGER_ABANDONMENT",
      aggressorAction: 1,
      defenderAction: 0,
      seatClaim: false,
      punishmentApplied: true,
    };
  }
  return {
    kind: "resolve",
    resolutionKind: "MUTUAL_NO_START",
    aggressorAction: 0,
    defenderAction: 0,
    seatClaim: false,
    punishmentApplied: false,
  };
}
