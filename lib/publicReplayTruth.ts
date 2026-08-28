import { resolveReplayOwnerDisplay } from "./replayOwnerDisplay.ts";
import {
  classifyUnresolvedWatcherResult,
  normalizePublicReplayText,
  resolveReplayWinnerTruth,
  type UnresolvedWatcherResult,
} from "./unresolvedWatcherResult.ts";
import {
  applyReplayAdjudicationToGameStats,
  getReplayAdjudicationForGameStatsId,
} from "./replayAdjudications.ts";

export type PublicGameStatsLike = {
  id?: number | string | null;
  replayHash?: string | null;
  replay_hash?: string | null;
  replayFile?: string | null;
  replay_file?: string | null;
  originalFilename?: string | null;
  original_filename?: string | null;
  winner?: string | null;
  players?: unknown;
  map?: unknown;
  mapName?: string | null;
  map_name?: string | null;
  key_events?: unknown;
  keyEvents?: unknown;
  event_types?: unknown;
  eventTypes?: unknown;
  parse_reason?: string | null;
  parseReason?: string | null;
  parse_source?: string | null;
  parseSource?: string | null;
  disconnect_detected?: boolean | null;
  disconnectDetected?: boolean | null;
  is_final?: boolean | null;
  isFinal?: boolean | null;
  timestamp?: string | Date | null;
  played_on?: string | Date | null;
  playedOn?: string | Date | null;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
  parse_iteration?: number | null;
  parseIteration?: number | null;
  unresolvedResult?: UnresolvedWatcherResult | null;
  [key: string]: unknown;
};

