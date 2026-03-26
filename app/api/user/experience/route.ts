import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { recordUserActivity } from "@/lib/userExperience";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      type?: string;
      path?: string | null;
      label?: string | null;
      metadata?: Record<string, unknown> | null;
      dedupeWithinSeconds?: number;
    };

    if (!payload.type || typeof payload.type !== "string") {
      return NextResponse.json({ detail: "Activity type is required" }, { status: 400 });
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
      type: payload.type,
      path: payload.path,
      label: payload.label,
      metadata:
        payload.metadata && typeof payload.metadata === "object" ? payload.metadata : null,
      dedupeWithinSeconds:
        typeof payload.dedupeWithinSeconds === "number" ? payload.dedupeWithinSeconds : 300,
    });

    return NextResponse.json({
      ok: true,
      eventId: event?.id ?? null,
    });
  } catch (error) {
    console.error("Failed to record user activity:", error);
    return NextResponse.json({ detail: "Activity tracking failed" }, { status: 500 });
  }
}
