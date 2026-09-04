import {
  resolveExplicitUnevenTeamStats,
} from "./replayExplicitTeamStats.ts";

export const UNRESOLVED_WATCHER_RESULT_CODES = [
  "disconnect_or_desync",
  "roster_missing",
  "winner_missing",
  "parser_unknown_fields",
  "final_proof_unparsed",
  "duplicate_or_alias_conflict",
  "replay_still_cooling_down",
  "incomplete_single_watcher_proof",
  "watcher_ended_early_team_result",
  "impossible_from_available_replay_data",
] as const;

export type UnresolvedWatcherResultCode =
  (typeof UNRESOLVED_WATCHER_RESULT_CODES)[number];

export type UnresolvedWatcherResult = {
  code: UnresolvedWatcherResultCode;
  label:
    | "Winner under review"
    | "Result review"
    | "Awaiting final proof"
    | "Desynced"
    | "Unknown · watcher ended early";
  explanation: string;
  reviewNeeded: boolean;
};

export const REPLAY_TRUTH_CONFIDENCES = [
  "proven",
  "recovered",
  "inferred_low_confidence",
  "unresolved",
] as const;

export type ReplayTruthConfidence =
  (typeof REPLAY_TRUTH_CONFIDENCES)[number];

export const REPLAY_WINNER_TRUTH_REASON_CODES = [
  "stored_winner_field",
  "reliable_player_winner_flag",
  "trusted_team_result",
  "recorded_resignation",
  "postgame_block",
  "scoreboard_completion",
  "manual_recovery",
  "accepted_result_adjudication",
  "uploader_opponent_inference_rejected",
  "generic_inference_rejected",
  "disconnect_or_desync",
  "untrusted_structured_team_result",
  "winner_missing",
  "no_postgame_block",
  "no_scores",
  "no_achievements",
  "no_resignation_event",
  "no_reliable_winner_flag",
  "no_completion_signal",
  "conflicting_winner_flags",
  "insufficient_final_signal",
  "coherent_final_team_winner_flags",
] as const;

export type ReplayWinnerTruthReason =
  (typeof REPLAY_WINNER_TRUTH_REASON_CODES)[number];

export type ReplayWinnerTruth = {
  winner: string | null;
  candidateWinner: string | null;
  confidence: ReplayTruthConfidence;
  truthReasons: ReplayWinnerTruthReason[];
  publicLabel: string;
  statsEligible: boolean;
  bettingEligible: boolean;
  diagnosticSummary: string;
  neededEvidence: string[];
};

export type ReplayWinnerTruthInput = {
  winner: unknown;
  players?: Array<{ name?: unknown; winner?: unknown }> | null;
  parseReason?: string | null;
  parseSource?: string | null;
  keyEvents?: unknown;
  eventTypes?: unknown;
  disconnectDetected?: boolean | null;
  isFinal?: boolean | null;
};

type UnresolvedWatcherResultInput = {
  winner?: unknown;
  players?: Array<{ name?: unknown; winner?: unknown }> | null;
  playerCount?: number | null;
  mapName?: unknown;
  state?: string | null;
  parseReason?: string | null;
  parseSource?: string | null;
  keyEvents?: unknown;
  eventTypes?: unknown;
  isFinal?: boolean | null;
  eventType?: string | null;
  finalityStatus?: string | null;
  unparsedFinal?: boolean | null;
  finalAccepted?: boolean | null;
  reason?: string | null;
  waitMs?: number | null;
  watcherCount?: number | null;
  disconnectDetected?: boolean | null;
};

const NON_WINNER_VALUES = new Set([
  "unknown",
  "unknown map",
  "unknown player",
  "unknown opponent",
  "opponent",
  "unknown result",
  "unknown battlefield",
  "undetermined",
  "unresolved",
  "map unresolved",
  "roster unresolved",
  "winner unresolved",
  "opponent unresolved",
  "none",
  "null",
  "n/a",
  "na",
  "parsing",
  "players parsing",
  "game in progress",
  "tbd",
  "to be determined",
  "-",
  "--",
  "unavailable",
  "map unavailable",
  "size unavailable",
  "version unavailable",
  "match type unavailable",
  "parse reason unavailable",
  "duration unavailable",
  "civilization unavailable",
  "date unavailable",
  "map pending",
]);

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePublicReplayText(value: unknown) {
  const text = textValue(value);
  if (!text || NON_WINNER_VALUES.has(text.toLowerCase())) {
    return null;
  }
  return text;
}

export function isUnknownishReplayValue(value: unknown) {
  return normalizePublicReplayText(value) === null;
}

export function publicReplayMapLabel(value: unknown, fallback = "HD Battlefield") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return normalizePublicReplayText((value as { name?: unknown }).name) ?? fallback;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return normalizePublicReplayText((parsed as { name?: unknown }).name) ?? fallback;
      }
      if (typeof parsed === "string") {
        return normalizePublicReplayText(parsed) ?? fallback;
      }
    } catch {
      return normalizePublicReplayText(value) ?? fallback;
    }
  }

  return fallback;
}

export function publicReplayPlayerLabel(value: unknown, fallback = "HD Warrior") {
  return normalizePublicReplayText(value) ?? fallback;
}

export function unresolvedReplayReviewLabel(parseReason: string | null | undefined) {
  const reason = textValue(parseReason).toLowerCase();
  if (reason.includes("final_unparsed") || reason.includes("unknown_fields")) {
    return "Parser review";
  }
  if (reason.includes("pending") || reason.includes("cooldown")) {
    return "Awaiting proof";
  }
  return "Needs review";
}

export function normalizeResolvedWinner(value: unknown) {
  return normalizePublicReplayText(value);
}

