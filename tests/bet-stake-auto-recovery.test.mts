import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  inspectSignedButUnrecordedBetStakes,
  isAutomaticBetStakeRecoveryStatus,
  reconcileSignedButUnrecordedBetStakes,
} from "../lib/betStakeAutoRecovery.ts";
import { BetWagerError } from "../lib/betWagering.ts";

type Intent = {
  id: number;
  userId: number;
  marketId: number;
  side: string;
  amountWolo: number;
  walletAddress: string | null;
  stakeTxHash: string | null;
  wager: { id: number } | null;
};

type Ticket = {
  id: number;
  userId: number;
  walletAddress: string | null;
  stakeTxHash: string | null;
};

const NOW = new Date("2026-09-15T12:00:00.000Z");

function viewer(id = 7) {
  return {
    id,
    uid: `user-${id}`,
    inGameName: `Player ${id}`,
    steamPersonaName: `Steam ${id}`,
    walletAddress: `wolo1wallet${id}`,
  };
}

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: 101,
    userId: 7,
    marketId: 55,
    side: "left",
    amountWolo: 250,
    walletAddress: "wolo1wallet7",
    stakeTxHash: "A".repeat(64),
    wager: null,
    ...overrides,
  };
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 202,
    userId: 7,
    walletAddress: "wolo1wallet7",
    stakeTxHash: "B".repeat(64),
    ...overrides,
  };
}

function fakePrisma(options: {
  intents?: Intent[];
  tickets?: Ticket[];
  ticketSeedUserIds?: number[];
  viewers?: Map<number, ReturnType<typeof viewer>>;
  exactWager?: { id: number } | null;
} = {}) {
  const intentUpdates: unknown[] = [];
  const ticketUpdates: unknown[] = [];
  const viewers = options.viewers ?? new Map([[7, viewer(7)]]);

  const prisma = {
    betStakeIntent: {
      findMany: async () => options.intents ?? [],
      update: async (payload: unknown) => {
        intentUpdates.push(payload);
        return payload;
      },
    },
    betStakeTicket: {
      findMany: async (args: { select?: Record<string, boolean> }) => {
        const keys = Object.keys(args.select ?? {});
        if (keys.length === 1 && keys[0] === "userId") {
          return (options.ticketSeedUserIds ?? []).map((userId) => ({ userId }));
        }
        return options.tickets ?? [];
      },
      updateMany: async (payload: unknown) => {
        ticketUpdates.push(payload);
        return { count: 1 };
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        viewers.get(where.id) ?? null,
    },
    betWager: {
      findUnique: async () => options.exactWager ?? null,
    },
  };

  return { prisma, intentUpdates, ticketUpdates };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    now: () => NOW,
    refreshIntents: async () => undefined,
    refreshTickets: async () => undefined,
    commitIntent: async () => ({ kind: "created" as const }),
    commitTicket: async () => ({ id: 1 }),
    ...overrides,
  };
}

test("automatic recovery only admits chain-proof states", () => {
  for (const status of ["broadcast_submitted", "verified_unrecorded", "orphaned"]) {
    assert.equal(isAutomaticBetStakeRecoveryStatus(status), true, status);
  }
  for (const status of ["awaiting_signature", "recorded", "failed", "suspect", null]) {
    assert.equal(isAutomaticBetStakeRecoveryStatus(status), false, String(status));
  }
});

test("plan mode is read-only and exposes only bounded candidate identity", async () => {
  const calls: string[] = [];
  const prisma = {
    betStakeIntent: {
      findMany: async (args: { where: { status: { in: string[] } }; take: number }) => {
        calls.push("intent.findMany");
        assert.deepEqual(args.where.status.in, [
          "broadcast_submitted",
          "verified_unrecorded",
          "orphaned",
        ]);
        assert.equal(args.take, 3);
        return [{ id: 11, userId: 7, marketId: 55, status: "verified_unrecorded" }];
      },
    },
    betStakeTicket: {
      findMany: async (args: { where: { status: { in: string[] } }; take: number }) => {
        calls.push("ticket.findMany");
        assert.equal(args.take, 3);
        return [{ id: 12, userId: 7, status: "broadcast_submitted" }];
      },
    },
  };

  const plan = await inspectSignedButUnrecordedBetStakes(prisma as never, {
    take: 3,
    now: NOW,
  });

  assert.deepEqual(calls.sort(), ["intent.findMany", "ticket.findMany"]);
  assert.deepEqual(plan.intentCandidates, [
    { id: 11, userId: 7, marketId: 55, status: "verified_unrecorded" },
  ]);
  assert.deepEqual(plan.ticketCandidates, [
    { id: 12, userId: 7, status: "broadcast_submitted" },
  ]);
  assert.equal(plan.take, 3);
  assert.equal(plan.checkedAt, NOW.toISOString());
});

