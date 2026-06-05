import type { PrismaClient } from "@/lib/generated/prisma";
import {
  fetchWoloTxMsgSends,
  type WoloMsgSend,
} from "@/lib/woloClaimPayoutGuards";
import {
  WOLO_REST_URL,
  getWoloMainnetDisplayStartAt,
  isWoloMainnet,
  toUwoLoAmount,
} from "@/lib/woloChain";

export type WoloDuplicateTxClassification =
  | "MAINNET_VERIFIED_MULTI_PAYOUT"
  | "MAINNET_SUSPICIOUS_DUPLICATE"
  | "LEGACY_TESTNET_SINGLE_SEND_DUPLICATE"
  | "REST_NOT_FOUND";

export type WoloDuplicateTxClaimRow = {
  claimId: number;
  player: string;
  wallet: string | null;
  amountWolo: number;
  marketId: number | null;
  gameId: number | null;
  proofUrl: string | null;
  txHash: string;
  status: string;
  claimKind: string;
  errorState: string | null;
  note: string | null;
};

export type WoloDuplicateTxGroup = {
  txHash: string;
  classification: WoloDuplicateTxClassification;
  detail: string;
  mainnetFound: boolean;
  testnetFound: boolean;
  mainnetMsgSendCount: number;
  testnetMsgSendCount: number;
  indexedTransferCount: number;
  claimCount: number;
  claims: WoloDuplicateTxClaimRow[];
};

export type WoloIndexedTransferGap = {
  txHash: string;
  claimIds: number[];
  playerNames: string[];
  wallets: string[];
  amountWolo: number;
  mainnetProofUrl: string | null;
  mainnetMsgSendCount: number;
  detail: string;
};

export type WoloDuplicateTxDiagnostics = {
  checkedAt: string;
  mainnetRestUrl: string;
  legacyTestnetRestUrl: string;
  duplicateGroupCount: number;
  suspiciousMainnetCount: number;
  legacyTestnetCount: number;
  verifiedMultiPayoutCount: number;
  restNotFoundCount: number;
  indexedTransferGapCount: number;
  groups: WoloDuplicateTxGroup[];
  indexedTransferGaps: WoloIndexedTransferGap[];
};

type ClaimRow = {
  id: number;
  displayPlayerName: string;
  amountWolo: number;
  status: string;
  claimKind: string;
  sourceMarketId: number | null;
  sourceGameStatsId: number | null;
  claimedByUserId: number | null;
  payoutTxHash: string | null;
  payoutProofUrl: string | null;
  errorState: string | null;
  note: string | null;
  createdAt: Date;
};

function normalizeTxHash(value: string | null | undefined) {
  const clean = (value || "").trim().toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(clean) ? clean : null;
}

function normalizeAddress(value: string | null | undefined) {
  const clean = (value || "").trim().toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(clean) ? clean : null;
}

function legacyTestnetRestUrl() {
  return (
    process.env.WOLO_LEGACY_TESTNET_REST_URL?.trim() ||
    process.env.WOLO_TESTNET_REST_URL?.trim() ||
    "http://127.0.0.1:1317"
  ).replace(/\/+$/, "");
}

function mainnetRestUrl() {
  return WOLO_REST_URL.replace(/\/+$/, "");
}

function sendKey(wallet: string | null | undefined, amountWolo: number) {
  const address = normalizeAddress(wallet);
  if (!address) return null;
  return `${address}|${toUwoLoAmount(amountWolo)}`;
}

