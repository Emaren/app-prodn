import { Prisma, type PrismaClient } from "../generated/prisma";
import { getPrisma } from "../prisma";

import { advanceWarGraphFossilizationInTransaction } from "./fossilization";
import { lockWarGraphTransaction } from "./foundation";
import { applyWarGraphGravityInTransaction } from "./gravity";
import {
  parseWarGraphMaintenanceJobPayload,
  warGraphMaintenanceRetryDelayMs,
} from "./maintenanceJobsContract";

const JOB_TYPES = ["apply_gravity", "advance_fossilization"] as const;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 16;
const LEASE_MS = 45_000;

type LeasedJob = {
  id: bigint;
  graphId: number;
  jobType: string;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  version: number;
};

export type WarGraphMaintenanceJobReport = {
  leased: number;
  succeeded: number;
  retried: number;
  dead: number;
  staleLease: number;
};

function boundedLimit(value: number | undefined): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Math.min(Number(value), MAX_LIMIT)
    : DEFAULT_LIMIT;
}

function safeError(error: unknown): { code: string; detail: string } {
  const raw = error instanceof Error ? error.message : "UNKNOWN";
  const detail = raw.replace(/[\r\n\t]+/gu, " ").slice(0, 500);
  const code = /^[A-Z0-9_]{3,80}$/u.test(raw)
    ? raw
    : "WARGRAPH_MAINTENANCE_JOB_FAILED";
  return { code, detail };
}

async function leaseJobs(
  prisma: PrismaClient,
  input: { workerId: string; now: Date; limit: number },
): Promise<LeasedJob[]> {
  const leaseExpiresAt = new Date(input.now.getTime() + LEASE_MS);
  return prisma.$queryRaw<LeasedJob[]>(Prisma.sql`
    WITH candidates AS (
      SELECT job."id"
      FROM "war_graph_jobs" job
      WHERE job."job_type" IN (${Prisma.join(JOB_TYPES)})
        AND job."attempt_count" < job."max_attempts"
        AND (
          (job."status" = 'queued' AND job."available_at" <= ${input.now})
          OR (
            job."status" = 'running'
            AND job."lease_expires_at" IS NOT NULL
            AND job."lease_expires_at" <= ${input.now}
          )
        )
      ORDER BY job."available_at" ASC, job."id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.limit}
    )
    UPDATE "war_graph_jobs" job
    SET
      "status" = 'running',
      "lease_owner" = ${input.workerId},
      "lease_expires_at" = ${leaseExpiresAt},
      "attempt_count" = job."attempt_count" + 1,
      "version" = job."version" + 1,
      "updated_at" = ${input.now}
    FROM candidates
    WHERE job."id" = candidates."id"
    RETURNING
      job."id" AS "id",
      job."graph_id" AS "graphId",
      job."job_type" AS "jobType",
      job."payload" AS "payload",
      job."attempt_count" AS "attemptCount",
      job."max_attempts" AS "maxAttempts",
      job."lease_owner" AS "leaseOwner",
      job."lease_expires_at" AS "leaseExpiresAt",
      job."version" AS "version"
  `);
}

async function applyLeasedJob(
  prisma: PrismaClient,
  job: LeasedJob,
  now: Date,
): Promise<"succeeded" | "stale"> {
  const payload = parseWarGraphMaintenanceJobPayload(job.jobType, job.payload);
  if (!payload) throw new Error("WARGRAPH_MAINTENANCE_PAYLOAD_INVALID");
  return prisma.$transaction(
    async (tx) => {
      await lockWarGraphTransaction(tx, job.graphId);
      const live = await tx.warGraphJob.findUnique({ where: { id: job.id } });
      if (
        !live ||
        live.status !== "running" ||
        live.leaseOwner !== job.leaseOwner ||
        live.version !== job.version ||
        !live.leaseExpiresAt ||
        live.leaseExpiresAt <= now
      ) {
        return "stale" as const;
      }
      if (payload.kind === "gravity") {
        await applyWarGraphGravityInTransaction(tx, {
          graphId: job.graphId,
          nightId: payload.nightId,
          triggerKey: `contest:${payload.triggerContestId}`,
          now,
        });
      } else {
        await advanceWarGraphFossilizationInTransaction(tx, {
          graphId: job.graphId,
          nightId: payload.nightId,
          nextPrimeOpensAt: payload.nextPrimeOpensAt,
          now,
        });
      }
      const transitioned = await tx.warGraphJob.updateMany({
        where: {
          id: job.id,
          status: "running",
          leaseOwner: job.leaseOwner,
          version: job.version,
        },
        data: {
          status: "succeeded",
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastError: null,
          version: { increment: 1 },
        },
      });
      return transitioned.count === 1 ? "succeeded" as const : "stale" as const;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 20_000,
    },
  );
}

async function transitionFailure(
  prisma: PrismaClient,
  job: LeasedJob,
  now: Date,
  error: unknown,
): Promise<"retry" | "dead" | "stale"> {
  const failure = safeError(error);
  const retry =
    failure.code !== "WARGRAPH_MAINTENANCE_PAYLOAD_INVALID" &&
    job.attemptCount < job.maxAttempts;
  const result = await prisma.warGraphJob.updateMany({
    where: {
      id: job.id,
      status: "running",
      leaseOwner: job.leaseOwner,
      version: job.version,
    },
    data: retry
      ? {
          status: "queued",
          availableAt: new Date(
            now.getTime() + warGraphMaintenanceRetryDelayMs(job.attemptCount),
          ),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: failure.code,
          lastError: failure.detail,
          version: { increment: 1 },
        }
      : {
          status: "dead",
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: failure.code,
          lastError: failure.detail,
          version: { increment: 1 },
        },
  });
  return result.count !== 1 ? "stale" : retry ? "retry" : "dead";
}

export async function runWarGraphMaintenanceJobs(input: {
  workerId: string;
  now?: Date;
  limit?: number;
  prisma?: PrismaClient;
}): Promise<WarGraphMaintenanceJobReport> {
  const workerId = input.workerId.trim();
  if (!workerId || workerId.length > 128) {
    throw new Error("WARGRAPH_WORKER_ID_INVALID");
  }
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("WARGRAPH_WORKER_CLOCK_INVALID");
  }
  const prisma = input.prisma ?? getPrisma();
  const jobs = await leaseJobs(prisma, {
    workerId,
    now,
    limit: boundedLimit(input.limit),
  });
  const report: WarGraphMaintenanceJobReport = {
    leased: jobs.length,
    succeeded: 0,
    retried: 0,
    dead: 0,
    staleLease: 0,
  };
  for (const job of jobs) {
    try {
      const state = await applyLeasedJob(prisma, job, now);
      if (state === "succeeded") report.succeeded += 1;
      else report.staleLease += 1;
    } catch (error) {
      const state = await transitionFailure(prisma, job, now, error);
      if (state === "retry") report.retried += 1;
      else if (state === "dead") report.dead += 1;
      else report.staleLease += 1;
    }
  }
  return report;
}
