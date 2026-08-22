import { NextRequest, NextResponse } from "next/server";

import {
  loadLivingKingdomIdentityProfile,
  type LivingKingdomIdentityProfile,
} from "@/lib/livingKingdom/identity";
import {
  isLivingKingdomSameOrigin,
} from "@/lib/livingKingdom/rateLimit";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function errorResponse(detail: string, status: number, code?: string) {
  return NextResponse.json(
    { detail, ...(code ? { code } : {}) },
    { status, headers: NO_STORE_HEADERS },
  );
}

function preferenceResponse(profile: LivingKingdomIdentityProfile) {
  return NextResponse.json(
    {
      mode: profile.preferenceMode,
      decisionRecorded: profile.preferenceExists,
      avatarEligible: profile.avatarEligible,
      avatarUrl: profile.avatarUrl,
      displayEligible: profile.displayEligible,
      displayName: profile.displayName,
      featureAllowed: profile.featureAllowed,
      canPublish: Boolean(profile.identity),
      enabledAt: profile.enabledAt?.toISOString() ?? null,
      updatedAt: profile.preferenceUpdatedAt?.toISOString() ?? null,
    },
    { headers: NO_STORE_HEADERS },
  );
}

async function authenticatedProfile(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return { uid: null, profile: null };
  const profile = await loadLivingKingdomIdentityProfile(getPrisma(), uid);
  return { uid, profile };
}

export async function GET(request: NextRequest) {
  try {
    const { uid, profile } = await authenticatedProfile(request);
    if (!uid) return errorResponse("No active session", 401);
    if (!profile) return errorResponse("User not found", 404);
    return preferenceResponse(profile);
  } catch (error) {
    console.error("Failed to load presence preference:", error);
    return errorResponse("Presence preference unavailable", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isLivingKingdomSameOrigin(request)) {
    return errorResponse("Same-origin request required", 403);
  }

  const uid = await getSessionUid(request);
  if (!uid) return errorResponse("No active session", 401);

  // Kept as a compatibility boundary for already-loaded older clients. Living
  // Kingdom publication is automatic for every eligible avatarized account;
  // this endpoint can no longer create a server-side visibility toggle.
  return NextResponse.json(
    {
      detail: "Living Kingdom publication is automatic",
      code: "presence_always_on",
    },
    {
      status: 405,
      headers: {
        ...NO_STORE_HEADERS,
        Allow: "GET",
      },
    },
  );
}
