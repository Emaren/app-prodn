import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "./generated/prisma/index.js";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_NOTE_LENGTH = 2_000;

export const DESYNC_REVIEW_REQUIRED = "commissioner_resolution_required" as const;
export const DESYNC_REVIEW_REMATCH = "rematch" as const;
export const DESYNC_REVIEW_VOID_REFUND = "void_refund" as const;
export const DESYNC_REVIEW_CORRECTED = "corrected" as const;
export const DESYNC_REVIEW_UNREVIEWED = "unreviewed" as const;

export const DESYNC_COMPETITIVE_UNRESOLVED = "unresolved" as const;
export const DESYNC_AXIS_NOT_APPLICABLE = "not_applicable" as const;
export const DESYNC_SETTLEMENT_COMMISSIONER_REVIEW = "commissioner_review" as const;
export const DESYNC_SETTLEMENT_REMATCH = "rematch" as const;
export const DESYNC_SETTLEMENT_VOID_REFUND = "void_refund" as const;

// TODO(desync-side-market): a future YES/NO desync proposition may consume the
// effective human truth from this ledger. It must remain independent of the
// ordinary winner proposition and its settlement rail.

export type ReplayDesyncReviewState =
  | typeof DESYNC_REVIEW_REQUIRED
  | typeof DESYNC_REVIEW_REMATCH
  | typeof DESYNC_REVIEW_VOID_REFUND
  | typeof DESYNC_REVIEW_CORRECTED
  | typeof DESYNC_REVIEW_UNREVIEWED;

export type ReplayDesyncCompetitiveResultStatus =
  | typeof DESYNC_COMPETITIVE_UNRESOLVED
  | typeof DESYNC_AXIS_NOT_APPLICABLE;

export type ReplayDesyncSettlementDisposition =
  | typeof DESYNC_SETTLEMENT_COMMISSIONER_REVIEW
  | typeof DESYNC_SETTLEMENT_REMATCH
  | typeof DESYNC_SETTLEMENT_VOID_REFUND
  | typeof DESYNC_AXIS_NOT_APPLICABLE;

export type ReplayDesyncIncidentInput = {
  idempotencyKey?: unknown;
  sourceReplayHash?: unknown;
  sourceParseIteration?: unknown;
  desyncOccurred?: unknown;
  competitiveResultStatus?: unknown;
  settlementDisposition?: unknown;
  note?: unknown;
  supersedesId?: unknown;
  scheduledMatchId?: unknown;
};

export type ValidatedReplayDesyncIncidentInput = {
  idempotencyKey: string;
  sourceReplayHash: string;
  sourceParseIteration: number;
  desyncOccurred: boolean;
  competitiveResultStatus: ReplayDesyncCompetitiveResultStatus;
  settlementDisposition: ReplayDesyncSettlementDisposition;
  note: string | null;
  supersedesId: number | null;
  scheduledMatchId: number | null;
  inputHash: string;
};

type DesyncIncidentRow = {
  id: number;
  gameStatsId: number;
  scheduledMatchId: number | null;
  supersedesId: number | null;
  desyncOccurred: boolean;
  competitiveResultStatus: string;
  settlementDisposition: string;
  reviewerUidSnapshot: string;
  reviewerDisplayNameSnapshot: string;
  note: string | null;
  sourceReplayHash: string;
  sourceParseIteration: number;
  parserDesyncCandidate: boolean;
  machineEvidence: Prisma.JsonValue;
  createdAt: Date;
};

type DesyncReviewGame = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_iteration: number;
  disconnect_detected: boolean;
  parse_source: string;
  parse_reason: string;
  event_types: Prisma.JsonValue | null;
  key_events: Prisma.JsonValue | null;
};

export class ReplayDesyncIncidentError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ReplayDesyncIncidentError";
    this.status = status;
    this.code = code;
  }
}

function fail(status: number, code: string, message: string): never {
  throw new ReplayDesyncIncidentError(status, code, message);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function positiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function nonNegativeInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function stableJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)])
    );
  }
  return null;
}