function readKeyEvents(value: unknown): Record<string, unknown> {
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

const UNRELIABLE_WINNER_INFERENCE_REASONS = new Set([
  "watcher_inferred_opponent_win_on_incomplete_1v1",
  "watcher_inferred_opponent_win_on_incomplete",
  "watcher_inferred_backfill",
]);

export function isUnreliableWinnerInference(
  parseReason: string | null | undefined,
  keyEvents?: unknown
) {
  const reason = textValue(parseReason).toLowerCase();
  if (
    UNRELIABLE_WINNER_INFERENCE_REASONS.has(reason) ||
    reason.startsWith("watcher_inferred_")
  ) {
    return true;
  }

  const inference = readKeyEvents(keyEvents).winner_inference;
  if (!inference || typeof inference !== "object" || Array.isArray(inference)) {
    return false;
  }

  const inferenceType = textValue(
    (inference as { type?: unknown }).type
  ).toLowerCase();
  return Boolean(inferenceType);
}

function truthBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function truthCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }
  return 0;
}

function hasArrayValues(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function eventTypeSet(value: unknown) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => textValue(entry).toLowerCase())
      .filter(Boolean)
  );
}

function winnerFlagNames(
  players: ReplayWinnerTruthInput["players"]
) {
  const names = new Set<string>();
  for (const player of Array.isArray(players) ? players : []) {
    if (!truthBoolean(player?.winner)) continue;
    const name = normalizePublicReplayText(player?.name);
    if (name) names.add(name);
  }
  return [...names];
}

function trustedStructuredTeamWinners(
  keyEvents: Record<string, unknown>,
  flaggedWinners: string[]
) {
  const result =
    readKeyEvents(
      keyEvents
        .result_resolution
    );

  const teams =
    readKeyEvents(
      keyEvents
        .team_resolution
    );

  const winningNames =
    (
      Array.isArray(
        result
          .winning_player_names
      )
        ? result
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

  const normalizedWinningNames =
    new Set(
      winningNames.map(
        (name) =>
          name.toLowerCase()
      )
    );

  const flaggedKeys =
    new Set(
      flaggedWinners.map(
        (name) =>
          name.toLowerCase()
      )
    );

  const winningPlayerKeys =
    (
      Array.isArray(
        result
          .winning_player_keys
      )
        ? result
            .winning_player_keys
        : []
    )
      .map(
        textValue
      )
      .filter(Boolean);

  const normalizedWinningPlayerKeys =
    new Set(
      winningPlayerKeys.map(
        (key) =>
          key.toLowerCase()
      )
    );

  const winningTeamId =
    textValue(
      result
        .winning_team_id
    )
      .toLowerCase();

  const provenance =
    textValue(
      result
        .result_provenance
    )
      .toLowerCase();

  const allowlistedProvenance =
    new Set([
      "complete_losing_team_resignation",
      "postgame_winner_flags",
      "scoreboard_winner_flags",
      "postgame_single_team_winner_flags",
      "scoreboard_single_team_winner_flags",
    ]);

  const rawTeams =
    Array.isArray(
      teams.teams
    )
      ? teams.teams
      : [];

  const teamEntries =
    rawTeams
      .filter(
        (
          value
        ): value is Record<
          string,
          unknown
        > =>
          Boolean(value) &&
          typeof value ===
            "object" &&
          !Array.isArray(value)
      )
      .map(
        (team) => {
          const names =
            (
              Array.isArray(
                team.players
              )
                ? team.players
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

          const playerKeys =
            (
              Array.isArray(
                team.player_keys
              )
                ? team.player_keys
                : []
            )
              .map(
                textValue
              )
              .filter(Boolean);

          return {
            teamId:
              textValue(
                team.team_id
              )
                .toLowerCase(),

            names,

            normalizedNames:
              new Set(
                names.map(
                  (name) =>
                    name.toLowerCase()
                )
              ),

            playerKeys,

            normalizedPlayerKeys:
              new Set(
                playerKeys.map(
                  (key) =>
                    key.toLowerCase()
                )
              ),
          };
        }
      );

  const sameSet =
    (
      left: Set<string>,
      right: Set<string>
    ) =>
      left.size ===
        right.size &&
      [...left].every(
        (value) =>
          right.has(value)
      );

  const matchingTeams =
    teamEntries.filter(
      (team) =>
        (
          normalizedWinningNames
            .size >
            0 &&
          sameSet(
            normalizedWinningNames,
            team.normalizedNames
          )
        ) ||
        (
          normalizedWinningPlayerKeys
            .size >
            0 &&
          sameSet(
            normalizedWinningPlayerKeys,
            team.normalizedPlayerKeys
          )
        ) ||
        (
          Boolean(
            winningTeamId
          ) &&
          (
            team.teamId ===
              winningTeamId ||
            team.normalizedPlayerKeys
              .has(
                winningTeamId
              )
          )
        )
    );

  const isOneVsOne =
    teamEntries.length ===
      2 &&
    teamEntries.every(
      (team) =>
        team.names.length ===
          1 ||
        team.playerKeys.length ===
          1
    );

  if (
    !truthBoolean(
      result
        .result_trusted
    ) ||
    textValue(
      result
        .result_status
    )
      .toLowerCase() !==
      "resolved" ||
    !allowlistedProvenance.has(
      provenance
    ) ||
    textValue(
      teams.status
    )
      .toLowerCase() !==
      "resolved" ||
    textValue(
      teams.confidence
    )
      .toLowerCase() !==
      "high" ||
    winningNames.length <
      1 ||
    normalizedWinningNames
      .size !==
      winningNames.length ||
    matchingTeams.length !==
      1 ||
    (
      winningNames.length ===
        1 &&
      !isOneVsOne
    ) ||
    [...flaggedKeys].some(
      (key) =>
        !normalizedWinningNames
          .has(key)
    )
  ) {
    return null;
  }

  return winningNames;
}


/**
 * Stats-only fallback for a complete trusted structured team result.
 *
 * This deliberately does not create betting or settlement proof. It only
 * permits a resolved team winner into public statistics when the structured
 * result is trusted and the replay winner flags match the complete winning
 * roster exactly.
 */
function trustedStructuredTeamStatsWinners(
  keyEvents: Record<string, unknown>,
  flaggedWinners: string[]
) {
  const result = readKeyEvents(
    keyEvents.result_resolution
  );

  const teams = readKeyEvents(
    keyEvents.team_resolution
  );

  const winningNames = (
    Array.isArray(result.winning_player_names)
      ? result.winning_player_names
      : []
  )
    .map(normalizePublicReplayText)
    .filter(
      (name): name is string =>
        Boolean(name)
    );

  const winningKeys = new Set(
    winningNames.map(
      (name) =>
        name.toLowerCase()
    )
  );

  const flaggedKeys = new Set(
    flaggedWinners.map(
      (name) =>
        name.toLowerCase()
    )
  );

  const exactWinningRoster =
    winningNames.length >= 2 &&
    winningKeys.size === winningNames.length &&
    flaggedKeys.size === winningKeys.size &&
    [...winningKeys].every(
      (key) =>
        flaggedKeys.has(key)
    );

  if (
    textValue(
      result.result_status
    ).toLowerCase() !== "resolved" ||
    !truthBoolean(
      result.result_trusted
    ) ||
    textValue(
      teams.status
    ).toLowerCase() !== "resolved" ||
    textValue(
      teams.confidence
    ).toLowerCase() !== "high" ||
    !exactWinningRoster
  ) {
    return null;
  }

  return winningNames;
}

function missingWinnerProofReasons(
  keyEvents: Record<string, unknown>,
  eventTypes: Set<string>,
  reliableWinnerFlag: boolean
) {
  const reasons: ReplayWinnerTruthReason[] = [];
  if (!truthBoolean(keyEvents.postgame_available)) {
    reasons.push("no_postgame_block");
  }
  if (
    !truthBoolean(keyEvents.has_scores) &&
    truthCount(keyEvents.player_score_count) === 0
  ) {
    reasons.push("no_scores");
  }
  if (
    !truthBoolean(keyEvents.has_achievements) &&
    truthCount(keyEvents.achievement_player_count) === 0
  ) {
    reasons.push("no_achievements");
  }
  if (
    !hasArrayValues(keyEvents.resigned_player_names) &&
    !hasArrayValues(keyEvents.resigned_player_numbers) &&
    !eventTypes.has("resign")
  ) {
    reasons.push("no_resignation_event");
  }
  if (!reliableWinnerFlag) {
    reasons.push("no_reliable_winner_flag");
  }
  if (
    !truthBoolean(keyEvents.completed) &&
    !textValue(keyEvents.completion_source)
  ) {
    reasons.push("no_completion_signal");
  }
  reasons.push("insufficient_final_signal");
  return reasons;
}

function neededWinnerEvidence(reasons: ReplayWinnerTruthReason[]) {
  const needed = new Set<string>();
  if (reasons.includes("no_postgame_block")) {
    needed.add("a parsed postgame block");
  }
  if (reasons.includes("no_reliable_winner_flag")) {
    needed.add("a reliable winner flag");
  }
  if (reasons.includes("no_resignation_event")) {
    needed.add("an explicit resignation or defeat event");
  }
  if (reasons.includes("no_scores") || reasons.includes("no_achievements")) {
    needed.add("a completed score or achievement table");
  }
  if (reasons.includes("no_completion_signal")) {
    needed.add("a decisive replay completion signal");
  }
  return [...needed];
}

function recoveredWinnerReason(parseReason: string) {
  return (
    parseReason.includes("manual_backfill") ||
    parseReason.includes("manual_override") ||
    parseReason.includes("repaired")
  );
}

function coherentTeamFlagDisplayCandidate(
  keyEvents: Record<string, unknown>
) {
  const resultResolution = readKeyEvents(
    keyEvents.result_resolution
  );

  const resultEvidence = readKeyEvents(
    resultResolution.result_evidence
  );

  const teamResolution = readKeyEvents(
    keyEvents.team_resolution
  );

  if (
    !truthBoolean(
      resultEvidence.winner_flags_coherent
    )
  ) {
    return null;
  }

  const winningTeamId =
    resultEvidence.winner_flag_team_id;

  if (
    winningTeamId === null ||
    winningTeamId === undefined ||
    String(winningTeamId).trim() === ""
  ) {
    return null;
  }

  const teams = Array.isArray(teamResolution.teams)
    ? teamResolution.teams
    : [];

  const winningTeam = teams
    .filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value)
    )
    .find(
      (team) =>
        String(team.team_id) ===
        String(winningTeamId)
    );

  if (!winningTeam) {
    return null;
  }

  const names = (
    Array.isArray(winningTeam.players)
      ? winningTeam.players
      : []
  )
    .map(normalizePublicReplayText)
    .filter(
      (name): name is string =>
        Boolean(name)
    );

  // This rail is deliberately team-game only.
  // Existing 1v1 truth rules remain untouched.
  if (names.length < 2) {
    return null;
  }

  return {
    names,
    label: names.join(" / "),
    teamId: String(winningTeamId),
  };
}



