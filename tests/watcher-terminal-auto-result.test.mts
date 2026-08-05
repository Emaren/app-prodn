import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateWatcherTerminalOwnerLoss,
  reconcileAutomaticWatcherTerminalResults,
  WATCHER_TERMINAL_ADJUDICATION_ACTOR_ROLE,
  WATCHER_TERMINAL_LINKED_MARKET_DISPOSITION,
  WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION,
  WATCHER_TERMINAL_RAW_ACTIVITY_FIELD_PATH,
  type WatcherTerminalOwnerLossInput,
} from "../lib/replayResultAdjudications.ts";
import {
  buildRosterHash,
  normalizeReplayPlayers,
} from "../lib/teamResolution.ts";

const replayHash = "4".repeat(64);

function baseInput(): WatcherTerminalOwnerLossInput {
  return {
    id: 20432,
    replayHash,
    parseIteration: 38,
    parseSource: "watcher_final",
    parseReason: "watcher_final_submission",
    isFinal: true,
    winner: null,
    players: [
      {
        name: "Emaren",
        steam_id: "76561198065420384",
        number: 1,
        team_id: 1,
        winner: false,
      },
      {
        name: "Feegaro",
        steam_id: "76561198442007385",
        number: 2,
        team_id: 2,
        winner: false,
      },
    ],
    keyEvents: {
      rated: true,
      restored: false,
      completed: false,
      platform_id: "hd",
      watcher_upload: {
        file_role: "final_recording",
        final_candidate: true,
        checkpoint_final_rejected: false,
        server_sha256: replayHash,
      },
      team_resolution: {
        format: "1v1",
        status: "resolved",
        confidence: "high",
      },
      result_resolution: {
        result_status: "review_required",
        result_trusted: false,
      },
      resigned_player_numbers: [],
      resigned_player_names: [],
      postgame_available: false,
      has_scores: false,
      has_achievements: false,
    },
    eventTypes: [],
    disconnectDetected: true,
    durationSeconds: 485.64,
    uploaderSteamId: "76561198065420384",
    uploaderUid: "u_emaren",
    uploaderUserId: 7,
    hasAdjudicationHistory: false,
    currentDesyncOccurred: null,
    terminalReceipt: {
      eventId: "9001",
      eventType: "final_settle_observation_complete",
      createdAt: "2026-08-04T02:12:26.796Z",
      userId: 7,
      userUid: "u_emaren",
      sessionId: "session_exact",
      replayHash,
      replayFile: "MP Replay.aoe2record",
      metadata: {
        finalStored: true,
        settleWindowMs: 180000,
      },
    },
    terminalFailureCount: 0,
    rawActivityByPlayer: [
      {
        player_number: 1,
        player_name: "Emaren",
        action_packet_count: 182,
        first_action_ms: 1400,
        last_action_ms: 470990,
      },
      {
        player_number: 2,
        player_name: "Feegaro",
        action_packet_count: 201,
        first_action_ms: 1600,
        last_action_ms: 480268,
      },
    ],
    parseRun: {
      id: 4965,
      passName: "hd_deterministic_evidence",
      passVersion: "8",
    },
  };
}

test("empty automatic reconciliation is a safe no-op", async () => {
  const report = await reconcileAutomaticWatcherTerminalResults(
    {} as never,
    []
  );

  assert.deepEqual(report, {
    requestedCount: 0,
    createdCount: 0,
    existingCount: 0,
    skippedCount: 0,
    outcomes: [],
  });
});