function sha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableJsonValue(value)))
    .digest("hex");
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return jsonRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function desyncKeyFlags(value: unknown): Record<string, boolean | number | string> {
  const source = jsonRecord(value);
  if (!source) return {};
  const flags: Record<string, boolean | number | string> = {};
  for (const [key, entry] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase();
    if (
      (normalizedKey.includes("desync") || normalizedKey.includes("disconnect")) &&
      (typeof entry === "boolean" || typeof entry === "number" || typeof entry === "string")
    ) {
      flags[key] = entry;
    }
  }
  return flags;
}

function desyncEventTypes(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  return entries
    .map((entry) => String(entry).trim())
    .filter((entry) => /desync|disconnect/i.test(entry))
    .slice(0, 50);
}

export function buildReplayDesyncMachineEvidence(game: {
  disconnect_detected: boolean;
  parse_source: string;
  parse_reason: string;
  event_types: unknown;
  key_events: unknown;
}) {
  const keyEventFlags = desyncKeyFlags(game.key_events);
  const eventTypeSignals = desyncEventTypes(game.event_types);
  const parserDesyncCandidate =
    game.disconnect_detected ||
    /desync|disconnect/i.test(game.parse_reason) ||
    eventTypeSignals.length > 0 ||
    Object.values(keyEventFlags).some((value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      return /^(true|yes|desync|disconnect)/i.test(value.trim());
    });

  return {
    parserDesyncCandidate,
    machineEvidence: {
      disconnectDetected: game.disconnect_detected,
      parseSource: game.parse_source,
      parseReason: game.parse_reason,
      eventTypeSignals,
      keyEventFlags,
    } satisfies Prisma.InputJsonObject,
  };
}

export function validateReplayDesyncIncident(input: {
  payload: ReplayDesyncIncidentInput;
  replayHash: string;
  parseIteration: number;
}): ValidatedReplayDesyncIncidentInput {
  const idempotencyKey = cleanText(input.payload.idempotencyKey, 128);
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    fail(
      400,
      "invalid_idempotency_key",
      "Provide an idempotency key between 8 and 128 safe characters."
    );
  }

  const sourceReplayHash = cleanText(input.payload.sourceReplayHash, 64).toLowerCase();
  if (!SHA256_PATTERN.test(sourceReplayHash) || sourceReplayHash !== input.replayHash.toLowerCase()) {
    fail(409, "stale_replay_hash", "The replay changed. Reload before confirming a desync.");
  }

  const sourceParseIteration = nonNegativeInteger(input.payload.sourceParseIteration);
  if (sourceParseIteration === null || sourceParseIteration !== input.parseIteration) {
    fail(409, "stale_parse_iteration", "A newer parser pass exists. Reload before confirming a desync.");
  }

  if (typeof input.payload.desyncOccurred !== "boolean") {
    fail(400, "desync_truth_required", "desyncOccurred must be an explicit boolean.");
  }

  const competitiveResultStatus = cleanText(input.payload.competitiveResultStatus, 24) ||
    (input.payload.desyncOccurred
      ? DESYNC_COMPETITIVE_UNRESOLVED
      : DESYNC_AXIS_NOT_APPLICABLE);
  if (
    competitiveResultStatus !== DESYNC_COMPETITIVE_UNRESOLVED &&
    competitiveResultStatus !== DESYNC_AXIS_NOT_APPLICABLE
  ) {
    fail(
      400,
      "invalid_competitive_result_status",
      "competitiveResultStatus must be unresolved or not_applicable."
    );
  }

  const settlementDisposition = cleanText(input.payload.settlementDisposition, 32) ||
    (input.payload.desyncOccurred
      ? DESYNC_SETTLEMENT_COMMISSIONER_REVIEW
      : DESYNC_AXIS_NOT_APPLICABLE);
  if (
    settlementDisposition !== DESYNC_SETTLEMENT_COMMISSIONER_REVIEW &&
    settlementDisposition !== DESYNC_SETTLEMENT_REMATCH &&
    settlementDisposition !== DESYNC_SETTLEMENT_VOID_REFUND &&
    settlementDisposition !== DESYNC_AXIS_NOT_APPLICABLE
  ) {
    fail(
      400,
      "invalid_settlement_disposition",
      "settlementDisposition must be commissioner_review, rematch, void_refund, or not_applicable."
    );
  }
  if (
    input.payload.desyncOccurred &&
    (
      competitiveResultStatus !== DESYNC_COMPETITIVE_UNRESOLVED ||
      settlementDisposition === DESYNC_AXIS_NOT_APPLICABLE
    )
  ) {
    fail(
      422,
      "desync_axes_inconsistent",
      "A confirmed desync keeps the competitive result unresolved and requires a protocol disposition."
    );
  }
  if (
    !input.payload.desyncOccurred &&
    (
      competitiveResultStatus !== DESYNC_AXIS_NOT_APPLICABLE ||
      settlementDisposition !== DESYNC_AXIS_NOT_APPLICABLE
    )
  ) {
    fail(
      422,
      "desync_correction_axes_inconsistent",
      "A correction that withdraws desync truth must mark both independent axes not_applicable."
    );
  }

  if (
    input.payload.note !== undefined &&
    input.payload.note !== null &&
    typeof input.payload.note !== "string"
  ) {
    fail(400, "invalid_desync_note", "The optional desync note must be text.");
  }
  if (typeof input.payload.note === "string" && input.payload.note.trim().length > MAX_NOTE_LENGTH) {
    fail(413, "desync_note_too_large", "The desync note must be 2,000 characters or shorter.");
  }
  const note = cleanText(input.payload.note, MAX_NOTE_LENGTH) || null;

  const supersedesId =
    input.payload.supersedesId === undefined || input.payload.supersedesId === null
      ? null
      : positiveInteger(input.payload.supersedesId);
  if (input.payload.supersedesId != null && supersedesId === null) {
    fail(400, "invalid_supersedes_id", "supersedesId must identify an existing incident.");
  }

  const scheduledMatchId =
    input.payload.scheduledMatchId === undefined || input.payload.scheduledMatchId === null
      ? null
      : positiveInteger(input.payload.scheduledMatchId);
  if (input.payload.scheduledMatchId != null && scheduledMatchId === null) {
    fail(400, "invalid_scheduled_match_id", "scheduledMatchId must identify a Challenge Match.");
  }

  const canonical = {
    idempotencyKey,
    sourceReplayHash,
    sourceParseIteration,
    desyncOccurred: input.payload.desyncOccurred,
    competitiveResultStatus,
    settlementDisposition,
    note,
    supersedesId,
    scheduledMatchId,
  };

  return {
    ...canonical,
    inputHash: sha256(canonical),
  };
}

