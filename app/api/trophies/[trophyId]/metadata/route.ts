import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  ensureTrophySeedData,
  projectedTrophyBounty,
  seededTrophyDefinition,
} from "@/lib/trophies/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ trophyId: string }> }
) {
  const { trophyId } = await context.params;
  const prisma = getPrisma();
  await ensureTrophySeedData(prisma);
  const trophy = await prisma.trophy.findUnique({
    where: { trophyId },
    include: {
      currentHolder: {
        select: { uid: true, inGameName: true, steamPersonaName: true },
      },
    },
  });
  if (!trophy) {
    return NextResponse.json({ detail: "Trophy not found." }, { status: 404 });
  }

  const seed = seededTrophyDefinition(trophy.trophyId);
  const definition = seed?.definition;
  const currentHolder =
    trophy.currentHolderDisplayName ||
    trophy.currentHolder?.inGameName ||
    trophy.currentHolder?.steamPersonaName ||
    null;
  const image = trophy.nftImageUri || definition?.assetUrl || null;
  const externalUrl = definition?.routeHref
    ? `https://aoe2war.com${definition.routeHref}`
    : "https://aoe2war.com/champions";

  return NextResponse.json({
    name: trophy.displayName,
    description:
      definition?.detailLore ||
      `${trophy.displayName} is an AoE2WAR War Trophy governed by verified challenge and replay proof.`,
    image,
    external_url: externalUrl,
    attributes: [
      { trait_type: "Kind", value: trophy.kind },
      { trait_type: "Family", value: trophy.family },
      { trait_type: "Tier", value: trophy.tier || "Open" },
      { trait_type: "Status", value: trophy.status },
      { trait_type: "Eligible Nationality", value: trophy.eligibleNationality || "Open" },
      {
        trait_type: "ELO Band",
        value:
          trophy.eloBandMin !== null || trophy.eloBandMax !== null
            ? `${trophy.eloBandMin ?? "open"}-${trophy.eloBandMax ?? "open"}`
            : "Open",
      },
      { trait_type: "Tribute Per Day", value: trophy.tributeAmountWolo },
      { trait_type: "Bounty Growth Per Day", value: trophy.bountyGrowthWolo },
      { trait_type: "Current Estimated Bounty", value: projectedTrophyBounty(trophy) },
      { trait_type: "Current Holder", value: currentHolder || "Vacant" },
      { trait_type: "Chain Status", value: trophy.chainStatus },
    ],
    trophy_id: trophy.trophyId,
    family: trophy.family,
    kind: trophy.kind,
    tribute_per_day: trophy.tributeAmountWolo,
    bounty_growth_per_day: trophy.bountyGrowthWolo,
    current_holder: currentHolder,
    app_status: trophy.status,
    chain_status: trophy.chainStatus,
    nft_class_id: trophy.nftClassId,
    nft_id: trophy.nftId,
    holder_since: trophy.holderSince?.toISOString() ?? null,
    ownership_note:
      "App-side custody is authoritative until the WoloChain Warbound trophy module is enabled.",
  });
}
