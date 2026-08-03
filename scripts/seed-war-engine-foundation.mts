import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";

import { getPrisma } from "@/lib/prisma";

const FOUNDING_GAME_IDS = [
  108,
  1964,
  1967,
  2979,
  2981,
  2994,
  5003,
] as const;

const INITIAL_TIER = 3;
const INITIAL_REASON_CODE =
  "standard_parse_exhausted_result_not_encoded";
const PUBLIC_LABEL = "WAR ENGINE REQUIRED";
const PUBLIC_DETAIL =
  "Result not encoded · Full battle reconstruction queued.";

function sha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function readCandidate(path: string) {
  const raw = await readFile(path);
  const decoded = raw[0] === 0x1f && raw[1] === 0x8b
    ? gunzipSync(raw)
    : raw;
  const candidate = JSON.parse(decoded.toString("utf8")) as Record<string, unknown>;
  const projection = objectValue(candidate.projection);
  const keyEvents = objectValue(projection.key_events);
  const result = objectValue(keyEvents.result_resolution);

  return {
    resultStatus: textValue(result.result_status),
    resultTrusted: result.result_trusted === true,
    winningPlayerKeys: arrayValue(result.winning_player_keys),
    winningTeamKey: textValue(result.winning_team_key),
    disconnectDetected: projection.disconnect_detected === true,
    completed: projection.completed === true,
    duration: numberValue(projection.duration),
    actionCount: numberValue(objectValue(candidate.actions).count),
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

async function main() {
  const prisma = getPrisma();
  const created: number[] = [];
  const reused: number[] = [];
  const evidenceRows: Array<Record<string, unknown>> = [];

  try {
    for (const gameStatsId of FOUNDING_GAME_IDS) {
      const game = await prisma.gameStats.findUnique({
        where: { id: gameStatsId },
        select: {
          id: true,
          is_final: true,
          replayHash: true,
          winner: true,
          parse_reason: true,
          disconnect_detected: true,
          replayResultAdjudications: {
            where: {
              decisionStatus: "accepted",
              affectsStats: true,
            },
            select: { id: true },
            take: 1,
          },
        },
      });

      if (!game || !game.is_final) {
        throw new Error(
          `Founding War Engine game ${gameStatsId} is missing or not final.`
        );
      }

      if (game.replayResultAdjudications.length > 0) {
        throw new Error(
          `Game ${gameStatsId} already has accepted statistical adjudication.`
        );
      }

      const parseRun = await prisma.replayParseRun.findFirst({
        where: {
          gameStatsId,
          status: "completed",
          candidateOnly: true,
          affectsPublicAggregates: false,
        },
        orderBy: [
          { completedAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          inputHash: true,
          parserName: true,
          parserVersion: true,
          passName: true,
          passVersion: true,
          candidateOutputStorageKey: true,
          actionCount: true,
          metrics: true,
          completedAt: true,
        },
      });

      if (!parseRun?.candidateOutputStorageKey) {
        throw new Error(
          `Game ${gameStatsId} has no completed private candidate run.`
        );
      }

      const candidate = await readCandidate(
        parseRun.candidateOutputStorageKey
      );

      if (
        candidate.resultTrusted ||
        candidate.resultStatus !== "review_required" ||
        candidate.winningPlayerKeys.length > 0 ||
        candidate.winningTeamKey
      ) {
        throw new Error(
          `Game ${gameStatsId} no longer satisfies the War Engine founding contract.`
        );
      }

      const linkedMarketCount = await prisma.betMarket.count({
        where: {
          OR: [
            { linkedGameStatsId: gameStatsId },
            { lateFinalGameStatsId: gameStatsId },
          ],
        },
      });

      const sourceReplayHashes = Array.from(
        new Set([
          game.replayHash.toLowerCase(),
          parseRun.inputHash.toLowerCase(),
        ])
      ).sort();
      const caseIdempotencyKey =
        `war-engine:case:game:${gameStatsId}:v1`;
      const eventIdempotencyKey =
        `war-engine:event:game:${gameStatsId}:sequence:0:v1`;
      const financialLockReason = linkedMarketCount > 0
        ? "Historical betting state is immutable. War Engine findings may affect future statistics only and cannot reopen, reverse or reinterpret settled or voided markets."
        : "War Engine authority is statistics-only. It cannot create retroactive betting, settlement or chain authority.";
      const evidence = {
        source: "pass9m_r3_private_parse",
        sourceParseRunId: parseRun.id,
        sourceReplayHashes,
        parser: {
          name: parseRun.parserName,
          version: parseRun.parserVersion,
          passName: parseRun.passName,
          passVersion: parseRun.passVersion,
        },
        candidate,
        linkedMarketCount,
        rawGame: {
          winner: game.winner,
          parseReason: game.parse_reason,
          disconnectDetected: game.disconnect_detected,
        },
      };

      const existing = await prisma.warEngineCase.findUnique({
        where: { gameStatsId },
        include: {
          events: {
            where: { sequence: 0 },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
      });

      if (existing) {
        const event = existing.events[0];

        if (
          existing.idempotencyKey !== caseIdempotencyKey ||
          existing.initialTier !== INITIAL_TIER ||
          existing.initialReasonCode !== INITIAL_REASON_CODE ||
          existing.financialHistoryLocked !== true ||
          !event ||
          event.idempotencyKey !== eventIdempotencyKey ||
          event.publicLabel !== PUBLIC_LABEL ||
          event.publicDetail !== PUBLIC_DETAIL
        ) {
          throw new Error(
            `Existing War Engine case for game ${gameStatsId} differs from the founding contract.`
          );
        }

        reused.push(gameStatsId);
      } else {
        await prisma.warEngineCase.create({
          data: {
            gameStatsId,
            idempotencyKey: caseIdempotencyKey,
            sourceReplayHashes,
            initialTier: INITIAL_TIER,
            initialReasonCode: INITIAL_REASON_CODE,
            financialHistoryLocked: true,
            financialLockReason,
            events: {
              create: {
                idempotencyKey: eventIdempotencyKey,
                sequence: 0,
                eventType: "queued",
                tier: INITIAL_TIER,
                status: "queued",
                classification: null,
                publicLabel: PUBLIC_LABEL,
                publicDetail: PUBLIC_DETAIL,
                winningTeamKey: null,
                winningPlayerKeys: [],
                confidenceBps: null,
                evidence,
              },
            },
          },
        });

        created.push(gameStatsId);
      }

      evidenceRows.push({
        gameStatsId,
        sourceReplayHashes,
        sourceParseRunId: parseRun.id,
        candidate,
        linkedMarketCount,
        evidenceSha256: sha256(evidence),
      });
    }

    const caseCount = await prisma.warEngineCase.count({
      where: {
        gameStatsId: {
          in: [...FOUNDING_GAME_IDS],
        },
      },
    });

    if (caseCount !== FOUNDING_GAME_IDS.length) {
      throw new Error(
        `War Engine founding case count is ${caseCount}, expected ${FOUNDING_GAME_IDS.length}.`
      );
    }

    console.log(JSON.stringify({
      ok: true,
      foundingGameIds: FOUNDING_GAME_IDS,
      created,
      reused,
      caseCount,
      publicLabel: PUBLIC_LABEL,
      publicDetail: PUBLIC_DETAIL,
      initialTier: INITIAL_TIER,
      financialHistoryLocked: true,
      affectsPublicAggregates: false,
      affectsBets: false,
      evidenceRows,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

await main();
