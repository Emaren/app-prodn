// /var/www/AoE2HDBets/app-prodn/app/api/auth/session/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { toUserApi, type UserCoreRow } from "@/lib/userDto";
import {
  clearSessionCookie,
  getSessionUid,
  newSessionUid,
  setSessionCookie,
  signSession,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const user = await prisma.user.findUnique({ where: { uid } });

  return NextResponse.json({
    uid,
    user: user ? toUserApi(user as unknown as UserCoreRow) : null,
  });
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const providedEmail = normalizeEmail(body.email);

  let uid = await getSessionUid(request);
  if (!uid) uid = newSessionUid();

  const existing = await prisma.user.findUnique({ where: { uid } });
  let user = existing;

  if (!user) {
    const userCount = await prisma.user.count();
    user = await prisma.user.create({
      data: {
        uid,
        email: providedEmail,
        isAdmin: userCount === 0,
      },
    });
  } else if (providedEmail && providedEmail !== user.email) {
    user = await prisma.user.update({
      where: { uid },
      data: { email: providedEmail },
    });
  }

  const token = await signSession(uid);

  const response = NextResponse.json({
    uid,
    user: user ? toUserApi(user as unknown as UserCoreRow) : null,
  });

  setSessionCookie(response, token);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}