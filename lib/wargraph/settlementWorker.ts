export const WARGRAPH_SETTLEMENT_WORKER_LIMIT = 16 as const;
export const WARGRAPH_SETTLEMENT_LEASE_MS = 45_000 as const;

export type LeasedWarGraphSettlementJob = {
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

export type WarGraphSettlementPersistedResult =
  | {
      kind: "settled";
      contestId: number;
      movementCount: number;
      rewardCount: number;
    }
  | {
      kind: "system_void";
      contestId: number;
      code: string;
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
      availableAt?: Date;
    }
  | {
      kind: "dead";
      code: string;
      detail: string;
    };

export type WarGraphSettlementJobTransition = {
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

export type WarGraphSettlementWorkerAdapter = {
  lease: (input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    limit: number;
  }) => Promise<readonly LeasedWarGraphSettlementJob[]>;
  settle: (
    job: LeasedWarGraphSettlementJob,
    now: Date,
  ) => Promise<WarGraphSettlementPersistedResult>;
  transition: (
    transition: WarGraphSettlementJobTransition,
  ) => Promise<boolean>;
};

export type WarGraphSettlementWorkerReport = {
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
    return WARGRAPH_SETTLEMENT_WORKER_LIMIT;
  }
  return Math.min(Number(value), WARGRAPH_SETTLEMENT_WORKER_LIMIT);
}

function safeDetail(error: unknown): string {
  const detail = error instanceof Error
    ? error.message
    : "Unexpected settlement worker failure";
  return detail.replace(/[\r\n\t]+/gu, " ").slice(0, 500);
}

function retryDelayMs(attemptCount: number): number {
  const exponent = Math.min(Math.max(attemptCount - 1, 0), 6);
  return Math.min(5_000 * 2 ** exponent, 5 * 60_000);
}

function commencement(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "\uffff";
  }
  const value = (payload as Record<string, unknown>).commencedAt;
  return typeof value === "string" ? value : "\uffff";
}

function orderedJobs(
  jobs: readonly LeasedWarGraphSettlementJob[],
): LeasedWarGraphSettlementJob[] {
  return [...jobs].sort((left, right) => {
    const authoritative = commencement(left.payload).localeCompare(
      commencement(right.payload),
    );
    if (authoritative !== 0) return authoritative;
    const created = left.createdAt.getTime() - right.createdAt.getTime();
    if (created !== 0) return created;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function transitionBase(job: LeasedWarGraphSettlementJob, now: Date) {
  return {
    jobId: job.id,
    leaseOwner: job.leaseOwner,
    leasedVersion: job.version,
    now,
  } as const;
}

/**
 * Runs a bounded leased settlement batch. The persistence adapter owns both
 * the Serializable domain transaction and lease/version CAS transitions.
 */
export async function runWarGraphSettlementWorker(input: {
  adapter: WarGraphSettlementWorkerAdapter;
  workerId: string;
  now?: Date;
  limit?: number;
}): Promise<WarGraphSettlementWorkerReport> {
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error("WARGRAPH_WORKER_CLOCK_INVALID");
  const workerId = input.workerId?.trim();
  if (!workerId || workerId.length > 128) {
    throw new Error("WARGRAPH_WORKER_ID_INVALID");
  }
  const limit = boundedLimit(input.limit);
  const leaseExpiresAt = new Date(
    now.getTime() + WARGRAPH_SETTLEMENT_LEASE_MS,
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
    let result: WarGraphSettlementPersistedResult;
    try {
      result = await input.adapter.settle(job, now);
    } catch (error) {
      report.unexpectedFailure += 1;
      result = {
        kind: "retry",
        code: "WARGRAPH_SETTLEMENT_UNEXPECTED_FAILURE",
        detail: safeDetail(error),
      };
    }

    let transition: WarGraphSettlementJobTransition;
    if (
      result.kind === "settled" ||
      result.kind === "system_void" ||
      result.kind === "terminal"
    ) {
      transition = {
        ...transitionBase(job, now),
        kind: "succeeded",
      };
    } else if (
      result.kind === "retry" &&
      job.attemptCount < job.maxAttempts
    ) {
      const requestedAt = result.availableAt;
      const backoffAt = new Date(
        now.getTime() + retryDelayMs(job.attemptCount),
      );
      transition = {
        ...transitionBase(job, now),
        kind: "retry",
        code: result.code,
        detail: result.detail,
        availableAt:
          requestedAt && validDate(requestedAt) && requestedAt > backoffAt
            ? requestedAt
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
