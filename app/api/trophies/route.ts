import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  loadPublicTrophies,
  projectedTrophyBounty,
  seededTrophyDefinition,
} from "@/lib/trophies/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const trophies = await loadPublicTrophies(getPrisma());
    return NextResponse.json({
      trophies: trophies.map((trophy) => ({
        trophyId: trophy.trophyId,
        championTitleId: seededTrophyDefinition(trophy.trophyId)?.definition.id ?? null,
        displayName: trophy.displayName,
        kind: trophy.kind,
        family: trophy.family,
        tier: trophy.tier,
        status: trophy.status,
        currentHolder:
          trophy.currentHolderDisplayName ||
          trophy.currentHolder?.inGameName ||
          trophy.currentHolder?.steamPersonaName ||
          null,
        guardianHolder:
          trophy.guardianHolderDisplayName ||
          trophy.guardianHolder?.inGameName ||
          trophy.guardianHolder?.steamPersonaName ||
          null,
        eligibleNationality: trophy.eligibleNationality,
        eloBandMin: trophy.eloBandMin,
        eloBandMax: trophy.eloBandMax,
        tributeAmountWolo: trophy.tributeAmountWolo,
        bountyGrowthWolo: trophy.bountyGrowthWolo,
        currentBountyWolo: projectedTrophyBounty(trophy),
        chainStatus: trophy.chainStatus,
        nftClassId: trophy.nftClassId,
        nftId: trophy.nftId,
        metadataUri: trophy.nftMetadataUri,
        imageUri: trophy.nftImageUri,
        holderSince: trophy.holderSince?.toISOString() ?? null,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to load public trophies:", error);
    return NextResponse.json({ detail: "Trophy registry unavailable." }, { status: 500 });
  }
}
