import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateWatcherRecorderExitResult,
  evaluateWatcherTerminalOwnerLoss,
  isProvisionalWatcherRecorderExitAdjudication,
  reconcileAutomaticWatcherTerminalResults,
  WATCHER_RATING_DELTA_RESULT_AUTHORITY,
  WATCHER_TERMINAL_ACTION_TAIL_RESULT_AUTHORITY,
  WATCHER_TERMINAL_RECORDER_EXIT_POLICY_VERSION,
  WATCHER_TERMINAL_RECORDER_EXIT_RESULT_AUTHORITY,
  WATCHER_TERMINAL_ADJUDICATION_ACTOR_ROLE,
  WATCHER_TERMINAL_LINKED_MARKET_DISPOSITION,
  WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION,
  WATCHER_TERMINAL_RAW_ACTIVITY_FIELD_PATH,
  type WatcherTerminalOwnerLossInput,
} from "../lib/replayResultAdjudications.ts";
import { evaluateReplayRatingDeltaAuthority } from "../lib/replayRatingDeltaAuthority.ts";
import { applyReplayAdjudicationToGameStats } from "../lib/replayAdjudications.ts";
import { publicReplayWinnerTruth } from "../lib/publicReplayTruth.ts";
import { buildRosterHash, normalizeReplayPlayers } from "../lib/teamResolution.ts";
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
        watcher_id: "watcher_exact",
        watcher_session_id: "session_exact",
        file_size_bytes: 123456,
        replay_fingerprint: "123456:1786158638102",
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

test("automatic reconciliation refuses recorder-exit winner authority", async () => {
  const input = baseInput();
  let created = false;

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
      findMany: async () => [],
    },
    replayResultAdjudication: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => {
        created = true;
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
      findFirst: async () => ({
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
      }),
    },
    betMarket: {
      findMany: async () => [],
    },
    pendingWoloClaim: {
      findMany: async () => [],
    },
  };

  const prisma = {
    gameStats: {
      findMany: async () => [],
    },
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>
    ) => callback(tx),
  };

  const report = await reconcileAutomaticWatcherTerminalResults(
    prisma as never,
    [input.id]
  );

  assert.equal(report.createdCount, 0);
  assert.equal(report.existingCount, 0);
  assert.equal(report.skippedCount, 1);
  assert.equal(created, false);
  assert.deepEqual(report.outcomes, [
    {
      gameStatsId: input.id,
      outcome: "skipped",
      detail: "recorder_exit_is_not_result_authority",
      adjudicationId: null,
    },
  ]);
});


