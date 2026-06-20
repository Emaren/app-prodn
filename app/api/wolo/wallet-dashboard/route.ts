import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS } from "@/lib/woloMainnetWallets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function normalizeWoloAddress(value: string | null | undefined) {
  const clean = (value || "").trim().toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(clean) ? clean : null;
}

function clampLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(75, parsed));
}

function addressLabel(address: string | null | undefined) {
  if (!address) return null;
  return WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS[address.toLowerCase()] ?? null;
}

function amountNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function GET(request: NextRequest) {
  const address = normalizeWoloAddress(request.nextUrl.searchParams.get("address"));
  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));

  if (!address) {
    return NextResponse.json(
      { ok: false, detail: "Choose a valid WoloChain address." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const prisma = getPrisma();

    const [transfers, trophies] = await Promise.all([
      prisma.woloIndexedTransfer.findMany({
        where: {
          OR: [
            { senderAddress: address },
            { recipientAddress: address },
          ],
        },
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        take: limit,
      }),
      prisma.trophy.findMany({
        where: {
          OR: [
            { currentHolderWoloAddress: address },
            { chainOwnerAddress: address },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 50,
      }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        address,
        generatedAt: new Date().toISOString(),
        transfers: transfers.map((row) => {
          const incoming = row.recipientAddress.toLowerCase() === address;
          return {
            id: row.id,
            txHash: row.txHash,
            transferIndex: row.transferIndex,
            chainId: row.chainId,
            height: row.height.toString(),
            timestamp: row.timestamp.toISOString(),
            direction: incoming ? "incoming" : "outgoing",
            senderAddress: row.senderAddress,
            senderLabel: addressLabel(row.senderAddress),
            recipientAddress: row.recipientAddress,
            recipientLabel: addressLabel(row.recipientAddress),
            amountUwolo: row.amountUwolo.toString(),
            amountWolo: amountNumber(row.amountWoloDisplay),
            denom: row.denom,
            memo: row.memo,
            source: row.source,
          };
        }),
        trophies: trophies.map((trophy) => ({
          id: trophy.id,
          trophyId: trophy.trophyId,
          displayName: trophy.displayName,
          kind: trophy.kind,
          family: trophy.family,
          tier: trophy.tier,
          status: trophy.status,
          currentHolderDisplayName: trophy.currentHolderDisplayName,
          currentHolderWoloAddress: trophy.currentHolderWoloAddress,
          tributeAmountWolo: trophy.tributeAmountWolo,
          currentBountyWolo: trophy.currentBountyWolo,
          bountyGrowthWolo: trophy.bountyGrowthWolo,
          nftClassId: trophy.nftClassId,
          nftId: trophy.nftId,
          metadataUri: trophy.nftMetadataUri,
          imageUri: trophy.nftImageUri,
          chainStatus: trophy.chainStatus,
          chainOwnerAddress: trophy.chainOwnerAddress,
          holderSince: trophy.holderSince?.toISOString() ?? null,
          updatedAt: trophy.updatedAt.toISOString(),
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Wallet dashboard unavailable.";
    return NextResponse.json(
      { ok: false, detail },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
