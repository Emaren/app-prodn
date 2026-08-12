#!/usr/bin/env -S node --experimental-strip-types

import {
  createHash,
} from "node:crypto";

import {
  readFile,
} from "node:fs/promises";

import {
  gunzipSync,
} from "node:zlib";

import {
  getPrisma,
} from "@/lib/prisma";

import {
  classifyWarEngineTier3Candidate,
  WAR_ENGINE_TIER3_ENGINE,
} from "../lib/warEngineTier3.ts";

import {
  buildWarEngineTier3RunIdentity,
  resolveWarEngineTier3StableWinner,
  sha256WarEngineTier3Input,
  warEngineTier3PersistenceConfidence,
  warEngineTier3PublicCopy,
} from "../lib/warEngineTier3Execution.ts";

const FOUNDING_GAME_IDS = [
  108,
  1964,
  1967,
  2979,
  2981,
  2994,
  5003,
] as const;

const APPLY =
  process.argv.includes("--apply");

const EXPECTED_REASON =
  "standard_parse_exhausted_result_not_encoded";

type JsonObject =
  Record<string, unknown>;

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

function textValue(
  value: unknown
): string | null {
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

function candidateResult(
  candidate: unknown
) {
  const projection =
    objectValue(
      objectValue(candidate)
        .projection
    );

  const keyEvents =
    objectValue(
      projection.key_events
    );

  const keyResult =
    objectValue(
      keyEvents.result_resolution
    );

  const directResult =
    objectValue(
      projection.result_resolution
    );

  const result =
    Object.keys(keyResult)
      .length > 0
      ? keyResult
      : directResult;

  return {
    status:
      textValue(
        result.result_status
      ),

    trusted:
      result.result_trusted ===
      true,

    winningPlayerKeys:
      arrayValue(
        result
          .winning_player_keys
      ),

    winningTeamKey:
      textValue(
        result
          .winning_team_key ??
        result
          .winning_team_id
      ),
  };
}

async function readCandidate(
  path: string
) {
  const raw =
    await readFile(path);

  const decoded =
    raw[0] === 0x1f &&
    raw[1] === 0x8b
      ? gunzipSync(raw)
      : raw;

  return {
    candidate:
      JSON.parse(
        decoded.toString(
          "utf8"
        )
      ) as unknown,

    inputHash:
      sha256WarEngineTier3Input(
        decoded
      ),
  };
}

function evidenceHash(
  value: unknown
) {
  return createHash("sha256")
    .update(
      JSON.stringify(value)
    )
    .digest("hex");
}

async function main() {
  const prisma =
    getPrisma();

  const report:
    Array<Record<string, unknown>> =
    [];

  try {
    for (
      const gameStatsId
      of FOUNDING_GAME_IDS
    ) {
      const game =
        await prisma
          .gameStats
          .findUnique({
            where: {
              id:
                gameStatsId,
            },

            select: {
              id:
                true,

              is_final:
                true,

              replayHash:
                true,

              replayResultAdjudications: {
                where: {
                  decisionStatus:
                    "accepted",
                  affectsStats:
                    true,
                },

                select: {
                  id:
                    true,
                },

                take:
                  1,
              },
            },
          });

      if (
        !game ||
        !game.is_final
      ) {
        throw new Error(
          `WAR_ENGINE_TIER3_GAME_NOT_FINAL:${gameStatsId}`
        );
      }

      if (
        game
          .replayResultAdjudications
          .length > 0
      ) {
        throw new Error(
          `WAR_ENGINE_TIER3_ACCEPTED_STATS_ADJUDICATION_PRESENT:${gameStatsId}`
        );
      }

      const warCase =
        await prisma
          .warEngineCase
          .findUnique({
            where: {
              gameStatsId,
            },

            include: {
              events: {
                orderBy: [
                  {
                    sequence:
                      "desc",
                  },
                  {
                    id:
                      "desc",
                  },
                ],
                take:
                  1,
              },
            },
          });

      if (
        !warCase
      ) {
        throw new Error(
          `WAR_ENGINE_TIER3_CASE_MISSING:${gameStatsId}`
        );
      }

      if (
        warCase.initialTier !==
          3 ||
        warCase
          .initialReasonCode !==
          EXPECTED_REASON ||
        warCase
          .financialHistoryLocked !==
          true
      ) {
        throw new Error(
          `WAR_ENGINE_TIER3_CASE_CONTRACT_DRIFT:${gameStatsId}`
        );
      }

      const latestEvent =
        warCase.events[0] ??
        null;

      const parseRun =
        await prisma
          .replayParseRun
          .findFirst({
            where: {
              gameStatsId,
              status:
                "completed",
              candidateOnly:
                true,
              affectsPublicAggregates:
                false,
            },

            orderBy: [
              {
                completedAt:
                  "desc",
              },
              {
                id:
                  "desc",
              },
            ],

            select: {
              id:
                true,
              runIdentityHash:
                true,
              inputHash:
                true,
              parserName:
                true,
              parserVersion:
                true,
              passName:
                true,
              passVersion:
                true,
              candidateOutputStorageKey:
                true,
              completedAt:
                true,
            },
          });

      if (
        !parseRun
          ?.candidateOutputStorageKey
      ) {
        throw new Error(
          `WAR_ENGINE_TIER3_PRIVATE_CANDIDATE_MISSING:${gameStatsId}`
        );
      }

      const {
        candidate,
        inputHash,
      } =
        await readCandidate(
          parseRun
            .candidateOutputStorageKey
        );

      const sourceResult =
        candidateResult(
          candidate
        );

      if (
        sourceResult.trusted ||
        sourceResult.status !==
          "review_required" ||
        sourceResult
          .winningPlayerKeys
          .length > 0 ||
        sourceResult
          .winningTeamKey
      ) {
        throw new Error(
          `WAR_ENGINE_TIER3_SOURCE_RESULT_CONTRACT_DRIFT:${gameStatsId}`
        );
      }

      const startedAt =
        new Date();

      const verdict =
        classifyWarEngineTier3Candidate(
          candidate
        );

      const winner =
        resolveWarEngineTier3StableWinner(
          candidate,
          verdict
        );

      const publicCopy =
        warEngineTier3PublicCopy(
          verdict
        );

      const confidenceBps =
        warEngineTier3PersistenceConfidence(
          verdict
        );

      const runIdentityHash =
        buildWarEngineTier3RunIdentity({
          caseId:
            warCase.id,

          gameStatsId,

          sourceParseRunId:
            parseRun.id,

          sourceParseRunIdentityHash:
            parseRun
              .runIdentityHash,

          inputHash,

          engineName:
            WAR_ENGINE_TIER3_ENGINE
              .engineName,

          engineVersion:
            WAR_ENGINE_TIER3_ENGINE
              .engineVersion,
        });

      const runIdempotencyKey =
        `war-engine:tier3:${runIdentityHash}`;

      const eventIdempotencyKey =
        `war-engine:event:tier3:${runIdentityHash}`;

      const completedAt =
        new Date();

      const evidence = {
        source:
          "war_engine_tier3_fast_verdict",

        gameStatsId,

        caseId:
          warCase.id,

        sourceParseRunId:
          parseRun.id,

        sourceParseRunIdentityHash:
          parseRun.runIdentityHash,

        sourceReplayHash:
          game.replayHash,

        candidateInputHash:
          inputHash,

        parser: {
          name:
            parseRun.parserName,
          version:
            parseRun.parserVersion,
          passName:
            parseRun.passName,
          passVersion:
            parseRun.passVersion,
        },

        engine: {
          name:
            WAR_ENGINE_TIER3_ENGINE
              .engineName,
          version:
            WAR_ENGINE_TIER3_ENGINE
              .engineVersion,
          tier:
            3,
        },

        verdict,
        winner,
      };

      const summary = {
        gameStatsId,

        caseId:
          warCase.id,

        latestEvent:
          latestEvent
            ? {
                sequence:
                  latestEvent.sequence,
                status:
                  latestEvent.status,
                classification:
                  latestEvent
                    .classification,
              }
            : null,

        sourceParseRunId:
          parseRun.id,

        candidateInputHash:
          inputHash,

        runIdentityHash,

        classification:
          verdict.classification,

        classificationConfidenceBps:
          verdict
            .classificationConfidenceBps,

        winnerConfidenceBps:
          verdict
            .winnerConfidenceBps,

        winningPlayerNames:
          verdict
            .winningPlayerNames,

        winningPlayerKeys:
          winner
            .winningPlayerKeys,

        winningTeamKey:
          winner
            .winningTeamKey,

        evidenceHash:
          evidenceHash(
            evidence
          ),

        apply:
          APPLY,
      };

      if (
        !APPLY
      ) {
        report.push({
          ...summary,
          persistence:
            "dry_run_no_writes",
        });

        continue;
      }

      const persisted =
        await prisma
          .$transaction(
            async (tx) => {
              const current =
                await tx
                  .warEngineCase
                  .findUnique({
                    where: {
                      id:
                        warCase.id,
                    },

                    include: {
                      events: {
                        orderBy: [
                          {
                            sequence:
                              "desc",
                          },
                          {
                            id:
                              "desc",
                          },
                        ],
                        take:
                          1,
                      },
                    },
                  });

              if (
                !current
              ) {
                throw new Error(
                  `WAR_ENGINE_TIER3_CASE_DISAPPEARED:${gameStatsId}`
                );
              }

              const existingRun =
                await tx
                  .warEngineRun
                  .findUnique({
                    where: {
                      runIdentityHash,
                    },
                  });

              const existingEvent =
                await tx
                  .warEngineCaseEvent
                  .findUnique({
                    where: {
                      idempotencyKey:
                        eventIdempotencyKey,
                    },
                  });

              if (
                existingRun ||
                existingEvent
              ) {
                if (
                  !existingRun ||
                  !existingEvent ||
                  existingRun.caseId !==
                    current.id ||
                  existingEvent.caseId !==
                    current.id ||
                  existingEvent.sequence !==
                    1
                ) {
                  throw new Error(
                    `WAR_ENGINE_TIER3_IDEMPOTENCY_DRIFT:${gameStatsId}`
                  );
                }

                return {
                  reused:
                    true,
                  runId:
                    existingRun.id,
                  eventId:
                    existingEvent.id,
                };
              }

              const currentEvent =
                current.events[0] ??
                null;

              if (
                !currentEvent ||
                currentEvent.sequence !==
                  0 ||
                currentEvent.status !==
                  "queued" ||
                currentEvent.tier !==
                  3
              ) {
                throw new Error(
                  `WAR_ENGINE_TIER3_CASE_ALREADY_ADVANCED:${gameStatsId}`
                );
              }

              const run =
                await tx
                  .warEngineRun
                  .create({
                    data: {
                      caseId:
                        current.id,

                      sourceParseRunId:
                        parseRun.id,

                      idempotencyKey:
                        runIdempotencyKey,

                      runIdentityHash,

                      tier:
                        3,

                      engineName:
                        WAR_ENGINE_TIER3_ENGINE
                          .engineName,

                      engineVersion:
                        WAR_ENGINE_TIER3_ENGINE
                          .engineVersion,

                      engineBuild:
                        null,

                      inputHash,

                      status:
                        "completed",

                      resultClassification:
                        verdict
                          .classification,

                      resultTrusted:
                        false,

                      winningTeamKey:
                        winner
                          .winningTeamKey,

                      winningPlayerKeys:
                        winner
                          .winningPlayerKeys,

                      confidenceBps,

                      finalState:
                        null,

                      metrics: {
                        reasonCode:
                          verdict.reasonCode,

                        reason:
                          verdict.reason,

                        classificationConfidenceBps:
                          verdict
                            .classificationConfidenceBps,

                        winnerConfidenceBps:
                          verdict
                            .winnerConfidenceBps,

                        rawPacketCount:
                          verdict
                            .rawPacketCount,

                        uniquePacketCount:
                          verdict
                            .uniquePacketCount,

                        terminalWindowMs:
                          verdict
                            .terminalWindowMs,

                        metricsByPlayer:
                          verdict
                            .metricsByPlayer,
                      },

                      failureSignature:
                        null,

                      failureDetail:
                        null,

                      candidateOnly:
                        true,

                      affectsPublicAggregates:
                        false,

                      affectsBets:
                        false,

                      startedAt,

                      completedAt,
                    },
                  });

              const event =
                await tx
                  .warEngineCaseEvent
                  .create({
                    data: {
                      caseId:
                        current.id,

                      idempotencyKey:
                        eventIdempotencyKey,

                      sequence:
                        1,

                      eventType:
                        "classified",

                      tier:
                        3,

                      status:
                        "completed",

                      classification:
                        verdict
                          .classification,

                      publicLabel:
                        publicCopy
                          .publicLabel,

                      publicDetail:
                        publicCopy
                          .publicDetail,

                      winningTeamKey:
                        winner
                          .winningTeamKey,

                      winningPlayerKeys:
                        winner
                          .winningPlayerKeys,

                      confidenceBps,

                      evidence: {
                        ...evidence,
                        warEngineRunId:
                          run.id,
                        runIdentityHash,
                      },
                    },
                  });

              return {
                reused:
                  false,
                runId:
                  run.id,
                eventId:
                  event.id,
              };
            }
          );

      report.push({
        ...summary,
        persistence:
          persisted.reused
            ? "reused"
            : "created",
        runId:
          persisted.runId,
        eventId:
          persisted.eventId,
      });
    }

    console.log(
      JSON.stringify(
        {
          ok:
            true,

          mode:
            APPLY
              ? "apply"
              : "dry_run",

          foundingGameIds:
            FOUNDING_GAME_IDS,

          authority: {
            candidateOnly:
              true,
            affectsPublicAggregates:
              false,
            affectsBets:
              false,
            resultTrusted:
              false,
          },

          report,
        },
        null,
        2
      )
    );
  } finally {
    await prisma
      .$disconnect();
  }
}

await main();