test("same-roster RM rating movement in a later DM snapshot cannot write an exact-game result", async () => {
  const sourceId = 41001;
  const laterId = 41002;
  const sourceCreatedAt =
    new Date("2026-10-02T01:13:22.000Z");
  const laterCreatedAt =
    new Date("2026-10-02T01:24:01.000Z");

  const sourcePlayers = [
    {
      name: "Jim",
      steam_id: "76561198166409520",
      user_id: "76561198166409520",
      number: 1,
      team_id: 0,
      winner: null,
      steam_rm_rating: 960,
      steam_dm_rating: 1676,
    },
    {
      name: "Emaren",
      steam_id: "76561198065420384",
      user_id: "76561198065420384",
      number: 2,
      team_id: null,
      winner: null,
      steam_rm_rating: 1071,
      steam_dm_rating: 1549,
    },
  ];
  const laterPlayers = [
    {
      ...sourcePlayers[0],
      steam_rm_rating: 980,
    },
    {
      ...sourcePlayers[1],
      steam_rm_rating: 1051,
    },
  ];

  const sourceGame = {
    id: sourceId,
    userUid: "jim-uid",
    replay_file: "rm-final.aoe2record",
    replayHash: "a".repeat(64),
    createdAt: sourceCreatedAt,
    game_version: "HD",
    map: { name: "Arabia" },
    game_type: "TurboRandom9",
    duration: 1200,
    game_duration: 1200,
    winner: "Unknown",
    players: sourcePlayers,
    event_types: [],
    key_events: {
      result_resolution: {
        result_status: "review_required",
        result_trusted: false,
        winning_player_names: [],
      },
    },
    timestamp: sourceCreatedAt,
    played_on: sourceCreatedAt,
    parse_iteration: 69,
    is_final: true,
    disconnect_detected: false,
    parse_source: "watcher_final",
    parse_reason: "watcher_final_submission",
    original_filename: "rm-final.aoe2record",
    user: {
      id: 18168,
      uid: "jim-uid",
      steamId: "76561198166409520",
      inGameName: "Jim",
      steamPersonaName: "Jim",
    },
  };

  const laterObservation = {
    id: laterId,
    createdAt: laterCreatedAt,
    game_type: "DM",
    players: laterPlayers,
    replayHash: "b".repeat(64),
    parse_iteration: 1,
  };

  let createdData:
    Record<string, unknown> | null =
      null;
  let ratingScanCount = 0;

  const gameStatsFindMany = async (
    args: {
      where?: {
        id?: { in?: number[] };
        is_final?: boolean;
        createdAt?: { gt?: Date };
      };
    }
  ) => {
    ratingScanCount += 1;
    if (args?.where?.id?.in) {
      return [
        {
          id: laterId,
          createdAt: laterCreatedAt,
          players: laterPlayers,
        },
      ];
    }

    if (
      args?.where?.is_final === true
    ) {
      return [
        {
          id: sourceId,
          game_type: "TurboRandom9",
          players: sourcePlayers,
        },
      ];
    }

    if (
      args?.where?.createdAt?.gt
    ) {
      return [laterObservation];
    }

    return [];
  };

  const tx = {
    $queryRaw: async () => [
      { lock_acquired: 1 },
    ],
    gameStats: {
      findUnique: async ({
        where,
      }: {
        where: { id: number };
      }) =>
        where.id === sourceId
          ? sourceGame
          : null,
      findMany:
        gameStatsFindMany,
    },
    replayResultAdjudication: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({
        data,
      }: {
        data: Record<
          string,
          unknown
        >;
      }) => {
        createdData = data;
        return { id: 92001 };
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
      findFirst: async () => null,
    },
    betMarket: {
      findMany: async () => [],
    },
    pendingWoloClaim: {
      findMany: async () => [],
    },
  };

  const prisma = {
    gameStats: {
      findMany:
        gameStatsFindMany,
    },
    $transaction: async (
      callback: (
        transaction:
          typeof tx
      ) => Promise<unknown>
    ) => callback(tx),
  };

  // The arithmetic remains available as candidate evidence. It says nothing
  // about intervening matches or whether this replay caused the rating change.
  const numericCandidate = evaluateReplayRatingDeltaAuthority({
    lane: "rm",
    sourcePlayers,
    laterPlayers,
  });
  assert.equal(numericCandidate.eligible, true);

  const laterReport =
    await reconcileAutomaticWatcherTerminalResults(
      prisma as never,
      [laterId]
    );

  assert.equal(
    laterReport.requestedCount,
    1
  );
  assert.equal(laterReport.createdCount, 0);
  assert.deepEqual(laterReport.outcomes.map((entry) => entry.gameStatsId), [laterId]);

  const sourceReport = await reconcileAutomaticWatcherTerminalResults(prisma as never, [sourceId]);
  assert.equal(sourceReport.createdCount, 0);
  assert.equal(sourceReport.outcomes[0]?.detail, "raw_activity_observation_missing");
  assert.equal(createdData, null);
  assert.equal(ratingScanCount, 0, "disabled rating authority cannot expand or scan unrelated replay rows");
  assert.equal(publicReplayWinnerTruth(sourceGame).statsEligible, false);
});