test("legacy intent recovery reuses the exact sealed transaction proof", async () => {
  const candidate = intent();
  const { prisma } = fakePrisma({ intents: [candidate] });
  const commits: unknown[] = [];

  const result = await reconcileSignedButUnrecordedBetStakes(prisma as never, {
    dependencies: dependencies({
      commitIntent: async (_prisma: unknown, payload: unknown) => {
        commits.push(payload);
        return { kind: "created" as const };
      },
    }) as never,
  });

  assert.deepEqual(result.intentCommitted, [candidate.id]);
  assert.equal(result.reviewRequired.length, 0);
  assert.equal(result.transientErrors.length, 0);
  assert.deepEqual(commits, [
    {
      viewer: viewer(7),
      marketId: candidate.marketId,
      side: "left",
      amountWolo: candidate.amountWolo,
      walletAddress: candidate.walletAddress,
      stakeTxHash: candidate.stakeTxHash,
      stakeIntentId: candidate.id,
    },
  ]);
});

test("already-related wager is idempotently marked recorded without recommit", async () => {
  const candidate = intent({ wager: { id: 999 } });
  const { prisma, intentUpdates } = fakePrisma({ intents: [candidate] });
  let commits = 0;

  const result = await reconcileSignedButUnrecordedBetStakes(prisma as never, {
    dependencies: dependencies({
      commitIntent: async () => {
        commits += 1;
        return { kind: "created" as const };
      },
    }) as never,
  });

  assert.equal(commits, 0);
  assert.deepEqual(result.intentAlreadyRecorded, [candidate.id]);
  assert.equal(intentUpdates.length, 1);
  assert.equal((intentUpdates[0] as { data: { status: string } }).data.status, "recorded");
});

test("ambiguous duplicate never manufactures a wager and is escalated", async () => {
  const candidate = intent();
  const { prisma, intentUpdates } = fakePrisma({
    intents: [candidate],
    exactWager: null,
  });

  const result = await reconcileSignedButUnrecordedBetStakes(prisma as never, {
    dependencies: dependencies({
      commitIntent: async () => ({ kind: "duplicate_existing" as const }),
    }) as never,
  });

  assert.equal(result.intentCommitted.length, 0);
  assert.equal(result.reviewRequired.length, 1);
  assert.match(result.reviewRequired[0].detail, /exact wager relation/i);
  assert.equal((intentUpdates[0] as { data: { status: string } }).data.status, "suspect");
});

test("409 financial conflict fails closed to review while transient failure remains retryable", async () => {
  const reviewIntent = intent({ id: 301 });
  const first = fakePrisma({ intents: [reviewIntent] });
  const reviewed = await reconcileSignedButUnrecordedBetStakes(first.prisma as never, {
    dependencies: dependencies({
      commitIntent: async () => {
        throw new BetWagerError(409, "Market financial authority changed.");
      },
    }) as never,
  });
  assert.equal(reviewed.reviewRequired.length, 1);
  assert.equal(reviewed.transientErrors.length, 0);
  assert.equal((first.intentUpdates[0] as { data: { status: string } }).data.status, "suspect");

  const transientIntent = intent({ id: 302 });
  const second = fakePrisma({ intents: [transientIntent] });
  const transient = await reconcileSignedButUnrecordedBetStakes(second.prisma as never, {
    dependencies: dependencies({
      commitIntent: async () => {
        throw new Error("temporary database disconnect");
      },
    }) as never,
  });
  assert.equal(transient.reviewRequired.length, 0);
  assert.equal(transient.transientErrors.length, 1);
  assert.equal(second.intentUpdates.length, 0);
});

