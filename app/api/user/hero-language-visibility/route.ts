import { NextRequest, NextResponse } from "next/server";

import {
  HERO_LANGUAGE_CODES,
  normalizeHeroHiddenLanguageByGroup,
  serializeHeroHiddenLanguageByGroup,
} from "@/lib/hero/languageVariants";
import type { HeroLanguageCode } from "@/lib/hero/types";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

async function viewerForRequest(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return null;
  return getPrisma().user.findUnique({
    where: { uid },
    select: { id: true },
  });
}

function groupKey(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().slice(0, 120);
  return /^[a-z0-9][a-z0-9._:-]{0,119}$/i.test(normalized) ? normalized : "";
}

function hiddenLanguage(value: unknown): HeroLanguageCode | null | undefined {
  if (value === null) return null;
  return HERO_LANGUAGE_CODES.includes(value as HeroLanguageCode)
    ? (value as HeroLanguageCode)
    : undefined;
}

export async function GET(request: NextRequest) {
  const viewer = await viewerForRequest(request);
  if (!viewer) {
    return NextResponse.json(
      { authenticated: false, hiddenByGroup: {} },
      { headers: NO_STORE_HEADERS }
    );
  }

  const preference = await getPrisma().userAppearancePreference.findUnique({
    where: { userId: viewer.id },
    select: { heroLanguageVisibility: true },
  });

  return NextResponse.json(
    {
      authenticated: true,
      hiddenByGroup: normalizeHeroHiddenLanguageByGroup(
        preference?.heroLanguageVisibility
      ),
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function PUT(request: NextRequest) {
  const viewer = await viewerForRequest(request);
  if (!viewer) {
    return NextResponse.json(
      { detail: "No active session" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const input = (await request.json().catch(() => ({}))) as {
    groupKey?: unknown;
    hiddenLanguage?: unknown;
  };
  const group = groupKey(input.groupKey);
  const language = hiddenLanguage(input.hiddenLanguage);

  if (!group) {
    return NextResponse.json(
      { detail: "Choose a valid Hero language group." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (language === undefined) {
    return NextResponse.json(
      { detail: "Choose a supported Hero language." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const prisma = getPrisma();
  const current = await prisma.userAppearancePreference.findUnique({
    where: { userId: viewer.id },
    select: { heroLanguageVisibility: true },
  });
  const hiddenByGroup = normalizeHeroHiddenLanguageByGroup(
    current?.heroLanguageVisibility
  );

  if (language === null) {
    delete hiddenByGroup[group];
  } else {
    hiddenByGroup[group] = language;
  }

  const serialized = serializeHeroHiddenLanguageByGroup(hiddenByGroup);
  await prisma.userAppearancePreference.upsert({
    where: { userId: viewer.id },
    create: {
      userId: viewer.id,
      heroLanguageVisibility: serialized,
    },
    update: {
      heroLanguageVisibility: serialized,
    },
  });

  return NextResponse.json(
    {
      authenticated: true,
      hiddenByGroup: serialized.hiddenByGroup,
    },
    { headers: NO_STORE_HEADERS }
  );
}