function countSendsByKey(sends: WoloMsgSend[]) {
  const counts = new Map<string, number>();
  for (const send of sends) {
    const key = `${send.toAddress}|${send.amountUwolo}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function claimUsesAreCoveredBySends(
  claims: WoloDuplicateTxClaimRow[],
  sends: WoloMsgSend[]
) {
  const available = countSendsByKey(sends);
  const required = new Map<string, number>();
  for (const claim of claims) {
    const key = sendKey(claim.wallet, claim.amountWolo);
    if (!key) return false;
    required.set(key, (required.get(key) ?? 0) + 1);
  }

  return Array.from(required.entries()).every(
    ([key, count]) => (available.get(key) ?? 0) >= count
  );
}

function summarizeClassification(input: {
  classification: WoloDuplicateTxClassification;
  mainnetMsgSendCount: number;
  testnetMsgSendCount: number;
  claimCount: number;
}) {
  switch (input.classification) {
    case "MAINNET_VERIFIED_MULTI_PAYOUT":
      return `Mainnet REST found ${input.mainnetMsgSendCount} matching MsgSend(s) covering ${input.claimCount} claimed rows.`;
    case "MAINNET_SUSPICIOUS_DUPLICATE":
      return `Mainnet REST found this tx, but its ${input.mainnetMsgSendCount} MsgSend(s) do not distinctly cover ${input.claimCount} claimed rows.`;
    case "LEGACY_TESTNET_SINGLE_SEND_DUPLICATE":
      return `Mainnet REST did not find this tx; legacy testnet REST found ${input.testnetMsgSendCount} MsgSend(s). Exclude from mainnet accounting until reviewed.`;
    default:
      return "Neither mainnet nor legacy testnet REST found this tx hash.";
  }
}

function toClaimRows(claims: ClaimRow[], walletByUserId: Map<number, string | null>) {
  return claims.map((claim) => ({
    claimId: claim.id,
    player: claim.displayPlayerName,
    wallet:
      typeof claim.claimedByUserId === "number"
        ? walletByUserId.get(claim.claimedByUserId) ?? null
        : null,
    amountWolo: claim.amountWolo,
    marketId: claim.sourceMarketId,
    gameId: claim.sourceGameStatsId,
    proofUrl: claim.payoutProofUrl,
    txHash: normalizeTxHash(claim.payoutTxHash) || claim.payoutTxHash || "",
    status: claim.status,
    claimKind: claim.claimKind,
    errorState: claim.errorState,
    note: claim.note,
  }));
}

async function walletMapForClaims(prisma: PrismaClient, claims: ClaimRow[]) {
  const userIds = Array.from(
    new Set(
      claims
        .map((claim) => claim.claimedByUserId)
        .filter((id): id is number => typeof id === "number")
    )
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          walletAddress: true,
        },
      })
    : [];
  return new Map(
    users.map((user) => [
      user.id,
      normalizeAddress(user.walletAddress),
    ] as const)
  );
}

export async function loadWoloDuplicateTxDiagnostics(
  prisma: PrismaClient
): Promise<WoloDuplicateTxDiagnostics> {
  const claimedRows = await prisma.pendingWoloClaim.findMany({
    where: {
      status: "claimed",
      payoutTxHash: { not: null },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1_500,
    select: {
      id: true,
      displayPlayerName: true,
      amountWolo: true,
      status: true,
      claimKind: true,
      sourceMarketId: true,
      sourceGameStatsId: true,
      claimedByUserId: true,
      payoutTxHash: true,
      payoutProofUrl: true,
      errorState: true,
      note: true,
      createdAt: true,
    },
  });
  const walletByUserId = await walletMapForClaims(prisma, claimedRows);
  const rowsByTxHash = new Map<string, ClaimRow[]>();

  for (const claim of claimedRows) {
    const txHash = normalizeTxHash(claim.payoutTxHash);
    if (!txHash) continue;
    const bucket = rowsByTxHash.get(txHash) ?? [];
    bucket.push(claim);
    rowsByTxHash.set(txHash, bucket);
  }

  const duplicateGroups: WoloDuplicateTxGroup[] = [];
  const duplicateEntries = Array.from(rowsByTxHash.entries())
    .filter(([, claims]) => claims.length > 1)
    .slice(0, 40);

  for (const [txHash, claims] of duplicateEntries) {
    const claimRows = toClaimRows(claims, walletByUserId);
    const mainnet = await fetchWoloTxMsgSends(txHash);
    const testnet =
      mainnet.found
        ? null
        : await fetchWoloTxMsgSends(txHash, { restUrl: legacyTestnetRestUrl() });
    const txHashVariants = Array.from(new Set([txHash, txHash.toLowerCase()]));
    const indexedTransferCount = await prisma.woloIndexedTransfer.count({
      where: { txHash: { in: txHashVariants } },
    });
    const classification: WoloDuplicateTxClassification =
      mainnet.found && claimUsesAreCoveredBySends(claimRows, mainnet.sends)
        ? "MAINNET_VERIFIED_MULTI_PAYOUT"
        : mainnet.found
          ? "MAINNET_SUSPICIOUS_DUPLICATE"
          : testnet?.found
            ? "LEGACY_TESTNET_SINGLE_SEND_DUPLICATE"
            : "REST_NOT_FOUND";

    duplicateGroups.push({
      txHash,
      classification,
      detail: summarizeClassification({
        classification,
        mainnetMsgSendCount: mainnet.sends.length,
        testnetMsgSendCount: testnet?.sends.length ?? 0,
        claimCount: claims.length,
      }),
      mainnetFound: mainnet.found,
      testnetFound: Boolean(testnet?.found),
      mainnetMsgSendCount: mainnet.sends.length,
      testnetMsgSendCount: testnet?.sends.length ?? 0,
      indexedTransferCount,
      claimCount: claims.length,
      claims: claimRows,
    });
  }

  const mainnetClaimRows = claimedRows.filter((claim) => {
    if (!isWoloMainnet()) return true;
    return claim.createdAt.getTime() >= getWoloMainnetDisplayStartAt().getTime();
  });
  const transferGapCandidates = Array.from(
    new Set(
      mainnetClaimRows
        .map((claim) => normalizeTxHash(claim.payoutTxHash))
        .filter((txHash): txHash is string => Boolean(txHash))
    )
  ).slice(0, 80);
  const indexedTransferGaps: WoloIndexedTransferGap[] = [];

  for (const txHash of transferGapCandidates) {
    const txHashVariants = Array.from(new Set([txHash, txHash.toLowerCase()]));
    const indexedCount = await prisma.woloIndexedTransfer.count({
      where: { txHash: { in: txHashVariants } },
    });
    if (indexedCount > 0) continue;

    const mainnet = await fetchWoloTxMsgSends(txHash);
    if (!mainnet.found || !mainnet.success || mainnet.sends.length === 0) continue;

    const txClaims = mainnetClaimRows.filter(
      (claim) => normalizeTxHash(claim.payoutTxHash) === txHash
    );
    const claimRows = toClaimRows(txClaims, walletByUserId);
    indexedTransferGaps.push({
      txHash,
      claimIds: claimRows.map((claim) => claim.claimId),
      playerNames: Array.from(new Set(claimRows.map((claim) => claim.player))),
      wallets: Array.from(
        new Set(
          claimRows
            .map((claim) => normalizeAddress(claim.wallet))
            .filter((wallet): wallet is string => Boolean(wallet))
        )
      ),
      amountWolo: claimRows.reduce((sum, claim) => sum + claim.amountWolo, 0),
      mainnetProofUrl: mainnet.proofUrl,
      mainnetMsgSendCount: mainnet.sends.length,
      detail:
        "Direct mainnet REST proves this MsgSend tx exists, but wolo_indexed_transfers has no row. Rerun/expand mainnet transfer backfill and inspect address-book coverage.",
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    mainnetRestUrl: mainnetRestUrl(),
    legacyTestnetRestUrl: legacyTestnetRestUrl(),
    duplicateGroupCount: duplicateGroups.length,
    suspiciousMainnetCount: duplicateGroups.filter(
      (group) => group.classification === "MAINNET_SUSPICIOUS_DUPLICATE"
    ).length,
    legacyTestnetCount: duplicateGroups.filter(
      (group) => group.classification === "LEGACY_TESTNET_SINGLE_SEND_DUPLICATE"
    ).length,
    verifiedMultiPayoutCount: duplicateGroups.filter(
      (group) => group.classification === "MAINNET_VERIFIED_MULTI_PAYOUT"
    ).length,
    restNotFoundCount: duplicateGroups.filter((group) => group.classification === "REST_NOT_FOUND")
      .length,
    indexedTransferGapCount: indexedTransferGaps.length,
    groups: duplicateGroups,
    indexedTransferGaps,
  };
}
