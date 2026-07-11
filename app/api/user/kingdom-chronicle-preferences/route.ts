import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import {
  loadAppearancePreferenceForUser,
  recordUserActivity,
  upsertAppearancePreference,
} from "@/lib/userExperience";
import {
  getTileViewMode,
  isTileViewMode,
  type TileViewMode,
} from "@/lib/tileViewPreferences";
import { KINGDOM_CHRONICLE_AVATAR_EVENT_TYPE } from "@/lib/adminTileViewAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KingdomChronicleView = "b" | "a" | "e";

function isKingdomChronicleView(value: unknown): value is KingdomChronicleView {
  return value === "b" || value === "a" || value === "e";
}

function tileModeToKingdomView(mode: TileViewMode): KingdomChronicleView {
  if (mode === "basic") return "b";
  if (mode === "advanced") return "a";
  return "e";
}

function kingdomViewToTileMode(value: KingdomChronicleView): TileViewMode {
  if (value === "b") return "basic";
  if (value === "a") return "advanced";
  return "extreme";
}

function metadataAvatarsEnabled(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return true;
  }

  return (metadata as { avatarsEnabled?: unknown }).avatarsEnabled !== false;
}

async function resolveUser(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: { id: true, uid: true },
  });

  return user ? { prisma, user } : null;
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveUser(request);
    if (!resolved) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const { prisma, user } = resolved;
    const appearance = await loadAppearancePreferenceForUser(prisma, user.id);
    const latestAvatarToggle = await prisma.userActivityEvent.findFirst({
      where: {
        userId: user.id,
        type: KINGDOM_CHRONICLE_AVATAR_EVENT_TYPE,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        metadata: true,
        createdAt: true,
      },
    });

    const storedTileMode = getTileViewMode(
      appearance.tileViewPreferences,
      "kingdom_chronicle"
    );

    return NextResponse.json({
      view: tileModeToKingdomView(storedTileMode),
      avatarsEnabled: latestAvatarToggle
        ? metadataAvatarsEnabled(latestAvatarToggle.metadata)
        : true,
      updatedAt: latestAvatarToggle?.createdAt.toISOString() ?? appearance.updatedAt,
    });
  } catch (error) {
    console.error("Failed to load Kingdom Chronicle preferences:", error);
    return NextResponse.json({ detail: "Kingdom preferences unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveUser(request);
    if (!resolved) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      view?: unknown;
      avatarsEnabled?: unknown;
    };

    const view = isKingdomChronicleView(payload.view) ? payload.view : "e";
    const avatarsEnabled = payload.avatarsEnabled !== false;

    const { prisma, user } = resolved;
    const current = await loadAppearancePreferenceForUser(prisma, user.id);
    const currentKingdomMode = current.tileViewPreferences.kingdom_chronicle;
    const nextTileMode = kingdomViewToTileMode(view);

    const saved = await upsertAppearancePreference(prisma, user.id, {
      ...current,
      tileViewPreferences: {
        ...current.tileViewPreferences,
        kingdom_chronicle: isTileViewMode(nextTileMode) ? nextTileMode : "extreme",
      },
    });

    await recordUserActivity(prisma, {
      userId: user.id,
      type: KINGDOM_CHRONICLE_AVATAR_EVENT_TYPE,
      path: "/kingdom",
      label: avatarsEnabled ? "avatars_on" : "avatars_off",
      metadata: {
        view,
        tileViewMode: nextTileMode,
        avatarsEnabled,
        previousTileViewMode: currentKingdomMode ?? null,
      },
      dedupeWithinSeconds: 3,
    });

    return NextResponse.json({
      view,
      avatarsEnabled,
      tileViewMode: nextTileMode,
      updatedAt: saved.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to save Kingdom Chronicle preferences:", error);
    return NextResponse.json({ detail: "Kingdom preferences update failed" }, { status: 500 });
  }
}
