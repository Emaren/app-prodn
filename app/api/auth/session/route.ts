// /var/www/AoE2HDBets/app-prodn/app/api/auth/session/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { hydrateSteamIdentity } from "@/lib/steamIdentity";
import { fetchUserVerification, toUserApi, type UserCoreRow } from "@/lib/userDto";
import {
  clearSessionCookie,
  getSessionUid,
  newSessionUid,
  setSessionCookie,
  signSession,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOW_GUEST_SESSIONS = process.env.ALLOW_GUEST_SESSIONS === "true";

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim();
  if (!e) return null;
  if (e.length > 100) return null;
  return e;
}

export async function GET(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return NextResponse.json({ detail: "No active session" }, { status: 401 });
  }

  const prisma = getPrisma();
  let user = await prisma.user.findUnique({ where: { uid } });

  let verification = user ? await fetchUserVerification(prisma, uid) : null;
  if (user && verification?.steamId) {
    const hydration = await hydrateSteamIdentity(prisma, uid);
    verification = hydration.verification;
    if (hydration.seededPlayableName) {
      user = await prisma.user.findUnique({ where: { uid } });
    }
  }

  return NextResponse.json({
    uid,
    user: user
      ? toUserApi(user as unknown as UserCoreRow, verification)
      : null,
  });
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const providedEmail = normalizeEmail(body.email);

  let uid = await getSessionUid(request);
  if (!uid) {
    if (!ALLOW_GUEST_SESSIONS) {
      return NextResponse.json(
        { detail: "Guest sessions are disabled. Sign in with Steam to continue." },
        { status: 401 }
      );
    }

    uid = newSessionUid();
    const user = await prisma.user.create({
      data: {
        uid,
        email: providedEmail,
        isAdmin: false,
      },
    });

    const token = await signSession(uid);
    const response = NextResponse.json({
      uid,
      user: toUserApi(
        user as unknown as UserCoreRow,
        await fetchUserVerification(prisma, uid)
      ),
    });
    setSessionCookie(response, token);
    return response;
  }

  const existing = await prisma.user.findUnique({ where: { uid } });
  let user = existing;

  if (!user) {
    user = await prisma.user.create({
      data: {
        uid,
        email: providedEmail,
        isAdmin: false,
      },
    });
  } else if (providedEmail && providedEmail !== user.email) {
    user = await prisma.user.update({
      where: { uid },
      data: { email: providedEmail },
    });
  }

  return NextResponse.json({
    uid,
    user: user
      ? toUserApi(user as unknown as UserCoreRow, await fetchUserVerification(prisma, uid))
      : null,
  });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
