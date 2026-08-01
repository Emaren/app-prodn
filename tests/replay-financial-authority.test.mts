import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  approveReplayFinancialAuthority,
  evaluateFrozenReplayMarketAuthority,
  isReplayFinancialAuthorityConfirmation,
  planReplayFinancialAuthority,
  replayFinancialAuthorityFingerprint,
  REPLAY_FINANCIAL_AUTHORITY_CONFIRMATION,
} from "../lib/replayFinancialAuthority.ts";
import {
  replayResultAdjudicationAuthorizesBets,
} from "../lib/replayResultAdjudications.ts";
import {
  normalizeReplayPlayers,
  resolveReplayTeams,
  rosterSnapshot,
} from "../lib/teamResolution.ts";

const replayHash =
  "a".repeat(64);
const players = [
  {
    name: "Emaren",
    team_id: 0,
    number: 1,
  },
  {
    name: "Julio Alvarez",
    team_id: 1,
    number: 2,
  },
];
const canonicalPlayers =
  normalizeReplayPlayers(
    players
  );
const resolution =
  resolveReplayTeams(
    canonicalPlayers
  );

assert.equal(
  resolution.status,
  "resolved"
);
assert.ok(
  resolution.rosterHash
);
assert.ok(
  resolution.propositionHash
);

const left =
  rosterSnapshot(
    resolution.teams[0]
  );
const right =
  rosterSnapshot(
    resolution.teams[1]
  );
const assignments = [
  {
    teamKey:
      "gold",
    players:
      resolution.teams[0]
        .players.map(
          (player) => ({
            stablePlayerKey:
              player.stablePlayerKey,
            name:
              player.name,
            normalizedName:
              player.normalizedName,
            steamId:
              player.steamId,
            sourceTeamId:
              player.teamId,
            playerNumber:
              player.playerNumber,
          })
        ),
  },
  {
    teamKey:
      "blue",
    players:
      resolution.teams[1]
        .players.map(
          (player) => ({
            stablePlayerKey:
              player.stablePlayerKey,
            name:
              player.name,
            normalizedName:
              player.normalizedName,
            steamId:
              player.steamId,
            sourceTeamId:
              player.teamId,
            playerNumber:
              player.playerNumber,
          })
        ),
  },
];

test(
  "financial authority maps an explicit complete verdict onto the exact frozen market",
  () => {
    const evaluated =
      evaluateFrozenReplayMarketAuthority({
        gamePlayers:
          players,
        sourceRosterHash:
          resolution.rosterHash,
        teamAssignments:
          assignments,
        winningTeamKey:
          "gold",
        propositionHash:
          resolution.propositionHash,
        marketSourceRosterHash:
          resolution.rosterHash,
        leftRosterSnapshot:
          left,
        rightRosterSnapshot:
          right,
      });

    assert.equal(
      evaluated.ok,
      true
    );
    assert.equal(
      evaluated.winnerSide,
      "left"
    );
    assert.deepEqual(
      evaluated.reasonCodes,
      []
    );
  }
);

test(
  "financial authority blocks a frozen roster or proposition mismatch",
  () => {
    const rosterMismatch =
      evaluateFrozenReplayMarketAuthority({
        gamePlayers:
          players,
        sourceRosterHash:
          resolution.rosterHash,
        teamAssignments:
          assignments,
        winningTeamKey:
          "gold",
        propositionHash:
          resolution.propositionHash,
        marketSourceRosterHash:
          resolution.rosterHash,
        leftRosterSnapshot:
          left,
        rightRosterSnapshot: [
          {
            ...right[0],
            name:
              "Someone Else",
            stablePlayerKey:
              "name:someone else",
          },
        ],
      });

    assert.equal(
      rosterMismatch.ok,
      false
    );
    assert.ok(
      rosterMismatch.reasonCodes.includes(
        "frozen_market_roster_mismatch"
      )
    );

    const propositionMismatch =
      evaluateFrozenReplayMarketAuthority({
        gamePlayers:
          players,
        sourceRosterHash:
          resolution.rosterHash,
        teamAssignments:
          assignments,
        winningTeamKey:
          "gold",
        propositionHash:
          "b".repeat(64),
        marketSourceRosterHash:
          resolution.rosterHash,
        leftRosterSnapshot:
          left,
        rightRosterSnapshot:
          right,
      });

    assert.equal(
      propositionMismatch.ok,
      false
    );
    assert.ok(
      propositionMismatch.reasonCodes.includes(
        "stored_proposition_hash_mismatch"
      )
    );
  }
);