function readString(row: PublicGameStatsLike, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNumber(row: PublicGameStatsLike, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function readTimeMs(row: PublicGameStatsLike) {
  for (const value of [
    row.played_on,
    row.playedOn,
    row.timestamp,
    row.createdAt,
    row.created_at,
  ]) {
    if (!value) continue;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function readPlayers(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(
      (player): player is Record<string, unknown> =>
        Boolean(player) && typeof player === "object" && !Array.isArray(player)
    );
  }
  if (typeof value === "string") {
    try {
      return readPlayers(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function readMapName(row: PublicGameStatsLike) {
  const direct = normalizePublicReplayText(
    row.mapName ?? row.map_name
  );
  if (direct) return direct;
  return normalizePublicReplayText(readRecord(row.map).name);
}

function basename(value: string) {
  return value.split(/[\\/]/).pop()?.trim() || value.trim();
}

export function publicReplayParseReason(row: PublicGameStatsLike) {
  return readString(row, "parse_reason", "parseReason").toLowerCase();
}

export function publicReplayParseSource(row: PublicGameStatsLike) {
  return readString(row, "parse_source", "parseSource").toLowerCase();
}

export function publicReplayIsFinal(row: PublicGameStatsLike) {
  return row.is_final === true || row.isFinal === true;
}

function durableAdjudicatedPublicWinnerTruth(
  row: PublicGameStatsLike
) {
  const adjudicated =
    applyReplayAdjudicationToGameStats(
      row
    );

  const source =
    adjudicated as
      Record<string, unknown>;

  const adjudication =
    readRecord(
      source
        .replayResultAdjudication
    );

  const winnerProof =
    readString(
      adjudicated,
      "winnerProof",
      "winner_proof"
    )
      .trim()
      .toLowerCase();

  const parseReason =
    readString(
      adjudicated,
      "parse_reason",
      "parseReason"
    )
      .trim()
      .toLowerCase();

  const decisionStatus =
    String(
      adjudication
        .decisionStatus ??
      adjudication
        .decision_status ??
      ""
    )
      .trim()
      .toLowerCase();

  const affectsStats =
    adjudication
      .affectsStats ===
      true ||
    adjudication
      .affects_stats ===
      true;

  /*
   * This branch accepts only the durable result-review ledger.
   *
   * A scalar winner or manual parse reason alone is insufficient.
   * The explicit adjudication marker must be present, accepted,
   * statistics-authorized and projected onto a final replay.
   */
  if (
    !publicReplayIsFinal(
      adjudicated
    ) ||
    winnerProof !==
      "replay_result_adjudication" ||
    parseReason !==
      "manual_result_adjudication" ||
    decisionStatus !==
      "accepted" ||
    !affectsStats
  ) {
    return null;
  }

  const explicitWinnerPlayers =
    (
      Array.isArray(
        source.winnerPlayers
      )
        ? source
            .winnerPlayers
        : []
    )
      .map(
        normalizePublicReplayText
      )
      .filter(
        (
          name
        ): name is string =>
          Boolean(name)
      );

  const projectedFlagWinners =
    readPlayers(
      adjudicated.players
    )
      .filter(
        (player) =>
          publicWinnerFlagIsTrue(
            player.winner
          )
      )
      .map(
        (player) =>
          normalizePublicReplayText(
            player.name
          )
      )
      .filter(
        (
          name
        ): name is string =>
          Boolean(name)
      );

  const rawWinningNames =
    explicitWinnerPlayers.length >
      0
      ? explicitWinnerPlayers
      : projectedFlagWinners;

  const winningNames =
    rawWinningNames.filter(
      (
        name,
        index,
        values
      ) =>
        values.findIndex(
          (candidate) =>
            candidate
              .toLowerCase() ===
            name.toLowerCase()
        ) ===
        index
    );

  const storedWinner =
    normalizePublicReplayText(
      readString(
        adjudicated,
        "winner",
        "winnerName",
        "winner_name"
      )
    );

  const winner =
    winningNames.length >
      0
      ? winningNames.join(
          " / "
        )
      : storedWinner;

  if (!winner) {
    return null;
  }

  return {
    winner,

    candidateWinner:
      winner,

    confidence:
      "recovered" as const,

    truthReasons: [
      "replay_result_adjudication",
    ],

    publicLabel:
      winner,

    statsEligible:
      true,

    /*
     * Durable result adjudication is a statistics and presentation
     * authority only. It never becomes settlement evidence here.
     */
    bettingEligible:
      false,

    diagnosticSummary:
      `Winning side ${winner} was accepted through the durable replay-result adjudication ledger.`,

    neededEvidence:
      [],
  };
}

export function publicReplayWinnerTruth(row: PublicGameStatsLike) {
  const adjudicatedTruth =
    durableAdjudicatedPublicWinnerTruth(
      row
    );

  if (adjudicatedTruth) {
    return adjudicatedTruth;
  }

  const adjudicated =
    applyReplayAdjudicationToGameStats(
      row
    );

  return resolveReplayWinnerTruth({
    winner:
      adjudicated.winner,

    players:
      readPlayers(
        adjudicated.players
      ),

    parseReason:
      readString(
        adjudicated,
        "parse_reason",
        "parseReason"
      ) ||
      null,

    parseSource:
      readString(
        adjudicated,
        "parse_source",
        "parseSource"
      ) ||
      null,

    keyEvents:
      adjudicated.key_events ??
      adjudicated.keyEvents,

    eventTypes:
      adjudicated.event_types ??
      adjudicated.eventTypes,

    isFinal:
      publicReplayIsFinal(
        adjudicated
      ),

    disconnectDetected:
      adjudicated
        .disconnect_detected ===
        true ||
      adjudicated
        .disconnectDetected ===
        true,
  });
}

export function isPublicResolvedGameStatsRow(row: PublicGameStatsLike) {
  const adjudicated = applyReplayAdjudicationToGameStats(row);
  const adjudication = getReplayAdjudicationForGameStatsId(row.id);
  if (
    adjudication?.affectsStats ||
    Boolean((adjudicated as Record<string, unknown>).replayResultAdjudication)
  ) {
    return publicReplayIsFinal(adjudicated);
  }
  return (
    publicReplayIsFinal(adjudicated) &&
    publicReplayWinnerTruth(adjudicated).statsEligible
  );
}

export function publicReplayIdentity(row: PublicGameStatsLike) {
  const keyEvents = readRecord(row.key_events ?? row.keyEvents);
  const platformMatchId = normalizePublicReplayText(keyEvents.platform_match_id);
  if (platformMatchId) return `platform:${platformMatchId.toLowerCase()}`;

  const watcherUpload = readRecord(keyEvents.watcher_upload);
  const watcherSessionId = normalizePublicReplayText(
    watcherUpload.watcher_session_id
  );
  const file = readString(
    row,
    "original_filename",
    "originalFilename",
    "replay_file",
    "replayFile"
  );
  const hash = readString(row, "replayHash", "replay_hash");

  /*
   * Final artifacts have a stable content hash. Prefer it over a process-wide
   * watcher session so sequential legacy games that overwrite the same generic
   * filename remain separate logical battles. Platform identity still wins
   * across independent watchers when it is available.
   */
  if (publicReplayIsFinal(row) && hash) {
    return `hash:${hash.toLowerCase()}`;
  }

  // Live replay hashes change while the file grows. The watcher session and
  // original filename remain stable across those parse iterations.
  if (watcherSessionId && file) {
    return `watcher:${watcherSessionId.toLowerCase()}:${basename(file).toLowerCase()}`;
  }
  if (file && publicReplayParseSource(row).startsWith("watcher")) {
    return `watcher-file:${basename(file).toLowerCase()}`;
  }

  if (hash) return `hash:${hash.toLowerCase()}`;
  if (file) return `file:${basename(file).toLowerCase()}`;
  return `row:${String(row.id ?? "")}`;
}

function metadataScore(row: PublicGameStatsLike) {
  const adjudicated = applyReplayAdjudicationToGameStats(row);
  const players = readPlayers(adjudicated.players);
  const knownPlayers = players.filter((player) =>
    normalizePublicReplayText(player.name)
  ).length;
  let score = knownPlayers * 50;
  if (readMapName(adjudicated)) score += 100;
  if (publicReplayIsFinal(adjudicated)) score += 500;
  if (
    getReplayAdjudicationForGameStatsId(row.id)?.affectsStats ||
    Boolean((adjudicated as Record<string, unknown>).replayResultAdjudication)
  ) {
    score += 1400;
  } else if (publicReplayWinnerTruth(adjudicated).statsEligible) {
    score += 1000;
  }
  score += Math.min(
    250,
    Math.max(0, readNumber(adjudicated, "parse_iteration", "parseIteration"))
  );
  return score;
}

function comparePublicRows(left: PublicGameStatsLike, right: PublicGameStatsLike) {
  const scoreDiff = metadataScore(left) - metadataScore(right);
  if (scoreDiff !== 0) return scoreDiff;
  const timeDiff = readTimeMs(left) - readTimeMs(right);
  if (timeDiff !== 0) return timeDiff;
  return readNumber(left, "id") - readNumber(right, "id");
}

function clearUnsafeWinnerFields<T extends PublicGameStatsLike>(row: T): T {
  const next: Record<string, unknown> = { ...row };
  next["winner"] = null;

  for (const key of [
    "winnerName",
    "winner_name",
    "winningTeam",
    "winning_team",
  ]) {
    if (key in next) next[key] = null;
  }

  const players = readPlayers(next["players"]);
  if (players.length > 0) {
    next["players"] = players.map((player) => ({
      ...player,
      winner: null,
    }));
  }

  const proof = next["proof"];
  if (proof && typeof proof === "object" && !Array.isArray(proof)) {
    const nextProof: Record<string, unknown> = {
      ...(proof as Record<string, unknown>),
    };
    for (const key of [
      "winner",
      "winnerName",
      "winner_name",
      "winningTeam",
      "winning_team",
    ]) {
      if (key in nextProof) nextProof[key] = null;
    }
    next["proof"] = nextProof;
  }

  return next as T;
}

function sanitizePublicMetadataFields<T extends PublicGameStatsLike>(row: T): T {
  const next: Record<string, unknown> = { ...row };
  const map = readRecord(row.map);
  if (Object.keys(map).length > 0) {
    next["map"] = {
      ...map,
      name: normalizePublicReplayText(map.name),
      size: normalizePublicReplayText(map.size),
    };
  }
  for (const key of ["mapName", "map_name"]) {
    if (key in next) next[key] = normalizePublicReplayText(next[key]);
  }

  if (Array.isArray(row.players)) {
    next["players"] = readPlayers(row.players).flatMap((player) => {
      const name = normalizePublicReplayText(player.name);
      if (!name) return [];
      return [{
        ...player,
        name,
        civilization_name: normalizePublicReplayText(
          player.civilization_name
        ),
        civilization:
          typeof player.civilization === "string"
            ? normalizePublicReplayText(player.civilization)
            : player.civilization,
      }];
    });
  }

  const owner = resolveReplayOwnerDisplay(row);
  next["ownerPlayerName"] = owner.ownerPlayerName;
  next["owner_player_name"] = owner.ownerPlayerName;
  next["ownerDisplayName"] = owner.ownerDisplayName;
  next["ownerDisplaySource"] = owner.ownerDisplaySource;
  next["ownerWatcherId"] = owner.ownerWatcherId;

  return next as T;
}

function isManualPublicResultReason(parseReason: string | null | undefined) {
  const reason = String(parseReason || "").trim().toLowerCase();
  return (
    reason === "manual_override" ||
    reason === "manual_recovery" ||
    reason === "manual_result_adjudication" ||
    reason.includes("manual_backfill") ||
    reason.includes("manual_recovery") ||
    reason.includes("manual_override")
  );
}

function publicWinnerFlagIsTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function trustedStructuredWinningPlayerNames(
  row: PublicGameStatsLike
) {
  const keyEvents =
    readRecord(
      row.key_events ??
        row.keyEvents
    );

  const resultResolution =
    readRecord(
      keyEvents
        .result_resolution
    );

  const winningNames =
    (
      Array.isArray(
        resultResolution
          .winning_player_names
      )
        ? resultResolution
            .winning_player_names
        : []
    )
      .map(
        normalizePublicReplayText
      )
      .filter(
        (
          name
        ): name is string =>
          Boolean(name)
      );

  const winningKeys =
    new Set(
      winningNames.map(
        (name) =>
          name.toLowerCase()
      )
    );

  if (
    winningNames.length < 2 ||
    winningKeys.size !==
      winningNames.length
  ) {
    return null;
  }

  const rosterNames =
    readPlayers(
      row.players
    )
      .map(
        (player) =>
          normalizePublicReplayText(
            player.name
          )
      )
      .filter(
        (
          name
        ): name is string =>
          Boolean(name)
      );

  const rosterKeys =
    new Set(
      rosterNames.map(
        (name) =>
          name.toLowerCase()
      )
    );

  if (
    rosterNames.length < 3 ||
    rosterKeys.size !==
      rosterNames.length ||
    winningNames.length >=
      rosterNames.length ||
    [...winningKeys].some(
      (key) =>
        !rosterKeys.has(key)
    )
  ) {
    return null;
  }

  return winningNames;
}

function trustedManualPublicWinner(row: PublicGameStatsLike) {
  const parseReason = readString(row, "parse_reason", "parseReason") || "";
  if (!isManualPublicResultReason(parseReason)) return null;

  const storedWinner = normalizePublicReplayText(
    readString(row, "winner", "winnerName", "winner_name")
  );
  if (!storedWinner) return null;

  const winnerKey = storedWinner.trim().toLowerCase();
  const players = readPlayers(row.players);

  const matchingWinnerFlag = players.some((player) => {
    const playerName = normalizePublicReplayText(player.name);
    return Boolean(
      playerName &&
      playerName.trim().toLowerCase() === winnerKey &&
      publicWinnerFlagIsTrue(player.winner)
    );
  });

  return matchingWinnerFlag ? storedWinner : null;
}

export function toPublicGameStatsRow<T extends PublicGameStatsLike>(row: T): T {
  const adjudicated = applyReplayAdjudicationToGameStats(row);
  if (
    getReplayAdjudicationForGameStatsId(row.id) ||
    Boolean((adjudicated as Record<string, unknown>).replayResultAdjudication)
  ) {
    return sanitizePublicMetadataFields(adjudicated);
  }

  const publicRow = sanitizePublicMetadataFields(row);

  const trustedManualWinner = trustedManualPublicWinner(row);
  if (trustedManualWinner) {
    const next: Record<string, unknown> = { ...publicRow };
    next["winner"] = trustedManualWinner;
    next["winnerProof"] = "manual_winner_flag";
    next["reviewNeeded"] = false;
    next["unresolvedResult"] = null;
    return next as T;
  }

  const truth = publicReplayWinnerTruth(row);

  if (truth.statsEligible && truth.winner) {
    const next: Record<string, unknown> = {
      ...publicRow,
    };

    // The canonical replay winner resolver may recover stronger
    // result truth than the legacy scalar winner field contains.
    //
    // This is especially important for team games, where the
    // stored scalar historically represented only one member of
    // the winning side while resolveReplayWinnerTruth() returns
    // the complete trusted winning team.
    //
    // This changes presentation only. Betting eligibility remains
    // independently governed by truth.bettingEligible.
    next["winner"] = truth.winner;

    const trustedTeamResult =
      truth.truthReasons.includes(
        "trusted_team_result"
      );

    next["winnerProof"] =
      trustedTeamResult
        ? "trusted_structured_result"
        : "replay_winner_truth";

    if (trustedTeamResult) {
      const winningNames =
        trustedStructuredWinningPlayerNames(
          row
        );

      if (winningNames) {
        const winningKeys =
          new Set(
            winningNames.map(
              (name) =>
                name.toLowerCase()
            )
          );

        const players =
          readPlayers(
            publicRow.players
          );

        if (players.length > 0) {
          next["players"] =
            players.map(
              (player) => {
                const name =
                  normalizePublicReplayText(
                    player.name
                  );

                return {
                  ...player,
                  winner:
                    Boolean(
                      name &&
                      winningKeys.has(
                        name.toLowerCase()
                      )
                    ),
                };
              }
            );
        }
      }
    }

    next["reviewNeeded"] = false;
    next["unresolvedResult"] = null;

    return next as T;
  }

  if (truth.statsEligible) return publicRow;

  const disconnectNoResult =
    row.disconnect_detected === true ||
    row.disconnectDetected === true;

  if (disconnectNoResult) {
    const players =
      readPlayers(row.players);

    const specificUnresolved =
      classifyUnresolvedWatcherResult({
        winner: row.winner,
        players,
        playerCount:
          players.length,
        mapName:
          readMapName(row),
        state:
          "completed",
        parseReason:
          readString(
            row,
            "parse_reason",
            "parseReason"
          ) || null,
        parseSource:
          readString(
            row,
            "parse_source",
            "parseSource"
          ) || null,
        keyEvents:
          row.key_events ??
          row.keyEvents,
        eventTypes:
          row.event_types ??
          row.eventTypes,
        isFinal:
          publicReplayIsFinal(row),
        finalAccepted:
          publicReplayIsFinal(row),
        disconnectDetected:
          true,
      });

    if (
      specificUnresolved?.code ===
        "watcher_ended_early_team_result"
    ) {
      const next:
        Record<string, unknown> =
          clearUnsafeWinnerFields(
            publicRow
          );

      next["unresolvedResult"] =
        specificUnresolved;

      next["reviewNeeded"] =
        false;

      next["winnerProof"] =
        "watcher_ended_early_team_result";

      return next as T;
    }

    const next: Record<string, unknown> =
      clearUnsafeWinnerFields(
        publicRow
      );

    /*
     * A parser/watcher disconnect flag is machine evidence,
     * not human-confirmed desync truth.
     *
     * The lobby may display DESYNCED only after the separate,
     * append-only ReplayDesyncIncident ledger establishes that
     * human conclusion.
     */
    next["unresolvedResult"] = {
      code:
        "disconnect_result_unproven",
      label:
        "Result unproven",
      explanation:
        "The replay ended with a disconnect flag before a canonical winner was proven. A machine disconnect flag is not a human-confirmed desync.",
      reviewNeeded:
        true,
    };

    next["reviewNeeded"] =
      true;

    next["winnerProof"] =
      "disconnect_result_unproven";

    return next as T;
  }

  const noCapturedWinnerReason = readString(row, "parse_reason", "parseReason") || "";
  const isEngineRoomStructuralProjection =
    noCapturedWinnerReason === "engine_room_structural_projection";
  const structuralReplayFile = readString(
    row,
    "original_filename",
    "originalFilename",
    "replay_file",
    "replayFile"
  ).toLowerCase();
  const isSavedCheckpointStructure =
    isEngineRoomStructuralProjection && structuralReplayFile.endsWith(".aoe2mpgame");
  const isQuietCompletedNoWinner =
    publicReplayIsFinal(row) &&
    (
      noCapturedWinnerReason === "hd_final_parse_match_fallback" ||
      noCapturedWinnerReason === "repaired_parse_match_fallback" ||
      noCapturedWinnerReason === "recorded_resignation_final" ||
      noCapturedWinnerReason === "watcher_final_unparsed" ||
      noCapturedWinnerReason === "watcher_final_submission" ||
      isEngineRoomStructuralProjection
    );

  if (isQuietCompletedNoWinner) {
    const players =
      readPlayers(row.players);

    const specificUnresolved =
      classifyUnresolvedWatcherResult({
        winner: row.winner,
        players,
        playerCount:
          players.length,
        mapName:
          readMapName(row),
        state:
          "completed",
        parseReason:
          readString(
            row,
            "parse_reason",
            "parseReason"
          ) || null,
        parseSource:
          readString(
            row,
            "parse_source",
            "parseSource"
          ) || null,
        keyEvents:
          row.key_events ??
          row.keyEvents,
        eventTypes:
          row.event_types ??
          row.eventTypes,
        isFinal:
          publicReplayIsFinal(row),
        finalAccepted:
          publicReplayIsFinal(row),
        disconnectDetected:
          row.disconnect_detected === true ||
          row.disconnectDetected === true,
      });

    if (
      specificUnresolved?.code ===
        "watcher_ended_early_team_result"
    ) {
      const next:
        Record<string, unknown> =
          clearUnsafeWinnerFields(
            publicRow
          );

      next["unresolvedResult"] =
        specificUnresolved;

      next["reviewNeeded"] =
        false;

      next["winnerProof"] =
        "watcher_ended_early_team_result";

      return next as T;
    }

    const next: Record<string, unknown> = clearUnsafeWinnerFields(publicRow);

    // Product truth policy:
    // Structurally recovered rows may publish map, roster and teams without
    // manufacturing a winner. Ordinary completed rows remain quiet when no
    // reliable result was captured.
    next["unresolvedResult"] = {
      code: "winner_not_captured",
      label: isSavedCheckpointStructure
        ? "Saved checkpoint"
        : isEngineRoomStructuralProjection
          ? "Result unproven"
          : "Completed",
      explanation: isEngineRoomStructuralProjection
        ? "Map, roster and teams were recovered from the immutable replay artifact; no reliable winner was proven."
        : "Match completed, but no reliable winner was captured from the replay data.",
      reviewNeeded: false,
    };
    next["reviewNeeded"] = false;
    next["winnerProof"] = "not_captured";

    return next as T;
  }

  const players = readPlayers(row.players);
  const next: Record<string, unknown> = clearUnsafeWinnerFields(publicRow);
  next["unresolvedResult"] =
    row.unresolvedResult ??
    classifyUnresolvedWatcherResult({
      winner: row.winner,
      players,
      playerCount: players.length,
      mapName: readMapName(row),
      state: publicReplayIsFinal(row) ? "completed" : "live",
      parseReason: readString(row, "parse_reason", "parseReason") || null,
      parseSource: readString(row, "parse_source", "parseSource") || null,
      keyEvents: row.key_events ?? row.keyEvents,
      disconnectDetected:
        row.disconnect_detected === true || row.disconnectDetected === true,
    });
  return next as T;
}

export function sanitizePublicLiveGamesSnapshot<
  T extends Record<string, unknown>
>(snapshot: T): T {
  const sanitize = (value: unknown) =>
    Array.isArray(value)
      ? value.map((item) =>
          item && typeof item === "object"
            ? toPublicGameStatsRow(item as PublicGameStatsLike)
            : item
        )
      : value;

  return {
    ...snapshot,
    activeSessions: sanitize(snapshot.activeSessions),
    recentlyCompletedSessions: sanitize(snapshot.recentlyCompletedSessions),
    recentMatches: sanitize(snapshot.recentMatches),
  } as T;
}

export function cleanPublicGameRows<T extends PublicGameStatsLike>(
  rows: T[],
  options: { includeReview?: boolean; includeLive?: boolean } = {}
): T[] {
  const includeReview = options.includeReview ?? true;
  const includeLive = options.includeLive ?? false;
  const byIdentity = new Map<string, T>();

  for (const row of rows) {
    if (
      !includeLive &&
      !publicReplayIsFinal(row) &&
      publicReplayParseSource(row).startsWith("watcher")
    ) {
      continue;
    }
    if (!includeReview && !isPublicResolvedGameStatsRow(row)) continue;

    const key = publicReplayIdentity(row);
    const current = byIdentity.get(key);
    if (!current || comparePublicRows(row, current) > 0) {
      byIdentity.set(key, row);
    }
  }

  return [...byIdentity.values()]
    .sort((left, right) => readTimeMs(right) - readTimeMs(left))
    .map((row) => toPublicGameStatsRow(row));
}
