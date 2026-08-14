import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  mergeLiveSessionPlayerIterations,
} from "../lib/liveSessionSnapshot.ts";
import {
  reconcileDetachedWatcherMarkets,
  reconciledWinnerMarketSessionKeys,
  watcherMarketNeedsDetachedReconciliation,
  watcherFinalProofDeadline,
  watcherFinalProofDeadlineForTransition,
  watcherFinalProofGraceStartedAt,
  watcherMissingProofDeadlineRepairDeadline,
} from "../lib/bets.ts";
import {
  resolveReplayTeams,
  rosterSnapshot,
} from "../lib/teamResolution.ts";
import {
  assertBetMarketPreflight,
} from "../lib/betWagering.ts";

const betsSource = readFileSync(
  new URL("../lib/bets.ts", import.meta.url),
  "utf8"
);
const betsPageSource = readFileSync(
  new URL("../app/bets/page.tsx", import.meta.url),
  "utf8"
);
const betsRouteSource = readFileSync(
  new URL("../app/api/bets/route.ts", import.meta.url),
  "utf8"
);
const ensureQueueSource = readFileSync(
  new URL("../lib/betMarketEnsureQueue.ts", import.meta.url),
  "utf8"
);
const liveGamesSource = readFileSync(
  new URL("../lib/liveGames.ts", import.meta.url),
  "utf8"
);
const liveGamesBoardSource = readFileSync(
  new URL("../components/live/LiveGamesBoard.tsx", import.meta.url),
  "utf8"
);

test(
  "a metadata-only first pass stops poisoning a substantive live roster",
  () => {
    const fragment = [
      {
        name: "Emaren",
        steam_id: "76561198065420384",
        team_id: 0,
      },
      {
        name: "Lone Wolf",
        steam_id: "76561198111111111",
        team_id: 1,
      },
    ];
    const substantive = [
      ...fragment,
      {
        name: "FEO(M)X",
        steam_id: "76561198222222222",
        team_id: 0,
      },
      {
        name: "vaporskills",
        steam_id: "76561198333333333",
        team_id: 1,
      },
    ];

    const merged = mergeLiveSessionPlayerIterations([
      {
        parse_reason: "hd_metadata_fragment_only_recovery",
        players: fragment,
      },
      {
        parse_reason: "watcher_live_iteration",
        players: substantive,
      },
    ]);

    assert.deepEqual(merged.conflictReasonCodes, []);
    assert.equal(merged.players.length, 4);
    const resolution = resolveReplayTeams(merged.players);
    assert.equal(resolution.status, "resolved");
    assert.equal(resolution.confidence, "high");
  }
);

test(
  "a metadata-only row remains usable until a substantive iteration exists",
  () => {
    const merged = mergeLiveSessionPlayerIterations([
      {
        parse_reason: "hd_metadata_fragment_only_recovery",
        players: [
          { name: "Emaren" },
          { name: "somniosator" },
        ],
      },
    ]);

    assert.equal(merged.players.length, 2);
  }
);

test(
  "low-level persisted proof clock fallback remains deterministic",
  () => {
    const createdAt = new Date("2026-07-30T01:00:00.000Z");
    const firstNow = new Date("2026-08-09T03:00:00.000Z").getTime();
    const laterNow = new Date("2026-08-10T03:00:00.000Z").getTime();
    const clock = {
      proofDeadlineAt: null,
      underReviewAt: null,
      closeAt: null,
      createdAt,
    };

    assert.equal(
      watcherFinalProofGraceStartedAt(clock, firstNow).toISOString(),
      createdAt.toISOString()
    );
    assert.equal(
      watcherFinalProofDeadline(clock, firstNow).toISOString(),
      watcherFinalProofDeadline(clock, laterNow).toISOString()
    );
    assert.equal(
      watcherFinalProofDeadline(clock, firstNow).toISOString(),
      "2026-07-30T01:20:00.000Z"
    );
  }
);

test(
  "legacy null proof-deadline repair receives one fresh bounded migration grace",
  () => {
    const repairObservedAt =
      new Date("2026-08-09T05:10:00.000Z");

    assert.equal(
      watcherMissingProofDeadlineRepairDeadline(
        repairObservedAt
      ).toISOString(),
      "2026-08-09T05:30:00.000Z"
    );

    assert.match(
      betsSource,
      /const repairObservedAt = new Date\(\);/
    );

    assert.match(
      betsSource,
      /inheritedParentDeadline\s*\?\?\s*watcherMissingProofDeadlineRepairDeadline\(\s*repairObservedAt\s*\)/
    );

    assert.match(
      betsSource,
      /parentProofClock\?\.proofDeadlineAt \?\? null/
    );
  }
);

