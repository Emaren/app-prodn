import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ACTIVITY_TYPES = new Set([
  "staking_view_selected",
]);

function cleanText(value: unknown, fallback: string, maxLength = 180) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(([, next]) => {
    if (next == null) return false;
    return ["string", "number", "boolean"].includes(typeof next);
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const type = cleanText(body.type, "", 80);

    if (!ALLOWED_ACTIVITY_TYPES.has(type)) {
      return NextResponse.json({ detail: "Unsupported activity type" }, { status: 400 });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const event = await recordUserActivity(prisma, {
      userId: user.id,
      type,
      path: cleanText(body.path, request.nextUrl.pathname, 220),
      label: cleanText(body.label, "Staking view selected"),
      metadata: cleanMetadata(body.metadata),
      dedupeWithinSeconds: 20,
    });

    return NextResponse.json({ ok: true, id: event?.id ?? null });
  } catch (error) {
    console.error("Failed to record user activity:", error);
    return NextResponse.json({ detail: "Activity tracking failed" }, { status: 500 });
  }
}
