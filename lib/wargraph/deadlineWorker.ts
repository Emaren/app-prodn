import type {
  WarGraphDeadlineJobType,
} from "./deadline.ts";

export const WARGRAPH_DEADLINE_WORKER_LIMIT = 24 as const;
export const WARGRAPH_DEADLINE_LEASE_MS = 30_000 as const;

export type LeasedWarGraphDeadlineJob = {
  id: bigint;
  graphId: number;
  jobType: WarGraphDeadlineJobType;
  payload: unknown;
  availableAt: Date;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  version: number;
  createdAt: Date;
};

export type WarGraphDeadlinePersistedResult =
  | {
      kind: "resolved";
      aggregateId: string;
      contestId: number | null;
      resolutionCode: string;
    }
  | {
      kind: "exact_game";
      aggregateId: string;
      contestId: number;
    }
  | {
      kind: "terminal";
      aggregateId: string;
    }
  | {
      kind: "retry";
      code: string;
      detail: string;
      availableAt?: Date;
    }
  | {
      kind: "dead";
      code: string;
      detail: string;
    };

export type WarGraphDeadlineJobTransition = {
  jobId: bigint;
  leaseOwner: string;
  leasedVersion: number;
  now: Date;
} & (
  | { kind: "succeeded" }
  | {
      kind: "retry";
      code: string;
      detail: string;
      availableAt: Date;
    }
  | {
      kind: "dead";
      code: string;
      detail: string;
    }
);

export type WarGraphDeadlineWorkerAdapter = {
  lease: (input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    limit: number;
  }) => Promise<readonly LeasedWarGraphDeadlineJob[]>;
  resolve: (
    job: LeasedWarGraphDeadlineJob,
    now: Date,
  ) => Promise<WarGraphDeadlinePersistedResult>;
  transition: (
    transition: WarGraphDeadlineJobTransition,
  ) => Promise<boolean>;
};

export type WarGraphDeadlineWorkerReport = {
  leased: number;
  succeeded: number;
  retried: number;
  dead: number;
  staleLease: number;
  unexpectedFailure: number;
  outcomes: ReadonlyArray<{
    jobId: string;
    state: "succeeded" | "retry" | "dead" | "stale_lease";
    code: string | null;
  }>;
};

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function boundedLimit(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    return WARGRAPH_DEADLINE_WORKER_LIMIT;
  }
  return Math.min(Number(value), WARGRAPH_DEADLINE_WORKER_LIMIT);
}

function safeDetail(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : "Unexpected deadline worker failure";
  return raw.replace(/[\r\n\t]+/gu, " ").slice(0, 500);
}

function retryDelayMs(attemptCount: number): number {
  const exponent = Math.min(Math.max(attemptCount - 1, 0), 6);
  return Math.min(5_000 * 2 ** exponent, 5 * 60_000);
}

function orderedJobs(
  jobs: readonly LeasedWarGraphDeadlineJob[],
): LeasedWarGraphDeadlineJob[] {
  return [...jobs].sort((left, right) => {
    const due = left.availableAt.getTime() - right.availableAt.getTime();
    if (due !== 0) return due;
    const created = left.createdAt.getTime() - right.createdAt.getTime();
    if (created !== 0) return created;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function transitionBase(job: LeasedWarGraphDeadlineJob, now: Date) {
  return {
    jobId: job.id,
    leaseOwner: job.leaseOwner,
    leasedVersion: job.version,
    now,
  } as const;
}

/** Runs one bounded, due-time-ordered deadline batch with lease/version CAS. */
export async function runWarGraphDeadlineWorker(input: {
  adapter: WarGraphDeadlineWorkerAdapter;
  workerId: string;
  now?: Date;
  limit?: number;
}): Promise<WarGraphDeadlineWorkerReport> {
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error("WARGRAPH_WORKER_CLOCK_INVALID");
  const workerId = input.workerId?.trim();
  if (!workerId || workerId.length > 128) {
    throw new Error("WARGRAPH_WORKER_ID_INVALID");
  }
  const limit = boundedLimit(input.limit);
  const leaseExpiresAt = new Date(now.getTime() + WARGRAPH_DEADLINE_LEASE_MS);
  const leased = orderedJobs(await input.adapter.lease({
    workerId,
    now,
    leaseExpiresAt,
    limit,
  })).slice(0, limit);

  const report: WarGraphDeadlineWorkerReport & {
    outcomes: Array<{
      jobId: string;
      state: "succeeded" | "retry" | "dead" | "stale_lease";
      code: string | null;
    }>;
  } = {
    leased: leased.length,
    succeeded: 0,
    retried: 0,
    dead: 0,
    staleLease: 0,
    unexpectedFailure: 0,
    outcomes: [],
  };

  for (const job of leased) {
    let result: WarGraphDeadlinePersistedResult;
    try {
      result = await input.adapter.resolve(job, now);
    } catch (error) {
      report.unexpectedFailure += 1;
      result = {
        kind: "retry",
        code: "WARGRAPH_DEADLINE_UNEXPECTED_FAILURE",
        detail: safeDetail(error),
      };
    }

    let transition: WarGraphDeadlineJobTransition;
    if (
      result.kind === "resolved" ||
      result.kind === "exact_game" ||
      result.kind === "terminal"
    ) {
      transition = { ...transitionBase(job, now), kind: "succeeded" };
    } else if (result.kind === "retry" && job.attemptCount < job.maxAttempts) {
      const backoffAt = new Date(
        now.getTime() + retryDelayMs(job.attemptCount),
      );
      transition = {
        ...transitionBase(job, now),
        kind: "retry",
        code: result.code,
        detail: result.detail,
        availableAt:
          result.availableAt &&
          validDate(result.availableAt) &&
          result.availableAt > backoffAt
            ? result.availableAt
            : backoffAt,
      };
    } else {
      transition = {
        ...transitionBase(job, now),
        kind: "dead",
        code:
          result.kind === "retry"
            ? "WARGRAPH_MAX_ATTEMPTS_EXHAUSTED"
            : result.code,
        detail: result.detail,
      };
    }

    const changed = await input.adapter.transition(transition);
    if (!changed) {
      report.staleLease += 1;
      report.outcomes.push({
        jobId: job.id.toString(),
        state: "stale_lease",
        code: "WARGRAPH_LEASE_CAS_LOST",
      });
      continue;
    }
    if (transition.kind === "succeeded") report.succeeded += 1;
    if (transition.kind === "retry") report.retried += 1;
    if (transition.kind === "dead") report.dead += 1;
    report.outcomes.push({
      jobId: job.id.toString(),
      state: transition.kind,
      code: transition.kind === "succeeded" ? null : transition.code,
    });
  }

  return report;
}
