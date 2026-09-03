import { NextRequest, NextResponse } from "next/server";

import {
  LIVING_KINGDOM_ANONYMOUS_HEADER,
  livingKingdomAnonymousIdentity,
  livingKingdomAnonymousUid,
  livingKingdomAnonymousVisitorIdIsValid,
} from "@/lib/livingKingdom/anonymous";
import { livingKingdomHub } from "@/lib/livingKingdom/hub";
import { livingKingdomFeatureMode } from "@/lib/livingKingdom/identity";
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

function anonymousVisitorId(request: NextRequest) {
  const raw = request.headers.get(LIVING_KINGDOM_ANONYMOUS_HEADER)?.trim();
  return livingKingdomAnonymousVisitorIdIsValid(raw) ? raw.toLowerCase() : null;
}

function authenticateAnonymousMutation(request: NextRequest) {
  // Anonymous roaming is a public-mode capability. Staff/canary modes remain
  // signed-in-only so the feature cannot leak beyond the intended rollout.
  if (livingKingdomFeatureMode() !== "public") {
    return { response: json("Not found", 404), visitorId: null };
  }
  if (!isLivingKingdomSameOrigin(request)) {
    livingKingdomHub.recordInvalid();
    return { response: json("Same-origin request required", 403), visitorId: null };
  }
  const visitorId = anonymousVisitorId(request);
  if (!visitorId) {
    livingKingdomHub.recordInvalid();
    return { response: json("Valid anonymous visitor id required", 400), visitorId: null };
  }
  return { response: null, visitorId };
}

function rateLimitMutation(request: NextRequest, visitorId: string) {
  const actorResult = livingKingdomActorRateLimiter.consume(
    `anonymous:${visitorId}`,
  );
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

export async function POST(request: NextRequest) {
  const auth = authenticateAnonymousMutation(request);
  if (auth.response || !auth.visitorId) return auth.response!;

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

  const limited = rateLimitMutation(request, auth.visitorId);
  if (limited) return limited;

  const identity = livingKingdomAnonymousIdentity(auth.visitorId);
  if (!identity) {
    livingKingdomHub.recordInvalid();
    return json("Anonymous identity unavailable", 400);
  }
  if (request.signal.aborted) {
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  }

  const result =
    parsed.value.kind === "state"
      ? livingKingdomHub.upsert(identity, parsed.value)
      : livingKingdomHub.door(identity, parsed.value);
  if (!result.accepted) {
    if (result.reason === "capacity") {
      return json("Anonymous presence capacity reached", 503, { code: result.reason });
    }
    return json(
      result.reason === "stale" ? "Stale sequence" : "Current tab state is required",
      409,
      { code: result.reason },
    );
  }

  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
}

export async function DELETE(request: NextRequest) {
  const auth = authenticateAnonymousMutation(request);
  if (auth.response || !auth.visitorId) return auth.response!;

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

  const result = livingKingdomHub.removeTab(
    livingKingdomAnonymousUid(auth.visitorId),
    parsed.value.tabId,
    parsed.value.seq,
  );
  if (!result.accepted) {
    if (result.reason === "capacity") {
      return json("Anonymous presence capacity reached", 503, {
        code: result.reason,
      });
    }
    return json("Stale sequence", 409, { code: result.reason });
  }
  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
}