export function replayDesyncReviewState(
  current: Pick<DesyncIncidentRow, "desyncOccurred" | "settlementDisposition"> | null | undefined
): ReplayDesyncReviewState {
  if (!current) return DESYNC_REVIEW_UNREVIEWED;
  if (!current.desyncOccurred) return DESYNC_REVIEW_CORRECTED;
  if (current.settlementDisposition === DESYNC_SETTLEMENT_REMATCH) {
    return DESYNC_REVIEW_REMATCH;
  }
  if (current.settlementDisposition === DESYNC_SETTLEMENT_VOID_REFUND) {
    return DESYNC_REVIEW_VOID_REFUND;
  }
  return DESYNC_REVIEW_REQUIRED;
}

export function replayDesyncIncidentDto(incident: DesyncIncidentRow) {
  return {
    id: incident.id,
    gameStatsId: incident.gameStatsId,
    scheduledMatchId: incident.scheduledMatchId,
    supersedesId: incident.supersedesId,
    desyncOccurred: incident.desyncOccurred,
    competitiveResultStatus: incident.competitiveResultStatus,
    settlementDisposition: incident.settlementDisposition,
    reviewerUid: incident.reviewerUidSnapshot,
    reviewerDisplayName: incident.reviewerDisplayNameSnapshot,
    note: incident.note,
    sourceReplayHash: incident.sourceReplayHash,
    sourceParseIteration: incident.sourceParseIteration,
    parserDesyncCandidate: incident.parserDesyncCandidate,
    machineEvidence: incident.machineEvidence,
    createdAt: incident.createdAt,
  };
}

