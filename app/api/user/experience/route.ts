import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { recordUserActivity } from "@/lib/userExperience";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_METADATA_KEYS = new Set([
  "journeySessionId",
  "previousPath",
  "currentPath",
  "referrerHost",
  "referrerPath",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "viewportWidth",
  "viewportHeight",
  "deviceKind",
  "touch",
  "timezone",
  "language",
  "capturedAt",
  "targetTag",
  "targetRole",
  "targetLabel",
  "href",
  "hrefHost",
  "hrefPath",
  "external",
  "buttonType",
]);

const STRING_METADATA_LIMITS: Record<string, number> = {
  journeySessionId: 80,
  previousPath: 160,
  currentPath: 160,
  referrerHost: 120,
  referrerPath: 160,
  utmSource: 80,
  utmMedium: 80,
  utmCampaign: 120,
  utmContent: 120,
  utmTerm: 120,
  deviceKind: 40,
  timezone: 80,
  language: 40,
  capturedAt: 40,
  targetTag: 40,
  targetRole: 40,
  targetLabel: 80,
  href: 160,
  hrefHost: 120,
  hrefPath: 160,
  buttonType: 40,
};

const NUMERIC_METADATA_LIMITS: Record<string, number> = {
  viewportWidth: 10_000,
  viewportHeight: 10_000,
};

function sanitizeMetadataString(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}

function sanitizeClientMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, string | number | boolean> = {};

  for (const key of SAFE_METADATA_KEYS) {
    const rawValue = input[key];
    if (rawValue == null) continue;

    if (typeof rawValue === "string") {
      const sanitized = sanitizeMetadataString(rawValue, STRING_METADATA_LIMITS[key] ?? 120);
      if (sanitized) output[key] = sanitized;
      continue;
    }

    if (typeof rawValue === "number" && key in NUMERIC_METADATA_LIMITS && Number.isFinite(rawValue)) {
      output[key] = Math.max(0, Math.min(NUMERIC_METADATA_LIMITS[key], Math.round(rawValue)));
      continue;
    }

    if (typeof rawValue === "boolean") {
      output[key] = rawValue;
    }
  }

  return Object.keys(output).length > 0 ? output : null;
}

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
      path: typeof payload.path === "string" ? payload.path : null,
      label: typeof payload.label === "string" ? payload.label : null,
      metadata: sanitizeClientMetadata(payload.metadata),
      dedupeWithinSeconds:
        typeof payload.dedupeWithinSeconds === "number"
          ? Math.max(0, Math.min(900, Math.round(payload.dedupeWithinSeconds)))
          : 300,
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
