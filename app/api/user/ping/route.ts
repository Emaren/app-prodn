import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid =
    request.headers.get("x-user-uid")?.trim() ||
    (typeof body.uid === "string" ? body.uid.trim() : "");

  if (!uid) {
    return NextResponse.json({ detail: "Missing uid" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { uid } });
  if (!user) {
    return NextResponse.json({ detail: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { uid },
    data: { lastSeen: new Date() },
  });

  return NextResponse.json({ status: "ok" });
}
