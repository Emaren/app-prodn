import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { pendingWoloClaimNameKeys } from "@/lib/pendingWoloClaims";
import { getWoloMainnetDisplayStartAt, isWoloMainnet } from "@/lib/woloChain";
import { WOLO_MAINNET_WALLET_ALIASES } from "@/lib/woloMainnetWallets";
import {
  WOLO_INDEXED_TRANSFER_SOURCE,
  WOLO_MAINNET_BASE_DENOM,
  WOLO_MAINNET_CHAIN_ID,
  buildWoloAddressBook,
} from "@/lib/woloMainnetTransfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WoloTransactionRow = {
  id: string;
  direction: "in" | "out";
  amountWolo: number;
  label: string;
  status: string;
  occurredAt: string;
  txHash: string | null;
  proofUrl?: string | null;
  category:
    | "chain_confirmed"
    | "app_claim"
    | "app_pending"
    | "app_retry"
    | "app_gift"
    | "bet"
    | "challenge";
  network: "mainnet" | "app";
  riskLabel?: string | null;
};

function clampLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(40, Math.max(10, parsed));
}

function clampOffset(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 25_000) : 0;
}

function formatStatus(value: string | null | undefined) {
  return (value || "recorded").replace(/_/g, " ");
}

function opponentLabel(input: {
  userId: number;
  challengerUserId: number;
  challengedUserId: number;
  challenger: { inGameName: string | null; steamPersonaName: string | null; uid: string };
  challenged: { inGameName: string | null; steamPersonaName: string | null; uid: string };
}) {
  const opponent =
    input.userId === input.challengerUserId ? input.challenged : input.challenger;
  return opponent.inGameName || opponent.steamPersonaName || opponent.uid;
}

function pushRow(rows: WoloTransactionRow[], row: WoloTransactionRow | null) {
  if (!row || row.amountWolo <= 0 || !row.occurredAt) return;
  rows.push(row);
}

function transactionRowRank(row: WoloTransactionRow) {
  if (row.id.startsWith("mainnet-transfer-")) return 0;
  if (row.txHash) return 1;
  return 2;
}

function mainnetCutoffWhere() {
  return isWoloMainnet() ? { gte: getWoloMainnetDisplayStartAt() } : undefined;
}

function normalizeAliasMatcher(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function aliasMatchesUser(
  aliasLabel: string,
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  }
) {
  const userKeys = [user.inGameName, user.steamPersonaName, user.uid]
    .map(normalizeAliasMatcher)
    .filter(Boolean);
  if (userKeys.length === 0) return false;

  const aliasSegments = aliasLabel
    .split("/")
    .map(normalizeAliasMatcher)
    .filter(Boolean);
  const fullAlias = normalizeAliasMatcher(aliasLabel);

  return userKeys.some(
    (key) =>
      aliasSegments.includes(key) ||
      fullAlias === key ||
      fullAlias.endsWith(` ${key}`)
  );
}

function profileKeysMatchUser(
  profileNameKeys: readonly string[] | undefined,
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  }
) {
  const aliasKeys = (profileNameKeys || [])
    .map(normalizeAliasMatcher)
    .filter(Boolean);
  if (aliasKeys.length === 0) return false;

  const userKeys = [user.inGameName, user.steamPersonaName, user.uid]
    .map(normalizeAliasMatcher)
    .filter(Boolean);
  return userKeys.some((key) => aliasKeys.includes(key));
}

function walletProfileNameKeys(wallet: (typeof WOLO_MAINNET_WALLET_ALIASES)[number]) {
  return "profileNameKeys" in wallet ? wallet.profileNameKeys : undefined;
}

function normalizeTxHash(value: string | null | undefined) {
  const clean = (value || "").trim().toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(clean) ? clean : null;
}

function claimCategory(claim: {
  status: string;
  errorState?: string | null;
}): WoloTransactionRow["category"] {
  if (claim.status === "claimed") return "app_claim";
  if (/retry|duplicate_tx_hash_corrected/i.test(claim.errorState || "")) return "app_retry";
  return "app_pending";
}

function claimStatusLabel(claim: {
  status: string;
  errorState?: string | null;
  payoutTxHash?: string | null;
}) {
  if (claim.status === "claimed" && claim.payoutTxHash) return "claimed · chain tx recorded";
  if (claim.status === "claimed") return "claimed · app recorded";
  if (/review/i.test(claim.errorState || "")) return "pending · admin review";
  if (/retry|duplicate_tx_hash_corrected/i.test(claim.errorState || "")) {
    return "pending · retry needed";
  }
  return formatStatus(claim.status);
}