test(
  "only effective automatic evidence or explicit affectsBets authority can enter betting truth",
  () => {
    assert.equal(
      replayResultAdjudicationAuthorizesBets({
        decisionStatus:
          "accepted",
        affectsBets:
          false,
        idempotencyKey:
          "review:ordinary:one",
      }),
      false
    );
    assert.equal(
      replayResultAdjudicationAuthorizesBets({
        decisionStatus:
          "accepted",
        affectsBets:
          false,
        idempotencyKey:
          "evidence:auto:42:9",
      }),
      true
    );
    assert.equal(
      replayResultAdjudicationAuthorizesBets({
        decisionStatus:
          "accepted",
        affectsBets:
          true,
        idempotencyKey:
          "financial-authority:42:abc",
      }),
      true
    );
    assert.equal(
      replayResultAdjudicationAuthorizesBets({
        decisionStatus:
          "accepted",
        affectsBets:
          true,
        idempotencyKey:
          "review:ordinary:forged-bit",
      }),
      false
    );
    assert.equal(
      replayResultAdjudicationAuthorizesBets({
        decisionStatus:
          "pending_admin_approval",
        affectsBets:
          true,
        idempotencyKey:
          "financial-authority:42:abc",
      }),
      false
    );
  }
);

test(
  "confirmation is exact and fingerprints change with exposure",
  () => {
    assert.equal(
      isReplayFinancialAuthorityConfirmation(
        REPLAY_FINANCIAL_AUTHORITY_CONFIRMATION
      ),
      true
    );
    assert.equal(
      isReplayFinancialAuthorityConfirmation(
        "authorize financial reconciliation"
      ),
      false
    );

    const first =
      replayFinancialAuthorityFingerprint({
        replayHash,
        wager: {
          id: 7,
          amountWolo:
            100,
        },
      });
    const repeat =
      replayFinancialAuthorityFingerprint({
        wager: {
          amountWolo:
            100,
          id: 7,
        },
        replayHash,
      });
    const changed =
      replayFinancialAuthorityFingerprint({
        replayHash,
        wager: {
          id: 7,
          amountWolo:
            101,
        },
      });

    assert.equal(
      first,
      repeat
    );
    assert.notEqual(
      first,
      changed
    );
  }
);

test(
  "financial authority plans only ordinary winner markets",
  () => {
    const source = readFileSync(
      "lib/replayFinancialAuthority.ts",
      "utf8"
    );

    assert.match(
      source,
      /linkedGameStatsId:\s*gameStatsId,\s*marketType:\s*"winner"/
    );
  }
);

function planPrisma(
  options: {
    amountWolo?: number;
    desyncOccurred?: boolean;
    payoutWolo?: number | null;
    automaticEvidence?: boolean;
    integrityStatus?: string;
    incidentType?: string;
    incidentReason?: string;
    marketStatus?: string;
  } = {}
) {
  const amountWolo =
    options.amountWolo ??
    1_000;
  const adjudication = {
    id: 9,
    actorUserId: 1,
    idempotencyKey:
      options.automaticEvidence
        ? "evidence:auto:42:7"
        : "review:game-42:accepted",
    inputHash:
      "c".repeat(64),
    decisionStatus:
      "accepted",
    actorUidSnapshot:
      "admin-uid",
    actorDisplayNameSnapshot:
      "Commissioner",
    actorRole:
      "site_admin",
    teamAssignments:
      assignments,
    winningTeamKey:
      "gold",
    winningPlayerKeys:
      assignments[0].players.map(
        (player) =>
          player.stablePlayerKey
      ),
    reason:
      "Final screen reviewed.",
    evidence:
      null,
    sourceReplayHash:
      replayHash,
    sourceParseIteration:
      7,
    sourceRosterHash:
      resolution.rosterHash,
    sourcePropositionHash:
      "d".repeat(64),
    rawParserSnapshot:
      {},
    marketSnapshot:
      {},
    hasLinkedMarket:
      true,
    financialDisposition:
      "operator_review_required",
    affectsStats:
      true,
    affectsBets:
      false,
    createdAt:
      new Date(
        "2026-07-25T20:00:00.000Z"
      ),
  };
  const market = {
    id: 70,
    title:
      "Emaren vs Julio Alvarez",
    status:
      options.marketStatus ??
      "under_review",
    marketType:
      "winner",
    leftLabel:
      resolution.teams[0]
        .players[0].name,
    rightLabel:
      resolution.teams[1]
        .players[0].name,
    propositionHash:
      resolution.propositionHash,
    sourceRosterHash:
      resolution.rosterHash,
    leftRosterSnapshot:
      left,
    rightRosterSnapshot:
      right,
    integrityStatus:
      options.integrityStatus ??
      "verified",
    integrityReason:
      null,
    winnerSide:
      null,
    resolutionReason:
      null,
    voidedAt:
      null,
    refundStatus:
      null,
    settlementStatus:
      "under_review",
    settlementExecutedAt:
      null,
    seedLeftWolo:
      0,
    seedRightWolo:
      0,
    wagers: [
      {
        id: 480,
        side:
          "left",
        amountWolo,
        payoutWolo:
          options.payoutWolo ??
          null,
        status:
          "active",
        executionMode:
          "app_only",
        stakeTxHash:
          null,
        payoutTxHash:
          null,
        stakeLockedAt:
          null,
        settledAt:
          null,
      },
    ],
    integrityIncidents:
      options.incidentType
        ? [
            {
              id: 6,
              status:
                "open",
              incidentType:
                options.incidentType,
              publicSummary:
                "Operator review required.",
              evidence: {
                reason:
                  options.incidentReason ??
                  "MARKET_INTEGRITY_BLOCKED: market 70 final proposition failed: final_replay_not_betting_eligible,final_winning_team_not_coherent",
              },
            },
          ]
        : [],
  };

  return {
    user: {
      findUnique:
        async () => ({
          id: 1,
          uid:
            "admin-uid",
          isAdmin:
            true,
          inGameName:
            "Commissioner",
          steamPersonaName:
            null,
        }),
    },
    gameStats: {
      findUnique:
        async () => ({
          id: 42,
          replayHash,
          replay_file:
            "final.aoe2record",
          original_filename:
            "final.aoe2record",
          parse_iteration:
            7,
          parse_source:
            "watcher_final",
          parse_reason:
            "watcher_final_submission",
          is_final:
            true,
          winner:
            "Unknown",
          players,
          key_events:
            {},
          event_types:
            [],
          map:
            {
              name:
                "Yucatan",
            },
          game_type:
            "Random Map",
          game_version:
            "HD",
          duration:
            1_800,
          game_duration:
            1_800,
          played_on:
            null,
          timestamp:
            null,
        }),
    },
    replayResultAdjudication: {
      findMany:
        async () => [
          adjudication,
        ],
    },
    replayDesyncIncident: {
      findFirst:
        async () =>
          options.desyncOccurred
            ? {
                id: 3,
                desyncOccurred:
                  true,
              }
            : null,
    },
    betMarket: {
      findMany:
        async () => [
          market,
        ],
    },
    pendingWoloClaim: {
      findMany:
        async () => [],
    },
  };
}

