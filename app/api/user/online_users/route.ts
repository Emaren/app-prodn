import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const prisma = getPrisma();
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: {
      inGameName: { not: null },
      lastSeen: { gt: twoMinutesAgo },
    },
    orderBy: { lastSeen: "desc" },
    select: {
      uid: true,
      inGameName: true,
      verified: true,
      verificationLevel: true,
    },
    take: 500,
  });

  return NextResponse.json(
    users.map((u) => ({
      uid: u.uid,
      in_game_name: u.inGameName,
      verified: u.verified,
      verificationLevel: u.verificationLevel,
    }))
  );
}
