import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const prisma = getPrisma();
  const name = (request.nextUrl.searchParams.get("name") || "").trim();
  if (!name) return NextResponse.json({ exists: false });

  const user = await prisma.user.findFirst({
    where: { inGameName: name },
    select: { id: true },
  });

  return NextResponse.json({ exists: Boolean(user) });
}