test(
  "dry run exposes exact wager and WOLO exposure and invalidates a changed plan",
  async () => {
    const first =
      await planReplayFinancialAuthority({
        prisma:
          planPrisma() as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });
    const changed =
      await planReplayFinancialAuthority({
        prisma:
          planPrisma({
            amountWolo:
              1_001,
          }) as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });

    assert.equal(
      first.ready,
      true
    );
    assert.equal(
      first.exposure
        .activeWagerCount,
      1
    );
    assert.equal(
      first.exposure
        .activeWolo,
      1_000
    );
    assert.equal(
      first.markets[0]
        .wagers[0].id,
      480
    );
    assert.notEqual(
      first.fingerprint,
      changed.fingerprint
    );
  }
);

test(
  "dry run blocks active desync and terminal money",
  async () => {
    const desync =
      await planReplayFinancialAuthority({
        prisma:
          planPrisma({
            desyncOccurred:
              true,
          }) as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });
    const terminal =
      await planReplayFinancialAuthority({
        prisma:
          planPrisma({
            payoutWolo:
              1_100,
          }) as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });

    assert.equal(
      desync.ready,
      false
    );
    assert.ok(
      desync.blockers.some(
        (blocker) =>
          blocker.code ===
          "active_desync_incident"
      )
    );
    assert.equal(
      terminal.ready,
      false
    );
    assert.ok(
      terminal.blockers.some(
        (blocker) =>
          blocker.code ===
          "terminal_market_money"
      )
    );
  }
);

test(
  "dry run accepts only non-wagerable review/final-proof states",
  async () => {
    for (
      const marketStatus of [
        "open",
        "live",
        "settled",
      ]
    ) {
      const plan =
        await planReplayFinancialAuthority({
          prisma:
            planPrisma({
              marketStatus,
            }) as never,
          viewerUid:
            "admin-uid",
          gameStatsId:
            42,
        });

      assert.equal(
        plan.ready,
        false
      );
      assert.ok(
        plan.blockers.some(
          (blocker) =>
            blocker.code ===
            "market_liquidity_not_closed"
        )
      );
    }
  }
);

test(
  "an effective automatic-evidence verdict cannot receive redundant manual authority",
  async () => {
    const automatic =
      await planReplayFinancialAuthority({
        prisma:
          planPrisma({
            automaticEvidence:
              true,
          }) as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });

    assert.equal(
      automatic.alreadyAuthorized,
      true
    );
    assert.equal(
      automatic.ready,
      false
    );
    assert.ok(
      automatic.blockers.some(
        (blocker) =>
          blocker.code ===
          "already_financially_authorized"
      )
    );
  }
);

