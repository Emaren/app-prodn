import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  WOLO_BASE_DENOM,
  WOLO_REST_URL,
  buildWoloRestTxLookupUrl,
  toUwoLoAmount,
} from "@/lib/woloChain";

type ClaimGuardDb = Pick<PrismaClient, "pendingWoloClaim" | "user"> | Prisma.TransactionClient;

export type WoloMsgSend = {
  index: number;
  fromAddress: string;
  toAddress: string;
  amountUwolo: string;
  denom: string;
};

export type WoloTxMsgSendLookup = {
  txHash: string;
  restUrl: string;
  proofUrl: string;
  found: boolean;
  success: boolean;
  statusCode: number | null;
  detail: string | null;
  sends: WoloMsgSend[];
};

export type ClaimPayoutGuardEntry = {
  key: string;
  claimId?: number | null;
  txHash: string;
  toAddress: string;
  amountWolo: number;
};

export type ClaimPayoutGuardResult = {
  key: string;
  claimId: number | null;
  txHash: string;
  ok: boolean;
  failureCode: string | null;
  detail: string | null;
  proofUrl: string | null;
  matchingSendCount: number;
  totalSendCount: number;
  existingClaimCount: number;
};

type ExistingClaimUse = {
  id: number;
  txHash: string;
  toAddress: string | null;
  amountWolo: number;
};

function normalizeTxHash(value: string | null | undefined) {
  const clean = (value || "").trim().toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(clean) ? clean : null;
}

function normalizeAddress(value: string | null | undefined) {
  const clean = (value || "").trim().toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(clean) ? clean : null;
}

function normalizedRestUrl(value: string | null | undefined = WOLO_REST_URL) {
  return (value || WOLO_REST_URL).trim().replace(/\/+$/, "");
}

