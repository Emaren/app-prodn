import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import {
  loadPublicTrophies,
  projectedTrophyBounty,
  projectTrophyChallengeAuthority,
  seededTrophyDefinition,
} from "@/lib/trophies/service";
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

function addressesMatch(
  value: string | null | undefined,
  address: string
) {
  return (value || "").trim().toLowerCase() === address;
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

    const [transfers, publicTrophies] = await Promise.all([
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
      loadPublicTrophies(prisma),
    ]);

    const trophies = publicTrophies
      .flatMap((trophy) => {
        const authority = projectTrophyChallengeAuthority(trophy);
        const currentHolderWoloAddress = authority.custodyConsistent
          ? authority.currentHolderWoloAddress
          : null;
        const guardianHolderWoloAddress = authority.custodyConsistent
          ? authority.guardianHolderWoloAddress
          : null;
        const appCustodyRole =
          addressesMatch(currentHolderWoloAddress, address)
            ? ("holder" as const)
            : addressesMatch(guardianHolderWoloAddress, address)
              ? ("guardian" as const)
              : null;
        const isChainOwner = addressesMatch(trophy.chainOwnerAddress, address);

        if (!appCustodyRole && !isChainOwner) {
          return [];
        }

        const seed = seededTrophyDefinition(trophy.trophyId);
        const definition = seed?.definition ?? null;
        const assetKind = trophy.kind === "artifact" ? "artifact" : "belt";
        const currentHolderDisplayName =
          authority.custodyConsistent && authority.currentHolderUserId !== null
            ? authority.currentHolderDisplayName ||
              trophy.currentHolder?.inGameName ||
              trophy.currentHolder?.steamPersonaName ||
              null
            : null;
        const guardianHolderDisplayName =
          authority.custodyConsistent && authority.guardianHolderUserId !== null
            ? authority.guardianHolderDisplayName ||
              trophy.guardianHolder?.inGameName ||
              trophy.guardianHolder?.steamPersonaName ||
              null
            : null;

        return [{
          id: trophy.id,
          trophyId: trophy.trophyId,
          displayName: trophy.displayName,
          kind: trophy.kind,
          family: trophy.family,
          tier: trophy.tier,
          status: authority.status,
          currentHolderDisplayName,
          currentHolderWoloAddress,
          guardianHolderDisplayName,
          guardianHolderWoloAddress,
          appCustodyRole,
          isChainOwner,
          custodyConsistent: authority.custodyConsistent,
          tributeAmountWolo: trophy.tributeAmountWolo,
          currentBountyWolo: projectedTrophyBounty(trophy),
          bountyGrowthWolo: trophy.bountyGrowthWolo,
          nftClassId: trophy.nftClassId,
          nftId: trophy.nftId,
          metadataUri: trophy.nftMetadataUri,
          imageUri: managedMediaPublicUrl(
            assetKind,
            definition?.id || trophy.trophyId,
            trophy.nftImageUri || definition?.assetUrl
          ),
          routeHref: definition?.routeHref || "/champions",
          chainStatus: trophy.chainStatus,
          chainOwnerAddress: trophy.chainOwnerAddress,
          holderSince: trophy.holderSince?.toISOString() ?? null,
          updatedAt: trophy.updatedAt.toISOString(),
        }];
      })
      .sort((left, right) => {
        const custodyOrder =
          Number(Boolean(right.appCustodyRole)) -
          Number(Boolean(left.appCustodyRole));

        if (custodyOrder !== 0) {
          return custodyOrder;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, 50);

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
        trophies,
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
