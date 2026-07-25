import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  HD_REPLAY_PARSER_CONTRACT,
} from "@/lib/replayEngineRoom";
import {
  ReplayParserOnDemandError,
  runLatestReplayParserForGame,
} from "@/lib/replayParserOnDemand";
import {
  planReplayCandidateBatch,
} from "@/lib/adminReplayOperations";
import {
  parseReplayCandidateExecutionRequest,
  replayCandidateRunSucceeded,
  REPLAY_OPERATIONS_MAX_EXECUTION_GAMES,
  ReplayOperationsContractError,
  type ReplayCandidateExecutionReport,
} from "@/lib/replayOperationsContracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 50;
const ADMIN_WORKER_TIMEOUT_MS = 20_000;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function errorDetail(error: unknown) {
  if (error instanceof ReplayParserOnDemandError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;

    const input = parseReplayCandidateExecutionRequest(
      await request.json().catch(() => ({}))
    );
    const currentPlan =
      await planReplayCandidateBatch(
        gate.prisma,
        {
          cohort:
            input.cohort,
          limit:
            input.limit,
        }
      );
    const currentGameStatsIds = [
      ...new Set(
        currentPlan.artifacts
          .map(
            (artifact) =>
              artifact.linkedGameStatsId
          )
          .filter(
            (
              value
            ): value is number =>
              typeof value ===
                "number"
          )
      ),
    ].slice(
      0,
      REPLAY_OPERATIONS_MAX_EXECUTION_GAMES
    );

    if (
      currentPlan.planFingerprint !==
        input.expectedPlanFingerprint ||
      currentGameStatsIds.length !==
        input.gameStatsIds.length ||
      currentGameStatsIds.some(
        (id, index) =>
          id !==
          input.gameStatsIds[index]
      )
    ) {
      throw new ReplayOperationsContractError(
        "The candidate plan changed after review. Build and confirm a fresh plan before running the worker.",
        409
      );
    }
    const results: ReplayCandidateExecutionReport["results"] = [];

    // Deliberately serial and bounded: each launch first verifies the canonical
    // archive object, builds a frozen one-replay manifest, and invokes the
    // private candidate worker. No projection or financial reconciler is run.
    for (const gameStatsId of input.gameStatsIds) {
      try {
        const result = await runLatestReplayParserForGame(
          gate.prisma,
          gameStatsId,
          gate.user.uid,
          {
            workerTimeoutMs:
              ADMIN_WORKER_TIMEOUT_MS,
          }
        );
        const parseSucceeded = replayCandidateRunSucceeded({
          workerExitCode: result.workerExitCode,
          runStatus: result.run.status,
        });
        results.push({
          gameStatsId,
          ok: parseSucceeded,
          outcome: result.outcome,
          runId: result.run.id,
          runStatus: result.run.status,
          detail: parseSucceeded
            ? null
            : result.run.failureSignature ||
              `Candidate worker exit ${result.workerExitCode}; durable run status ${result.run.status}.`,
        });
      } catch (error) {
        results.push({
          gameStatsId,
          ok: false,
          outcome: null,
          runId: null,
          runStatus: null,
          detail: errorDetail(error),
        });
      }
    }

    const succeededCount = results.filter((result) => result.ok).length;
    const report: ReplayCandidateExecutionReport = {
      generatedAt: new Date().toISOString(),
      parserContract: HD_REPLAY_PARSER_CONTRACT,
      requestedCount: input.gameStatsIds.length,
      processedCount: results.length,
      succeededCount,
      failedCount: results.length - succeededCount,
      results,
      authorityBoundary: {
        candidateOnly: true,
        affectsPublicAggregates: false,
        affectsResults: false,
        affectsBets: false,
        affectsChain: false,
      },
    };

    return NextResponse.json(report, {
      status: report.failedCount > 0 ? 207 : 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof ReplayOperationsContractError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error("[replay-operations] candidate execution failed", error);
    return NextResponse.json(
      {
        detail:
          "The bounded candidate batch could not be launched. No public statistics, results, bets, or chain state were changed.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
