import { NextRequest, NextResponse } from "next/server";

import {
  normalizeManagedMediaTarget,
  saveManagedMediaUpload,
} from "@/lib/managedMediaAssets";
import { requireMarketplaceKingdomOwner } from "@/lib/marketplaceOwnerControl";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: NextRequest) {
  try {
    const uid = await getSessionUid(request);
    if (!uid) {
      return NextResponse.json(
        { detail: "Marketplace owner authority required." },
        { status: 403, headers: HEADERS }
      );
    }

    const prisma = getPrisma();
    const owner = await requireMarketplaceKingdomOwner(prisma, uid);
    if (!owner) {
      return NextResponse.json(
        { detail: "Marketplace owner authority required." },
        { status: 403, headers: HEADERS }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const shopPublicId = String(form.get("shopPublicId") || "").trim();

    if (!(file instanceof File) || !shopPublicId) {
      return NextResponse.json(
        { detail: "Choose a business and image file." },
        { status: 400, headers: HEADERS }
      );
    }

    const shop = await prisma.marketplaceShop.findUnique({
      where: { publicId: shopPublicId },
    });
    if (!shop) {
      return NextResponse.json(
        { detail: "Marketplace business not found." },
        { status: 404, headers: HEADERS }
      );
    }

    const target = normalizeManagedMediaTarget(
      `marketplace-shop-${shop.publicId}`
    );
    if (!target) throw new Error("Could not build Marketplace media target.");

    const asset = await saveManagedMediaUpload({
      prisma,
      file,
      kind: "hero",
      target,
      label: `${shop.name} storefront`,
      alt: `${shop.name} business artwork`,
      uploadedByUid: owner.uid,
      active: true,
      replaceActive: true,
    });

    await prisma.marketplaceShop.update({
      where: { id: shop.id },
      data: { heroImageUrl: asset.url },
    });

    return NextResponse.json(
      { ok: true, heroImageUrl: asset.url, asset },
      { status: 201, headers: HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Business image upload failed.",
      },
      { status: 400, headers: HEADERS }
    );
  }
}
