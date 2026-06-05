import { NextRequest, NextResponse } from "next/server";

import type { AdminUsersRailsPayload } from "@/components/admin/command-tower/types";
import { requireAdmin } from "@/lib/adminSession";
import {
  isBetStakeIntentCountableStatus,
  refreshRecoverableBetStakeIntents,
} from "@/lib/betStakeIntents";
import { loadPendingWoloClaimsForAdmin } from "@/lib/pendingWoloClaims";
import { loadWatcherDownloadAnalytics } from "@/lib/watcherDownloads";
import { getWoloSettlementSurfaceStatus } from "@/lib/woloBetSettlement";
import {
  buildWoloRestTxLookupUrl,
  getWoloBetEscrowRuntime,
  getWoloMainnetDisplayStartAt,
  isMainnetVisibleBetWager,
  isWoloMainnet,
} from "@/lib/woloChain";
import { loadBetWalletFrictionRail } from "@/lib/adminWalletFriction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractPayoutTxHash(note: string | null | undefined) {
  if (!note) return null;
  const match = note.match(/\btx\s+([A-Za-z0-9]{16,128})\b/);
  return match?.[1] ?? null;
}

function extractAutoSettleError(note: string | null | undefined) {
  if (!note) return null;
  const marker = "auto-settle failed:";
  const index = note.toLowerCase().indexOf(marker);
  if (index < 0) return null;
  return note.slice(index + marker.length).trim() || null;
}

function resolveSettlementTxHash(claim: {
  payoutTxHash?: string | null;
  note?: string | null;
}) {
  return claim.payoutTxHash?.trim() || extractPayoutTxHash(claim.note);
}

function resolveSettlementError(claim: {
  errorState?: string | null;
  note?: string | null;
}) {
  return claim.errorState?.trim() || extractAutoSettleError(claim.note);
}

function refineSettlementErrorForCurrentSurface(
  value: string | null,
  settlementSurface: Awaited<ReturnType<typeof getWoloSettlementSurfaceStatus>>
) {
  if (!value) return null;
  const normalized = value.trim();
  if (
    /settlement execution is not configured|payout execution.*not configured|settlement service.*not configured/i.test(
      normalized
    ) &&
    settlementSurface.settlementHealthOk &&
    settlementSurface.settlementHealthChainId === "wolo-1"
  ) {
    return "Current wolo-1 settlement health is ok; this row needs retry/review rather than service configuration.";
  }
  if (/auth/i.test(normalized) && settlementSurface.groupedRunCapability === "auth_failed") {
    return "WoloChain grouped settlement auth rejected the configured bearer token.";
  }
  if (/auth/i.test(normalized) && settlementSurface.groupedRunCapability === "auth_required") {
    return "WoloChain grouped settlement auth is required, but the app has no settlement auth token configured.";
  }
  return normalized;
}

function deriveSettlementMode(
  status: "pending" | "claimed" | "rescinded",
  payoutTxHash: string | null
) {
  if (status === "rescinded") return "rescinded" as const;
  if (status === "claimed" && payoutTxHash) return "auto_settled" as const;
  if (status === "claimed") return "claimed_manual" as const;
  return "pending" as const;
}

function isAwaitingVerifiedWalletLinkDetail(value: string | null | undefined) {
  return /awaiting verified wallet-linked account|target unresolved|no verified wallet-linked user matches/i.test(
    value || ""
  );
}

function isSettlementUnavailableDetail(value: string | null | undefined) {
  return /settlement.*not configured|settlement_health|payout_fee_headroom_too_low|escrow_balance_too_low|payout execution.*not configured|service.*unconfigured|signer.*missing|signers unavailable|127\.0\.0\.1:8092|127\.0\.0\.1:8091|wolo-testnet/i.test(
    value || ""
  );
}

