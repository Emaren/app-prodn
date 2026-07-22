import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/index.js";
import {
  buildReplayDesyncMachineEvidence,
  replayDesyncIncidentDto,
  replayDesyncReviewState,
  ReplayDesyncIncidentError,
  submitReplayDesyncIncident,
  validateReplayDesyncIncident,
} from "../lib/replayDesyncIncidents.ts";

const replayHash = "d".repeat(64);

function confirmationPayload() {
  return {
    idempotencyKey: "desync:game-42:first",
    sourceReplayHash: replayHash,
    sourceParseIteration: 3,
    desyncOccurred: true,
    note: "Both players confirmed the game desynchronized.",
  };
}

test("only a site admin may append human desync truth", async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 9,
        uid: "ordinary-user",
        isAdmin: false,
        inGameName: "Player",
        steamPersonaName: null,
      }),
    },
  } as unknown as PrismaClient;

  await assert.rejects(
    submitReplayDesyncIncident({
      prisma,
      viewerUid: "ordinary-user",
      gameStatsId: 42,
      payload: confirmationPayload(),
    }),
    (error) =>
      error instanceof ReplayDesyncIncidentError &&
      error.status === 403 &&
      error.code === "desync_admin_required"
  );
});

test("confirmation keeps desync, competitive result, and settlement as separate axes", () => {
  const validated = validateReplayDesyncIncident({
    payload: confirmationPayload(),
    replayHash,
    parseIteration: 3,
  });

  assert.equal(validated.desyncOccurred, true);
  assert.equal(validated.competitiveResultStatus, "unresolved");
  assert.equal(validated.settlementDisposition, "commissioner_review");
  assert.equal("winner" in validated, false);
  assert.equal("winningTeamKey" in validated, false);
  assert.equal("affectsBets" in validated, false);
});

test("a rematch disposition appends without deleting the confirmed incident", () => {
  const validated = validateReplayDesyncIncident({
    payload: {
      ...confirmationPayload(),
      idempotencyKey: "desync:game-42:rematch",
      supersedesId: 17,
      settlementDisposition: "rematch",
    },
    replayHash,
    parseIteration: 3,
  });

  assert.equal(validated.desyncOccurred, true);
  assert.equal(validated.supersedesId, 17);
  assert.equal(validated.competitiveResultStatus, "unresolved");
  assert.equal(validated.settlementDisposition, "rematch");
});

test("a false correction is explicit and leaves the prior true row addressable", () => {
  const validated = validateReplayDesyncIncident({
    payload: {
      ...confirmationPayload(),
      idempotencyKey: "desync:game-42:correction",
      desyncOccurred: false,
      supersedesId: 18,
    },
    replayHash,
    parseIteration: 3,
  });

  assert.equal(validated.desyncOccurred, false);
  assert.equal(validated.supersedesId, 18);
  assert.equal(validated.competitiveResultStatus, "not_applicable");
  assert.equal(validated.settlementDisposition, "not_applicable");
  assert.equal(replayDesyncReviewState({
    desyncOccurred: false,
    settlementDisposition: "not_applicable",
  }), "corrected");
});

test("inconsistent result or settlement axes are rejected", () => {
  assert.throws(
    () =>
      validateReplayDesyncIncident({
        payload: {
          ...confirmationPayload(),
          competitiveResultStatus: "resolved",
        },
        replayHash,
        parseIteration: 3,
      }),
    (error) =>
      error instanceof ReplayDesyncIncidentError &&
      error.code === "invalid_competitive_result_status"
  );

  assert.throws(
    () =>
      validateReplayDesyncIncident({
        payload: {
          ...confirmationPayload(),
          desyncOccurred: false,
          supersedesId: 18,
          settlementDisposition: "void_refund",
        },
        replayHash,
        parseIteration: 3,
      }),
    (error) =>
      error instanceof ReplayDesyncIncidentError &&
      error.code === "desync_correction_axes_inconsistent"
  );
});

test("machine suspicion is captured separately from human confirmation", () => {
  const evidence = buildReplayDesyncMachineEvidence({
    disconnect_detected: false,
    parse_source: "watcher_final",
    parse_reason: "possible_desync_signal",
    event_types: ["game_started", "disconnect_warning"],
    key_events: { desync_detected: true, winner: "Jim" },
  });

  assert.equal(evidence.parserDesyncCandidate, true);
  assert.deepEqual(evidence.machineEvidence.eventTypeSignals, ["disconnect_warning"]);
  assert.deepEqual(evidence.machineEvidence.keyEventFlags, { desync_detected: true });
  assert.equal("desyncOccurred" in evidence.machineEvidence, false);
});