test("disabling new rating promotion preserves an existing exact-bound accepted stats ledger result", () => {
  const players = [
    { name: "Jim", steam_id: "76561198166409520", number: 1, team_id: 0, winner: null },
    { name: "Emaren", steam_id: "76561198065420384", number: 2, team_id: 1, winner: null },
  ];
  const teams = normalizeReplayPlayers(players).map((player) => ({
    teamKey: player.stablePlayerKey,
    players: [{
      stablePlayerKey: player.stablePlayerKey,
      name: player.name,
      normalizedName: player.normalizedName,
      steamId: player.steamId,
      sourceTeamId: player.teamId,
      playerNumber: player.playerNumber,
    }],
  }));
  const accepted = {
    id: 92001,
    idempotencyKey: "title-authority:rating-delta-v1:41001:41002",
    decisionStatus: "accepted",
    affectsStats: true,
    affectsBets: false,
    actorDisplayNameSnapshot: "Jim",
    actorRole: "verified_submitter",
    teamAssignments: teams,
    winningTeamKey: "steam:76561198166409520",
    winningPlayerKeys: ["steam:76561198166409520"],
    reason: "Existing accepted exact-bound statistics verdict.",
    sourceReplayHash: replayHash,
    sourceParseIteration: 69,
    sourceRosterHash: buildRosterHash(normalizeReplayPlayers(players))!,
    sourcePropositionHash: "b".repeat(64),
    createdAt: "2026-10-02T01:24:01.000Z",
  };
  const game = {
    id: 41001, replayHash, players, winner: "Unknown",
    parse_source: "watcher_final", parse_reason: "watcher_final_submission",
    is_final: true, disconnect_detected: false,
    replayResultAdjudications: [accepted],
  };
  assert.equal(WATCHER_RATING_DELTA_RESULT_AUTHORITY, false);
  const effective = applyReplayAdjudicationToGameStats(game);
  const truth = publicReplayWinnerTruth(effective);
  assert.equal(truth.winner, "Jim");
  assert.equal(truth.statsEligible, true);
  assert.equal(truth.bettingEligible, false);
  assert.equal(publicReplayWinnerTruth({ ...game, replayHash: "f".repeat(64) }).statsEligible, false);
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
  assert.equal(
    WATCHER_TERMINAL_ACTION_TAIL_RESULT_AUTHORITY,
    false
  );
  assert.equal(
    WATCHER_TERMINAL_RECORDER_EXIT_POLICY_VERSION,
    "replay-terminal-recorder-exit-v2"
  );
  assert.equal(
    WATCHER_TERMINAL_RECORDER_EXIT_RESULT_AUTHORITY,
    false
  );
  assert.equal(WATCHER_RATING_DELTA_RESULT_AUTHORITY, false);
});


test("modern authenticated watcher final produces provisional recorder-exit inference", () => {
  const input =
    baseInput();

  input.id = 22128;

  input.players = [
    {
      name: "Emaren",
      steam_id: "76561198065420384",
      number: 1,
      team_id: 1,
      winner: null,
    },
    {
      name: "kaoritec",
      steam_id: "76561198904976282",
      number: 2,
      team_id: 2,
      winner: null,
    },
  ];

  const evaluation =
    evaluateWatcherRecorderExitResult(
      input
    );

  assert.equal(
    evaluation.eligible,
    true
  );

  if (!evaluation.eligible) {
    return;
  }

  assert.equal(
    evaluation.loser.stablePlayerKey,
    "steam:76561198065420384"
  );

  assert.equal(
    evaluation.winnerPlayer.stablePlayerKey,
    "steam:76561198904976282"
  );

  assert.equal(
    evaluation.winningTeamKey,
    "steam:76561198904976282"
  );

  const evidence =
    evaluation.evidence as {
      provisionalStatsInference?: unknown;
      replayPacketLeaveProof?: unknown;
      financialAuthority?: unknown;
      policyVersion?: unknown;
    };

  assert.equal(
    evidence.provisionalStatsInference,
    true
  );

  assert.equal(
    evidence.replayPacketLeaveProof,
    false
  );

  assert.equal(
    evidence.financialAuthority,
    false
  );

  assert.equal(
    evidence.policyVersion,
    WATCHER_TERMINAL_RECORDER_EXIT_POLICY_VERSION
  );
});


