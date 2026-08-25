import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  correlateWarGraphAttestations,
  parseWarGraphCorrelationJobPayload,
  type WarGraphAnyCorrelationJobPayload,
  type WarGraphCorrelationAttestation,
  type WarGraphCorrelationContext,
} from "../lib/wargraph/correlation.ts";
import {
  runWarGraphCorrelationWorker,
  type LeasedWarGraphCorrelationJob,
  type WarGraphCorrelationJobTransition,
  type WarGraphCorrelationWorkerAdapter,
} from "../lib/wargraph/correlationWorker.ts";

const HASH = Object.freeze({
  source: "a".repeat(64),
  other: "b".repeat(64),
  receiptOne: "c".repeat(64),
  receiptTwo: "d".repeat(64),
  replay: "e".repeat(64),
  live: "f".repeat(64),
  roster: "1".repeat(64),
  result: "2".repeat(64),
  watcherOne: "3".repeat(64),
  watcherTwo: "4".repeat(64),
  sessionOne: "5".repeat(64),
  sessionTwo: "6".repeat(64),
});
const PLAYER_ONE = "steam:76561198000000001";
const PLAYER_TWO = "steam:76561198000000002";
const PLAYER_ONE_HASH = createHash("sha256").update(PLAYER_ONE).digest("hex");
const PLAYER_TWO_HASH = createHash("sha256").update(PLAYER_TWO).digest("hex");
const COMMENCED_AT = "2026-08-24T01:00:00.000Z";

function payload(phase: "start" | "final"): WarGraphAnyCorrelationJobPayload {
  const common = {
    sourceAttestationId: HASH.source,
    receiptHash: HASH.receiptOne,
    gameStatsId: 42,
    replayHash: HASH.replay,
    liveGameFingerprint: HASH.live,
    platformMatchId: "platform-42",
    rosterHash: HASH.roster,
    rosterPlayerKeyHashes: [PLAYER_ONE_HASH, PLAYER_TWO_HASH].sort() as [
      string,
      string,
    ],
    commencedAt: COMMENCED_AT,
  } as const;
  return phase === "start"
    ? {
        ...common,
        schema: "aoe2war-wargraph-start-correlation-job/v1",
        phase: "start",
      }
    : {
        ...common,
        schema: "aoe2war-wargraph-correlation-job/v1",
        phase: "final",
        winnerPlayerKeyHash: PLAYER_ONE_HASH,
        resultHash: HASH.result,
      };
}

function attestation(
  side: "one" | "two",
  phase: "start" | "final",
  overrides: Partial<WarGraphCorrelationAttestation> = {},
): WarGraphCorrelationAttestation {
  const one = side === "one";
  return {
    id: one ? 1n : 2n,
    sourceAttestationId: one ? HASH.source : HASH.other,
    receiptHash: one ? HASH.receiptOne : HASH.receiptTwo,
    uploaderUserId: one ? 11 : 22,
    gameStatsId: 42,
    ingestionProvenance: "live_monitor",
    liveProvenance: true,
    provenanceSignatureVerified: true,
    replayHash: HASH.replay,
    liveGameFingerprint: HASH.live,
    platformMatchId: "platform-42",
    watcherIdentityHash: one ? HASH.watcherOne : HASH.watcherTwo,
    watcherSessionHash: one ? HASH.sessionOne : HASH.sessionTwo,
    rosterHash: HASH.roster,
    rosterPlayerKeyHashes: [PLAYER_ONE_HASH, PLAYER_TWO_HASH].sort(),
    uploaderPlayerKeyHash: one ? PLAYER_ONE_HASH : PLAYER_TWO_HASH,
    participantBound: true,
    commencedAt: new Date(COMMENCED_AT),
    isFinal: phase === "final",
    archiveVerified: phase === "final",
    resultTrusted: phase === "final",
    winningPlayerKeyHashes: phase === "final" ? [PLAYER_ONE_HASH] : [],
    resultHash: phase === "final" ? HASH.result : null,
    claimedContestId: null,
    ...overrides,
  };
}