function projectReturnWolo(stakeWolo: number, selectedPoolWolo: number, oppositePoolWolo: number) {
  if (stakeWolo <= 0) return 0;
  const nextSelectedPool = selectedPoolWolo + stakeWolo;
  if (nextSelectedPool <= 0) return stakeWolo;
  return Math.max(
    stakeWolo,
    Math.round(stakeWolo + oppositePoolWolo * (stakeWolo / nextSelectedPool))
  );
}

function isCountableWagerRow(wager: {
  executionMode: string;
  stakeTxHash?: string | null;
  stakeLockedAt?: Date | string | null;
  createdAt?: Date | string | null;
  stakeIntent?: { status: string | null } | null;
}) {
  if (!isMainnetVisibleBetWager(wager)) {
    return false;
  }

  return (
    wager.executionMode !== "onchain_escrow" ||
    isBetStakeIntentCountableStatus(wager.stakeIntent?.status)
  );
}

function isVisibleMainnetClaim(claim: { createdAt: Date }) {
  return !isWoloMainnet() || claim.createdAt.getTime() >= getWoloMainnetDisplayStartAt().getTime();
}

function resolveExecutionMode(
  executionModes: string[]
): "app_only" | "onchain_escrow" | "mixed" {
  const hasOnchain = executionModes.includes("onchain_escrow");
  const hasAppOnly = executionModes.includes("app_only");

  if (hasOnchain && hasAppOnly) return "mixed";
  if (hasOnchain) return "onchain_escrow";
  return "app_only";
}

function resolveWagerStatus(statuses: string[]): "active" | "won" | "lost" | "void" | "mixed" {
  const unique = Array.from(new Set(statuses.filter(Boolean)));
  if (unique.length === 0) return "active";
  if (unique.length === 1) {
    const status = unique[0];
    if (status === "won" || status === "lost" || status === "void") {
      return status;
    }
    return "active";
  }
  if (unique.includes("active")) return "active";
  return "mixed";
}

function resolveRecoveryState(
  statuses: string[]
): "reconciled" | "pending" | "suspect" | "orphaned" {
  if (statuses.includes("orphaned")) return "orphaned";
  if (statuses.includes("suspect") || statuses.includes("failed")) return "suspect";
  if (
    statuses.includes("awaiting_signature") ||
    statuses.includes("broadcast_submitted") ||
    statuses.includes("verified_unrecorded")
  ) {
    return "pending";
  }
  return "reconciled";
}