test("automatic reconciliation submits the canonical roster hash", async () => {
  const input = baseInput();
  let createdData: Record<string, unknown> | null = null;
  let parseRunFindFirstArgs:
    | Record<string, unknown>
    | null = null;

  const game = {
    id: input.id,
    userUid: input.uploaderUid,
    replay_file: "MP Replay.aoe2record",
    replayHash: input.replayHash,
    createdAt: new Date("2026-08-04T02:12:26.796Z"),
    game_version: "HD",
    map: { name: "Yucatan" },
    game_type: "Random Map",
    duration: input.durationSeconds,
    game_duration: input.durationSeconds,
    winner: input.winner,
    players: input.players,
    event_types: input.eventTypes,
    key_events: input.keyEvents,
    timestamp: new Date("2026-08-04T02:12:26.796Z"),
    played_on: new Date("2026-08-04T02:04:21.156Z"),
    parse_iteration: input.parseIteration,
    is_final: input.isFinal,
    disconnect_detected: input.disconnectDetected,
    parse_source: input.parseSource,
    parse_reason: input.parseReason,
    original_filename: "MP Replay.aoe2record",
    user: {
      id: input.uploaderUserId,
      uid: input.uploaderUid,
      steamId: input.uploaderSteamId,
      inGameName: "Emaren",
      steamPersonaName: "Emaren",
    },
  };

  const tx = {
    $queryRaw: async () => [{ lock_acquired: 1 }],
    gameStats: {
      findUnique: async () => game,
    },
    replayResultAdjudication: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        createdData = args.data;
        return { id: 9001 };
      },
    },
    replayDesyncIncident: {
      findFirst: async () => null,
    },
    watcherClientEvent: {
      findFirst: async () => null,
      count: async () => 0,
    },
    replayParseRun: {
      findFirst: async (
        args: Record<string, unknown>
      ) => {
        parseRunFindFirstArgs = args;

        return {
          id: 4965,
        parserName: "mgz",
        parserVersion: "8",
        parserBuild: "test",
        passName: "hd_deterministic_evidence",
        passVersion: "8",
        schemaVersion: "1",
        status: "completed",
        candidateOnly: true,
        affectsPublicAggregates: false,
        completedAt: new Date("2026-08-04T02:12:26.796Z"),
        observations: [
          {
            id: 7001,
            value: input.rawActivityByPlayer,
            provenance: { source: "test" },
          },
        ],
        };
      },
    },
    betMarket: {
      findMany: async () => [],
    },
    pendingWoloClaim: {
      findMany: async () => [],
    },
  };

  const prisma = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>
    ) => callback(tx),
  };

  const report = await reconcileAutomaticWatcherTerminalResults(
    prisma as never,
    [input.id]
  );

  const expectedRosterHash = buildRosterHash(
    normalizeReplayPlayers(input.players)
  );

  assert.equal(report.createdCount, 1);
  assert.equal(report.skippedCount, 0);
  assert.equal(createdData?.sourceRosterHash, expectedRosterHash);
  assert.equal(createdData?.affectsStats, true);
  assert.equal(createdData?.affectsBets, false);
  assert.deepEqual(createdData?.winningPlayerKeys, [
    "steam:76561198442007385",
  ]);

  assert.deepEqual(
    (
      parseRunFindFirstArgs as {
        where?: {
          observations?: unknown;
        };
      } | null
    )?.where?.observations,
    {
      some: {
        fieldPath:
          WATCHER_TERMINAL_RAW_ACTIVITY_FIELD_PATH,
      },
    }
  );
});

test("automatic watcher evidence uses stats-only append-only authority", () => {
  assert.equal(
    WATCHER_TERMINAL_ADJUDICATION_ACTOR_ROLE,
    "verified_submitter"
  );
  assert.equal(
    WATCHER_TERMINAL_LINKED_MARKET_DISPOSITION,
    "operator_review_required"
  );
  assert.equal(
    WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION,
    "replay-terminal-action-tail-v3"
  );
});

test("final rated HD 1v1 action tail resolves the player who remained active", () => {
  const evaluation = evaluateWatcherTerminalOwnerLoss(baseInput());

  assert.equal(evaluation.eligible, true);
  if (!evaluation.eligible) return;

  assert.equal(
    evaluation.loser.stablePlayerKey,
    "steam:76561198065420384"
  );
  assert.equal(
    evaluation.winnerPlayer.stablePlayerKey,
    "steam:76561198442007385"
  );
  assert.equal(
    evaluation.winningTeamKey,
    "steam:76561198442007385"
  );
  const evidence = evaluation.evidence as {
    policyVersion?: unknown;
    financialAuthority?: unknown;
    terminalReceiptMode?: unknown;
    actionTail?: {
      winnerLeadMs?: unknown;
      loserSilenceMs?: unknown;
      winnerTailMs?: unknown;
    };
  };
  assert.equal(
    evidence.policyVersion,
    WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION
  );
  assert.equal(evidence.financialAuthority, false);
  assert.equal(evidence.terminalReceiptMode, "exact_watcher_receipt");
  assert.equal(evidence.actionTail?.winnerLeadMs, 9278);
  assert.equal(evidence.actionTail?.loserSilenceMs, 14650);
  assert.equal(evidence.actionTail?.winnerTailMs, 5372);
});

test("legacy final plus clean monitor settlement is accepted", () => {
  const input = baseInput();
  input.terminalReceipt = {
    eventId: "9002",
    eventType: "legacy_final_monitor_settled",
    createdAt: "2026-08-04T02:12:26.796Z",
    userId: 7,
    userUid: "u_emaren",
    sessionId: "session_exact",
    replayHash,
    replayFile: "MP Replay.aoe2record",
    metadata: {
      finalEventType: "result_review_routed",
      monitorStopEventId: "9002",
    },
  };

  assert.equal(evaluateWatcherTerminalOwnerLoss(input).eligible, true);
});

