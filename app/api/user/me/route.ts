import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { toUserApi } from "@/lib/userDto";
import { resolveRequestEmail, resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const prisma = getPrisma();
  const uid = await resolveRequestUid(request);
  if (!uid) {
    return NextResponse.json({ detail: "Missing session identity" }, { status: 401 });
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
  const uid = await resolveRequestUid(request, body);
  const email = resolveRequestEmail(request, body);
  const inGameName =
    typeof body.in_game_name === "string" && body.in_game_name.trim()
      ? body.in_game_name.trim()
      : undefined;

  if (!uid) {
    return NextResponse.json({ detail: "Missing session identity" }, { status: 401 });
  }

  const existing = await prisma.user.findUnique({ where: { uid } });
  if (!existing) {
    if (!inGameName) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    try {
      const namedUserCount = await prisma.user.count({
        where: { inGameName: { not: null } },
      });
      const created = await prisma.user.create({
        data: {
          uid,
          email,
          inGameName,
          verified: false,
          isAdmin: namedUserCount === 0,
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

  if (inGameName && existing.inGameName !== inGameName) {
    const conflict = await prisma.user.findFirst({
      where: {
        inGameName,
        uid: { not: uid },
      },
      select: { uid: true },
    });
    if (conflict) {
      return NextResponse.json(
        { detail: { field: "in_game_name", error: "In-game name already taken" } },
        { status: 400 }
      );
    }

    const renamed = await prisma.user.update({
      where: { uid },
      data: {
        inGameName,
        email: existing.email || email,
      },
    });
    return NextResponse.json(toUserApi(renamed), {
      headers: { "x-user-api-source": "next-prisma" },
    });
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
