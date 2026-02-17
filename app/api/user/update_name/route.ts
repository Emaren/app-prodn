import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid =
    request.headers.get("x-user-uid")?.trim() ||
    (typeof body.uid === "string" ? body.uid.trim() : "");
  const inGameName =
    typeof body.in_game_name === "string" ? body.in_game_name.trim() : "";

  if (!uid) {
    return NextResponse.json({ detail: "Missing uid" }, { status: 400 });
  }
  if (!inGameName) {
    return NextResponse.json({ detail: "In-game name cannot be blank" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { uid } });
  if (!user) {
    return NextResponse.json({ detail: "User not found" }, { status: 404 });
  }

  const conflict = await prisma.user.findFirst({
    where: { inGameName },
    select: { uid: true },
  });
  if (conflict && conflict.uid !== uid) {
    return NextResponse.json({ detail: "That in-game name is already taken" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { uid },
    data: { inGameName },
    select: { verified: true },
  });

  return NextResponse.json({ message: "Name updated", verified: updated.verified });
}