export async function loadReplayDesyncIncidentProvenance(
  prisma: PrismaClient,
  gameStatsId: number
) {
  const rows = await prisma.replayDesyncIncident.findMany({
    where: { gameStatsId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      gameStatsId: true,
      scheduledMatchId: true,
      supersedesId: true,
      desyncOccurred: true,
      competitiveResultStatus: true,
      settlementDisposition: true,
      reviewerUidSnapshot: true,
      reviewerDisplayNameSnapshot: true,
      note: true,
      sourceReplayHash: true,
      sourceParseIteration: true,
      parserDesyncCandidate: true,
      machineEvidence: true,
      createdAt: true,
    },
  });
  const incidents = rows.map(replayDesyncIncidentDto);
  const currentDesyncIncident = incidents[0] ?? null;

  return {
    desyncOccurred: currentDesyncIncident?.desyncOccurred ?? false,
    desyncReviewState: replayDesyncReviewState(rows[0] ?? null),
    currentDesyncIncident,
    desyncIncidents: incidents,
  };
}

async function resolveScheduledMatchId(
  tx: Prisma.TransactionClient,
  game: DesyncReviewGame,
  requestedId: number | null,
  priorIncidentMatchId: number | null
) {
  const sessionKeys = [game.replay_file, game.original_filename, game.replayHash]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);

  const [marketLinks, trophyLinks, sessionLinks] = await Promise.all([
    tx.betMarket.findMany({
      where: {
        linkedGameStatsId: game.id,
        scheduledMatchId: { not: null },
      },
      select: { scheduledMatchId: true },
    }),
    tx.trophyChallenge.findMany({
      where: {
        replayId: game.id,
        scheduledMatchId: { not: null },
      },
      select: { scheduledMatchId: true },
    }),
    sessionKeys.length > 0
      ? tx.scheduledMatch.findMany({
          where: {
            OR: sessionKeys.map((sessionKey) => ({
              linkedSessionKey: { equals: sessionKey, mode: "insensitive" as const },
            })),
          },
          select: { id: true },
        })
      : Promise.resolve([] as Array<{ id: number }>),
  ]);

  const authoritativeIds = new Set<number>([
    ...marketLinks.flatMap((entry) => entry.scheduledMatchId ?? []),
    ...trophyLinks.flatMap((entry) => entry.scheduledMatchId ?? []),
    ...(priorIncidentMatchId === null ? [] : [priorIncidentMatchId]),
  ]);
  const sessionIds = new Set(sessionLinks.map((entry) => entry.id));
  const allIds = new Set([...authoritativeIds, ...sessionIds]);

  if (requestedId !== null) {
    if (!allIds.has(requestedId)) {
      fail(
        409,
        "scheduled_match_not_linked",
        "That Challenge Match is not linked to this replay's existing evidence."
      );
    }
    return requestedId;
  }

  if (priorIncidentMatchId !== null) return priorIncidentMatchId;
  if (authoritativeIds.size === 1) return [...authoritativeIds][0];
  if (authoritativeIds.size === 0 && sessionIds.size === 1) return [...sessionIds][0];
  return null;
}

function reviewerDisplayName(viewer: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return viewer.inGameName || viewer.steamPersonaName || viewer.uid;
}