function explicitReplayWinnerFlag(
  value: unknown
): boolean | null {
  if (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === false ||
    value === "false" ||
    value === 0 ||
    value === "0"
  ) {
    return false;
  }

  return null;
}

function sameNameSet(
  left: Set<string>,
  right: Set<string>
) {
  return (
    left.size === right.size &&
    [...left].every(
      (value) =>
        right.has(value)
    )
  );
}

function coherentFinalTeamFlagStatsCandidate(
  input: ReplayWinnerTruthInput,
  keyEvents: Record<string, unknown>,
  candidate:
    | ReturnType<
        typeof coherentTeamFlagDisplayCandidate
      >
    | null
) {
  if (!candidate) {
    return null;
  }

  const parseSource =
    textValue(
      input.parseSource
    ).toLowerCase();

  /*
   * Callers that know database finality pass isFinal explicitly.
   * Older/direct callers may fall back to watcher_final.
   *
   * An explicit isFinal=false always wins and fails closed.
   */
  const finalReplay =
    input.isFinal === true ||
    (
      input.isFinal == null &&
      parseSource ===
        "watcher_final"
    );

  if (!finalReplay) {
    return null;
  }

  const teamResolution =
    readKeyEvents(
      keyEvents.team_resolution
    );

  if (
    textValue(
      teamResolution.status
    ).toLowerCase() !==
      "resolved" ||
    textValue(
      teamResolution.confidence
    ).toLowerCase() !==
      "high" ||
    textValue(
      teamResolution.provenance
    ).toLowerCase() !==
      "explicit_final_team_ids"
  ) {
    return null;
  }

  const rawTeams =
    Array.isArray(
      teamResolution.teams
    )
      ? teamResolution.teams
      : [];

  const teams =
    rawTeams
      .filter(
        (
          value
        ): value is Record<
          string,
          unknown
        > =>
          Boolean(value) &&
          typeof value ===
            "object" &&
          !Array.isArray(value)
      )
      .map((team) => {
        const names = (
          Array.isArray(
            team.players
          )
            ? team.players
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
          )
          .map(
            (name) =>
              name.toLowerCase()
          );

        return {
          teamId:
            String(
              team.team_id
            ),
          names,
        };
      });

  if (
    teams.length !== 2 ||
    teams.some(
      (team) =>
        team.names.length <
        1
    )
  ) {
    return null;
  }

  const winningTeam =
    teams.find(
      (team) =>
        team.teamId ===
        candidate.teamId
    );

  const losingTeam =
    teams.find(
      (team) =>
        team.teamId !==
        candidate.teamId
    );

  if (
    !winningTeam ||
    !losingTeam
  ) {
    return null;
  }

  const completeRoster =
    [
      ...winningTeam.names,
      ...losingTeam.names,
    ];

  const completeRosterSet =
    new Set(
      completeRoster
    );

  /*
   * Duplicate normalized names are ambiguous without stable
   * player keys at this resolver layer. Fail closed.
   */
  if (
    completeRosterSet.size !==
    completeRoster.length
  ) {
    return null;
  }

  const players =
    Array.isArray(
      input.players
    )
      ? input.players
      : [];

  if (
    players.length !==
    completeRoster.length
  ) {
    return null;
  }

  const winnerNames =
    new Set<string>();

  const loserNames =
    new Set<string>();

  const observedNames =
    new Set<string>();

  for (
    const player
    of players
  ) {
    const name =
      normalizePublicReplayText(
        player?.name
      )?.toLowerCase();

    const winner =
      explicitReplayWinnerFlag(
        player?.winner
      );

    if (
      !name ||
      winner === null ||
      observedNames.has(
        name
      )
    ) {
      return null;
    }

    observedNames.add(
      name
    );

    if (winner) {
      winnerNames.add(
        name
      );
    } else {
      loserNames.add(
        name
      );
    }
  }

  if (
    !sameNameSet(
      observedNames,
      completeRosterSet
    )
  ) {
    return null;
  }

  const expectedWinners =
    new Set(
      winningTeam.names
    );

  const expectedLosers =
    new Set(
      losingTeam.names
    );

  if (
    !sameNameSet(
      winnerNames,
      expectedWinners
    ) ||
    !sameNameSet(
      loserNames,
      expectedLosers
    )
  ) {
    return null;
  }

  const resultResolution =
    readKeyEvents(
      keyEvents.result_resolution
    );

  const resultEvidence =
    readKeyEvents(
      resultResolution.result_evidence
    );

  if (
    !truthBoolean(
      resultEvidence
        .winner_flags_coherent
    ) ||
    String(
      resultEvidence
        .winner_flag_team_id
    ) !==
      candidate.teamId ||
    truthBoolean(
      resultEvidence
        .resignation_result_conflict
    )
  ) {
    return null;
  }

  /*
   * A conflicting explicit structured winner is not eligible
   * for this fallback.
   */
  const structuredWinningTeamId =
    resultResolution
      .winning_team_id;

  if (
    structuredWinningTeamId !==
      null &&
    structuredWinningTeamId !==
      undefined &&
    String(
      structuredWinningTeamId
    ).trim() !== "" &&
    String(
      structuredWinningTeamId
    ) !== candidate.teamId
  ) {
    return null;
  }

  return candidate;
}