test("watcher 1.5.7 completion receipt may omit finalStored", () => {
  const input =
    baseInput();

  input.terminalReceipt = {
    eventId:
      "3861307",

    eventType:
      "final_settle_observation_complete",

    createdAt:
      "2026-08-08T03:14:03.779Z",

    userId:
      input.uploaderUserId,

    userUid:
      input.uploaderUid,

    sessionId:
      "session_exact",

    replayHash,

    replayFile:
      "MP Replay v5.8 @2026.08.07 212440 (1).aoe2record",

    metadata: {
      watcherVersion:
        "1.5.7",

      runtimeEventType:
        "final-settle-observation-complete",

      finalAccepted:
        false,

      fileSizeBytes:
        1036727,
    },
  };

  const evaluation =
    evaluateWatcherRecorderExitResult(
      input
    );

  assert.equal(
    evaluation.eligible,
    true
  );

  if (!evaluation.eligible) {
    return;
  }

  const evidence =
    evaluation.evidence as {
      terminalReceiptMode?: unknown;
      financialAuthority?: unknown;
    };

  assert.equal(
    evidence.terminalReceiptMode,
    "exact_watcher_receipt"
  );

  assert.equal(
    evidence.financialAuthority,
    false
  );
});

test("explicit finalStored false still blocks recorder-exit inference", () => {
  const input =
    baseInput();

  input.terminalReceipt = {
    eventId:
      "3861307",

    eventType:
      "final_settle_observation_complete",

    createdAt:
      "2026-08-08T03:14:03.779Z",

    userId:
      input.uploaderUserId,

    userUid:
      input.uploaderUid,

    sessionId:
      "session_exact",

    replayHash,

    replayFile:
      "MP Replay v5.8 @2026.08.07 212440 (1).aoe2record",

    metadata: {
      watcherVersion:
        "1.5.7",

      runtimeEventType:
        "final-settle-observation-complete",

      finalStored:
        false,
    },
  };

  assert.deepEqual(
    evaluateWatcherRecorderExitResult(
      input
    ),
    {
      eligible: false,
      reason:
        "terminal_receipt_conflicts",
    }
  );
});

test("old uploader-opponent false-positive policy shape cannot qualify", () => {
  const input =
    baseInput();

  input.id = 10252;

  input.parseReason =
    "watcher_inferred_opponent_win_on_incomplete_1v1";

  const evaluation =
    evaluateWatcherRecorderExitResult(
      input
    );

  assert.deepEqual(
    evaluation,
    {
      eligible: false,
      reason:
        "parse_reason_not_exact",
    }
  );
});

test("modern watcher provenance is mandatory", () => {
  const input =
    baseInput();

  const keyEvents =
    input.keyEvents as Record<
      string,
      unknown
    >;

  keyEvents.watcher_upload = {
    file_role:
      "final_recording",

    final_candidate:
      true,

    checkpoint_final_rejected:
      false,

    server_sha256:
      replayHash,
  };

  assert.deepEqual(
    evaluateWatcherRecorderExitResult(
      input
    ),
    {
      eligible: false,
      reason:
        "modern_watcher_final_proof_incomplete",
    }
  );
});

test("postgame or score evidence blocks recorder-exit inference", () => {
  const input =
    baseInput();

  const keyEvents =
    input.keyEvents as Record<
      string,
      unknown
    >;

  keyEvents.postgame_available =
    true;

  assert.deepEqual(
    evaluateWatcherRecorderExitResult(
      input
    ),
    {
      eligible: false,
      reason:
        "postgame_or_score_evidence_not_explicitly_absent",
    }
  );
});