function context(phase: "start" | "final"): WarGraphCorrelationContext {
  return {
    graphId: 9,
    nightId: 8,
    rulesetId: 7,
    gameStats: {
      id: 42,
      replayHash: HASH.replay,
      isFinal: phase === "final",
    },
    latestDesyncOccurred: null,
    latestAcceptedAdjudication: null,
    attestations: [
      attestation("one", phase),
      attestation("two", phase),
    ],
    memberships: [
      {
        id: 101,
        publicId: "membership-one",
        userId: 11,
        playerKey: PLAYER_ONE,
        status: "active",
        startNodeId: 201,
        startLayer: 2,
        startVersion: 3,
        actionsUsed: 0,
        hasConflictingEngagement: false,
      },
      {
        id: 102,
        publicId: "membership-two",
        userId: 22,
        playerKey: PLAYER_TWO,
        status: "active",
        startNodeId: 202,
        startLayer: 1,
        startVersion: 4,
        actionsUsed: 1,
        hasConflictingEngagement: false,
      },
    ],
    pairing: null,
  };
}

test("strictly parses distinct start and final job contracts", () => {
  assert.deepEqual(parseWarGraphCorrelationJobPayload(payload("start")), payload("start"));
  assert.deepEqual(parseWarGraphCorrelationJobPayload(payload("final")), payload("final"));
  assert.equal(
    parseWarGraphCorrelationJobPayload({
      ...payload("start"),
      liveGameFingerprint: null,
    }),
    null,
  );
  assert.equal(
    parseWarGraphCorrelationJobPayload({ ...payload("final"), phase: "start" }),
    null,
  );
});

test("two independent non-final receipts establish only a live evidence-pending plan", () => {
  const decision = correlateWarGraphAttestations(payload("start"), context("start"));
  assert.equal(decision.kind, "live");
  if (decision.kind !== "live") return;
  assert.equal(decision.plan.evidencePhase, "start");
  assert.equal(decision.plan.liveGameFingerprint, HASH.live);
  assert.equal(decision.plan.winnerMembershipId, null);
  assert.equal(decision.plan.resultHash, null);
  assert.deepEqual(
    decision.plan.evidenceLinks.map((row) => row.evidencePhase),
    ["start", "start"],
  );
  assert.equal(decision.plan.aggressorMembershipId, 101);
  assert.equal(decision.plan.defenderMembershipId, 102);
});

test("separate final receipts advance the same live identity to qualification", () => {
  const start = correlateWarGraphAttestations(payload("start"), context("start"));
  const final = correlateWarGraphAttestations(payload("final"), context("final"));
  assert.equal(start.kind, "live");
  assert.equal(final.kind, "qualified");
  if (start.kind !== "live" || final.kind !== "qualified") return;
  assert.equal(start.plan.idempotencyKey, final.plan.idempotencyKey);
  assert.equal(start.plan.propositionHash, final.plan.propositionHash);
  assert.equal(final.plan.evidencePhase, "final");
  assert.equal(final.plan.winnerMembershipId, 101);
  assert.equal(final.plan.loserMembershipId, 102);
  assert.equal(final.plan.outcomeCode, "AGGRESSOR_WIN");
  assert.deepEqual(
    final.plan.evidenceLinks.map((row) => row.evidencePhase),
    ["final", "final"],
  );
});

