import { NextRequest, NextResponse } from "next/server";

import {
  normalizeUniversalLanguage,
  type UniversalLanguageCode,
} from "@/lib/i18n/languages";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findViewer(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) return null;

  return getPrisma().user.findUnique({
    where: { uid: sessionUid },
    select: { id: true, preferredLanguage: true },
  });
}

export async function GET(request: NextRequest) {
  const viewer = await findViewer(request);
  if (!viewer) {
    return NextResponse.json({ detail: "No active session" }, { status: 401 });
  }

  return NextResponse.json(
    { language: normalizeUniversalLanguage(viewer.preferredLanguage) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PUT(request: NextRequest) {
  const viewer = await findViewer(request);
  if (!viewer) {
    return NextResponse.json({ detail: "No active session" }, { status: 401 });
  }

  const input = (await request.json().catch(() => ({}))) as {
    language?: UniversalLanguageCode | null;
  };
  const language = input.language === null ? null : normalizeUniversalLanguage(input.language);

  if (input.language !== null && !language) {
    return NextResponse.json({ detail: "Choose a supported language." }, { status: 400 });
  }

  const updated = await getPrisma().user.update({
    where: { id: viewer.id },
    data: { preferredLanguage: language },
    select: { preferredLanguage: true },
  });

  return NextResponse.json({
    language: normalizeUniversalLanguage(updated.preferredLanguage),
  });
}