function acceptedReplayResultAdjudicationCandidate(
  input: ReplayWinnerTruthInput,
  keyEvents: Record<string, unknown>
) {
  const parseReason =
    textValue(input.parseReason).toLowerCase();

  const parseSource =
    textValue(input.parseSource).toLowerCase();

  if (
    !(
      parseReason === "manual_result_adjudication" ||
      parseReason === "automatic_result_evidence"
    ) ||
    !(
      parseSource === "replay_result_review" ||
      parseSource === "replay_result_evidence"
    )
  ) {
    return null;
  }

  const evidence =
    readKeyEvents(
      keyEvents.replay_result_adjudication
    );

  if (
    textValue(
      evidence.decision_status
    ).toLowerCase() !== "accepted" ||
    !truthBoolean(
      evidence.affects_stats
    )
  ) {
    return null;
  }

  const winningPlayerKeys =
    Array.isArray(
      evidence.winning_player_keys
    )
      ? evidence.winning_player_keys
          .map(textValue)
          .filter(Boolean)
      : [];

  if (
    winningPlayerKeys.length === 0 ||
    new Set(
      winningPlayerKeys
    ).size !==
      winningPlayerKeys.length
  ) {
    return null;
  }

  const players =
    Array.isArray(
      input.players
    )
      ? input.players
      : [];

  if (
    players.length < 2
  ) {
    return null;
  }

  const observedNames =
    new Set<string>();

  const winningNames:
    string[] = [];

  let losingPlayerCount =
    0;

  for (
    const player
    of players
  ) {
    const name =
      normalizePublicReplayText(
        player?.name
      );

    const winner =
      explicitReplayWinnerFlag(
        player?.winner
      );

    if (
      !name ||
      winner === null
    ) {
      return null;
    }

    const normalizedName =
      name.toLowerCase();

    if (
      observedNames.has(
        normalizedName
      )
    ) {
      return null;
    }

    observedNames.add(
      normalizedName
    );

    if (winner) {
      winningNames.push(
        name
      );
    } else {
      losingPlayerCount +=
        1;
    }
  }

  if (
    winningNames.length === 0 ||
    losingPlayerCount === 0 ||
    winningNames.length !==
      winningPlayerKeys.length
  ) {
    return null;
  }

  const adjudicationId =
    truthCount(
      evidence.adjudication_id
    );

  if (
    adjudicationId <= 0
  ) {
    return null;
  }

  return {
    names:
      winningNames,

    label:
      winningNames.join(
        " / "
      ),

    adjudicationId,
  };
}