test("single-Watcher, reused Watcher, historical, and authoritative desync fail closed", () => {
  const missing = context("final");
  missing.attestations = missing.attestations.slice(0, 1);
  assert.equal(
    correlateWarGraphAttestations(payload("final"), missing).kind,
    "retry",
  );

  const reused = context("final");
  reused.attestations = [
    attestation("one", "final"),
    attestation("two", "final", {
      watcherIdentityHash: HASH.watcherOne,
    }),
  ];
  const reusedDecision = correlateWarGraphAttestations(payload("final"), reused);
  assert.equal(reusedDecision.kind, "dead");
  if (reusedDecision.kind === "dead") {
    assert.equal(reusedDecision.code, "WARGRAPH_WATCHER_PROOF_NOT_INDEPENDENT");
  }

  const historical = context("final");
  historical.attestations = [
    attestation("one", "final", {
      ingestionProvenance: "historical_import",
      liveProvenance: false,
      provenanceSignatureVerified: false,
    }),
    attestation("two", "final"),
  ];
  assert.equal(
    correlateWarGraphAttestations(payload("final"), historical).kind,
    "dead",
  );

  const desync = context("final");
  desync.latestDesyncOccurred = true;
  const desyncDecision = correlateWarGraphAttestations(payload("final"), desync);
  assert.equal(desyncDecision.kind, "dead");
  if (desyncDecision.kind === "dead") {
    assert.equal(desyncDecision.code, "WARGRAPH_AUTHORITATIVE_DESYNC");
  }
});

function leasedJob(input: {
  id: bigint;
  commencedAt: string;
  attemptCount?: number;
  maxAttempts?: number;
}): LeasedWarGraphCorrelationJob {
  return {
    id: input.id,
    graphId: 9,
    payload: { commencedAt: input.commencedAt },
    attemptCount: input.attemptCount ?? 1,
    maxAttempts: input.maxAttempts ?? 8,
    leaseOwner: "worker-a",
    leaseExpiresAt: new Date("2026-08-24T02:00:30.000Z"),
    version: Number(input.id),
    createdAt: new Date("2026-08-24T00:00:00.000Z"),
  };
}

test("bounded worker processes authoritative commencement order and CAS-transitions leases", async () => {
  const correlated: string[] = [];
  const transitions: WarGraphCorrelationJobTransition[] = [];
  const adapter: WarGraphCorrelationWorkerAdapter = {
    lease: async (input) => {
      assert.equal(input.limit, 25);
      return [
        leasedJob({ id: 2n, commencedAt: "2026-08-24T01:30:00.000Z" }),
        leasedJob({ id: 1n, commencedAt: "2026-08-24T01:00:00.000Z" }),
        leasedJob({
          id: 3n,
          commencedAt: "2026-08-24T02:00:00.000Z",
          attemptCount: 8,
          maxAttempts: 8,
        }),
      ];
    },
    correlate: async (job) => {
      correlated.push(job.id.toString());
      if (job.id === 1n) {
        return { kind: "live", contestId: 10, pairingId: 20 };
      }
      return {
        kind: "retry",
        code: "WARGRAPH_SECOND_ATTESTATION_PENDING",
        detail: "waiting",
      };
    },
    transition: async (transition) => {
      transitions.push(transition);
      return transition.jobId !== 2n;
    },
  };
  const report = await runWarGraphCorrelationWorker({
    adapter,
    workerId: "worker-a",
    now: new Date("2026-08-24T02:00:00.000Z"),
  });
  assert.deepEqual(correlated, ["1", "2", "3"]);
  assert.deepEqual(
    transitions.map((row) => row.kind),
    ["succeeded", "retry", "dead"],
  );
  assert.equal(report.succeeded, 1);
  assert.equal(report.staleLease, 1);
  assert.equal(report.dead, 1);
  assert.equal(report.retried, 0);
});

test("Prisma adapter source contains the durable lock/order/CAS contract and no settlement mutation", async () => {
  const source = await readFile(
    new URL("../lib/wargraph/prismaCorrelationWorker.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /FOR UPDATE SKIP LOCKED/u);
  assert.match(source, /"attempt_count" = job\."attempt_count" \+ 1/u);
  assert.match(source, /TransactionIsolationLevel\.Serializable/u);
  const gameLock = source.indexOf("pg_advisory_xact_lock(${gameStatsId})");
  const graphLock = source.indexOf("lockWarGraphTransaction(tx, graphId)");
  assert.ok(gameLock >= 0 && graphLock > gameLock);
  assert.match(source, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/u);
  assert.match(source, /evidencePhase: "start"/u);
  assert.match(source, /evidencePhase: "final"/u);
  assert.doesNotMatch(source, /warGraphMovement\.create/u);
  assert.doesNotMatch(source, /warGraphReward\.create/u);
});
