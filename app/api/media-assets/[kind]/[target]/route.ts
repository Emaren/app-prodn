import { NextRequest, NextResponse } from "next/server";

import { mediaFallbackUrl, resolveManagedMediaUrl } from "@/lib/managedMediaAssets";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToInternalAsset(url: string) {
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: url.startsWith("/") && !url.startsWith("//") ? url : "/",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; target: string }> }
) {
  const { kind, target } = await params;
  const fallback = request.nextUrl.searchParams.get("fallback");

  try {
    const url = await resolveManagedMediaUrl(getPrisma(), kind, target, fallback);
    return redirectToInternalAsset(url);
  } catch (error) {
    console.warn("Managed media redirect failed:", error);
    const url = mediaFallbackUrl(kind, target, fallback) || "/";
    return redirectToInternalAsset(url);
  }
}
