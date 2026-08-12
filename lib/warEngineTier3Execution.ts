import { createHash } from "node:crypto";

import type {
  WarEngineTier3Verdict,
} from "./warEngineTier3.ts";

export const WAR_ENGINE_TIER3_EXECUTION_CONTRACT =
  "war_engine_tier3_execution_v1";

export type WarEngineTier3RunIdentityInput = {
  caseId: number;
  gameStatsId: number;
  sourceParseRunId: number;
  sourceParseRunIdentityHash: string;
  inputHash: string;
  engineName: string;
  engineVersion: string;
};

export type WarEngineTier3StableWinner = {
  winningTeamKey: string | null;
  winningPlayerKeys: string[];
};

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as JsonObject
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown): string | null {
  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return null;
}

function normalizeName(value: unknown) {
  return (
    typeof value === "string"
      ? value.trim().toLocaleLowerCase()
      : ""
  );
}

export function sha256WarEngineTier3Input(
  value: Uint8Array
) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

export function buildWarEngineTier3RunIdentity(
  input: WarEngineTier3RunIdentityInput
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        contract:
          WAR_ENGINE_TIER3_EXECUTION_CONTRACT,
        caseId:
          input.caseId,
        gameStatsId:
          input.gameStatsId,
        sourceParseRunId:
          input.sourceParseRunId,
        sourceParseRunIdentityHash:
          input.sourceParseRunIdentityHash,
        inputHash:
          input.inputHash,
        engineName:
          input.engineName,
        engineVersion:
          input.engineVersion,
      })
    )
    .digest("hex");
}

function teamResolutionFromCandidate(
  candidate: unknown
): JsonObject {
  const root =
    objectValue(candidate);

  const projection =
    objectValue(root.projection);

  const direct =
    objectValue(
      projection.team_resolution
    );

  if (
    Object.keys(direct).length > 0
  ) {
    return direct;
  }

  return objectValue(
    objectValue(
      projection.key_events
    ).team_resolution
  );
}

export function resolveWarEngineTier3StableWinner(
  candidate: unknown,
  verdict: WarEngineTier3Verdict
): WarEngineTier3StableWinner {
  if (
    verdict.winningPlayerNames.length === 0
  ) {
    return {
      winningTeamKey: null,
      winningPlayerKeys: [],
    };
  }

  const wantedNames =
    new Set(
      verdict.winningPlayerNames
        .map(normalizeName)
        .filter(Boolean)
    );

  const teams =
    arrayValue(
      teamResolutionFromCandidate(
        candidate
      ).teams
    )
      .map(objectValue);

  const matches =
    teams.filter((team) => {
      const players =
        arrayValue(team.players)
          .map(normalizeName)
          .filter(Boolean);

      return (
        wantedNames.size > 0 &&
        [...wantedNames].every(
          (name) =>
            players.includes(name)
        )
      );
    });

  if (
    matches.length !== 1
  ) {
    throw new Error(
      "WAR_ENGINE_TIER3_STABLE_WINNER_TEAM_UNRESOLVED"
    );
  }

  const team =
    matches[0];

  const winningPlayerKeys =
    arrayValue(
      team.player_keys
    )
      .map(textValue)
      .filter(
        (value): value is string =>
          Boolean(value)
      );

  if (
    winningPlayerKeys.length === 0
  ) {
    throw new Error(
      "WAR_ENGINE_TIER3_STABLE_WINNER_KEYS_UNRESOLVED"
    );
  }

  return {
    winningTeamKey:
      textValue(team.team_id),
    winningPlayerKeys:
      Array.from(
        new Set(
          winningPlayerKeys
        )
      ).sort(),
  };
}

export function warEngineTier3PersistenceConfidence(
  verdict: WarEngineTier3Verdict
) {
  /*
   * DB/public confidence is winner confidence only.
   * Classification confidence remains private structured metrics.
   */
  return verdict.winnerConfidenceBps;
}

export function warEngineTier3PublicCopy(
  verdict: WarEngineTier3Verdict
) {
  switch (verdict.classification) {
    case "likely_outcome":
      return {
        publicLabel:
          "LIKELY OUTCOME",
        publicDetail:
          verdict.winningPlayerNames.length
            ? `Terminal replay evidence strongly favors ${verdict.winningPlayerNames.join(", ")}, but no official result was encoded.`
            : "Terminal replay evidence strongly favors one side, but no official result was encoded.",
      };

    case "aborted_battle":
      return {
        publicLabel:
          "ABORTED BATTLE",
        publicDetail:
          "The recording ended before a meaningful competitive battle developed.",
      };

    case "inconclusive_recording":
      return {
        publicLabel:
          "BATTLE INCONCLUSIVE",
        publicDetail:
          "Recording ended without enough deterministic evidence to identify a winner.",
      };
  }
}
