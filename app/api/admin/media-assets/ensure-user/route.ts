import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanText(value: unknown, max = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function slugify(value: string) {
  return normalizePublicPlayerName(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const displayName = cleanText(body.displayName, 120);

  if (!displayName) {
    return NextResponse.json(
      { detail: "Choose a tracked player first." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const existingByName = await gate.prisma.user.findFirst({
    where: {
      OR: [{ inGameName: displayName }, { steamPersonaName: displayName }],
    },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      email: true,
      representedCountry: true,
      genderDivision: true,
    },
  });

  if (existingByName) {
    return NextResponse.json({ user: existingByName }, { headers: NO_STORE_HEADERS });
  }

  const baseSlug = slugify(displayName) || `warrior-${randomUUID().slice(0, 8)}`;
  let uid = `aoe2hd-${baseSlug}`.slice(0, 96);

  const existingByUid = await gate.prisma.user.findUnique({
    where: { uid },
    select: { uid: true },
  });

  if (existingByUid) {
    uid = `aoe2hd-${baseSlug}-${randomUUID().slice(0, 6)}`.slice(0, 100);
  }

  try {
    const user = await gate.prisma.user.create({
      data: {
        uid,
        inGameName: displayName,
        verified: false,
        verificationLevel: 0,
        representedCountry: null,
        genderDivision: "Man",
      },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        email: true,
        representedCountry: true,
        genderDivision: true,
      },
    });

    return NextResponse.json({ user }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not create managed warrior.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
