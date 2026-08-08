export const AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS =
  9000;

export type ScreenshotVerdictObservation =
  | {
      value: unknown;
      confidenceBps: number | null;
    }
  | undefined;

export type ScreenshotVerdictCanonicalPlayer = {
  stablePlayerKey: string;
  normalizedName: string;
};

export type ScreenshotVerdictResolution =
  | {
      outcome: "eligible";
      evidenceTeams: string[][];
      winningPlayerKeys: string[];
      winningTeamIndex: number;
      teamResolutionMode:
        | "screenshot_teams"
        | "canonical_duel_singletons";
      teamConfidenceBps: number | null;
      winnerConfidenceBps: number | null;
    }
  | {
      outcome: "review_required";
      reason: string;
    };

function record(
  value: unknown
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(
  value: unknown
) {
  return Array.isArray(value)
    ? value
        .map((entry) =>
          typeof entry === "string"
            ? entry.trim()
            : ""
        )
        .filter(Boolean)
    : [];
}

function normalizedName(
  value: unknown
) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("en-US")
    : "";
}

function assessmentStatus(
  observation:
    ScreenshotVerdictObservation
) {
  const value =
    record(observation?.value);

  return typeof value?.status ===
    "string"
    ? value.status
        .trim()
        .toLowerCase()
    : "";
}

function assessmentEligible(
  observation:
    ScreenshotVerdictObservation
) {
  if (!observation) {
    return false;
  }

  const status =
    assessmentStatus(
      observation
    );

  return (
    (
      status === "confirmed" ||
      status === "observed"
    ) &&
    (
      observation.confidenceBps ??
      0
    ) >=
      AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS
  );
}

function exactCanonicalRoster(
  canonicalKeys: string[],
  evidenceTeams: string[][]
) {
  const assignedKeys =
    [
      ...new Set(
        evidenceTeams.flat()
      ),
    ].sort();

  return (
    canonicalKeys.length ===
      assignedKeys.length &&
    canonicalKeys.every(
      (key, index) =>
        key ===
        assignedKeys[index]
    )
  );
}