test(
  "an old live market receives a full proof grace on first transition and keeps it",
  () => {
    const createdAt = new Date("2026-08-09T01:00:00.000Z");
    const proofObservedAt = new Date("2026-08-09T03:00:00.000Z");
    const firstDeadline =
      watcherFinalProofDeadlineForTransition(
        {
          status: "live",
          proofDeadlineAt: null,
          underReviewAt: null,
          closeAt: null,
          createdAt,
        },
        proofObservedAt
      );

    assert.equal(
      firstDeadline.toISOString(),
      "2026-08-09T03:20:00.000Z"
    );
    assert.equal(
      watcherFinalProofDeadlineForTransition(
        {
          status: "awaiting_final_proof",
          proofDeadlineAt: firstDeadline,
          underReviewAt: null,
          closeAt: proofObservedAt,
          createdAt,
        },
        new Date("2026-08-09T03:05:00.000Z")
      ).toISOString(),
      firstDeadline.toISOString()
    );
  }
);

test(
  "a visible but ineligible completed session locks an active-wager book",
  async () => {
    const sessionKey =
      "final-proof-active-wager.mgz";
    const players = [
      {
        name: "Alpha",
        steam_id:
          "76561198000000001",
        team_id: 0,
        number: 1,
      },
      {
        name: "Bravo",
        steam_id:
          "76561198000000002",
        team_id: 1,
        number: 2,
      },
    ];
    const resolution =
      resolveReplayTeams(players);
    assert.equal(
      resolution.status,
      "resolved"
    );
    assert.equal(
      resolution.teams.length,
      2
    );

    const previouslyEligible =
      reconciledWinnerMarketSessionKeys([
        {
          linkedSessionKey:
            sessionKey,
          marketType:
            "winner",
        },
      ]);
    assert.equal(
      watcherMarketNeedsDetachedReconciliation({
        normalizedSessionKey:
          sessionKey,
        marketStatus:
          "live",
        reconciledSessionKeys:
          previouslyEligible,
      }),
      false
    );

    // The same key is still visible, but its completed row cannot build a
    // winner seed because it has no coherent winner. It must not be treated as
    // reconciled merely because the watcher still publishes the row.
    const completedIncoherent =
      reconciledWinnerMarketSessionKeys([]);
    assert.equal(
      watcherMarketNeedsDetachedReconciliation({
        normalizedSessionKey:
          sessionKey,
        marketStatus:
          "live",
        reconciledSessionKeys:
          completedIncoherent,
      }),
      true
    );

    const updates: Array<{
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }> = [];
    const market = {
      id: 44,
      title: "Alpha vs Bravo",
      linkedSessionKey:
        sessionKey,
      linkedGameStatsId: null,
      leftLabel: "Alpha",
      rightLabel: "Bravo",
      propositionHash:
        resolution.propositionHash,
      leftRosterSnapshot:
        rosterSnapshot(
          resolution.teams[0]
        ),
      rightRosterSnapshot:
        rosterSnapshot(
          resolution.teams[1]
        ),
      eventLabel: "Watcher Final",
      updatedAt:
        new Date("2026-08-09T03:00:00.000Z"),
      closeAt: null,
      status: "live",
      integrityReason: null,
      commissionerReviewState: null,
      underReviewAt: null,
      proofDeadlineAt: null,
      resolutionReason: null,
      createdAt:
        new Date("2026-08-09T02:00:00.000Z"),
      // Existing money must not exempt the market from the safety transition.
      wagers: [
        {
          id: 501,
          status: "active",
        },
      ],
    };
    const prisma = {
      betMarket: {
        findMany: async () => [market],
        updateMany: async (input: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          updates.push(input);
          return { count: 1 };
        },
      },
      gameStats: {
        findFirst: async () => ({ id: 77 }),
        findUnique: async () => ({
          id: 77,
          replayHash: "f".repeat(64),
          winner: "Unknown",
          players,
          parse_reason:
            "watcher_final_parse",
          key_events: {},
          map: "Arabia",
          timestamp:
            new Date("2026-08-09T03:01:00.000Z"),
          createdAt:
            new Date("2026-08-09T03:01:00.000Z"),
          replayResultAdjudications: [],
        }),
      },
    };

    await reconcileDetachedWatcherMarkets(
      prisma as never,
      completedIncoherent
    );

    assert.equal(
      updates.length,
      1
    );
    assert.equal(
      updates[0].data.status,
      "awaiting_final_proof"
    );
    assert.equal(
      updates[0].where.id,
      market.id
    );

    assert.throws(
      () =>
        assertBetMarketPreflight(
          {
            market: {
              status:
                updates[0].data.status,
              linkedSessionKey:
                sessionKey,
              scheduledMatchId:
                null,
            },
          } as never,
          {
            viewer: {
              id: 9,
              inGameName:
                "Bettor",
              steamPersonaName:
                null,
            },
            side: "left",
          }
        ),
      /locked while the final replay is being verified/
    );
  }
);

