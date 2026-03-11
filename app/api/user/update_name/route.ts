import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { fetchUserVerification, toUserApi, type UserApi } from "@/lib/userDto";
import { resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";

function normalizeInGameName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 64);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const uid = await resolveRequestUid(request, body);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const raw =
    typeof body?.inGameName === "string"
      ? body.inGameName
      : typeof body?.in_game_name === "string"
        ? body.in_game_name
        : "";
  const inGameName = normalizeInGameName(raw);
  if (inGameName.length < 2) {
    return NextResponse.json({ detail: "Invalid in-game name" }, { status: 400 });
  }

  const prisma = getPrisma();

  const existing = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      email: true,
      inGameName: true,
      verified: true,
      walletAddress: true,
      lockName: true,
      createdAt: true,
      token: true,
      lastSeen: true,
      isAdmin: true,
    },
  });

  if (!existing) return NextResponse.json({ detail: "User not found" }, { status: 404 });

  if (existing.lockName) {
    return NextResponse.json(
      { detail: "Name is locked (verified). Use admin tools to change." },
      { status: 403 }
    );
  }

  const verification = await fetchUserVerification(prisma, uid);
  const steamLinked = Boolean(verification.steamId);

  const user = await prisma.user.update({
    where: { uid },
    data: {
      inGameName,
      verified: false,
      lockName: false,
    },
  });

  await prisma.$executeRaw`
    UPDATE public.users
    SET
      verification_level = ${steamLinked ? 1 : 0},
      verification_method = ${steamLinked ? "steam" : "none"},
      verified_at = NULL
    WHERE uid = ${uid}
  `;

  return NextResponse.json(
    toUserApi(user, {
      ...verification,
      verificationLevel: steamLinked ? 1 : 0,
      verificationMethod: steamLinked ? "steam" : "none",
      verifiedAt: null,
    }) satisfies UserApi
  );
}