test("the public DTO carries provenance and no manufactured winner", () => {
  const dto = replayDesyncIncidentDto({
    id: 21,
    gameStatsId: 42,
    scheduledMatchId: 24,
    supersedesId: null,
    desyncOccurred: true,
    competitiveResultStatus: "unresolved",
    settlementDisposition: "commissioner_review",
    reviewerUidSnapshot: "commissioner-uid",
    reviewerDisplayNameSnapshot: "Emaren",
    note: "Confirmed from both watcher feeds.",
    sourceReplayHash: replayHash,
    sourceParseIteration: 3,
    parserDesyncCandidate: true,
    machineEvidence: { disconnectDetected: true },
    createdAt: new Date("2026-07-22T20:00:00.000Z"),
  });

  assert.equal(dto.scheduledMatchId, 24);
  assert.equal(dto.reviewerUid, "commissioner-uid");
  assert.equal(dto.desyncOccurred, true);
  assert.equal(dto.competitiveResultStatus, "unresolved");
  assert.equal(dto.settlementDisposition, "commissioner_review");
  assert.equal("winner" in dto, false);
});

test("identical requests hash identically and the database ledger is append-only", () => {
  const first = validateReplayDesyncIncident({
    payload: confirmationPayload(),
    replayHash,
    parseIteration: 3,
  });
  const retry = validateReplayDesyncIncident({
    payload: confirmationPayload(),
    replayHash,
    parseIteration: 3,
  });
  assert.equal(first.inputHash, retry.inputHash);

  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260722203000_add_replay_desync_incidents/migration.sql",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(migration, /uq_replay_desync_incidents_idempotency/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "replay_desync_incidents"/);
  assert.match(migration, /BEFORE TRUNCATE ON "replay_desync_incidents"/);
  assert.match(migration, /append a superseding incident instead/);
});

test("an identical idempotency-key retry returns the original append", async () => {
  const payload = confirmationPayload();
  const validated = validateReplayDesyncIncident({
    payload,
    replayHash,
    parseIteration: 3,
  });
  const existing = {
    id: 31,
    gameStatsId: 42,
    scheduledMatchId: 24,
    reviewerUserId: 1,
    supersedesId: null,
    idempotencyKey: validated.idempotencyKey,
    inputHash: validated.inputHash,
    desyncOccurred: true,
    competitiveResultStatus: "unresolved",
    settlementDisposition: "commissioner_review",
    reviewerUidSnapshot: "commissioner-uid",
    reviewerDisplayNameSnapshot: "Emaren",
    note: validated.note,
    sourceReplayHash: replayHash,
    sourceParseIteration: 3,
    parserDesyncCandidate: false,
    machineEvidence: {
      disconnectDetected: false,
      parseSource: "watcher_final",
      parseReason: "winner_unresolved",
      eventTypeSignals: [],
      keyEventFlags: {},
    },
    createdAt: new Date("2026-07-22T20:00:00.000Z"),
  };
  const tx = {
    $queryRaw: async () => [{ lock_acquired: 1 }],
    gameStats: {
      findUnique: async () => ({
        id: 42,
        replayHash,
        replay_file: "match-42.mgx",
        original_filename: "match-42.mgx",
        parse_iteration: 3,
        disconnect_detected: false,
        parse_source: "watcher_final",
        parse_reason: "winner_unresolved",
        event_types: [],
        key_events: {},
      }),
    },
    replayDesyncIncident: {
      findUnique: async () => existing,
    },
  };
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 1,
        uid: "commissioner-uid",
        isAdmin: true,
        inGameName: "Emaren",
        steamPersonaName: null,
      }),
    },
    $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaClient;

  const result = await submitReplayDesyncIncident({
    prisma,
    viewerUid: "commissioner-uid",
    gameStatsId: 42,
    payload,
  });

  assert.equal(result.created, false);
  assert.equal(result.incident.id, 31);
  assert.equal(result.incident.scheduledMatchId, 24);
  assert.equal(result.desyncReviewState, "commissioner_resolution_required");
});
