export const WAR_ENGINE_TIER3_ENGINE = {
  tier: 3,
  engineName: "aoe2war.fast_verdict",
  engineVersion: "1.0.0",
} as const;

export type WarEngineTier3Classification =
  | "likely_outcome"
  | "inconclusive_recording"
  | "aborted_battle";

export type WarEngineTier3PlayerMetrics = {
  name: string;
  attributedUniquePackets: number;
  terminalUniquePackets: number;
  terminalDeleteCommands: number;
  terminalDeletedObjectCount: number;
  terminalBuildCommands: number;
  terminalMovementOrAttackCommands: number;
  lastAttributedCommandMs: number | null;
  gapToRecordingEndMs: number | null;
};

export type WarEngineTier3Verdict = {
  tier: 3;
  engineName: string;
  engineVersion: string;

  classification: WarEngineTier3Classification;

  /*
   * War Engine authority boundary.
   *
   * These values are constants by design. Tier 3 is an evidence
   * classifier, never result/statistical/financial authority.
   */
  candidateOnly: true;
  affectsPublicAggregates: false;
  affectsBets: false;
  resultTrusted: false;

  /*
   * Do not overload a single confidence number.
   *
   * classificationConfidenceBps:
   *   confidence that the evidence fits the named classification.
   *
   * winnerConfidenceBps:
   *   confidence in the projected winning side, if and only if a
   *   likely outcome is produced.
   */
  classificationConfidenceBps: number;
  winnerConfidenceBps: number | null;

  winningPlayerNumbers: number[];
  winningPlayerNames: string[];

  reasonCode:
    | "recording_ended_before_two_minutes"
    | "terminal_self_delete_collapse"
    | "no_safe_tier3_winner_signal";

  reason: string;

  durationSeconds: number;
  replayEndMs: number;
  terminalWindowMs: number;

  rawPacketCount: number;
  uniquePacketCount: number;

  metricsByPlayer: Record<
    string,
    WarEngineTier3PlayerMetrics
  >;

  collapsingPlayerNumber?: number;
  collapsingPlayerName?: string;
};

type JsonObject = Record<string, unknown>;

type Player = {
  number: number;
  name: string | null;
};

function objectValue(
  value: unknown
): JsonObject {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as JsonObject
    : {};
}

