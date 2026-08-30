import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";

import { requireRadioWoloOperator } from "@/lib/radioWoloOperator";
import { radioStoragePath } from "@/lib/radioWolo";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; asset: string }> }) {
  const gate = await requireRadioWoloOperator(request);
  if ("error" in gate) return gate.error;
  const { id: idValue, asset } = await context.params;
  const id = Number(idValue);
  if (!Number.isSafeInteger(id) || !["audio", "artwork"].includes(asset)) return NextResponse.json({ detail: "Media not found." }, { status: 404 });
  const submission = await gate.prisma.radioSubmission.findUnique({ where: { id }, select: { audioStorageKey: true, audioMediaType: true, artworkStorageKey: true, artworkMediaType: true } });
  const storageKey = asset === "audio" ? submission?.audioStorageKey : submission?.artworkStorageKey;
  const mediaType = asset === "audio" ? submission?.audioMediaType : submission?.artworkMediaType;
  if (!storageKey) return NextResponse.json({ detail: "Media not found." }, { status: 404 });
  try { const bytes = await readFile(radioStoragePath(storageKey)); return new NextResponse(bytes, { headers: { "Content-Type": mediaType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
  catch { return NextResponse.json({ detail: "Media is unavailable." }, { status: 404 }); }
}
