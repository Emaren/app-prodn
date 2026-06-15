import { NextRequest, NextResponse } from "next/server";

import {
  mediaFallbackUrl,
  saveManagedMediaReference,
  saveManagedMediaUpload,
} from "@/lib/managedMediaAssets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const PRESET_AVATARS = new Set(["emaren", "jim", "julio", "julio-alvarez", "sniper", "silhouette"]);

function userAvatarTarget(uid: string) {
  return `user-${uid}`;
}

async function requireViewer(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return { error: NextResponse.json({ detail: "No active session" }, { status: 401 }) };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!user) {
    return { error: NextResponse.json({ detail: "User not found" }, { status: 404 }) };
  }

  return { prisma, user };
}

export async function POST(request: NextRequest) {
  const gate = await requireViewer(request);
  if ("error" in gate) {
    return gate.error;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { detail: "Choose an image file first." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const label =
      gate.user.inGameName ||
      gate.user.steamPersonaName ||
      "Profile avatar";

    const asset = await saveManagedMediaUpload({
      prisma: gate.prisma,
      file,
      kind: "avatar",
      target: userAvatarTarget(gate.user.uid),
      label,
      alt: `${label} avatar`,
      uploadedByUid: gate.user.uid,
    });

    return NextResponse.json({ avatarUrl: asset.url, asset }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not save avatar.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireViewer(request);
  if ("error" in gate) {
    return gate.error;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const preset = String(body.preset || "").trim().toLowerCase();
    if (!PRESET_AVATARS.has(preset)) {
      return NextResponse.json(
        { detail: "Choose a valid avatar preset." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const avatarUrl = mediaFallbackUrl("avatar", preset);
    if (!avatarUrl) {
      return NextResponse.json(
        { detail: "Avatar preset unavailable." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const label =
      gate.user.inGameName ||
      gate.user.steamPersonaName ||
      "Profile avatar";

    const asset = await saveManagedMediaReference({
      prisma: gate.prisma,
      kind: "avatar",
      target: userAvatarTarget(gate.user.uid),
      url: avatarUrl,
      label: `${label} avatar`,
      alt: `${label} avatar`,
      uploadedByUid: gate.user.uid,
    });

    return NextResponse.json({ avatarUrl: asset.url, asset }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not update avatar.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
