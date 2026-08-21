import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { livingKingdomHub } from "@/lib/livingKingdom/hub";
import {
  livingKingdomIdentityGeneration,
  livingKingdomFeatureMode,
  loadLivingKingdomIdentityProfile,
} from "@/lib/livingKingdom/identity";
import {
  parseLivingKingdomDeleteMutation,
  parseLivingKingdomPostMutation,
} from "@/lib/livingKingdom/protocol";
import {
  isLivingKingdomSameOrigin,
  livingKingdomActorRateLimiter,
  livingKingdomClientAddress,
  livingKingdomIpRateLimiter,
  readLivingKingdomJsonBody,
} from "@/lib/livingKingdom/rateLimit";
import { livingKingdomRealmForPath } from "@/lib/livingKingdom/realms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function json(detail: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { detail, ...extra },
    { status, headers: NO_STORE_HEADERS },
  );
}

function referrerMatchesRealm(request: NextRequest, realmId: string) {
  const rawReferrer = request.headers.get("referer");
  if (!rawReferrer) return true;
  try {
    const referrer = new URL(rawReferrer);
    const origin = request.headers.get("origin");
    if (!origin || referrer.origin !== new URL(origin).origin) return false;
    return livingKingdomRealmForPath(referrer.pathname) === realmId;
  } catch {
    return false;
  }
}

function rateLimitMutation(request: NextRequest, uid: string) {
  const actorResult = livingKingdomActorRateLimiter.consume(`actor:${uid}`);
  const ipResult = livingKingdomIpRateLimiter.consume(
    `ip:${livingKingdomClientAddress(request)}`,
  );
  if (actorResult.allowed && ipResult.allowed) return null;

  livingKingdomHub.recordRateLimited();
  const retryAfterMs = Math.max(
    actorResult.allowed ? 0 : actorResult.retryAfterMs,
    ipResult.allowed ? 0 : ipResult.retryAfterMs,
  );
  return NextResponse.json(
    { detail: "Presence update rate exceeded", retryAfterMs },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1_000))),
      },
    },
  );
}

async function authenticateMutation(request: NextRequest) {
  if (livingKingdomFeatureMode() === "off") {
    return { response: json("Not found", 404), uid: null };
  }
  if (!isLivingKingdomSameOrigin(request)) {
    livingKingdomHub.recordInvalid();
    return { response: json("Same-origin request required", 403), uid: null };
  }
  const uid = await getSessionUid(request);
  if (!uid) return { response: json("No active session", 401), uid: null };
  return { response: null, uid };
}

export async function POST(request: NextRequest) {
  const auth = await authenticateMutation(request);
  if (auth.response || !auth.uid) return auth.response!;

  const body = await readLivingKingdomJsonBody(request);
  if (!body.ok) {
    livingKingdomHub.recordInvalid();
    return json(body.error, body.status);
  }
  const parsed = parseLivingKingdomPostMutation(body.value);
  if (!parsed.ok) {
    livingKingdomHub.recordInvalid();
    return json(parsed.error, 400);
  }
  if (!referrerMatchesRealm(request, parsed.value.realmId)) {
    livingKingdomHub.recordInvalid();
    return json("Referrer realm mismatch", 403);
  }

  const limited = rateLimitMutation(request, auth.uid);
  if (limited) return limited;

  const identityGeneration = livingKingdomIdentityGeneration();
  const profile = await loadLivingKingdomIdentityProfile(getPrisma(), auth.uid);
  if (!profile) return json("User not found", 404);
  if (profile.preferenceMode !== "public_coarse") {
    return json("Presence sharing is disabled", 403, { code: "presence_disabled" });
  }
  if (!profile.displayEligible) {
    return json("A public display identity is required", 422, { code: "display_required" });
  }
  if (!profile.avatarEligible) {
    return json("A personal avatar is required", 422, { code: "avatar_required" });
  }
  if (!profile.featureAllowed || !profile.identity) {
    return json("Presence is unavailable for this account", 403, { code: "feature_gated" });
  }
  if (identityGeneration !== livingKingdomIdentityGeneration()) {
    return json("Presence identity changed; retry", 409, { code: "identity_changed" });
  }
  if (request.signal.aborted) {
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  }

  const result =
    parsed.value.kind === "state"
      ? livingKingdomHub.upsert(profile.identity, parsed.value)
      : livingKingdomHub.door(profile.identity, parsed.value);
  if (!result.accepted) {
    return json(
      result.reason === "stale" ? "Stale sequence" : "Current tab state is required",
      409,
      { code: result.reason },
    );
  }

  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateMutation(request);
  if (auth.response || !auth.uid) return auth.response!;

  const body = await readLivingKingdomJsonBody(request);
  if (!body.ok) {
    livingKingdomHub.recordInvalid();
    return json(body.error, body.status);
  }
  const parsed = parseLivingKingdomDeleteMutation(body.value);
  if (!parsed.ok) {
    livingKingdomHub.recordInvalid();
    return json(parsed.error, 400);
  }

  const limited = rateLimitMutation(request, auth.uid);
  if (limited) return limited;
  const result = livingKingdomHub.removeTab(
    auth.uid,
    parsed.value.tabId,
    parsed.value.seq,
  );
  if (!result.accepted) {
    return json("Stale sequence", 409, { code: result.reason });
  }
  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
}
