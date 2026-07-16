import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { radioStoragePath } from "@/lib/radioWolo";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  const track = await getPrisma().radioSubmission.findFirst({
    where: { publicId, status: "published" },
    select: { audioStorageKey: true, audioMediaType: true },
  });
  if (!track) return NextResponse.json({ detail: "Track not found." }, { status: 404 });
  try {
    const bytes = await readFile(radioStoragePath(track.audioStorageKey));
    return new NextResponse(bytes, { headers: { "Content-Type": track.audioMediaType, "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ detail: "Track media is unavailable." }, { status: 404 });
  }
}

