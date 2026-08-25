import {
  hostname,
} from "node:os";
import { randomUUID } from "node:crypto";

import { getPrisma } from "../prisma";

import {
  runWarGraphCorrelationWorker,
} from "./correlationWorker.ts";
import {
  runWarGraphDeadlineWorker,
} from "./deadlineWorker.ts";
import {
  ensureWarGraphFoundation,
} from "./foundation.ts";
import {
  runWarGraphMaintenanceJobs,
} from "./maintenanceJobs.ts";
import {
  createPrismaWarGraphCorrelationWorkerAdapter,
} from "./prismaCorrelationWorker.ts";
import {
  createPrismaWarGraphDeadlineWorkerAdapter,
} from "./prismaDeadlineWorker.ts";
import {
  createPrismaWarGraphSettlementWorkerAdapter,
} from "./prismaSettlementWorker.ts";
import {
  runWarGraphSettlementWorker,
} from "./settlementWorker.ts";

const DEFAULT_INTERVAL_MS = 2_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 60_000;
const FOUNDATION_INTERVAL_MS = 30_000;

type RuntimeState = {
  started: boolean;
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
  workerId: string;
  lastFoundationAt: number;
};

const GLOBAL_KEY =
  "__aoe2warWarGraphRuntimeV1";

function runtimeState(): RuntimeState {
  const globalObject = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: RuntimeState;
  };

  if (!globalObject[GLOBAL_KEY]) {
    globalObject[GLOBAL_KEY] = {
      started: false,
      running: false,
      timer: null,
      workerId:
        `wg:${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`,
      lastFoundationAt: 0,
    };
  }

  return globalObject[GLOBAL_KEY];
}

function intervalMs(): number {
  const parsed = Number(
    process.env.WARGRAPH_RUNTIME_INTERVAL_MS,
  );

  if (
    Number.isSafeInteger(parsed) &&
    parsed >= MIN_INTERVAL_MS &&
    parsed <= MAX_INTERVAL_MS
  ) {
    return parsed;
  }

  return DEFAULT_INTERVAL_MS;
}

function runtimeError(
  stage: string,
  error: unknown,
): void {
  const detail =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    `[WarGraph runtime] ${stage}: ${detail}`,
  );
}

async function runTick(): Promise<void> {
  const state = runtimeState();

  if (state.running) return;
  state.running = true;

  const prisma = getPrisma();
  const now = new Date();

  try {
    if (
      now.getTime() -
        state.lastFoundationAt >=
      FOUNDATION_INTERVAL_MS
    ) {
      try {
        await ensureWarGraphFoundation({
          prisma,
          now,
          force: true,
        });
        state.lastFoundationAt =
          now.getTime();
      } catch (error) {
        runtimeError("foundation", error);
        return;
      }
    }

    let correlationHealthy = true;

    try {
      const report =
        await runWarGraphCorrelationWorker({
          adapter:
            createPrismaWarGraphCorrelationWorkerAdapter(
              prisma,
            ),
          workerId:
            `${state.workerId}:correlation`,
          now,
        });

      if (report.unexpectedFailure > 0) {
        correlationHealthy = false;
        runtimeError(
          "correlation",
          new Error(
            `${report.unexpectedFailure} unexpected correlation failure(s)`,
          ),
        );
      }
    } catch (error) {
      correlationHealthy = false;
      runtimeError("correlation", error);
    }

    /*
     * Fail closed: deadline punishment never outruns an unhealthy
     * evidence-correlation pass.
     */
    if (correlationHealthy) {
      try {
        await runWarGraphDeadlineWorker({
          adapter:
            createPrismaWarGraphDeadlineWorkerAdapter(
              prisma,
            ),
          workerId:
            `${state.workerId}:deadline`,
          now,
        });
      } catch (error) {
        runtimeError("deadline", error);
      }
    }

    try {
      await runWarGraphSettlementWorker({
        adapter:
          createPrismaWarGraphSettlementWorkerAdapter(
            prisma,
          ),
        workerId:
          `${state.workerId}:settlement`,
        now,
      });
    } catch (error) {
      runtimeError("settlement", error);
    }

    try {
      await runWarGraphMaintenanceJobs({
        prisma,
        workerId:
          `${state.workerId}:maintenance`,
        now,
      });
    } catch (error) {
      runtimeError("maintenance", error);
    }
  } finally {
    state.running = false;
  }
}

export function startWarGraphRuntime(): void {
  if (
    process.env.WARGRAPH_RUNTIME_DISABLED ===
      "true"
  ) {
    return;
  }

  const state = runtimeState();
  if (state.started) return;

  state.started = true;

  void runTick();

  state.timer = setInterval(
    () => {
      void runTick();
    },
    intervalMs(),
  );

  state.timer.unref?.();
}

export const warGraphRuntimeInternals = {
  runTick,
  intervalMs,
  FOUNDATION_INTERVAL_MS,
};
