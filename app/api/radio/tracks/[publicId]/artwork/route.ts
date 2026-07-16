import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { radioStoragePath } from "@/lib/radioWolo";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  const track = await getPrisma().radioSubmission.findFirst({
    where: { publicId, status: "published", artworkStorageKey: { not: null } },
    select: { artworkStorageKey: true, artworkMediaType: true },
  });
  if (!track?.artworkStorageKey) return NextResponse.json({ detail: "Artwork not found." }, { status: 404 });
  try {
    const bytes = await readFile(radioStoragePath(track.artworkStorageKey));
    return new NextResponse(bytes, { headers: { "Content-Type": track.artworkMediaType || "application/octet-stream", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ detail: "Artwork is unavailable." }, { status: 404 });
  }
}

