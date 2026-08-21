import { NextRequest, NextResponse } from "next/server";

import { livingKingdomHub } from "@/lib/livingKingdom/hub";
import {
  invalidateLivingKingdomIdentity,
  loadLivingKingdomIdentityProfile,
  type LivingKingdomIdentityProfile,
  type LivingKingdomPreferenceMode,
} from "@/lib/livingKingdom/identity";
import {
  isLivingKingdomSameOrigin,
  livingKingdomClientAddress,
  livingKingdomPreferenceIpRateLimiter,
  livingKingdomPreferenceUidRateLimiter,
  readLivingKingdomJsonBody,
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
  try {
    if (!isLivingKingdomSameOrigin(request)) {
      return errorResponse("Same-origin request required", 403);
    }
    const { uid, profile } = await authenticatedProfile(request);
    if (!uid) return errorResponse("No active session", 401);
    if (!profile) return errorResponse("User not found", 404);

    const body = await readLivingKingdomJsonBody(request);
    if (!body.ok) return errorResponse(body.error, body.status);
    if (
      typeof body.value !== "object" ||
      body.value === null ||
      Array.isArray(body.value) ||
      Object.keys(body.value).length !== 1 ||
      !("mode" in body.value)
    ) {
      return errorResponse("Body must contain only mode", 400);
    }
    const rawMode = (body.value as { mode?: unknown }).mode;
    if (rawMode !== "off" && rawMode !== "public_coarse") {
      return errorResponse("Invalid presence mode", 400);
    }
    const mode: LivingKingdomPreferenceMode = rawMode;

    const uidLimit = livingKingdomPreferenceUidRateLimiter.consume(`preference:${uid}`);
    const ipLimit = livingKingdomPreferenceIpRateLimiter.consume(
      `preference-ip:${livingKingdomClientAddress(request)}`,
    );
    if (!uidLimit.allowed || !ipLimit.allowed) {
      const retryAfterMs = Math.max(
        uidLimit.allowed ? 0 : uidLimit.retryAfterMs,
        ipLimit.allowed ? 0 : ipLimit.retryAfterMs,
      );
      return NextResponse.json(
        { detail: "Preference update rate exceeded", retryAfterMs },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1_000))),
          },
        },
      );
    }

    if (mode === "public_coarse" && !profile.featureAllowed) {
      return errorResponse("Presence is unavailable for this account", 403, "feature_gated");
    }
    if (mode === "public_coarse" && !profile.displayEligible) {
      return errorResponse("A public display identity is required", 422, "display_required");
    }
    if (mode === "public_coarse" && !profile.avatarEligible) {
      return errorResponse("A personal avatar is required", 422, "avatar_required");
    }
    if (profile.preferenceExists && mode === profile.preferenceMode) {
      if (mode === "off") {
        invalidateLivingKingdomIdentity(uid);
        livingKingdomHub.removeUser(uid);
      }
      return preferenceResponse(profile);
    }

    const now = new Date();
    const enabledAt =
      mode === "public_coarse"
        ? profile.preferenceMode === "public_coarse" && profile.enabledAt
          ? profile.enabledAt
          : now
        : null;
    const prisma = getPrisma();
    await prisma.userPresencePreference.upsert({
      where: { userId: profile.userId },
      create: { userId: profile.userId, mode, enabledAt },
      update: { mode, enabledAt },
    });

    invalidateLivingKingdomIdentity(uid);
    if (mode === "off") livingKingdomHub.removeUser(uid);

    const updated = await loadLivingKingdomIdentityProfile(prisma, uid);
    if (!updated) return errorResponse("User not found", 404);
    return preferenceResponse(updated);
  } catch (error) {
    console.error("Failed to save presence preference:", error);
    return errorResponse("Presence preference update failed", 500);
  }
}