test("ticket recovery reuses its exact transaction hash and existing commit fences", async () => {
  const candidate = ticket();
  const { prisma } = fakePrisma({
    tickets: [candidate],
    ticketSeedUserIds: [candidate.userId],
  });
  const refreshedUsers: number[] = [];
  const commits: unknown[] = [];

  const result = await reconcileSignedButUnrecordedBetStakes(prisma as never, {
    dependencies: dependencies({
      refreshTickets: async (_prisma: unknown, userId: number) => {
        refreshedUsers.push(userId);
      },
      commitTicket: async (_prisma: unknown, payload: unknown) => {
        commits.push(payload);
        return { id: candidate.id };
      },
    }) as never,
  });

  assert.deepEqual(refreshedUsers, [candidate.userId]);
  assert.deepEqual(result.ticketCommitted, [candidate.id]);
  assert.deepEqual(commits, [
    {
      ticketId: candidate.id,
      viewer: viewer(7),
      stakeTxHash: candidate.stakeTxHash,
      walletAddress: candidate.walletAddress,
    },
  ]);
});

test("discovery outage is observable but does not erase recoverable chain proof", async () => {
  const candidate = intent();
  const { prisma } = fakePrisma({ intents: [candidate] });

  const result = await reconcileSignedButUnrecordedBetStakes(prisma as never, {
    dependencies: dependencies({
      refreshIntents: async () => {
        throw new Error("settlement discovery unavailable");
      },
    }) as never,
  });

  assert.deepEqual(result.intentCommitted, [candidate.id]);
  assert.equal(result.transientErrors.length, 1);
  assert.equal(result.transientErrors[0].kind, "intent_discovery");
});

test("production runner is authenticated, bounded and systemd-contained", () => {
  const route = readFileSync("app/api/bets/stake-reconciliation/route.ts", "utf8");
  const runner = readFileSync("scripts/run-bet-stake-reconciliation.mjs", "utf8");
  const planService = readFileSync(
    "deploy/aoe2hdbets-bet-stake-reconcile-plan.service",
    "utf8"
  );
  const service = readFileSync("deploy/aoe2hdbets-bet-stake-reconcile.service", "utf8");
  const timer = readFileSync("deploy/aoe2hdbets-bet-stake-reconcile.timer", "utf8");
  const webSecretDropIn = readFileSync(
    "deploy/systemd/aoe2hdbets-web.service.d/bet-stake-reconcile.conf",
    "utf8"
  );
  const applySecretDropIn = readFileSync(
    "deploy/systemd/aoe2hdbets-bet-stake-reconcile.service.d/secret.conf",
    "utf8"
  );
  const planSecretDropIn = readFileSync(
    "deploy/systemd/aoe2hdbets-bet-stake-reconcile-plan.service.d/secret.conf",
    "utf8"
  );
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(route, /timingSafeEqual/);
  assert.match(route, /BET_STAKE_RECONCILE_TOKEN/);
  assert.match(route, /status: 503/);
  assert.match(route, /status: 401/);
  assert.match(route, /export async function GET/);
  assert.match(route, /mode: "plan"/);
  assert.match(route, /mode: "apply"/);
  assert.match(runner, /args\.has\("--apply"\)/);
  assert.match(runner, /method: apply \? "POST" : "GET"/);
  assert.match(runner, /AbortSignal\.timeout\(220_000\)/);
  assert.match(runner, /Math\.min\(rawTake, 50\)/);
  assert.equal(pkg.scripts["bets:stake:reconcile"], "node scripts/run-bet-stake-reconciliation.mjs");

  for (const unit of [planService, service]) {
    assert.match(unit, /^User=tony$/m);
    assert.match(unit, /^NoNewPrivileges=true$/m);
    assert.match(unit, /^ProtectSystem=strict$/m);
    assert.match(unit, /^PrivateDevices=true$/m);
    assert.match(unit, /^CapabilityBoundingSet=$/m);
    assert.doesNotMatch(unit, /^Requires=aoe2hdbets-web\.service$/m);
  }
  assert.match(planService, /ExecStart=\/usr\/bin\/npm run bets:stake:reconcile$/m);
  assert.doesNotMatch(planService, /--apply/);
  assert.match(service, /bets:stake:reconcile -- --apply/);

  for (const dropIn of [webSecretDropIn, applySecretDropIn, planSecretDropIn]) {
    assert.match(
      dropIn,
      /^EnvironmentFile=\/etc\/aoe2hdbets\/aoe2hdbets-bet-stake-reconcile\.env$/m
    );
    assert.doesNotMatch(dropIn, /BET_STAKE_RECONCILE_TOKEN=/);
  }

  assert.match(timer, /^OnUnitInactiveSec=5min$/m);
  assert.match(timer, /^Persistent=true$/m);
});