function arrayValue(
  value: unknown
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function numberValue(
  value: unknown
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function textValue(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized
    ? normalized
    : null;
}

function packetTimestampMs(
  packet: JsonObject
): number | null {
  return numberValue(
    packet.timestamp_ms
  );
}

function packetPlayerNumber(
  packet: JsonObject
): number | null {
  const direct =
    numberValue(
      packet.player_number
    );

  if (
    direct !== null
  ) {
    return direct;
  }

  return numberValue(
    objectValue(
      packet.payload
    ).player_id
  );
}

function packetType(
  packet: JsonObject
): string {
  return (
    textValue(
      packet.type
    ) ??
    "unknown"
  );
}

function packetObjectIds(
  packet: JsonObject
): number[] {
  return arrayValue(
    objectValue(
      packet.payload
    ).object_ids
  ).filter(
    (
      value
    ): value is number =>
      typeof value === "number" &&
      Number.isFinite(value)
  );
}

function playersFromProjection(
  projection: JsonObject
): Player[] {
  const players =
    arrayValue(
      projection.players
    )
      .map(objectValue)
      .map((player) => ({
        number:
          numberValue(
            player.number
          ),
        name:
          textValue(
            player.name
          ),
      }))
      .filter(
        (
          player
        ): player is {
          number: number;
          name: string | null;
        } =>
          player.number !== null
      );

  /*
   * A malformed candidate must not create duplicate player
   * identities merely because the projection repeated a player row.
   */
  const seen =
    new Set<number>();

  return players.filter(
    (player) => {
      if (
        seen.has(
          player.number
        )
      ) {
        return false;
      }

      seen.add(
        player.number
      );

      return true;
    }
  );
}

export function deduplicateWarEngineTier3Packets(
  value: unknown
): JsonObject[] {
  const stream =
    arrayValue(value);

  const seen =
    new Set<string>();

  const output:
    JsonObject[] = [];

  for (
    const rawPacket
    of stream
  ) {
    const packet =
      objectValue(
        rawPacket
      );

    if (
      Object.keys(packet)
        .length === 0
    ) {
      continue;
    }

    const identity =
      textValue(
        packet.packet_identity_sha256
      );

    /*
     * Packets lacking the canonical identity remain evidence.
     * Tier 3 refuses to silently discard them.
     */
    if (
      identity === null
    ) {
      output.push(packet);
      continue;
    }

    if (
      seen.has(identity)
    ) {
      continue;
    }

    seen.add(identity);
    output.push(packet);
  }

  return output;
}

function assertTier3Preconditions(
  candidate: JsonObject,
  actions: JsonObject,
  projection: JsonObject
) {
  const keyEvents =
    objectValue(
      projection.key_events
    );

  const resultResolution =
    objectValue(
      keyEvents.result_resolution
    );

  if (
    resultResolution
      .result_trusted === true
  ) {
    throw new Error(
      "WAR_ENGINE_TIER3_PRECONDITION_RESULT_ALREADY_TRUSTED"
    );
  }

  const resignations =
    arrayValue(
      actions
        .raw_resignation_timeline
    );

  /*
   * Raw resignation evidence belongs to the normal deterministic
   * result parser. Tier 3 must not reinterpret that evidence into
   * a weaker heuristic verdict.
   */
  if (
    resignations.length > 0
  ) {
    throw new Error(
      "WAR_ENGINE_TIER3_PRECONDITION_RESIGNATION_EVIDENCE_PRESENT"
    );
  }

  /*
   * Keep the candidate reference deliberately touched here so a
   * future precondition can inspect top-level candidate metadata
   * without changing this function signature.
   */
  void candidate;
}

export function classifyWarEngineTier3Candidate(
  input: unknown
): WarEngineTier3Verdict {
  const candidate =
    objectValue(input);

  const projection =
    objectValue(
      candidate.projection
    );

  const actions =
    objectValue(
      candidate.actions
    );

  assertTier3Preconditions(
    candidate,
    actions,
    projection
  );

  const durationSeconds =
    numberValue(
      projection.duration
    ) ?? 0;

  const rawStream =
    arrayValue(
      actions.stream
    );

  const stream =
    deduplicateWarEngineTier3Packets(
      rawStream
    );

  const players =
    playersFromProjection(
      projection
    );

  const playerName =
    new Map<number, string>();

  for (
    const player
    of players
  ) {
    playerName.set(
      player.number,
      player.name ??
        `Player ${player.number}`
    );
  }

  const timestamps =
    stream
      .map(
        packetTimestampMs
      )
      .filter(
        (
          value
        ): value is number =>
          value !== null
      );

  const replayEndMs =
    Math.max(
      Math.max(
        0,
        durationSeconds * 1000
      ),
      ...timestamps
    );

  const terminalWindowMs =
    60_000;

  const terminalStartMs =
    Math.max(
      0,
      replayEndMs -
        terminalWindowMs
    );

  const terminal =
    stream.filter(
      (packet) => {
        const at =
          packetTimestampMs(
            packet
          );

        return (
          at !== null &&
          at >=
            terminalStartMs
        );
      }
    );

  const metricsByPlayer:
    Record<
      string,
      WarEngineTier3PlayerMetrics
    > = {};

  for (
    const player
    of players
  ) {
    const packets =
      stream.filter(
        (packet) =>
          packetPlayerNumber(
            packet
          ) ===
          player.number
      );

    const terminalPackets =
      terminal.filter(
        (packet) =>
          packetPlayerNumber(
            packet
          ) ===
          player.number
      );

    const deletePackets =
      terminalPackets.filter(
        (packet) =>
          packetType(packet) ===
          "delete"
      );

    const buildPackets =
      terminalPackets.filter(
        (packet) =>
          packetType(packet) ===
          "build"
      );

    const movementOrAttackPackets =
      terminalPackets.filter(
        (packet) => {
          switch (
            packetType(packet)
          ) {
            case "order":
            case "move":
            case "de_attack_move":
            case "attack_ground":
              return true;

            default:
              return false;
          }
        }
      );

    const lastTimestamp =
      Math.max(
        -1,
        ...packets
          .map(
            packetTimestampMs
          )
          .filter(
            (
              value
            ): value is number =>
              value !== null
          )
      );

    const deletedObjectIds =
      new Set<number>();

    for (
      const packet
      of deletePackets
    ) {
      for (
        const objectId
        of packetObjectIds(
          packet
        )
      ) {
        deletedObjectIds.add(
          objectId
        );
      }
    }

    metricsByPlayer[
      String(
        player.number
      )
    ] = {
      name:
        playerName.get(
          player.number
        ) ??
        `Player ${player.number}`,

      attributedUniquePackets:
        packets.length,

      terminalUniquePackets:
        terminalPackets.length,

      terminalDeleteCommands:
        deletePackets.length,

      terminalDeletedObjectCount:
        deletedObjectIds.size,

      terminalBuildCommands:
        buildPackets.length,

      terminalMovementOrAttackCommands:
        movementOrAttackPackets
          .length,

      lastAttributedCommandMs:
        lastTimestamp >= 0
          ? lastTimestamp
          : null,

      gapToRecordingEndMs:
        lastTimestamp >= 0
          ? replayEndMs -
            lastTimestamp
          : null,
    };
  }

  const authority = {
    tier:
      WAR_ENGINE_TIER3_ENGINE
        .tier,

    engineName:
      WAR_ENGINE_TIER3_ENGINE
        .engineName,

    engineVersion:
      WAR_ENGINE_TIER3_ENGINE
        .engineVersion,

    candidateOnly:
      true as const,

    affectsPublicAggregates:
      false as const,

    affectsBets:
      false as const,

    resultTrusted:
      false as const,

    durationSeconds,
    replayEndMs,
    terminalWindowMs,
    rawPacketCount:
      rawStream.length,
    uniquePacketCount:
      stream.length,
    metricsByPlayer,
  };

  /*
   * Extremely short unresolved recordings are useful to classify
   * as aborted work rather than pretending a winner can be
   * reconstructed from a battle that barely developed.
   */
  if (
    durationSeconds > 0 &&
    durationSeconds <= 120
  ) {
    return {
      ...authority,

      classification:
        "aborted_battle",

      classificationConfidenceBps:
        9500,

      winnerConfidenceBps:
        null,

      winningPlayerNumbers:
        [],

      winningPlayerNames:
        [],

      reasonCode:
        "recording_ended_before_two_minutes",

      reason:
        "Replay ended within two minutes without encoded result evidence.",
    };
  }

  /*
   * Conservative 1v1 terminal-collapse signature:
   *
   * - exactly one player issues at least five UNIQUE delete
   *   commands in the last minute;
   *
   * - at least five distinct object IDs are deleted;
   *
   * - the opponent remains actively commanding during that same
   *   terminal window;
   *
   * - the opponent's final attributable command occurs no more
   *   than one minute before recording end.
   *
   * This is never a trusted result. It can only produce
   * likely_outcome.
   */
  const collapsePlayers =
    players.filter(
      (player) => {
        const metrics =
          metricsByPlayer[
            String(
              player.number
            )
          ];

        return (
          metrics !== undefined &&
          metrics
            .terminalDeleteCommands >=
            5 &&
          metrics
            .terminalDeletedObjectCount >=
            5
        );
      }
    );

  if (
    players.length === 2 &&
    collapsePlayers.length === 1
  ) {
    const collapsing =
      collapsePlayers[0];

    const opponent =
      players.find(
        (player) =>
          player.number !==
          collapsing.number
      );

    if (
      opponent
    ) {
      const opponentMetrics =
        metricsByPlayer[
          String(
            opponent.number
          )
        ];

      if (
        opponentMetrics !==
          undefined &&
        opponentMetrics
          .terminalUniquePackets >=
          3 &&
        opponentMetrics
          .gapToRecordingEndMs !==
          null &&
        opponentMetrics
          .gapToRecordingEndMs <=
          terminalWindowMs
      ) {
        const winnerName =
          playerName.get(
            opponent.number
          ) ??
          `Player ${opponent.number}`;

        return {
          ...authority,

          classification:
            "likely_outcome",

          classificationConfidenceBps:
            9000,

          winnerConfidenceBps:
            8000,

          winningPlayerNumbers: [
            opponent.number,
          ],

          winningPlayerNames: [
            winnerName,
          ],

          collapsingPlayerNumber:
            collapsing.number,

          collapsingPlayerName:
            playerName.get(
              collapsing.number
            ) ??
            `Player ${collapsing.number}`,

          reasonCode:
            "terminal_self_delete_collapse",

          reason:
            "One player issued a concentrated terminal self-delete sequence while the opponent remained actively commanding.",
        };
      }
    }
  }

  return {
    ...authority,

    classification:
      "inconclusive_recording",

    classificationConfidenceBps:
      9000,

    winnerConfidenceBps:
      null,

    winningPlayerNumbers:
      [],

    winningPlayerNames:
      [],

    reasonCode:
      "no_safe_tier3_winner_signal",

    reason:
      "No official result was encoded and Tier-3 terminal evidence does not safely identify a winner.",
  };
}
