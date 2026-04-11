import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  loadAppearancePreferenceForUser,
  normalizeAppearancePreference,
  recordUserActivity,
  upsertAppearancePreference,
} from "@/lib/userExperience";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const preference = await loadAppearancePreferenceForUser(prisma, user.id);
    return NextResponse.json(preference);
  } catch (error) {
    console.error("Failed to load user appearance:", error);
    return NextResponse.json({ detail: "Appearance unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      themeKey?: string | null;
      tileThemeKey?: string | null;
      viewMode?: string | null;
      textColor?: string | null;
      timeDisplayMode?: string | null;
      timezoneOverride?: string | null;
    };

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const current = await loadAppearancePreferenceForUser(prisma, user.id);
    const normalized = normalizeAppearancePreference({
      ...current,
      ...payload,
    });
    const saved = await upsertAppearancePreference(prisma, user.id, normalized);

    await recordUserActivity(prisma, {
      userId: user.id,
      type: "appearance_changed",
      path: request.nextUrl.pathname,
      label:
        `${normalized.themeKey}/${normalized.tileThemeKey}/${normalized.viewMode}/${normalized.textColor}` +
        `/${normalized.timeDisplayMode}`,
      metadata: normalized,
      dedupeWithinSeconds: 90,
    });

    return NextResponse.json({
      themeKey: saved.themeKey,
      tileThemeKey: saved.tileThemeKey,
      viewMode: saved.viewMode,
      textColor: saved.textColor,
      timeDisplayMode: saved.timeDisplayMode,
      timezoneOverride: saved.timezoneOverride,
      updatedAt: saved.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to save user appearance:", error);
    return NextResponse.json({ detail: "Appearance update failed" }, { status: 500 });
  }
}