test(
  "an exact plan may clear only the generic settlement review incident",
  async () => {
    const recoverable =
      await planReplayFinancialAuthority({
        prisma:
          planPrisma({
            integrityStatus:
              "under_review",
            incidentType:
              "settlement_integrity_blocked",
          }) as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });
    const teamIncident =
      await planReplayFinancialAuthority({
        prisma:
          planPrisma({
            integrityStatus:
              "under_review",
            incidentType:
              "roster_changed_after_stake",
          }) as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });
    const genericRosterFailure =
      await planReplayFinancialAuthority({
        prisma:
          planPrisma({
            integrityStatus:
              "under_review",
            incidentType:
              "settlement_integrity_blocked",
            incidentReason:
              "MARKET_INTEGRITY_BLOCKED: market 70 final proposition failed: final_roster_identity_mismatch",
          }) as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });

    assert.equal(
      recoverable.ready,
      true
    );
    assert.equal(
      teamIncident.ready,
      false
    );
    assert.ok(
      teamIncident.blockers.some(
        (blocker) =>
          blocker.code ===
          "open_market_integrity_incident"
      )
    );
    assert.equal(
      genericRosterFailure.ready,
      false
    );
  }
);

test(
  "approval appends one superseding admin authority row bound to the dry-run fingerprint",
  async () => {
    const database =
      planPrisma({
        integrityStatus:
          "under_review",
        incidentType:
          "settlement_integrity_blocked",
      }) as ReturnType<
        typeof planPrisma
      > & {
        $transaction?: unknown;
      };
    const plan =
      await planReplayFinancialAuthority({
        prisma:
          database as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
      });
    let createdData:
      Record<string, unknown> | null =
      null;
    const adjudicationDelegate =
      database.replayResultAdjudication as typeof database.replayResultAdjudication & {
        findUnique?: unknown;
        create?: unknown;
      };
    adjudicationDelegate.findUnique =
      async () =>
        null;
    adjudicationDelegate.create =
      async (
        input: {
          data:
            Record<string, unknown>;
        }
      ) => {
        createdData =
          input.data;
        return {
          id: 10,
          ...input.data,
        };
      };
    const rawQueries:
      string[] = [];
    database.$transaction =
      async (
        callback: (
          tx: unknown
        ) => Promise<unknown>
      ) =>
        callback({
          ...database,
          $queryRaw:
            async (
              strings:
                TemplateStringsArray
            ) => {
              rawQueries.push(
                Array.from(
                  strings
                ).join("?")
              );
              return [
                {
                  lock_acquired:
                    1,
                },
              ];
            },
        });

    const approved =
      await approveReplayFinancialAuthority({
        prisma:
          database as never,
        viewerUid:
          "admin-uid",
        gameStatsId:
          42,
        expectedFingerprint:
          plan.fingerprint,
        confirmation:
          REPLAY_FINANCIAL_AUTHORITY_CONFIRMATION,
      });

    assert.equal(
      approved.created,
      true
    );
    assert.equal(
      approved.adjudication.id,
      10
    );
    assert.equal(
      createdData?.affectsBets,
      true
    );
    assert.equal(
      createdData?.actorRole,
      "site_admin"
    );
    assert.equal(
      createdData?.supersedesId,
      9
    );
    assert.match(
      String(
        createdData
          ?.idempotencyKey
      ),
      /^financial-authority:42:[a-f0-9]{64}$/
    );
    assert.deepEqual(
      (
        createdData
          ?.evidence as {
          recoverableIntegrityIncidentIds?: number[];
        }
      )
        .recoverableIntegrityIncidentIds,
      [
        6,
      ]
    );
    assert.equal(
      rawQueries.length,
      2
    );
    assert.match(
      rawQueries[0],
      /pg_advisory_xact_lock/
    );
    assert.match(
      rawQueries[1],
      /FROM "bet_markets"[\s\S]*FOR UPDATE/
    );
  }
);

test(
  "ordinary adjudication writes remain stats-only and the SQL exception is narrow",
  () => {
    const adjudicationSource =
      readFileSync(
        new URL(
          "../lib/replayResultAdjudications.ts",
          import.meta.url
        ),
        "utf8"
      );
    const migration =
      readFileSync(
        new URL(
          "../prisma/migrations/20260725213000_allow_replay_financial_authority/migration.sql",
          import.meta.url
        ),
        "utf8"
      );

    assert.match(
      adjudicationSource,
      /affectsBets:\s*false/
    );
    assert.match(
      migration,
      /"actor_role" = 'site_admin'/
    );
    assert.match(
      migration,
      /"supersedes_id" IS NOT NULL/
    );
    assert.match(
      migration,
      /"idempotency_key" LIKE 'financial-authority:%'/
    );
    assert.match(
      migration,
      /^BEGIN;[\s\S]*COMMIT;\s*$/m
    );
  }
);
