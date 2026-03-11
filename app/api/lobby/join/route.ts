import { NextRequest, NextResponse } from "next/server";
import { getFeaturedTournament } from "@/lib/communityStore";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const uid = await resolveRequestUid(request, body);

  if (!uid) {
    return NextResponse.json(
      { detail: "Sign in with Steam to join the tournament." },
      { status: 401 }
    );
  }

  const tournamentId =
    typeof body.tournamentId === "number"
      ? body.tournamentId
      : typeof body.tournamentId === "string"
        ? Number(body.tournamentId)
        : NaN;

  if (!Number.isFinite(tournamentId) || tournamentId < 1) {
    return NextResponse.json({ detail: "Invalid tournament id." }, { status: 400 });
  }

  const prisma = getPrisma();
  const [user, tournament] = await Promise.all([
    prisma.user.findUnique({
      where: { uid },
      select: { id: true },
    }),
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, status: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ detail: "User not found." }, { status: 404 });
  }

  if (!tournament) {
    return NextResponse.json({ detail: "Tournament not found." }, { status: 404 });
  }

  if (tournament.status === "completed") {
    return NextResponse.json({ detail: "This tournament is already completed." }, { status: 400 });
  }

  await prisma.tournamentEntry.upsert({
    where: {
      tournamentId_userId: {
        tournamentId,
        userId: user.id,
      },
    },
    update: {
      status: "joined",
      note: null,
    },
    create: {
      tournamentId,
      userId: user.id,
      status: "joined",
    },
  });

  const featuredTournament = await getFeaturedTournament(prisma, uid);
  return NextResponse.json({ ok: true, tournament: featuredTournament });
}
