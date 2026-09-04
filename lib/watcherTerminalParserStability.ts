export const WATCHER_TERMINAL_STABLE_PARSER_NAME =
  "aoe2war.mgz_hd" as const;

export const WATCHER_TERMINAL_STABLE_PARSER_VERSION =
  "1.8.51" as const;

export const WATCHER_TERMINAL_STABLE_PASS_NAME =
  "hd_deterministic_evidence" as const;

export const WATCHER_TERMINAL_STABLE_PASS_MIN_VERSION =
  8 as const;

export const WATCHER_TERMINAL_RAW_ACTIVITY_PATH =
  "actions.raw_activity_by_player" as const;

export const WATCHER_TERMINAL_PARSER_STABILITY_POLICY_VERSION =
  "watcher-terminal-parser-stability-v1" as const;

type StabilityEvidence =
  | {
      source:
        "legacy_game_stats_parse_iteration";
      parseIteration: number;
    }
  | {
      source:
        "deterministic_replay_parse_run";
      parseIteration: number;
      parseRunId: number;
      replayHash: string;
      parserName: string;
      parserVersion: string;
      passName: string;
      passVersion: number;
      status: string;
      activityObservationId: number;
      activityObservationFieldPath: string;
      policyVersion:
        typeof WATCHER_TERMINAL_PARSER_STABILITY_POLICY_VERSION;
    };

export type WatcherTerminalParserStability =
  | {
      stable: true;
      evidence: StabilityEvidence;
    }
  | {
      stable: false;
      evidence: null;
    };

function record(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function integer(
  value: unknown,
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isSafeInteger(parsed)
    ? parsed
    : null;
}

function positiveInteger(
  value: unknown,
) {
  const parsed =
    integer(value);

  return parsed !== null &&
    parsed > 0
    ? parsed
    : null;
}

export function evaluateWatcherTerminalParserStability(
  input: {
    parseIteration: number;
    replayHash: string;
    parseRun?: unknown;
  },
): WatcherTerminalParserStability {
  if (
    Number.isSafeInteger(
      input.parseIteration,
    ) &&
    input.parseIteration >= 2
  ) {
    return {
      stable: true,
      evidence: {
        source:
          "legacy_game_stats_parse_iteration",
        parseIteration:
          input.parseIteration,
      },
    };
  }

  const run =
    record(input.parseRun);

  const parseRunId =
    positiveInteger(run.id);

  const replayHash =
    text(
      input.replayHash,
    ).toLowerCase();

  const artifactSha256 =
    text(
      run.artifactSha256,
    ).toLowerCase();

  const parserName =
    text(run.parserName);

  const parserVersion =
    text(run.parserVersion);

  const passName =
    text(run.passName);

  const passVersion =
    integer(run.passVersion);

  const status =
    text(
      run.status,
    ).toLowerCase();

  const activityObservationId =
    positiveInteger(
      run.activityObservationId,
    );

  const activityObservationFieldPath =
    text(
      run.activityObservationFieldPath,
    );

  const stable =
    parseRunId !== null &&
    replayHash.length === 64 &&
    artifactSha256 ===
      replayHash &&
    parserName ===
      WATCHER_TERMINAL_STABLE_PARSER_NAME &&
    parserVersion ===
      WATCHER_TERMINAL_STABLE_PARSER_VERSION &&
    passName ===
      WATCHER_TERMINAL_STABLE_PASS_NAME &&
    passVersion !== null &&
    passVersion >=
      WATCHER_TERMINAL_STABLE_PASS_MIN_VERSION &&
    (
      status === "completed" ||
      status === "recovered"
    ) &&
    run.candidateOnly === true &&
    run.affectsPublicAggregates ===
      false &&
    activityObservationId !==
      null &&
    activityObservationFieldPath ===
      WATCHER_TERMINAL_RAW_ACTIVITY_PATH;

  if (!stable) {
    return {
      stable: false,
      evidence: null,
    };
  }

  return {
    stable: true,

    evidence: {
      source:
        "deterministic_replay_parse_run",

      parseIteration:
        input.parseIteration,

      parseRunId,

      replayHash,

      parserName,

      parserVersion,

      passName,

      passVersion,

      status,

      activityObservationId,

      activityObservationFieldPath,

      policyVersion:
        WATCHER_TERMINAL_PARSER_STABILITY_POLICY_VERSION,
    },
  };
}
