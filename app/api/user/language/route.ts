import { NextRequest, NextResponse } from "next/server";

import {
  normalizeUniversalLanguage,
  type UniversalLanguageCode,
} from "@/lib/i18n/languages";
import { getPrisma } from "@/lib/prisma";
import { usesC03ExistingOnlyAuth } from "@/lib/productionAuth";
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
  // Legacy direct users query is not part of A's restricted 21-field projection.
  if (usesC03ExistingOnlyAuth()) {
    return NextResponse.json({ detail: "C03 language read unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }

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
  // The protected users.preferred_language column is not a C03 sidecar.
  if (usesC03ExistingOnlyAuth()) {
    return NextResponse.json({ detail: "C03 protected preference updates unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }

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