export function resolveScreenshotAutoVerdictEvidence(
  input: {
    teamAssessment:
      ScreenshotVerdictObservation;
    winnerAssessment:
      ScreenshotVerdictObservation;
    winningKeysObservation:
      ScreenshotVerdictObservation;
    teamsObservation:
      ScreenshotVerdictObservation;
    canonicalRoster:
      ScreenshotVerdictCanonicalPlayer[];
  }
): ScreenshotVerdictResolution {
  const {
    teamAssessment,
    winnerAssessment,
    winningKeysObservation,
    teamsObservation,
    canonicalRoster,
  } = input;

  if (
    !assessmentEligible(
      winnerAssessment
    )
  ) {
    return {
      outcome:
        "review_required",
      reason:
        "winner_not_confirmed_at_90_percent",
    };
  }

  if (
    !winningKeysObservation ||
    (
      winningKeysObservation
        .confidenceBps ??
      0
    ) <
      AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS
  ) {
    return {
      outcome:
        "review_required",
      reason:
        "canonical_winner_mapping_below_90_percent",
    };
  }

  const winningPlayerKeys =
    stringArray(
      winningKeysObservation.value
    );

  if (
    winningPlayerKeys.length <
    1
  ) {
    return {
      outcome:
        "review_required",
      reason:
        "winning_player_keys_missing",
    };
  }

  const canonicalKeys =
    canonicalRoster
      .map((player) =>
        player.stablePlayerKey.trim()
      )
      .filter(Boolean)
      .sort();

  if (
    canonicalKeys.length < 2 ||
    new Set(canonicalKeys).size !==
      canonicalKeys.length
  ) {
    return {
      outcome:
        "review_required",
      reason:
        "canonical_roster_invalid",
    };
  }

  let evidenceTeams:
    string[][] = [];

  let teamResolutionMode:
    | "screenshot_teams"
    | "canonical_duel_singletons" =
      "screenshot_teams";

  const screenshotTeamsEligible =
    assessmentEligible(
      teamAssessment
    ) &&
    Boolean(
      teamsObservation
    ) &&
    (
      teamsObservation
        ?.confidenceBps ??
      0
    ) >=
      AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS;

  if (
    screenshotTeamsEligible
  ) {
    const teamsValue =
      record(
        teamsObservation?.value
      );

    const rawTeams =
      Array.isArray(
        teamsValue?.teams
      )
        ? teamsValue.teams
        : [];

    evidenceTeams =
      rawTeams
        .map((entry) => {
          const team =
            record(entry);

          return stringArray(
            team?.player_keys
          );
        })
        .filter(
          (playerKeys) =>
            playerKeys.length >
            0
        );

    if (
      evidenceTeams.length !==
      2
    ) {
      return {
        outcome:
          "review_required",
        reason:
          "screenshot_team_count_not_two",
      };
    }

    if (
      !exactCanonicalRoster(
        canonicalKeys,
        evidenceTeams
      )
    ) {
      return {
        outcome:
          "review_required",
        reason:
          "screenshot_roster_not_exactly_canonical",
      };
    }
  } else {
    /*
     * Narrow fallback for a canonical two-player duel.
     *
     * We do NOT infer team membership from:
     *   - player ordering
     *   - color
     *   - score
     *   - aliases
     *   - action tail
     *
     * Instead we require:
     *   - exactly two canonical participants
     *   - an explicitly CONFIRMED screenshot winner
     *   - exactly one winner name
     *   - exactly one loser name
     *   - exact canonical name mapping for both
     *   - exact canonical stable-key mapping for the winner
     *
     * With two distinct canonical participants and explicit
     * winner/loser evidence, each participant is necessarily
     * one singleton opposing side.
     */
    const winnerValue =
      record(
        winnerAssessment?.value
      );

    const winnerStatus =
      assessmentStatus(
        winnerAssessment
      );

    const winningPlayerNames =
      stringArray(
        winnerValue
          ?.winningPlayerNames
      );

    const losingPlayerNames =
      stringArray(
        winnerValue
          ?.losingPlayerNames
      );

    if (
      winnerStatus !==
        "confirmed" ||
      canonicalRoster.length !==
        2 ||
      winningPlayerKeys.length !==
        1 ||
      winningPlayerNames.length !==
        1 ||
      losingPlayerNames.length !==
        1
    ) {
      return {
        outcome:
          "review_required",
        reason:
          "team_not_confirmed_and_duel_fallback_not_eligible",
      };
    }

    const winnerName =
      normalizedName(
        winningPlayerNames[0]
      );

    const loserName =
      normalizedName(
        losingPlayerNames[0]
      );

    if (
      !winnerName ||
      !loserName ||
      winnerName === loserName
    ) {
      return {
        outcome:
          "review_required",
        reason:
          "canonical_duel_names_invalid",
      };
    }

    const winnerMatches =
      canonicalRoster.filter(
        (player) =>
          normalizedName(
            player.normalizedName
          ) === winnerName
      );

    const loserMatches =
      canonicalRoster.filter(
        (player) =>
          normalizedName(
            player.normalizedName
          ) === loserName
      );

    if (
      winnerMatches.length !==
        1 ||
      loserMatches.length !==
        1
    ) {
      return {
        outcome:
          "review_required",
        reason:
          "canonical_duel_name_mapping_not_exact",
      };
    }

    const winnerKey =
      winnerMatches[0]
        .stablePlayerKey;

    const loserKey =
      loserMatches[0]
        .stablePlayerKey;

    if (
      winnerKey === loserKey ||
      winnerKey !==
        winningPlayerKeys[0] ||
      !canonicalKeys.includes(
        winnerKey
      ) ||
      !canonicalKeys.includes(
        loserKey
      )
    ) {
      return {
        outcome:
          "review_required",
        reason:
          "canonical_duel_winner_mapping_conflict",
      };
    }

    evidenceTeams = [
      [loserKey],
      [winnerKey],
    ];

    teamResolutionMode =
      "canonical_duel_singletons";
  }

  const winningTeamIndex =
    evidenceTeams.findIndex(
      (playerKeys) =>
        playerKeys.length ===
          winningPlayerKeys.length &&
        winningPlayerKeys.every(
          (key) =>
            playerKeys.includes(
              key
            )
        )
    );

  if (
    winningTeamIndex === -1
  ) {
    return {
      outcome:
        "review_required",
      reason:
        "winning_players_do_not_exactly_match_one_team",
    };
  }

  return {
    outcome:
      "eligible",
    evidenceTeams,
    winningPlayerKeys,
    winningTeamIndex,
    teamResolutionMode,
    teamConfidenceBps:
      teamAssessment
        ?.confidenceBps ??
      null,
    winnerConfidenceBps:
      winnerAssessment
        ?.confidenceBps ??
      null,
  };
}
