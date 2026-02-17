import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { toUserApi } from "@/lib/userDto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveIdentity(request: NextRequest, body?: Record<string, unknown>) {
  const uidFromHeader = request.headers.get("x-user-uid")?.trim() || undefined;
  const emailFromHeader = request.headers.get("x-user-email")?.trim() || undefined;

  const uidFromBody =
    typeof body?.uid === "string" && body.uid.trim() ? body.uid.trim() : undefined;
  const emailFromBody =
    typeof body?.email === "string" && body.email.trim() ? body.email.trim() : undefined;

  return {
    uid: uidFromHeader || uidFromBody,
    email: emailFromHeader || emailFromBody,
  };
}

export async function GET(request: NextRequest) {
  const prisma = getPrisma();
  const { uid } = resolveIdentity(request);
  if (!uid) {
    return NextResponse.json({ detail: "Missing identity" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { uid } });
  if (!user) {
    return NextResponse.json({ detail: "User not found" }, { status: 404 });
  }

  return NextResponse.json(toUserApi(user), {
    headers: { "x-user-api-source": "next-prisma" },
  });
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { uid, email } = resolveIdentity(request, body);
  const inGameName =
    typeof body.in_game_name === "string" && body.in_game_name.trim()
      ? body.in_game_name.trim()
      : undefined;

  if (!uid) {
    return NextResponse.json({ detail: "Missing uid" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { uid } });
  if (!existing) {
    if (!inGameName) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    try {
      const userCount = await prisma.user.count();
      const created = await prisma.user.create({
        data: {
          uid,
          email,
          inGameName,
          verified: false,
          isAdmin: userCount === 0,
        },
      });
      return NextResponse.json(toUserApi(created), {
        headers: { "x-user-api-source": "next-prisma" },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
          { detail: "In-game name already taken" },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  if (!existing.email && email) {
    const updated = await prisma.user.update({
      where: { uid },
      data: { email },
    });
    return NextResponse.json(toUserApi(updated), {
      headers: { "x-user-api-source": "next-prisma" },
    });
  }

  return NextResponse.json(toUserApi(existing), {
    headers: { "x-user-api-source": "next-prisma" },
  });
}