export function resolveReplayWinnerTruth(
  input: ReplayWinnerTruthInput
): ReplayWinnerTruth {
  const keyEvents = readKeyEvents(input.keyEvents);
  const eventTypes = eventTypeSet(input.eventTypes);
  const parseReason = textValue(input.parseReason).toLowerCase();
  const storedWinner = normalizeResolvedWinner(input.winner);
  const flaggedWinners = winnerFlagNames(input.players);
  const structuredTeamWinners =
    trustedStructuredTeamWinners(
      keyEvents,
      flaggedWinners
    ) ??
    trustedStructuredTeamStatsWinners(
      keyEvents,
      flaggedWinners
    );
  const coherentTeamFlagCandidate =
    coherentTeamFlagDisplayCandidate(keyEvents);

  const coherentFinalTeamStatsCandidate =
    coherentFinalTeamFlagStatsCandidate(
      input,
      keyEvents,
      coherentTeamFlagCandidate
    );

  const explicitUnevenTeamStatsCandidate =
    resolveExplicitUnevenTeamStats({
      winner:
        input.winner,

      players:
        input.players,

      keyEvents:
        input.keyEvents,

      isFinal:
        input.isFinal,

      disconnectDetected:
        input.disconnectDetected,
    });
  const structuredResult = readKeyEvents(keyEvents.result_resolution);
  const structuredTeamResolution = readKeyEvents(keyEvents.team_resolution);
  const structuredResultClaimsTeam =
    Array.isArray(structuredResult.winning_player_names) &&
    structuredResult.winning_player_names.length > 1;
  const reliableFlagWinner =
    flaggedWinners.length === 1 ? flaggedWinners[0] : null;
  const inferenceRejected = isUnreliableWinnerInference(
    input.parseReason,
    input.keyEvents
  );
  const resignationProof =
    hasArrayValues(keyEvents.resigned_player_names) ||
    hasArrayValues(keyEvents.resigned_player_numbers) ||
    eventTypes.has("resign") ||
    parseReason === "recorded_resignation_final" ||
    textValue(keyEvents.completion_source).toLowerCase() === "resignation";
  const postgameProof = truthBoolean(keyEvents.postgame_available);
  const scoreboardProof =
    truthBoolean(keyEvents.has_scores) ||
    truthBoolean(keyEvents.has_achievements) ||
    truthCount(keyEvents.player_score_count) > 0 ||
    truthCount(keyEvents.achievement_player_count) > 0;
  const decisivePlayerFlag =
    Boolean(reliableFlagWinner) &&
    !structuredResultClaimsTeam &&
    (truthBoolean(keyEvents.completed) ||
      postgameProof ||
      scoreboardProof ||
      resignationProof);
  const candidateWinner = storedWinner ?? reliableFlagWinner;
  const disconnectDetected =
    truthBoolean(input.disconnectDetected) ||
    truthBoolean(keyEvents.disconnect_detected);
  const hasStructuredResultContract =
    Object.keys(structuredResult).length > 0 &&
    (
      "result_status" in structuredResult ||
      "result_trusted" in structuredResult ||
      "winning_team_id" in structuredResult ||
      "winning_player_names" in structuredResult
    );
  const isStructuredTeamGame =
    Array.isArray(input.players) &&
    input.players.length > 2 &&
    Object.keys(structuredTeamResolution).length > 0;
  const structuredTeamResultRejected =
    isStructuredTeamGame &&
    hasStructuredResultContract &&
    (
      textValue(structuredResult.result_status).toLowerCase() !== "resolved" ||
      !truthBoolean(structuredResult.result_trusted)
    );

  /*
   * An accepted, statistics-authorized adjudication is durable
   * human result authority over the immutable replay evidence.
   *
   * It may correct a raw Unknown result or a replay carrying a
   * disconnect flag, but it never becomes betting authority here.
   * Financial authority remains an independent explicit rail.
   */
  const acceptedAdjudication =
    acceptedReplayResultAdjudicationCandidate(
      input,
      keyEvents
    );

  if (
    acceptedAdjudication
  ) {
    return {
      winner:
        acceptedAdjudication.label,

      candidateWinner:
        acceptedAdjudication.label,

      confidence:
        "recovered",

      truthReasons: [
        "accepted_result_adjudication",
      ],

      publicLabel:
        acceptedAdjudication.label,

      statsEligible:
        true,

      bettingEligible:
        false,

      diagnosticSummary:
        `Winning side ${acceptedAdjudication.label} is authorized for statistics by accepted replay adjudication ${acceptedAdjudication.adjudicationId}.`,

      neededEvidence:
        [],
    };
  }

  /*
   * A projected adjudication must fail closed as one authority unit.
   *
   * When adjudication metadata is present but invalid, incomplete,
   * nonaccepted, or not statistics-authorized, the resolver must not
   * fall through to legacy scalar-winner or player-flag recovery.
   */
  const replayResultAdjudicationMarker =
    (
      parseReason ===
        "manual_result_adjudication" ||
      parseReason ===
        "automatic_result_evidence"
    ) &&
    (
      textValue(
        input.parseSource
      ).toLowerCase() ===
        "replay_result_review" ||
      textValue(
        input.parseSource
      ).toLowerCase() ===
        "replay_result_evidence"
    ) &&
    Object.keys(
      readKeyEvents(
        keyEvents.replay_result_adjudication
      )
    ).length >
      0;

  if (
    replayResultAdjudicationMarker &&
    !acceptedAdjudication
  ) {
    return {
      winner:
        null,

      candidateWinner,

      confidence:
        "unresolved",

      truthReasons: [
        "winner_missing",
      ],

      publicLabel:
        "Result review",

      statsEligible:
        false,

      bettingEligible:
        false,

      diagnosticSummary:
        "Projected replay adjudication evidence was rejected because it was not accepted statistics authority over a complete explicit winning and losing roster.",

      neededEvidence: [
        "a valid accepted replay result adjudication with a complete explicit roster",
      ],
    };
  }

  if (disconnectDetected) {
    const truthReasons: ReplayWinnerTruthReason[] = ["disconnect_or_desync"];
    return {
      winner: null,
      candidateWinner,
      confidence: "unresolved",
      truthReasons,
      publicLabel: "Result review",
      statsEligible: false,
      bettingEligible: false,
      diagnosticSummary: candidateWinner
        ? `Candidate ${candidateWinner} was rejected because the replay carries disconnect/desync evidence.`
        : "Replay carries disconnect/desync evidence and cannot establish a canonical winner.",
      neededEvidence: ["a clean final replay or commissioner adjudication"],
    };
  }

  /*
   * Unequal explicit teams are valid AoE2 games, but they are
   * intentionally recovered for statistics only.
   *
   * Requirements are deliberately stronger than a scalar winner:
   * complete true/false flags, exactly one fully resigned team,
   * zero resignations on the opposite team, no disconnect and no
   * conflicting structured result.
   */
  if (
    explicitUnevenTeamStatsCandidate
  ) {
    const winnerLabel =
      explicitUnevenTeamStatsCandidate
        .winningPlayerNames
        .join(" / ");

    return {
      winner:
        winnerLabel,

      candidateWinner:
        winnerLabel,

      confidence:
        "recovered",

      truthReasons: [
        "coherent_final_team_winner_flags",
        "recorded_resignation",
      ],

      publicLabel:
        winnerLabel,

      statsEligible:
        true,

      bettingEligible:
        false,

      diagnosticSummary:
        `Winning side ${winnerLabel} was recovered for statistics from complete unequal-team winner flags and one complete losing-team resignation.`,

      neededEvidence:
        [],
    };
  }

  /*
   * A final replay with a complete explicit team roster and
   * complete coherent true/false winner flags is sufficient
   * for statistical W/L truth.
   *
   * It is deliberately NOT standalone financial settlement
   * proof. Betting stays on its stronger frozen-roster,
   * finality, desync, and settlement gates.
   */
  if (
    coherentFinalTeamStatsCandidate &&
    !structuredTeamWinners
  ) {
    const winnerLabel =
      coherentFinalTeamStatsCandidate
        .label;

    return {
      winner:
        winnerLabel,

      candidateWinner:
        winnerLabel,

      confidence:
        "recovered",

      truthReasons: [
        "coherent_final_team_winner_flags",
      ],

      publicLabel:
        winnerLabel,

      statsEligible:
        true,

      bettingEligible:
        false,

      diagnosticSummary:
        `Winning team ${winnerLabel} was recovered for statistics from a final replay whose complete explicit roster and winner flags agree.`,

      neededEvidence:
        [],
    };
  }

  // Canonical team-result contract outranks the legacy scalar winner field.
  // AOE2WAR_DISPLAY_ONLY_COHERENT_TEAM_RESULT
  //
  // Full-team winner flags are useful presentation evidence,
  // but the parser contract deliberately does not accept them
  // alone as financial settlement proof.
  //
  // Show the detected side while keeping official stats and
  // betting truth locked.
  if (coherentTeamFlagCandidate && !structuredTeamWinners) {
    const truthReasons =
      missingWinnerProofReasons(
        keyEvents,
        eventTypes,
        false
      );

    truthReasons.unshift(
      "insufficient_final_signal"
    );

    return {
      winner: null,
      candidateWinner:
        coherentTeamFlagCandidate.label,
      confidence: "inferred_low_confidence",
      truthReasons,
      publicLabel:
        `${coherentTeamFlagCandidate.label} · result detected`,
      statsEligible: false,
      bettingEligible: false,
      diagnosticSummary:
        `Winning side detected from coherent team-wide replay flags: ${coherentTeamFlagCandidate.label}. ` +
        "Settlement remains locked until decisive final proof is available.",
      neededEvidence:
        neededWinnerEvidence(truthReasons),
    };
  }

  // A review_required/untrusted structured team result must never be resurrected
  // into a win merely because mgz exposed coherent player winner flags.
  if (structuredTeamResultRejected) {
    const truthReasons: ReplayWinnerTruthReason[] = [
      "untrusted_structured_team_result",
    ];
    return {
      winner: null,
      candidateWinner,
      confidence: "unresolved",
      truthReasons,
      publicLabel: "Result review",
      statsEligible: false,
      bettingEligible: false,
      diagnosticSummary: candidateWinner
        ? `Candidate ${candidateWinner} was rejected because the structured team result is not trusted.`
        : "The structured team result requires review and does not establish a canonical winner.",
      neededEvidence: ["a trusted structured team result or commissioner adjudication"],
    };
  }

  if (inferenceRejected) {
    const inference = readKeyEvents(input.keyEvents).winner_inference;
    const inferenceType =
      inference && typeof inference === "object" && !Array.isArray(inference)
        ? textValue((inference as { type?: unknown }).type).toLowerCase()
        : "";
    const rejectionReason: ReplayWinnerTruthReason =
      inferenceType === "uploader_incomplete_1v1_opponent" ||
      parseReason === "watcher_inferred_opponent_win_on_incomplete_1v1"
        ? "uploader_opponent_inference_rejected"
        : "generic_inference_rejected";
    const truthReasons = [
      rejectionReason,
      ...missingWinnerProofReasons(keyEvents, eventTypes, false),
    ];
    return {
      winner: null,
      candidateWinner,
      confidence: "inferred_low_confidence",
      truthReasons,
      publicLabel: "Winner under review",
      statsEligible: false,
      bettingEligible: false,
      diagnosticSummary: candidateWinner
        ? `Candidate ${candidateWinner} came only from a rejected replay inference; decisive winner proof is missing.`
        : "A low-confidence replay inference was rejected because decisive winner proof is missing.",
      neededEvidence: neededWinnerEvidence(truthReasons),
    };
  }

  if (storedWinner && !structuredTeamWinners) {
    const truthReasons: ReplayWinnerTruthReason[] = ["stored_winner_field"];
    if (
      reliableFlagWinner &&
      reliableFlagWinner.toLowerCase() === storedWinner.toLowerCase()
    ) {
      truthReasons.push("reliable_player_winner_flag");
    }
    if (resignationProof) truthReasons.push("recorded_resignation");
    if (postgameProof) truthReasons.push("postgame_block");
    if (scoreboardProof) truthReasons.push("scoreboard_completion");
    if (recoveredWinnerReason(parseReason)) {
      truthReasons.push("manual_recovery");
    }
    const confidence: ReplayTruthConfidence = recoveredWinnerReason(parseReason)
      ? "recovered"
      : "proven";
    return {
      winner: storedWinner,
      candidateWinner: storedWinner,
      confidence,
      truthReasons,
      publicLabel: storedWinner,
      statsEligible: true,
      bettingEligible: true,
      diagnosticSummary:
        confidence === "recovered"
          ? `Winner ${storedWinner} was recovered from reviewed replay metadata.`
          : `Winner ${storedWinner} is supported by the stored replay result.`,
      neededEvidence: [],
    };
  }

  if (structuredTeamWinners) {
    const winnerLabel = structuredTeamWinners.join(" / ");
    const truthReasons: ReplayWinnerTruthReason[] = ["trusted_team_result"];
    if (resignationProof) truthReasons.push("recorded_resignation");
    if (postgameProof) truthReasons.push("postgame_block");
    if (scoreboardProof) truthReasons.push("scoreboard_completion");
    return {
      winner: winnerLabel,
      candidateWinner: winnerLabel,
      confidence: "recovered",
      truthReasons,
      publicLabel: winnerLabel,
      statsEligible: true,
      // A structured team result can enter stats without becoming standalone
      // market settlement proof. Team markets retain their frozen-roster rail.
      bettingEligible: false,
      diagnosticSummary: `Winning team ${winnerLabel} matches the complete trusted structured result.`,
      neededEvidence: [],
    };
  }

  if (decisivePlayerFlag && reliableFlagWinner) {
    const truthReasons: ReplayWinnerTruthReason[] = [
      "reliable_player_winner_flag",
    ];
    if (resignationProof) truthReasons.push("recorded_resignation");
    if (postgameProof) truthReasons.push("postgame_block");
    if (scoreboardProof) truthReasons.push("scoreboard_completion");
    return {
      winner: reliableFlagWinner,
      candidateWinner: reliableFlagWinner,
      confidence: "recovered",
      truthReasons,
      publicLabel: reliableFlagWinner,
      statsEligible: true,
      bettingEligible: true,
      diagnosticSummary: `Winner ${reliableFlagWinner} was recovered from a decisive player result signal.`,
      neededEvidence: [],
    };
  }

  const truthReasons = missingWinnerProofReasons(
    keyEvents,
    eventTypes,
    false
  );
  if (flaggedWinners.length > 1) {
    truthReasons.unshift("conflicting_winner_flags");
  } else {
    truthReasons.unshift("winner_missing");
  }
  const lowConfidenceFlag = Boolean(reliableFlagWinner);
  return {
    winner: null,
    candidateWinner: reliableFlagWinner,
    confidence: lowConfidenceFlag
      ? "inferred_low_confidence"
      : "unresolved",
    truthReasons,
    publicLabel: "Winner under review",
    statsEligible: false,
    bettingEligible: false,
    diagnosticSummary: lowConfidenceFlag
      ? `Player flag for ${reliableFlagWinner} lacks a decisive completion, postgame, scoreboard, or resignation signal.`
      : "Replay did not expose a decisive winner signal.",
    neededEvidence: neededWinnerEvidence(truthReasons),
  };
}

