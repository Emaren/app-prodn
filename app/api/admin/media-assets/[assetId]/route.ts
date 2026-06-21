import { unlink } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanBasePath(value: string | null | undefined) {
  const cleaned = String(value || "").trim();

  if (!cleaned || !cleaned.startsWith("/") || cleaned.startsWith("//")) {
    return "/uploads/managed-assets";
  }

  return cleaned.replace(/\/+$/, "") || "/uploads/managed-assets";
}

function uploadRoot() {
  const configured = String(process.env.MANAGED_MEDIA_UPLOAD_DIR || "").trim();

  if (configured) {
    return path.resolve(configured);
  }

  return path.join(process.cwd(), "public", "uploads", "managed-assets");
}

function localFilePathForManagedUrl(url: string | null | undefined) {
  const value = String(url || "").trim();
  const basePath = cleanBasePath(process.env.MANAGED_MEDIA_PUBLIC_BASE_PATH);

  if (!value.startsWith(`${basePath}/`)) {
    return null;
  }

  const relative = decodeURIComponent(value.slice(basePath.length + 1));

  if (!relative || relative.includes("..") || path.isAbsolute(relative)) {
    return null;
  }

  const root = uploadRoot();
  const fullPath = path.resolve(root, relative);

  if (!fullPath.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  return fullPath;
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> }
) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  const params = await context.params;
  const assetId = Number(params.assetId);

  if (!Number.isInteger(assetId) || assetId < 1) {
    return NextResponse.json(
      { detail: "Invalid media asset id." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const existing = await gate.prisma.managedMediaAsset.findUnique({
    where: { id: assetId },
  });

  if (!existing) {
    return NextResponse.json(
      { detail: "Media asset not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  await gate.prisma.managedMediaAsset.delete({
    where: { id: assetId },
  });

  let removedFile = false;

  const sameUrlCount = existing.url
    ? await gate.prisma.managedMediaAsset.count({
        where: { url: existing.url },
      })
    : 0;

  const filePath = sameUrlCount === 0 ? localFilePathForManagedUrl(existing.url) : null;

  if (filePath) {
    try {
      await unlink(filePath);
      removedFile = true;
    } catch {
      removedFile = false;
    }
  }

  return NextResponse.json(
    {
      ok: true,
      deletedAssetId: assetId,
      removedFile,
      keptFileBecauseStillReferenced: sameUrlCount > 0,
    },
    { headers: NO_STORE_HEADERS }
  );
}
