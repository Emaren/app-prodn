import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid =
    request.headers.get("x-user-uid")?.trim() ||
    (typeof body.uid === "string" ? body.uid.trim() : "");
  const email =
    request.headers.get("x-user-email")?.trim() ||
    (typeof body.email === "string" ? body.email.trim() : null);
  const inGameName =
    typeof body.in_game_name === "string" ? body.in_game_name.trim() : "";

  if (!uid) {
    return NextResponse.json({ detail: "Missing uid for registration" }, { status: 400 });
  }
  if (!inGameName) {
    return NextResponse.json(
      { detail: { field: "in_game_name", error: "In-game name cannot be blank" } },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { uid } });
  if (existing) {
    return NextResponse.json({ message: "User already exists", is_admin: existing.isAdmin });
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
    const userCount = await prisma.user.count();
    const created = await prisma.user.create({
      data: {
        uid,
        email,
        inGameName,
        isAdmin: userCount === 0,
      },
      select: { isAdmin: true },
    });

    return NextResponse.json({
      message: "User registered",
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
