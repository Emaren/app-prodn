import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const FALLBACK_SESSION_SECRET = "aoe2hdbets-dev-session-secret-change-me";
const SESSION_ISSUER = "aoe2hdbets";
const SESSION_COOKIE = "aoe2hdbets_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionClaims = {
  uid: string;
};

function getSessionSecret() {
  const raw = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET (or NEXTAUTH_SECRET) is required in production");
    }
    return new TextEncoder().encode(FALLBACK_SESSION_SECRET);
  }
  return new TextEncoder().encode(raw);
}

function cookieIsSecure() {
  return process.env.NODE_ENV === "production";
}

export function newSessionUid() {
  return `u_${randomUUID().replace(/-/g, "")}`;
}

export async function signSession(uid: string) {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      issuer: SESSION_ISSUER,
    });
    if (typeof payload.uid !== "string" || !payload.uid.trim()) return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}

export async function getSessionUid(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token);
  return claims?.uid || null;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure(),
    path: "/",
    maxAge: 0,
  });
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
