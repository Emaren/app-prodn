export const WARGRAPH_CORRELATION_WORKER_LIMIT = 25 as const;
export const WARGRAPH_CORRELATION_LEASE_MS = 30_000 as const;

export type LeasedWarGraphCorrelationJob = {
  id: bigint;
  graphId: number;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  version: number;
  createdAt: Date;
};

export type WarGraphCorrelationPersistedResult =
  | {
      kind: "live";
      contestId: number;
      pairingId: number;
    }
  | {
      kind: "qualified";
      contestId: number;
      settlementJobCreated: boolean;
    }
  | {
      kind: "terminal";
      contestId: number;
      status: "settled" | "voided" | "rejected";
    }
  | {
      kind: "retry";
      code: string;
      detail: string;
    }
  | {
      kind: "dead";
      code: string;
      detail: string;
    };

export type WarGraphCorrelationJobTransition = {
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

export type WarGraphCorrelationWorkerAdapter = {
  lease: (input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    limit: number;
  }) => Promise<readonly LeasedWarGraphCorrelationJob[]>;
  correlate: (
    job: LeasedWarGraphCorrelationJob,
    now: Date,
  ) => Promise<WarGraphCorrelationPersistedResult>;
  transition: (
    transition: WarGraphCorrelationJobTransition,
  ) => Promise<boolean>;
};

export type WarGraphCorrelationWorkerReport = {
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

function validNow(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function boundedLimit(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    return WARGRAPH_CORRELATION_WORKER_LIMIT;
  }
  return Math.min(Number(value), WARGRAPH_CORRELATION_WORKER_LIMIT);
}

function safeDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unexpected worker failure";
  return raw.replace(/[\r\n\t]+/gu, " ").slice(0, 500);
}

function retryDelayMs(attemptCount: number): number {
  const exponent = Math.min(Math.max(attemptCount - 1, 0), 6);
  return Math.min(5_000 * 2 ** exponent, 5 * 60_000);
}

function authoritativeCommencement(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "\uffff";
  }
  const value = (payload as Record<string, unknown>).commencedAt;
  return typeof value === "string" ? value : "\uffff";
}

function orderedJobs(
  jobs: readonly LeasedWarGraphCorrelationJob[],
): LeasedWarGraphCorrelationJob[] {
  return [...jobs].sort((left, right) => {
    const commencement = authoritativeCommencement(left.payload).localeCompare(
      authoritativeCommencement(right.payload),
    );
    if (commencement !== 0) return commencement;
    const created = left.createdAt.getTime() - right.createdAt.getTime();
    if (created !== 0) return created;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function baseTransition(
  job: LeasedWarGraphCorrelationJob,
  now: Date,
) {
  return {
    jobId: job.id,
    leaseOwner: job.leaseOwner,
    leasedVersion: job.version,
    now,
  } as const;
}

/**
 * Runs one bounded invocation. Every terminal transition is a lease-owner and
 * version CAS in the adapter, so a worker that lost an expired lease cannot
 * acknowledge another worker's effects.
 */
export async function runWarGraphCorrelationWorker(input: {
  adapter: WarGraphCorrelationWorkerAdapter;
  workerId: string;
  now?: Date;
  limit?: number;
}): Promise<WarGraphCorrelationWorkerReport> {
  const now = input.now ?? new Date();
  if (!validNow(now)) throw new Error("WARGRAPH_WORKER_CLOCK_INVALID");
  const workerId = input.workerId.trim();
  if (!workerId || workerId.length > 128) {
    throw new Error("WARGRAPH_WORKER_ID_INVALID");
  }
  const limit = boundedLimit(input.limit);
  const leaseExpiresAt = new Date(
    now.getTime() + WARGRAPH_CORRELATION_LEASE_MS,
  );
  const leased = orderedJobs(
    await input.adapter.lease({
      workerId,
      now,
      leaseExpiresAt,
      limit,
    }),
  ).slice(0, limit);
  const report: {
    leased: number;
    succeeded: number;
    retried: number;
    dead: number;
    staleLease: number;
    unexpectedFailure: number;
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
    let result: WarGraphCorrelationPersistedResult;
    try {
      result = await input.adapter.correlate(job, now);
    } catch (error) {
      report.unexpectedFailure += 1;
      result = {
        kind: "retry",
        code: "WARGRAPH_CORRELATION_UNEXPECTED_FAILURE",
        detail: safeDetail(error),
      };
    }

    let transition: WarGraphCorrelationJobTransition;
    if (
      result.kind === "live" ||
      result.kind === "qualified" ||
      result.kind === "terminal"
    ) {
      transition = {
        ...baseTransition(job, now),
        kind: "succeeded",
      };
    } else if (
      result.kind === "retry" &&
      job.attemptCount < job.maxAttempts
    ) {
      transition = {
        ...baseTransition(job, now),
        kind: "retry",
        code: result.code,
        detail: result.detail,
        availableAt: new Date(
          now.getTime() + retryDelayMs(job.attemptCount),
        ),
      };
    } else {
      transition = {
        ...baseTransition(job, now),
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
      code:
        transition.kind === "succeeded" ? null : transition.code,
    });
  }
  return report;
}
