import { NextRequest, NextResponse } from "next/server";

import {
  normalizeManagedMediaTarget,
  saveManagedMediaUpload,
} from "@/lib/managedMediaAssets";
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
        { detail: "Sign in to update your business image." },
        { status: 401, headers: HEADERS }
      );
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { uid },
      select: { id: true, uid: true },
    });
    if (!user) {
      return NextResponse.json(
        { detail: "Profile not found." },
        { status: 404, headers: HEADERS }
      );
    }

    const shop = await prisma.marketplaceShop.findFirst({
      where: { ownerUserId: user.id, status: "active" },
      orderBy: { id: "asc" },
    });
    if (!shop) {
      return NextResponse.json(
        { detail: "You do not own an approved Marketplace business." },
        { status: 404, headers: HEADERS }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { detail: "Choose an image file first." },
        { status: 400, headers: HEADERS }
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
      uploadedByUid: user.uid,
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