function displayUserName(entry: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return entry.inGameName || entry.steamPersonaName || entry.uid || "Unknown";
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { prisma } = gate;
    await refreshRecoverableBetStakeIntents(prisma);

    const unresolvedIntentStatuses = [
      "awaiting_signature",
      "broadcast_submitted",
      "verified_unrecorded",
      "failed",
      "suspect",
      "orphaned",
    ] as const;

    const escrowRuntime = getWoloBetEscrowRuntime();
    const [allClaims, marketRows, settlementSurface, watcherDownloads, walletFriction] = await Promise.all([
      loadPendingWoloClaimsForAdmin(prisma, { take: 500 }),
      prisma.betMarket.findMany({
        where: {
          OR: [
            { status: { in: ["open", "closing", "live"] } },
            { settlementStatus: { not: null } },
            {
              stakeIntents: {
                some: {
                  status: {
                    in: [...unresolvedIntentStatuses],
                  },
                },
              },
            },
          ],
        },
        orderBy: [{ featured: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
        take: 40,
        select: {
          id: true,
          title: true,
          eventLabel: true,
          status: true,
          featured: true,
          leftLabel: true,
          rightLabel: true,
          seedLeftWolo: true,
          seedRightWolo: true,
          winnerSide: true,
          settlementRunId: true,
          settlementStatus: true,
          settlementFailureCode: true,
          settlementDetail: true,
          settlementAttemptedAt: true,
          settlementExecutedAt: true,
          wagers: {
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              userId: true,
              side: true,
              amountWolo: true,
              payoutWolo: true,
              status: true,
              executionMode: true,
              stakeTxHash: true,
              stakeWalletAddress: true,
              stakeLockedAt: true,
              payoutTxHash: true,
              payoutProofUrl: true,
              createdAt: true,
              updatedAt: true,
              stakeIntent: {
                select: {
                  status: true,
                },
              },
              user: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                },
              },
            },
          },
          stakeIntents: {
            where: {
              status: {
                in: [...unresolvedIntentStatuses],
              },
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 24,
            select: {
              id: true,
              userId: true,
              side: true,
              amountWolo: true,
              walletAddress: true,
              status: true,
              stakeTxHash: true,
              errorDetail: true,
              updatedAt: true,
              user: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                },
              },
            },
          },
        },
      }),
      getWoloSettlementSurfaceStatus(),
      loadWatcherDownloadAnalytics(prisma),
      loadBetWalletFrictionRail(prisma),
    ]);

    const visibleClaims = allClaims.filter(isVisibleMainnetClaim);

    const settlementMarketIds = Array.from(
      new Set(
        visibleClaims
          .map((claim) => claim.sourceMarketId)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      )
    );

    const settlementMarkets = settlementMarketIds.length
      ? await prisma.betMarket.findMany({
          where: { id: { in: settlementMarketIds } },
          select: {
            id: true,
            title: true,
            eventLabel: true,
            leftLabel: true,
            rightLabel: true,
            winnerSide: true,
          },
        })
      : [];

    const settlementMarketById = new Map(
      settlementMarkets.map((market) => [market.id, market] as const)
    );

    const settlementRows: AdminUsersRailsPayload["settlementRail"]["rows"] = visibleClaims
      .slice(0, 60)
      .map((claim) => {
      const market =
        typeof claim.sourceMarketId === "number"
          ? settlementMarketById.get(claim.sourceMarketId)
          : null;
      const winnerName =
        market?.winnerSide === "left"
          ? market.leftLabel
          : market?.winnerSide === "right"
            ? market.rightLabel
            : null;

      const payoutTxHash = resolveSettlementTxHash(claim);
      const errorState = refineSettlementErrorForCurrentSurface(
        resolveSettlementError(claim),
        settlementSurface
      );
      const settlementMode = deriveSettlementMode(
        claim.status as "pending" | "claimed" | "rescinded",
        payoutTxHash
      );

      return {
        id: claim.id,
        marketId: claim.sourceMarketId ?? null,
        marketTitle: market?.title ?? null,
        eventLabel: market?.eventLabel ?? null,
        winnerName,
        displayPlayerName: claim.displayPlayerName,
        amountWolo: claim.amountWolo,
        claimKind: claim.claimKind ?? "bet_payout",
        targetScope: claim.targetScope ?? null,
        sourceFounderBonusId: claim.sourceFounderBonusId ?? null,
        sourceGameStatsId: claim.sourceGameStatsId ?? null,
        claimStatus: claim.status as "pending" | "claimed" | "rescinded",
        settlementMode,
        payoutTxHash,
        payoutProofUrl: claim.payoutProofUrl ?? null,
        errorState,
        note: claim.note ?? null,
        payoutAttemptedAt: claim.payoutAttemptedAt?.toISOString() ?? null,
        createdAt: claim.createdAt.toISOString(),
        claimedAt: claim.claimedAt?.toISOString() ?? null,
        rescindedAt: claim.rescindedAt?.toISOString() ?? null,
      };
    });

    const marketRailRows: AdminUsersRailsPayload["marketRail"]["rows"] = marketRows.map((market) => {
      const poolEligibleWagers = market.wagers.filter(
        (wager) => wager.status !== "void" && isCountableWagerRow(wager)
      );
      const leftPoolWolo =
        market.seedLeftWolo +
        poolEligibleWagers
          .filter((wager) => wager.side === "left")
          .reduce((sum, wager) => sum + wager.amountWolo, 0);
      const rightPoolWolo =
        market.seedRightWolo +
        poolEligibleWagers
          .filter((wager) => wager.side === "right")
          .reduce((sum, wager) => sum + wager.amountWolo, 0);

      const unresolvedIntents = market.stakeIntents.map((intent) => ({
        id: intent.id,
        userUid: intent.user.uid,
        displayName: displayUserName(intent.user),
        side: (intent.side === "right" ? "right" : "left") as "left" | "right",
        amountWolo: intent.amountWolo,
        status: intent.status,
        walletAddress: intent.walletAddress ?? null,
        stakeTxHash: intent.stakeTxHash ?? null,
        stakeProofUrl: intent.stakeTxHash ? buildWoloRestTxLookupUrl(intent.stakeTxHash) : null,
        errorDetail: intent.errorDetail ?? null,
        updatedAt: intent.updatedAt.toISOString(),
      }));

      const unresolvedByUserId = new Map<number, typeof unresolvedIntents>();
      for (const intent of unresolvedIntents) {
        const original = market.stakeIntents.find((entry) => entry.id === intent.id);
        if (!original) continue;
        const bucket = unresolvedByUserId.get(original.userId) ?? [];
        bucket.push(intent);
        unresolvedByUserId.set(original.userId, bucket);
      }

      const bettorsBySide = new Map<
        string,
        {
          userId: number;
          userUid: string;
          displayName: string;
          side: "left" | "right";
          totalStakeWolo: number;
          slipCount: number;
          executionModes: string[];
          statuses: string[];
          stakeWalletAddress: string | null;
          stakeTxHash: string | null;
          payoutWolo: number;
          payoutTxHash: string | null;
          payoutProofUrl: string | null;
        }
      >();

      for (const wager of poolEligibleWagers) {
        const side = wager.side === "right" ? "right" : "left";
        const bucketKey = `${wager.userId}:${side}`;
        const existing = bettorsBySide.get(bucketKey);

        if (existing) {
          existing.totalStakeWolo += wager.amountWolo;
          existing.slipCount += 1;
          existing.executionModes.push(wager.executionMode);
          existing.statuses.push(wager.status);
          existing.payoutWolo += wager.payoutWolo ?? 0;
          existing.stakeWalletAddress ||= wager.stakeWalletAddress ?? null;
          existing.stakeTxHash ||= wager.stakeTxHash ?? null;
          existing.payoutTxHash ||= wager.payoutTxHash ?? null;
          existing.payoutProofUrl ||= wager.payoutProofUrl ?? null;
          continue;
        }

        bettorsBySide.set(bucketKey, {
          userId: wager.userId,
          userUid: wager.user.uid,
          displayName: displayUserName(wager.user),
          side,
          totalStakeWolo: wager.amountWolo,
          slipCount: 1,
          executionModes: [wager.executionMode],
          statuses: [wager.status],
          stakeWalletAddress: wager.stakeWalletAddress ?? null,
          stakeTxHash: wager.stakeTxHash ?? null,
          payoutWolo: wager.payoutWolo ?? 0,
          payoutTxHash: wager.payoutTxHash ?? null,
          payoutProofUrl: wager.payoutProofUrl ?? null,
        });
      }

      const leftBettors = Array.from(bettorsBySide.values())
        .filter((bettor) => bettor.side === "left")
        .map((bettor) => {
          const selectedPoolWolo = Math.max(0, leftPoolWolo - bettor.totalStakeWolo);
          const unresolved = unresolvedByUserId.get(bettor.userId) ?? [];

          return {
            userId: bettor.userId,
            userUid: bettor.userUid,
            displayName: bettor.displayName,
            totalStakeWolo: bettor.totalStakeWolo,
            slipCount: bettor.slipCount,
            executionMode: resolveExecutionMode(bettor.executionModes),
            wagerStatus: resolveWagerStatus(bettor.statuses),
            estimatedPayoutWolo: projectReturnWolo(
              bettor.totalStakeWolo,
              selectedPoolWolo,
              rightPoolWolo
            ),
            stakeWalletAddress: bettor.stakeWalletAddress,
            stakeTxHash: bettor.stakeTxHash,
            stakeProofUrl: bettor.stakeTxHash ? buildWoloRestTxLookupUrl(bettor.stakeTxHash) : null,
            payoutWolo: bettor.payoutWolo > 0 ? bettor.payoutWolo : null,
            payoutTxHash: bettor.payoutTxHash,
            payoutProofUrl: bettor.payoutProofUrl,
            recoveryState: resolveRecoveryState(unresolved.map((intent) => intent.status)),
            unresolvedIntentCount: unresolved.length,
          };
        })
        .sort((left, right) => right.totalStakeWolo - left.totalStakeWolo);

      const rightBettors = Array.from(bettorsBySide.values())
        .filter((bettor) => bettor.side === "right")
        .map((bettor) => {
          const selectedPoolWolo = Math.max(0, rightPoolWolo - bettor.totalStakeWolo);
          const unresolved = unresolvedByUserId.get(bettor.userId) ?? [];

          return {
            userId: bettor.userId,
            userUid: bettor.userUid,
            displayName: bettor.displayName,
            totalStakeWolo: bettor.totalStakeWolo,
            slipCount: bettor.slipCount,
            executionMode: resolveExecutionMode(bettor.executionModes),
            wagerStatus: resolveWagerStatus(bettor.statuses),
            estimatedPayoutWolo: projectReturnWolo(
              bettor.totalStakeWolo,
              selectedPoolWolo,
              leftPoolWolo
            ),
            stakeWalletAddress: bettor.stakeWalletAddress,
            stakeTxHash: bettor.stakeTxHash,
            stakeProofUrl: bettor.stakeTxHash ? buildWoloRestTxLookupUrl(bettor.stakeTxHash) : null,
            payoutWolo: bettor.payoutWolo > 0 ? bettor.payoutWolo : null,
            payoutTxHash: bettor.payoutTxHash,
            payoutProofUrl: bettor.payoutProofUrl,
            recoveryState: resolveRecoveryState(unresolved.map((intent) => intent.status)),
            unresolvedIntentCount: unresolved.length,
          };
        })
        .sort((left, right) => right.totalStakeWolo - left.totalStakeWolo);

      return {
        id: market.id,
        title: market.title,
        eventLabel: market.eventLabel,
        status: market.status,
        featured: market.featured,
        leftLabel: market.leftLabel,
        rightLabel: market.rightLabel,
        winnerSide:
          market.winnerSide === "left" || market.winnerSide === "right"
            ? market.winnerSide
            : null,
        leftPoolWolo,
        rightPoolWolo,
        totalPotWolo: leftPoolWolo + rightPoolWolo,
        settlementRunId: market.settlementRunId ?? null,
        settlementStatus: market.settlementStatus ?? null,
        settlementFailureCode: market.settlementFailureCode ?? null,
        settlementDetail: market.settlementDetail ?? null,
        settlementAttemptedAt: market.settlementAttemptedAt?.toISOString() ?? null,
        settlementExecutedAt: market.settlementExecutedAt?.toISOString() ?? null,
        leftBettors,
        rightBettors,
        unresolvedIntents,
      };
    });

    const visibleMarketRailRows = marketRailRows.filter((market) => {
      if (!isWoloMainnet()) return true;
      if (["open", "closing", "live"].includes(market.status)) return true;
      return market.leftBettors.length > 0 || market.rightBettors.length > 0 || market.unresolvedIntents.length > 0;
    });

    const payload: AdminUsersRailsPayload = {
      settlementRail: {
        summary: {
          totalCount: visibleClaims.length,
          totalAmountWolo: visibleClaims.reduce((sum, claim) => sum + claim.amountWolo, 0),
          pendingCount: visibleClaims.filter((claim) => claim.status === "pending").length,
          pendingAmountWolo: visibleClaims
            .filter((claim) => claim.status === "pending")
            .reduce((sum, claim) => sum + claim.amountWolo, 0),
          claimedCount: visibleClaims.filter((claim) => claim.status === "claimed").length,
          claimedAmountWolo: visibleClaims
            .filter((claim) => claim.status === "claimed")
            .reduce((sum, claim) => sum + claim.amountWolo, 0),
          rescindedCount: visibleClaims.filter((claim) => claim.status === "rescinded").length,
          rescindedAmountWolo: visibleClaims
            .filter((claim) => claim.status === "rescinded")
            .reduce((sum, claim) => sum + claim.amountWolo, 0),
          autoSettledCount: settlementRows.filter((row) => row.settlementMode === "auto_settled")
            .length,
          autoSettledAmountWolo: settlementRows
            .filter((row) => row.settlementMode === "auto_settled")
            .reduce((sum, row) => sum + row.amountWolo, 0),
          failedCount: settlementRows.filter(
            (row) =>
              Boolean(row.errorState) &&
              !isAwaitingVerifiedWalletLinkDetail(row.errorState) &&
              !isSettlementUnavailableDetail(row.errorState)
          ).length,
          failedAmountWolo: settlementRows
            .filter(
              (row) =>
                Boolean(row.errorState) &&
                !isAwaitingVerifiedWalletLinkDetail(row.errorState) &&
                !isSettlementUnavailableDetail(row.errorState)
            )
            .reduce((sum, row) => sum + row.amountWolo, 0),
        },
        rows: settlementRows,
      },
      marketRail: {
        summary: {
          betEscrowMode: escrowRuntime.mode,
          onchainEscrowEnabled: escrowRuntime.onchainAllowed,
          onchainEscrowRequired: escrowRuntime.onchainRequired,
          escrowConfigError: escrowRuntime.configError,
          settlementServiceConfigured: settlementSurface.settlementServiceConfigured,
          settlementAuthConfigured: settlementSurface.settlementAuthConfigured,
          settlementPayoutReady: settlementSurface.payoutReady,
          settlementHealthFailureCode: settlementSurface.settlementHealthFailureCode,
          settlementExecutionMode: settlementSurface.payoutExecutionMode,
          groupedRunCapability: settlementSurface.groupedRunCapability,
          escrowVerifyCapability: settlementSurface.escrowVerifyCapability,
          escrowRecentCapability: settlementSurface.escrowRecentCapability,
          settlementSurfaceWarnings: settlementSurface.warnings,
          settlementSurfaceDetail: settlementSurface.detail,
          openCount: visibleMarketRailRows.filter((market) =>
            ["open", "closing", "live"].includes(market.status)
          ).length,
          liveCount: visibleMarketRailRows.filter((market) => market.status === "live").length,
          pendingSettlementCount: visibleMarketRailRows.filter(
            (market) =>
              market.settlementStatus === "pending" || market.settlementStatus === "dry_run"
          ).length,
          failedSettlementCount: visibleMarketRailRows.filter(
            (market) =>
              market.settlementStatus === "failed" || market.settlementStatus === "partial"
          ).length,
          unresolvedIntentCount: visibleMarketRailRows.reduce(
            (sum, market) => sum + market.unresolvedIntents.length,
            0
          ),
          totalPotWolo: visibleMarketRailRows.reduce((sum, market) => sum + market.totalPotWolo, 0),
        },
        rows: visibleMarketRailRows,
      },
      walletFriction,
      watcherDownloads,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load admin command tower rails:", error);
    return NextResponse.json({ detail: "Admin rails unavailable" }, { status: 500 });
  }
}