test(
  "detached watcher transitions use one observed proof clock",
  () => {
    const transitionCalls =
      betsSource.match(
        /watcherFinalProofDeadlineForTransition\(\s*market,\s*(snapshotGapObservedAt|proofObservedAt)\s*\)/g
      ) ?? [];

    assert.equal(transitionCalls.length, 2);
    assert.match(
      betsSource,
      /closeAt:\s*snapshotGapObservedAt,\s*proofDeadlineAt:\s*watcherFinalProofDeadlineForTransition/
    );
    assert.match(
      betsSource,
      /closeAt:\s*proofObservedAt,\s*proofDeadlineAt:\s*watcherFinalProofDeadlineForTransition/
    );
  }
);

test(
  "deadline repair precedes parent expiry, child reconciliation, and refunds",
  () => {
    const repairIndex = betsSource.indexOf(
      "await repairMissingWatcherProofDeadlines(prisma)"
    );
    const expiryIndex = betsSource.indexOf(
      "await voidExpiredWatcherMarkets(prisma)"
    );
    const childIndex = betsSource.indexOf(
      "await reconcileDesyncSideMarkets(prisma)"
    );
    const refundIndex = betsSource.indexOf(
      "await settleResolvedMarketWagers(prisma)"
    );

    assert.ok(repairIndex >= 0);
    assert.ok(expiryIndex > repairIndex);
    assert.ok(childIndex > expiryIndex);
    assert.ok(refundIndex > childIndex);
    assert.match(
      betsSource,
      /status:\s*"awaiting_final_proof",\s*proofDeadlineAt:\s*null,[\s\S]*parentMarket:/
    );
    assert.match(
      betsSource,
      /proofDeadlineAt:\s*seed\.proofDeadlineAt \?\? null/
    );
  }
);

test(
  "the bets board has a bounded foreground refresh and explicit no-store response",
  () => {
    assert.match(
      betsPageSource,
      /BETS_POLL_INTERVAL_MS = 5_000/
    );
    assert.match(
      betsPageSource,
      /activeRequest\?\.abort\(\)/
    );
    assert.match(
      betsPageSource,
      /window\.addEventListener\("focus", handleForegroundRefresh\)/
    );
    assert.match(
      betsRouteSource,
      /queueBetMarketEnsure\(prisma, 0\)/
    );
    assert.match(
      betsRouteSource,
      /private, no-store, max-age=0, must-revalidate/
    );
    assert.match(
      ensureQueueSource,
      /BET_MARKET_ENSURE_MIN_INTERVAL_MS = 5_000/
    );
    assert.match(
      betsSource,
      /loadLiveGamesSnapshotFresh\(prisma\)/
    );
  }
);

test(
  "expired live snapshots coalesce on fresh truth and foreground the live board",
  () => {
    assert.match(
      liveGamesSource,
      /liveGamesSnapshotRefreshPromise/
    );
    assert.match(
      liveGamesSource,
      /LIVE_GAMES_SNAPSHOT_CACHE_TTL_MS = 4000/
    );
    assert.match(
      liveGamesSource,
      /return refreshLiveGamesSnapshot\(prisma\)/
    );
    assert.doesNotMatch(
      liveGamesSource,
      /LIVE_GAMES_SNAPSHOT_STALE_TTL_MS/
    );
    assert.match(
      liveGamesSource,
      /last good value is a failure-only availability fallback/
    );
    assert.match(
      liveGamesBoardSource,
      /window\.addEventListener\("focus", refreshIfVisible\)/
    );
    assert.match(
      liveGamesBoardSource,
      /document\.addEventListener\(\s*"visibilitychange",\s*refreshIfVisible/
    );
  }
);
