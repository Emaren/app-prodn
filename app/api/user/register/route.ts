import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestEmail, resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid = await resolveRequestUid(request, body);
  const email = resolveRequestEmail(request, body);
  const inGameName =
    typeof body.in_game_name === "string" ? body.in_game_name.trim() : "";

  if (!uid) {
    return NextResponse.json({ detail: "Missing session identity" }, { status: 401 });
  }
  if (!inGameName) {
    return NextResponse.json(
      { detail: { field: "in_game_name", error: "In-game name cannot be blank" } },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { uid } });
  if (existing) {
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

    const namedUserCount = await prisma.user.count({
      where: { inGameName: { not: null } },
    });
    const shouldBeAdmin = !existing.isAdmin && namedUserCount === 0;

    const updated = await prisma.user.update({
      where: { uid },
      data: {
        inGameName,
        email: existing.email || email,
        isAdmin: existing.isAdmin || shouldBeAdmin,
      },
      select: { isAdmin: true, uid: true, inGameName: true },
    });

    return NextResponse.json({
      message: "User updated",
      uid: updated.uid,
      in_game_name: updated.inGameName,
      is_admin: updated.isAdmin,
    });
  }

  const nameConflict = await prisma.user.findFirst({
    where: { inGameName },
    select: { id: true },
  });
  if (nameConflict) {
    return NextResponse.json(
      { detail: { field: "in_game_name", error: "In-game name already taken" } },
      { status: 400 }
    );
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
        isAdmin: namedUserCount === 0,
      },
      select: { isAdmin: true },
    });

    return NextResponse.json({
      message: "User registered",
      uid,
      in_game_name: inGameName,
      is_admin: created.isAdmin,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { detail: { field: "in_game_name", error: "In-game name already taken" } },
        { status: 400 }
      );
    }
    throw error;
  }
}