test("explicit resignation remains stronger than recorder-exit inference", () => {
  const input =
    baseInput();

  input.eventTypes = [
    "resign",
  ];

  const keyEvents =
    input.keyEvents as Record<
      string,
      unknown
    >;

  keyEvents.resigned_player_numbers = [
    2,
  ];

  assert.deepEqual(
    evaluateWatcherRecorderExitResult(
      input
    ),
    {
      eligible: false,
      reason:
        "serialized_result_exists",
    }
  );
});

test("provisional recorder-exit classifier accepts only its stats-only ledger row", () => {
  assert.equal(
    isProvisionalWatcherRecorderExitAdjudication({
      idempotencyKey:
        `evidence:auto:${WATCHER_TERMINAL_RECORDER_EXIT_POLICY_VERSION}:22128:abc:86`,
      decisionStatus:
        "accepted",
      affectsStats:
        true,
      affectsBets:
        false,
    }),
    true
  );

  assert.equal(
    isProvisionalWatcherRecorderExitAdjudication({
      idempotencyKey:
        "evidence:auto:screenshot-auto-verdict-v2:22128:5553",
      decisionStatus:
        "accepted",
      affectsStats:
        true,
      affectsBets:
        false,
    }),
    false
  );

  assert.equal(
    isProvisionalWatcherRecorderExitAdjudication({
      idempotencyKey:
        `evidence:auto:${WATCHER_TERMINAL_RECORDER_EXIT_POLICY_VERSION}:22128:abc:86`,
      decisionStatus:
        "accepted",
      affectsStats:
        true,
      affectsBets:
        true,
    }),
    false
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

test(
  "deterministic pass-8 parse run satisfies recorder stability when legacy iteration is one",
  () => {
    const input =
      baseInput();

    input.parseIteration = 1;

    input.parseRun = {
      id: 8001,
      artifactSha256:
        input.replayHash,
      parserName:
        "aoe2war.mgz_hd",
      parserVersion:
        "1.8.51",
      passName:
        "hd_deterministic_evidence",
      passVersion:
        "8",
      status:
        "completed",
      candidateOnly:
        true,
      affectsPublicAggregates:
        false,
      activityObservationId:
        7001,
      activityObservationFieldPath:
        WATCHER_TERMINAL_RAW_ACTIVITY_FIELD_PATH,
    };

    const evaluation =
      evaluateWatcherRecorderExitResult(
        input
      );

    assert.equal(
      evaluation.eligible,
      true
    );

    if (!evaluation.eligible) {
      return;
    }

    const evidence =
      evaluation.evidence as {
        parserStability?: {
          source?: unknown;
          passVersion?: unknown;
        };
      };

    assert.equal(
      evidence
        .parserStability
        ?.source,
      "deterministic_replay_parse_run"
    );

    assert.equal(
      evidence
        .parserStability
        ?.passVersion,
      8
    );
  },
);

test(
  "pass-6 parse run cannot replace recorder legacy stability",
  () => {
    const input =
      baseInput();

    input.parseIteration = 1;

    input.parseRun = {
      id: 8002,
      artifactSha256:
        input.replayHash,
      parserName:
        "aoe2war.mgz_hd",
      parserVersion:
        "1.8.51",
      passName:
        "hd_deterministic_evidence",
      passVersion:
        "6",
      status:
        "completed",
      candidateOnly:
        true,
      affectsPublicAggregates:
        false,
      activityObservationId:
        7002,
      activityObservationFieldPath:
        WATCHER_TERMINAL_RAW_ACTIVITY_FIELD_PATH,
    };

    assert.deepEqual(
      evaluateWatcherRecorderExitResult(
        input
      ),
      {
        eligible: false,
        reason:
          "parser_stability_not_proven",
      }
    );
  },
);