test("action tail can resolve without a receipt, but conflicting receipt blocks", () => {
  const missing = baseInput();
  missing.terminalReceipt = null;
  const fallback = evaluateWatcherTerminalOwnerLoss(missing);
  assert.equal(fallback.eligible, true);
  if (fallback.eligible) {
    const evidence = fallback.evidence as { terminalReceiptMode?: unknown };
    assert.equal(evidence.terminalReceiptMode, "action_tail_fallback");
  }

  const mismatched = baseInput();
  mismatched.terminalReceipt = {
    ...(mismatched.terminalReceipt as Record<string, unknown>),
    replayHash: "5".repeat(64),
  };
  assert.deepEqual(evaluateWatcherTerminalOwnerLoss(mismatched), {
    eligible: false,
    reason: "terminal_receipt_conflicts",
  });
});

test("a terminal failure blocks inference", () => {
  const input = baseInput();
  input.terminalFailureCount = 1;

  assert.deepEqual(evaluateWatcherTerminalOwnerLoss(input), {
    eligible: false,
    reason: "terminal_failure_present",
  });
});

test("winner must remain active after the loser and near the replay tail", () => {
  const shortLead = baseInput();
  shortLead.rawActivityByPlayer = [
    {
      player_number: 1,
      player_name: "Emaren",
      action_packet_count: 10,
      first_action_ms: 1000,
      last_action_ms: 479000,
    },
    {
      player_number: 2,
      player_name: "Feegaro",
      action_packet_count: 10,
      first_action_ms: 1000,
      last_action_ms: 480000,
    },
  ];
  assert.deepEqual(evaluateWatcherTerminalOwnerLoss(shortLead), {
    eligible: false,
    reason: "terminal_activity_gap_too_short",
  });

  const staleOpponent = baseInput();
  staleOpponent.rawActivityByPlayer = [
    {
      player_number: 1,
      player_name: "Emaren",
      action_packet_count: 10,
      first_action_ms: 1000,
      last_action_ms: 430000,
    },
    {
      player_number: 2,
      player_name: "Feegaro",
      action_packet_count: 10,
      first_action_ms: 1000,
      last_action_ms: 450000,
    },
  ];
  assert.deepEqual(evaluateWatcherTerminalOwnerLoss(staleOpponent), {
    eligible: false,
    reason: "winner_not_active_at_terminal_tail",
  });
});

test("the uploader may be the winner when the opponent stops first", () => {
  const input = baseInput();
  input.uploaderSteamId = "76561198442007385";

  const evaluation = evaluateWatcherTerminalOwnerLoss(input);
  assert.equal(evaluation.eligible, true);
  if (!evaluation.eligible) return;

  assert.equal(evaluation.uploader.name, "Feegaro");
  assert.equal(evaluation.loser.name, "Emaren");
  assert.equal(evaluation.winnerPlayer.name, "Feegaro");
  assert.equal(evaluation.winningTeamKey, "steam:76561198442007385");
});

test("generic postgame panels do not block a decisive action tail", () => {
  const input = baseInput();
  input.keyEvents = {
    ...(input.keyEvents as Record<string, unknown>),
    postgame_available: true,
    has_scores: true,
    has_achievements: true,
  };

  const evaluation = evaluateWatcherTerminalOwnerLoss(input);
  assert.equal(evaluation.eligible, true);
});

test("serialized resignation evidence blocks terminal inference", () => {
  const input = baseInput();
  input.eventTypes = ["resign"];

  assert.deepEqual(evaluateWatcherTerminalOwnerLoss(input), {
    eligible: false,
    reason: "serialized_result_exists",
  });
});

test("confirmed desync blocks terminal inference", () => {
  const input = baseInput();
  input.currentDesyncOccurred = true;

  assert.deepEqual(evaluateWatcherTerminalOwnerLoss(input), {
    eligible: false,
    reason: "confirmed_desync",
  });
});

test("an uploader mismatch cannot award the opponent", () => {
  const input = baseInput();
  input.uploaderSteamId = "76561199999999999";

  assert.deepEqual(evaluateWatcherTerminalOwnerLoss(input), {
    eligible: false,
    reason: "uploader_player_not_exact",
  });
});

test("short or non-final recordings remain unresolved", () => {
  const short = baseInput();
  short.durationSeconds = 59;
  assert.equal(evaluateWatcherTerminalOwnerLoss(short).eligible, false);

  const live = baseInput();
  live.isFinal = false;
  assert.equal(evaluateWatcherTerminalOwnerLoss(live).eligible, false);
});
