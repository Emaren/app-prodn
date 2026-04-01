import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const GUEST_REACTION_COOKIE_NAME = "aoe2hdbets_guest_reaction";

const GUEST_REACTION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

function cookieIsSecure() {
  return process.env.NODE_ENV === "production";
}

function normalizeGuestSessionId(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createGuestReactionSessionId() {
  return `gr_${randomUUID().replace(/-/g, "")}`;
}

export function readGuestReactionSessionIdFromCookies(cookieStore: CookieReader) {
  return normalizeGuestSessionId(cookieStore.get(GUEST_REACTION_COOKIE_NAME)?.value);
}

export function readGuestReactionSessionIdFromRequest(request: NextRequest) {
  return readGuestReactionSessionIdFromCookies(request.cookies);
}

export function writeGuestReactionSessionId(
  response: NextResponse,
  guestSessionId: string
) {
  response.cookies.set({
    name: GUEST_REACTION_COOKIE_NAME,
    value: guestSessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure(),
    path: "/",
    maxAge: GUEST_REACTION_COOKIE_MAX_AGE_SECONDS,
  });
  return guestSessionId;
}

export function ensureGuestReactionSessionId(
  request: NextRequest,
  response: NextResponse,
  guestSessionId?: string | null
) {
  const existing = readGuestReactionSessionIdFromRequest(request);
  if (existing) {
    return existing;
  }

  return writeGuestReactionSessionId(response, guestSessionId || createGuestReactionSessionId());
}