export function resolveReliableReplayWinner(input: ReplayWinnerTruthInput) {
  const truth = resolveReplayWinnerTruth(input);
  if (!truth.statsEligible) {
    return null;
  }
  return truth.winner;
}

function result(
  code: UnresolvedWatcherResultCode,
  label: UnresolvedWatcherResult["label"],
  explanation: string,
  reviewNeeded: boolean
): UnresolvedWatcherResult {
  return { code, label, explanation, reviewNeeded };
}

export function classifyUnresolvedWatcherResult(
  input: UnresolvedWatcherResultInput
): UnresolvedWatcherResult | null {
  const players = Array.isArray(input.players) ? input.players : [];
  const namedPlayers = players.filter((player) => textValue(player?.name));
  const playerCount =
    typeof input.playerCount === "number" && Number.isFinite(input.playerCount)
      ? Math.max(0, Math.floor(input.playerCount))
      : namedPlayers.length;
  const winnerTruth = resolveReplayWinnerTruth({
    winner: input.winner,
    players,
    parseReason: input.parseReason,
    parseSource: input.parseSource,
    keyEvents: input.keyEvents,
    eventTypes: input.eventTypes,
    isFinal: input.isFinal,
    disconnectDetected: input.disconnectDetected,
  });

  if (winnerTruth.statsEligible) {
    return null;
  }

  const rawWinner = textValue(input.winner).toLowerCase();
  const keyEvents = readKeyEvents(input.keyEvents);
  const watcherParseSource =
    textValue(input.parseSource).toLowerCase();

  const watcherUpload =
    readKeyEvents(
      keyEvents.watcher_upload
    );

  const teamResolution =
    readKeyEvents(
      keyEvents.team_resolution
    );

  const resultResolution =
    readKeyEvents(
      keyEvents.result_resolution
    );

  const resultEvidence =
    readKeyEvents(
      resultResolution.result_evidence
    );

  const watcherEndedBeforeTeamResult =
    playerCount >= 4 &&
    watcherParseSource === "watcher_final" &&
    !truthBoolean(keyEvents.completed) &&
    truthBoolean(
      watcherUpload.final_candidate
    ) &&
    textValue(
      watcherUpload.file_role
    ).toLowerCase() === "final_recording" &&
    textValue(
      teamResolution.status
    ).toLowerCase() === "resolved" &&
    textValue(
      teamResolution.confidence
    ).toLowerCase() === "high" &&
    textValue(
      resultResolution.result_status
    ).toLowerCase() === "review_required" &&
    !truthBoolean(
      resultResolution.result_trusted
    ) &&
    !truthBoolean(
      resultEvidence.postgame_available
    ) &&
    !truthBoolean(
      resultEvidence.complete_losing_team_resignation
    );

  if (watcherEndedBeforeTeamResult) {
    return result(
      "watcher_ended_early_team_result",
      "Unknown · watcher ended early",
      "The watcher recording ended before the team game final result was captured, so the eventual winner is unknown.",
      false
    );
  }

  const unresolvedDisconnectDetected =
    input.disconnectDetected === true ||
    truthBoolean(keyEvents.disconnect_detected);

  if (unresolvedDisconnectDetected) {
    return result(
      "disconnect_or_desync",
      "Desynced",
      "Replay ended in a disconnect or desync before a canonical winner existed.",
      false
    );
  }
  const completionSource = textValue(keyEvents.completion_source);
  const eventType = textValue(input.eventType).toLowerCase();
  const finalityStatus = textValue(input.finalityStatus).toLowerCase();
  const parseReason = textValue(input.parseReason).toLowerCase();
  const reason = textValue(input.reason).toLowerCase();
  const state = textValue(input.state).toLowerCase();
  const hasKnownMap = normalizePublicReplayText(input.mapName) !== null;
  const combined = [
    eventType,
    finalityStatus,
    parseReason,
    reason,
    textValue(input.parseSource).toLowerCase(),
    completionSource.toLowerCase(),
  ].join(" ");
  const explicitlyUnknown = Boolean(rawWinner && NON_WINNER_VALUES.has(rawWinner));
  const finalish =
    state === "completed" ||
    input.finalAccepted === true ||
    keyEvents.completed === true ||
    Boolean(completionSource) ||
    combined.includes("final") ||
    combined.includes("resignation");

  if (
    eventType === "final_candidate_reopened" ||
    reason === "replay_changed_after_final_acceptance"
  ) {
    return result(
      "replay_still_cooling_down",
      "Awaiting final proof",
      "Replay changed after final acceptance; live proof reopened",
      false
    );
  }

  if (!finalish && state === "live") {
    if (playerCount === 0) {
      return result(
        "roster_missing",
        "Awaiting final proof",
        "Player roster still parsing",
        false
      );
    }

    if (playerCount === 1) {
      return result(
        "incomplete_single_watcher_proof",
        "Awaiting final proof",
        "Only one player detected; awaiting fuller proof",
        false
      );
    }

    if (!hasKnownMap) {
      return result(
        "parser_unknown_fields",
        "Awaiting final proof",
        "Map unavailable; live replay metadata still parsing",
        false
      );
    }

    // A live replay is not expected to expose winner proof yet. Known roster and
    // map metadata are enough to present it as a normal active game.
    return null;
  }

  if (winnerTruth.confidence === "inferred_low_confidence") {
    return result(
      "impossible_from_available_replay_data",
      "Winner under review",
      winnerTruth.diagnosticSummary,
      true
    );
  }

  if (
    input.unparsedFinal === true ||
    finalityStatus === "final_unparsed_proof" ||
    parseReason === "watcher_final_unparsed" ||
    combined.includes("final_unparsed")
  ) {
    return result(
      "final_proof_unparsed",
      "Result review",
      "Final proof preserved but parser could not extract winner",
      true
    );
  }

  if (
    (eventType === "final_candidate_deferred" &&
      (reason === "final_candidate_cooldown" || !reason)) ||
    combined.includes("cooling") ||
    combined.includes("cooldown")
  ) {
    const seconds =
      typeof input.waitMs === "number" && input.waitMs > 0
        ? Math.max(1, Math.ceil(input.waitMs / 1000))
        : null;
    return result(
      "replay_still_cooling_down",
      "Awaiting final proof",
      `Replay still cooling down${seconds ? ` · ${seconds}s remaining` : ""}`,
      false
    );
  }

  if (
    eventType === "replay_detected_ignored" ||
    combined.includes("duplicate") ||
    combined.includes("alias_conflict") ||
    combined.includes("superseded_by_later_upload")
  ) {
    return result(
      "duplicate_or_alias_conflict",
      "Result review",
      "Duplicate replay candidate ignored",
      false
    );
  }

  if (
    playerCount === 1 &&
    (finalish ||
      explicitlyUnknown ||
      eventType === "parse_pending" ||
      eventType === "parse_result_unknown_fields")
  ) {
    return result(
      "incomplete_single_watcher_proof",
      "Awaiting final proof",
      "Only one player detected; awaiting fuller proof",
      false
    );
  }

  if (
    combined.includes("impossible") ||
    combined.includes("unrecoverable") ||
    combined.includes("insufficient_replay_data")
  ) {
    return result(
      "impossible_from_available_replay_data",
      "Winner under review",
      "Winner is impossible to determine from the available replay data",
      true
    );
  }

  if (playerCount >= 2 && finalish) {
    return result(
      "winner_missing",
      "Winner under review",
      "Replay parsed but winner field missing",
      true
    );
  }

  if (
    eventType === "parse_result_unknown_fields" ||
    combined.includes("unknown_fields") ||
    explicitlyUnknown
  ) {
    return result(
      "parser_unknown_fields",
      "Result review",
      "Parser returned unknown replay fields; needs parser review",
      true
    );
  }

  if (playerCount === 0 && eventType === "parse_pending") {
    return result(
      "roster_missing",
      "Awaiting final proof",
      "Player roster missing; awaiting fuller proof",
      false
    );
  }

  if (finalish) {
    return result(
      "impossible_from_available_replay_data",
      "Winner under review",
      "Winner is impossible to determine from the available replay data",
      true
    );
  }

  return null;
}