function buildLookupUrl(restUrl: string, txHash: string) {
  return `${normalizedRestUrl(restUrl)}/cosmos/tx/v1beta1/txs/${txHash}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function getStringField(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseTxCode(payload: unknown) {
  const root = asRecord(payload);
  const txResponse = asRecord(root?.tx_response);
  const rawCode = txResponse?.code;
  if (typeof rawCode === "number") return rawCode;
  if (typeof rawCode === "string") {
    const parsed = Number.parseInt(rawCode, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function extractTxMessages(payload: unknown) {
  const root = asRecord(payload);
  const rootTx = asRecord(root?.tx);
  const rootBody = asRecord(rootTx?.body);
  const response = asRecord(root?.tx_response);
  const responseTx = asRecord(response?.tx);
  const responseBody = asRecord(responseTx?.body);
  const rootMessages = asRecordArray(rootBody?.messages);
  return rootMessages.length > 0 ? rootMessages : asRecordArray(responseBody?.messages);
}

function extractMsgSends(payload: unknown): WoloMsgSend[] {
  const sends: WoloMsgSend[] = [];

  for (const [index, message] of extractTxMessages(payload).entries()) {
    if (getStringField(message, "@type") !== "/cosmos.bank.v1beta1.MsgSend") continue;

    const toAddress = normalizeAddress(getStringField(message, "to_address"));
    const fromAddress = normalizeAddress(getStringField(message, "from_address"));
    const coin = asRecordArray(message.amount).find(
      (entry) => getStringField(entry, "denom") === WOLO_BASE_DENOM
    );
    const amountUwolo = getStringField(coin, "amount");
    if (!toAddress || !fromAddress || !/^[0-9]+$/.test(amountUwolo)) continue;

    sends.push({
      index,
      fromAddress,
      toAddress,
      amountUwolo,
      denom: WOLO_BASE_DENOM,
    });
  }

  return sends;
}

function sendKey(address: string | null | undefined, amountWolo: number) {
  const toAddress = normalizeAddress(address);
  if (!toAddress) return null;
  return `${toAddress}|${toUwoLoAmount(amountWolo)}`;
}

function countByKey(values: string[]) {
  const result = new Map<string, number>();
  for (const value of values) {
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return result;
}

export async function fetchWoloTxMsgSends(
  txHash: string,
  options?: { restUrl?: string | null }
): Promise<WoloTxMsgSendLookup> {
  const normalizedHash = normalizeTxHash(txHash);
  const restUrl = normalizedRestUrl(options?.restUrl);
  const proofUrl =
    restUrl === normalizedRestUrl(WOLO_REST_URL) && normalizedHash
      ? buildWoloRestTxLookupUrl(normalizedHash) || buildLookupUrl(restUrl, normalizedHash)
      : normalizedHash
        ? buildLookupUrl(restUrl, normalizedHash)
        : restUrl;

  if (!normalizedHash) {
    return {
      txHash: (txHash || "").trim(),
      restUrl,
      proofUrl,
      found: false,
      success: false,
      statusCode: null,
      detail: "Invalid WOLO tx hash.",
      sends: [],
    };
  }

  const response = await fetch(buildLookupUrl(restUrl, normalizedHash), {
    cache: "no-store",
    headers: { accept: "application/json" },
  }).catch(() => null);

  if (!response) {
    return {
      txHash: normalizedHash,
      restUrl,
      proofUrl,
      found: false,
      success: false,
      statusCode: null,
      detail: "WOLO REST lookup failed.",
      sends: [],
    };
  }

  if (!response.ok) {
    return {
      txHash: normalizedHash,
      restUrl,
      proofUrl,
      found: false,
      success: false,
      statusCode: response.status,
      detail: `WOLO REST lookup returned HTTP ${response.status}.`,
      sends: [],
    };
  }

  const payload = await response.json().catch(() => null);
  if (!payload) {
    return {
      txHash: normalizedHash,
      restUrl,
      proofUrl,
      found: false,
      success: false,
      statusCode: response.status,
      detail: "WOLO REST lookup returned an unstructured tx payload.",
      sends: [],
    };
  }

  const code = parseTxCode(payload);
  const success = code === 0;
  return {
    txHash: normalizedHash,
    restUrl,
    proofUrl,
    found: true,
    success,
    statusCode: response.status,
    detail: success ? null : `WOLO tx failed with code ${code}.`,
    sends: success ? extractMsgSends(payload) : [],
  };
}

export async function validateDistinctClaimPayoutTxBatch(
  prisma: ClaimGuardDb,
  entries: ClaimPayoutGuardEntry[]
): Promise<Map<string, ClaimPayoutGuardResult>> {
  const normalizedEntries = entries
    .map((entry) => ({
      ...entry,
      txHash: normalizeTxHash(entry.txHash),
      toAddress: normalizeAddress(entry.toAddress),
    }))
    .filter((entry) => entry.txHash && entry.toAddress && entry.amountWolo > 0);
  const results = new Map<string, ClaimPayoutGuardResult>();
  const byTxHash = new Map<string, typeof normalizedEntries>();

  for (const original of entries) {
    if (!normalizeTxHash(original.txHash)) {
      results.set(original.key, {
        key: original.key,
        claimId: original.claimId ?? null,
        txHash: original.txHash,
        ok: false,
        failureCode: "INVALID_TX_HASH",
        detail: "WOLO payout guard rejected an invalid tx hash.",
        proofUrl: null,
        matchingSendCount: 0,
        totalSendCount: 0,
        existingClaimCount: 0,
      });
    } else if (!normalizeAddress(original.toAddress)) {
      results.set(original.key, {
        key: original.key,
        claimId: original.claimId ?? null,
        txHash: normalizeTxHash(original.txHash) || original.txHash,
        ok: false,
        failureCode: "INVALID_RECIPIENT_WALLET",
        detail: "WOLO payout guard rejected an invalid recipient wallet.",
        proofUrl: buildWoloRestTxLookupUrl(original.txHash),
        matchingSendCount: 0,
        totalSendCount: 0,
        existingClaimCount: 0,
      });
    } else if (original.amountWolo <= 0) {
      results.set(original.key, {
        key: original.key,
        claimId: original.claimId ?? null,
        txHash: normalizeTxHash(original.txHash) || original.txHash,
        ok: false,
        failureCode: "INVALID_AMOUNT",
        detail: "WOLO payout guard rejected a non-positive amount.",
        proofUrl: buildWoloRestTxLookupUrl(original.txHash),
        matchingSendCount: 0,
        totalSendCount: 0,
        existingClaimCount: 0,
      });
    }
  }

  for (const entry of normalizedEntries) {
    const txHash = entry.txHash as string;
    const bucket = byTxHash.get(txHash) ?? [];
    bucket.push(entry);
    byTxHash.set(txHash, bucket);
  }

  for (const [txHash, txEntries] of byTxHash.entries()) {
    const lookup = await fetchWoloTxMsgSends(txHash);
    const baseFailure = !lookup.found
      ? {
          code: "TX_NOT_FOUND",
          detail: "WOLO payout tx was not found on configured mainnet REST.",
        }
      : !lookup.success
        ? {
            code: "TX_FAILED",
            detail: lookup.detail || "WOLO payout tx was not successful.",
          }
        : lookup.sends.length === 0
          ? {
              code: "NO_MSG_SEND",
              detail: "WOLO payout tx contains no distinct bank MsgSend.",
            }
          : null;

    const incomingIds = txEntries
      .map((entry) => entry.claimId)
      .filter((id): id is number => typeof id === "number");
    const txHashVariants = Array.from(new Set([txHash, txHash.toLowerCase()]));
    const existingRows = await prisma.pendingWoloClaim.findMany({
      where: {
        status: "claimed",
        payoutTxHash: { in: txHashVariants },
        ...(incomingIds.length > 0 ? { id: { notIn: incomingIds } } : {}),
      },
      select: {
        id: true,
        amountWolo: true,
        claimedByUserId: true,
      },
    });
    const userIds = Array.from(
      new Set(
        existingRows
          .map((row) => row.claimedByUserId)
          .filter((id): id is number => typeof id === "number")
      )
    );
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, walletAddress: true },
        })
      : [];
    const walletByUserId = new Map(
      users.map((user) => [user.id, normalizeAddress(user.walletAddress)] as const)
    );
    const existingUses: ExistingClaimUse[] = existingRows.map((row) => ({
      id: row.id,
      txHash,
      amountWolo: row.amountWolo,
      toAddress:
        typeof row.claimedByUserId === "number"
          ? walletByUserId.get(row.claimedByUserId) ?? null
          : null,
    }));
    const existingKeys = existingUses
      .map((row) => sendKey(row.toAddress, row.amountWolo))
      .filter((key): key is string => Boolean(key));
    const incomingKeys = txEntries
      .map((entry) => sendKey(entry.toAddress, entry.amountWolo))
      .filter((key): key is string => Boolean(key));
    const requiredByKey = countByKey([...existingKeys, ...incomingKeys]);
    const availableByKey = countByKey(
      lookup.sends.map((send) => `${send.toAddress}|${send.amountUwolo}`)
    );
    const missingExistingWalletCount = existingUses.filter((row) => !row.toAddress).length;
    const anyPairOverAllocated = Array.from(requiredByKey.entries()).some(
      ([key, requiredCount]) => (availableByKey.get(key) ?? 0) < requiredCount
    );

    for (const entry of txEntries) {
      const key = sendKey(entry.toAddress, entry.amountWolo);
      const matchingSendCount = key ? availableByKey.get(key) ?? 0 : 0;
      const failure =
        baseFailure ||
        (missingExistingWalletCount > 0
          ? {
              code: "EXISTING_CLAIM_WALLET_UNVERIFIED",
              detail:
                "WOLO payout tx is already used by a claimed row without a verifiable recipient wallet. Admin review required before reusing this tx.",
            }
          : null) ||
        (anyPairOverAllocated
          ? {
              code: "DUPLICATE_TX_GUARD",
              detail:
                "WOLO payout tx does not contain enough distinct matching MsgSends for every claimed row using this tx hash.",
            }
          : null);

      results.set(entry.key, {
        key: entry.key,
        claimId: entry.claimId ?? null,
        txHash,
        ok: !failure,
        failureCode: failure?.code ?? null,
        detail: failure?.detail ?? null,
        proofUrl: lookup.proofUrl,
        matchingSendCount,
        totalSendCount: lookup.sends.length,
        existingClaimCount: existingRows.length,
      });
    }
  }

  return results;
}

export async function validateDistinctClaimPayoutTx(
  prisma: ClaimGuardDb,
  entry: ClaimPayoutGuardEntry
) {
  const results = await validateDistinctClaimPayoutTxBatch(prisma, [entry]);
  return results.get(entry.key) ?? {
    key: entry.key,
    claimId: entry.claimId ?? null,
    txHash: entry.txHash,
    ok: false,
    failureCode: "PAYOUT_GUARD_MISSING_RESULT",
    detail: "WOLO payout guard did not produce a validation result.",
    proofUrl: null,
    matchingSendCount: 0,
    totalSendCount: 0,
    existingClaimCount: 0,
  };
}