export async function submitReplayDesyncIncident(input: {
  prisma: PrismaClient;
  viewerUid: string;
  gameStatsId: number;
  payload: ReplayDesyncIncidentInput;
}) {
  const { prisma, viewerUid, gameStatsId, payload } = input;
  const viewer = await prisma.user.findUnique({
    where: { uid: viewerUid },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });
  if (!viewer) fail(401, "viewer_not_found", "Sign in again before reviewing a desync.");
  if (!viewer.isAdmin) {
    fail(403, "desync_admin_required", "Only a site admin can confirm or correct a desync.");
  }

  let expectedInputHash: string | null = null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ lock_acquired: number }>>`
        SELECT 1::int AS lock_acquired
        FROM pg_advisory_xact_lock(${gameStatsId})
      `;

      const game = await tx.gameStats.findUnique({
        where: { id: gameStatsId },
        select: {
          id: true,
          replayHash: true,
          replay_file: true,
          original_filename: true,
          parse_iteration: true,
          disconnect_detected: true,
          parse_source: true,
          parse_reason: true,
          event_types: true,
          key_events: true,
        },
      });
      if (!game) fail(404, "game_not_found", "Replay game not found.");

      const validated = validateReplayDesyncIncident({
        payload,
        replayHash: game.replayHash,
        parseIteration: game.parse_iteration,
      });
      expectedInputHash = validated.inputHash;

      const existingIdempotent = await tx.replayDesyncIncident.findUnique({
        where: { idempotencyKey: validated.idempotencyKey },
      });
      if (existingIdempotent) {
        if (
          existingIdempotent.gameStatsId === gameStatsId &&
          existingIdempotent.reviewerUserId === viewer.id &&
          existingIdempotent.inputHash === validated.inputHash
        ) {
          return { incident: existingIdempotent, created: false };
        }
        fail(
          409,
          "idempotency_conflict",
          "That idempotency key was already used for another desync decision."
        );
      }

      const previous = await tx.replayDesyncIncident.findFirst({
        where: { gameStatsId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, scheduledMatchId: true },
      });
      if (!previous && !validated.desyncOccurred) {
        fail(
          409,
          "initial_desync_must_confirm",
          "The first desync incident must confirm that a desync occurred."
        );
      }
      if (
        !previous &&
        validated.settlementDisposition !== DESYNC_SETTLEMENT_COMMISSIONER_REVIEW
      ) {
        fail(
          409,
          "initial_desync_requires_review",
          "A first desync confirmation must enter commissioner review before rematch or refund disposition."
        );
      }
      if (previous && validated.supersedesId === null) {
        fail(
          409,
          "supersedes_required",
          "This replay already has desync history. Name the latest incident this correction supersedes."
        );
      }
      if (validated.supersedesId !== null) {
        const superseded = await tx.replayDesyncIncident.findFirst({
          where: { id: validated.supersedesId, gameStatsId },
          select: { id: true },
        });
        if (!superseded) {
          fail(
            409,
            "supersedes_not_found",
            "The superseded desync incident does not belong to this replay."
          );
        }
        if (!previous || validated.supersedesId !== previous.id) {
          fail(
            409,
            "stale_superseded_incident",
            "A newer desync decision exists. Reload before appending this correction."
          );
        }
      }

      const scheduledMatchId = await resolveScheduledMatchId(
        tx,
        game,
        validated.scheduledMatchId,
        previous?.scheduledMatchId ?? null
      );
      const machine = buildReplayDesyncMachineEvidence(game);
      const incident = await tx.replayDesyncIncident.create({
        data: {
          gameStatsId,
          scheduledMatchId,
          reviewerUserId: viewer.id,
          supersedesId: validated.supersedesId,
          idempotencyKey: validated.idempotencyKey,
          inputHash: validated.inputHash,
          desyncOccurred: validated.desyncOccurred,
          competitiveResultStatus: validated.competitiveResultStatus,
          settlementDisposition: validated.settlementDisposition,
          reviewerUidSnapshot: viewer.uid,
          reviewerDisplayNameSnapshot: reviewerDisplayName(viewer),
          note: validated.note,
          sourceReplayHash: validated.sourceReplayHash,
          sourceParseIteration: validated.sourceParseIteration,
          parserDesyncCandidate: machine.parserDesyncCandidate,
          machineEvidence: machine.machineEvidence,
        },
      });

      return { incident, created: true };
    });

    const incident = replayDesyncIncidentDto(result.incident);
    return {
      ...result,
      incident,
      desyncOccurred: incident.desyncOccurred,
      desyncReviewState: replayDesyncReviewState(result.incident),
      access: { isAdmin: true },
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const idempotencyKey = cleanText(payload.idempotencyKey, 128);
      const existing = idempotencyKey
        ? await prisma.replayDesyncIncident.findUnique({ where: { idempotencyKey } })
        : null;
      if (
        existing &&
        existing.gameStatsId === gameStatsId &&
        existing.reviewerUserId === viewer.id &&
        expectedInputHash !== null &&
        existing.inputHash === expectedInputHash
      ) {
        const incident = replayDesyncIncidentDto(existing);
        return {
          incident,
          created: false,
          desyncOccurred: incident.desyncOccurred,
          desyncReviewState: replayDesyncReviewState(existing),
          access: { isAdmin: true },
        };
      }
      fail(
        409,
        "desync_incident_conflict",
        "A concurrent desync decision was recorded. Reload before appending a correction."
      );
    }
    throw error;
  }
}