function visibleMainnetWagerWhere(userId: number) {
  if (!isWoloMainnet()) return { userId };
  return {
    userId,
    executionMode: "onchain_escrow",
    stakeTxHash: { not: null },
    stakeLockedAt: { gte: getWoloMainnetDisplayStartAt() },
    stakeIntent: {
      is: {
        status: "recorded",
      },
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const offset = clampOffset(request.nextUrl.searchParams.get("offset"));
    const sourceTake = Math.min(25_000, Math.max(offset + limit + 2_000, 5_000));
    const prisma = getPrisma();

    const user = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
      },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const nameKeys = pendingWoloClaimNameKeys([
      user.inGameName,
      user.steamPersonaName,
      user.uid,
    ]);
    const addressBook = await buildWoloAddressBook(prisma).catch(() => new Map());
    const linkedWalletAddresses = new Set<string>();
    if (user.walletAddress?.trim()) {
      linkedWalletAddresses.add(user.walletAddress.trim().toLowerCase());
    }
    for (const entry of addressBook.values()) {
      if (entry.userId === user.id || entry.uid === user.uid) {
        linkedWalletAddresses.add(entry.address.toLowerCase());
      }
    }
    for (const wallet of WOLO_MAINNET_WALLET_ALIASES) {
      if (
        aliasMatchesUser(wallet.label, user) ||
        profileKeysMatchUser(walletProfileNameKeys(wallet), user)
      ) {
        linkedWalletAddresses.add(wallet.address.toLowerCase());
      }
    }
    const linkedWalletAddressList = Array.from(linkedWalletAddresses);

    const [claims, gifts, wagers, stakeIntents, scheduledMatches, indexedTransfers] = await Promise.all([
      prisma.pendingWoloClaim.findMany({
        where: {
          ...(mainnetCutoffWhere() ? { createdAt: mainnetCutoffWhere() } : {}),
          OR: [
            { claimedByUserId: user.id },
            ...(nameKeys.length > 0 ? [{ normalizedPlayerName: { in: nameKeys } }] : []),
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          amountWolo: true,
          claimKind: true,
          displayPlayerName: true,
          status: true,
          sourceMarketId: true,
          createdAt: true,
          updatedAt: true,
          claimedAt: true,
          payoutAttemptedAt: true,
          payoutTxHash: true,
          payoutProofUrl: true,
          errorState: true,
        },
      }),
      prisma.userGift.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          amount: true,
          kind: true,
          status: true,
          acceptedAt: true,
          createdAt: true,
        },
      }),
      prisma.betWager.findMany({
        where: visibleMainnetWagerWhere(user.id),
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          amountWolo: true,
          payoutWolo: true,
          status: true,
          stakeTxHash: true,
          stakeLockedAt: true,
          payoutTxHash: true,
          createdAt: true,
          settledAt: true,
          market: {
            select: {
              title: true,
            },
          },
        },
      }),
      prisma.betStakeIntent.findMany({
        where: {
          userId: user.id,
          ...(mainnetCutoffWhere() ? { updatedAt: mainnetCutoffWhere() } : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          amountWolo: true,
          status: true,
          stakeTxHash: true,
          recordedAt: true,
          verifiedAt: true,
          createdAt: true,
          market: {
            select: {
              title: true,
            },
          },
          wager: {
            select: {
              id: true,
            },
          },
        },
      }),
      prisma.scheduledMatch.findMany({
        where: {
          OR: [{ challengerUserId: user.id }, { challengedUserId: user.id }],
          ...(mainnetCutoffWhere() ? { updatedAt: mainnetCutoffWhere() } : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: sourceTake,
        select: {
          id: true,
          status: true,
          challengerUserId: true,
          challengedUserId: true,
          wagerAmountWolo: true,
          guaranteeAmountWolo: true,
          challengerFundedAt: true,
          challengerFundingTxHash: true,
          challengedFundedAt: true,
          challengedFundingTxHash: true,
          challenger: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
          challenged: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      }),
      linkedWalletAddressList.length
        ? prisma.woloIndexedTransfer.findMany({
            where: {
              chainId: WOLO_MAINNET_CHAIN_ID,
              denom: WOLO_MAINNET_BASE_DENOM,
              source: WOLO_INDEXED_TRANSFER_SOURCE,
              ...(mainnetCutoffWhere() ? { timestamp: mainnetCutoffWhere() } : {}),
              OR: [
                { senderAddress: { in: linkedWalletAddressList } },
                { recipientAddress: { in: linkedWalletAddressList } },
              ],
            },
            orderBy: [{ timestamp: "desc" }, { height: "desc" }, { id: "desc" }],
            take: sourceTake,
            select: {
              id: true,
              txHash: true,
              timestamp: true,
              senderAddress: true,
              recipientAddress: true,
              amountWoloDisplay: true,
              memo: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const claimMarketIds = Array.from(
      new Set(
        claims
          .map((claim) => claim.sourceMarketId)
          .filter((marketId): marketId is number => typeof marketId === "number")
      )
    );
    const claimMarkets = claimMarketIds.length
      ? await prisma.betMarket.findMany({
          where: { id: { in: claimMarketIds } },
          select: {
            id: true,
            title: true,
            eventLabel: true,
          },
        })
      : [];
    const claimMarketById = new Map(claimMarkets.map((market) => [market.id, market] as const));
    const claimTxHashes = Array.from(
      new Set(
        claims
          .map((claim) => normalizeTxHash(claim.payoutTxHash))
          .filter((txHash): txHash is string => Boolean(txHash))
      )
    );
    const duplicateClaimTxHashes = new Set<string>();

    if (claimTxHashes.length > 0) {
      const duplicateClaimRows = await prisma.pendingWoloClaim.findMany({
        where: {
          status: "claimed",
          payoutTxHash: {
            in: Array.from(
              new Set(claimTxHashes.flatMap((txHash) => [txHash, txHash.toLowerCase()]))
            ),
          },
        },
        select: {
          payoutTxHash: true,
        },
        take: 2_000,
      });
      const counts = new Map<string, number>();
      for (const row of duplicateClaimRows) {
        const txHash = normalizeTxHash(row.payoutTxHash);
        if (!txHash) continue;
        counts.set(txHash, (counts.get(txHash) ?? 0) + 1);
      }
      for (const [txHash, count] of counts.entries()) {
        if (count > 1) duplicateClaimTxHashes.add(txHash);
      }
    }

    const rows: WoloTransactionRow[] = [];

    for (const claim of claims) {
      const market =
        typeof claim.sourceMarketId === "number"
          ? claimMarketById.get(claim.sourceMarketId)
          : null;
      const marketLabel = market?.title ? ` · ${market.title}` : "";
      const txHash = normalizeTxHash(claim.payoutTxHash);
      const duplicateRisk = Boolean(txHash && duplicateClaimTxHashes.has(txHash));
      pushRow(rows, {
        id: `claim-${claim.id}`,
        direction: "in",
        amountWolo: claim.amountWolo,
        label: `${claim.status === "claimed" ? "Mainnet payout claim" : "App-side claim"} · ${claim.claimKind.replace(/_/g, " ")}${marketLabel}`,
        status: duplicateRisk
          ? `${claimStatusLabel(claim)} · duplicate review`
          : claimStatusLabel(claim),
        occurredAt: (
          claim.claimedAt ||
          claim.payoutAttemptedAt ||
          claim.updatedAt ||
          claim.createdAt
        ).toISOString(),
        txHash: claim.payoutTxHash,
        proofUrl: claim.payoutProofUrl,
        category: claimCategory(claim),
        network: "mainnet",
        riskLabel: duplicateRisk ? "Duplicate tx group" : null,
      });
    }

    for (const gift of gifts) {
      pushRow(rows, {
        id: `gift-${gift.id}`,
        direction: "in",
        amountWolo: gift.amount ?? 0,
        label: `${gift.kind} grant`,
        status: formatStatus(gift.status),
        occurredAt: (gift.acceptedAt || gift.createdAt).toISOString(),
        txHash: null,
        proofUrl: null,
        category: "app_gift",
        network: "app",
      });
    }

    for (const transfer of indexedTransfers) {
      const senderAddress = transfer.senderAddress.toLowerCase();
      const recipientAddress = transfer.recipientAddress.toLowerCase();
      const incoming = linkedWalletAddresses.has(recipientAddress);
      const counterpartyAddress = incoming ? senderAddress : recipientAddress;
      const counterparty = addressBook.get(counterpartyAddress);
      const counterpartyLabel = counterparty?.label || `${counterpartyAddress.slice(0, 10)}...${counterpartyAddress.slice(-6)}`;
      const memoLabel = transfer.memo?.trim() ? ` · ${transfer.memo.trim().slice(0, 48)}` : "";
      pushRow(rows, {
        id: `mainnet-transfer-${transfer.id}`,
        direction: incoming ? "in" : "out",
        amountWolo: Number(transfer.amountWoloDisplay) || 0,
        label: `Confirmed mainnet transfer · ${incoming ? "from" : "to"} ${counterpartyLabel}${memoLabel}`,
        status: "confirmed",
        occurredAt: transfer.timestamp.toISOString(),
        txHash: transfer.txHash,
        proofUrl: null,
        category: "chain_confirmed",
        network: "mainnet",
      });
    }

    for (const wager of wagers) {
      pushRow(rows, {
        id: `wager-out-${wager.id}`,
        direction: "out",
        amountWolo: wager.amountWolo,
        label: `Bet stake · ${wager.market.title}`,
        status: formatStatus(wager.status),
        occurredAt: (wager.stakeLockedAt || wager.createdAt).toISOString(),
        txHash: wager.stakeTxHash,
        proofUrl: null,
        category: "bet",
        network: wager.stakeTxHash ? "mainnet" : "app",
      });

      pushRow(rows, {
        id: `wager-in-${wager.id}`,
        direction: "in",
        amountWolo: wager.payoutWolo ?? 0,
        label: `Bet payout · ${wager.market.title}`,
        status: wager.payoutTxHash ? "paid" : formatStatus(wager.status),
        occurredAt: (wager.settledAt || wager.createdAt).toISOString(),
        txHash: wager.payoutTxHash,
        proofUrl: null,
        category: "bet",
        network: wager.payoutTxHash ? "mainnet" : "app",
      });
    }

    for (const intent of stakeIntents) {
      if (intent.wager) continue;
      pushRow(rows, {
        id: `stake-intent-${intent.id}`,
        direction: "out",
        amountWolo: intent.amountWolo,
        label: `Stake intent · ${intent.market.title}`,
        status: formatStatus(intent.status),
        occurredAt: (intent.recordedAt || intent.verifiedAt || intent.createdAt).toISOString(),
        txHash: intent.stakeTxHash,
        proofUrl: null,
        category: "bet",
        network: intent.stakeTxHash ? "mainnet" : "app",
      });
    }

    for (const match of scheduledMatches) {
      const amountWolo = match.wagerAmountWolo + match.guaranteeAmountWolo;
      const label = `Scheduled escrow · vs ${opponentLabel({ ...match, userId: user.id })}`;
      if (match.challengerUserId === user.id) {
        pushRow(rows, {
          id: `scheduled-challenger-${match.id}`,
          direction: "out",
          amountWolo,
          label,
          status: formatStatus(match.status),
          occurredAt: match.challengerFundedAt?.toISOString() ?? "",
          txHash: match.challengerFundingTxHash,
          proofUrl: null,
          category: "challenge",
          network: match.challengerFundingTxHash ? "mainnet" : "app",
        });
      }
      if (match.challengedUserId === user.id) {
        pushRow(rows, {
          id: `scheduled-challenged-${match.id}`,
          direction: "out",
          amountWolo,
          label,
          status: formatStatus(match.status),
          occurredAt: match.challengedFundedAt?.toISOString() ?? "",
          txHash: match.challengedFundingTxHash,
          proofUrl: null,
          category: "challenge",
          network: match.challengedFundingTxHash ? "mainnet" : "app",
        });
      }
    }

    rows.sort((left, right) => {
      const timeDiff = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
      if (timeDiff) return timeDiff;
      const rankDiff = transactionRowRank(left) - transactionRowRank(right);
      return rankDiff || right.id.localeCompare(left.id);
    });

    const pageRows = rows.slice(offset, offset + limit);
    const nextOffset = offset + pageRows.length;

    return NextResponse.json({
      rows: pageRows,
      nextOffset,
      hasMore: nextOffset < rows.length,
    });
  } catch (error) {
    console.error("Failed to load WOLO transactions:", error);
    return NextResponse.json({ detail: "WOLO transactions unavailable." }, { status: 500 });
  }
}
