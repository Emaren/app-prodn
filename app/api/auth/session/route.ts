import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { toUserApi } from "@/lib/userDto";
import {
  clearSessionCookie,
  getSessionUid,
  newSessionUid,
  setSessionCookie,
  signSession,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return NextResponse.json({ detail: "No active session" }, { status: 401 });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { uid } });
  return NextResponse.json({
    uid,
    user: user ? toUserApi(user) : null,
  });
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const providedEmail =
    typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;

  let uid = await getSessionUid(request);
  if (!uid) {
    uid = newSessionUid();
  }

  const existing = await prisma.user.findUnique({ where: { uid } });
  let user = existing;
  if (!existing) {
    user = await prisma.user.create({
      data: {
        uid,
        email: providedEmail,
        isAdmin: false,
      },
    });
  } else if (!existing.email && providedEmail) {
    user = await prisma.user.update({
      where: { uid },
      data: { email: providedEmail },
    });
  }

  const token = await signSession(uid);
  const response = NextResponse.json({
    uid,
    user: user ? toUserApi(user) : null,
  });
  setSessionCookie(response, token);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
