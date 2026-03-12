import { NextRequest, NextResponse } from "next/server";
import { ensureTournamentRoom, getFeaturedTournament } from "@/lib/communityStore";
import { requireAdmin } from "@/lib/adminSession";
import { PrismaClient } from "@/lib/generated/prisma";
import { normalizeTournamentStatus, slugifyTournamentTitle } from "@/lib/lobby";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseStartsAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  return parsed;
}

async function buildUniqueTournamentSlug(prisma: PrismaClient, title: string) {
  const baseSlug = slugifyTournamentTitle(title) || "community-tournament";

  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.tournament.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${baseSlug.slice(0, 70)}-${suffix}`.slice(0, 80);
    suffix += 1;
  }

  return candidate;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const tournament = await getFeaturedTournament(admin.prisma, admin.user.uid);
  return NextResponse.json({ tournament });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const description =
    typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
  const format =
    typeof body.format === "string" && body.format.trim()
      ? body.format.trim().slice(0, 80)
      : "1v1 AoE2HD showcase";
  const status = normalizeTournamentStatus(body.status);
  const startsAt = parseStartsAt(body.startsAt);

  if (title.length < 3) {
    return NextResponse.json({ detail: "Title must be at least 3 characters." }, { status: 400 });
  }

  if (startsAt === "invalid") {
    return NextResponse.json({ detail: "Invalid start date." }, { status: 400 });
  }

  const id =
    typeof body.id === "number"
      ? body.id
      : typeof body.id === "string"
        ? Number(body.id)
        : null;

  let tournamentId: number;

  if (id && Number.isFinite(id)) {
    const existing = await admin.prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        chatRoomId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ detail: "Tournament not found." }, { status: 404 });
    }

    const room =
      existing.chatRoomId
        ? await admin.prisma.chatRoom.findUnique({
            where: { id: existing.chatRoomId },
            select: { id: true, slug: true },
          })
        : null;

    const chatRoom = room || (await ensureTournamentRoom(admin.prisma, existing.slug, title));

    await admin.prisma.$transaction([
      admin.prisma.tournament.updateMany({
        where: { featured: true, NOT: { id: existing.id } },
        data: { featured: false },
      }),
      admin.prisma.tournament.update({
        where: { id: existing.id },
        data: {
          title,
          description,
          format,
          status,
          startsAt: startsAt || null,
          featured: true,
          chatRoomId: chatRoom.id,
          createdByUserId: admin.user.id,
        },
      }),
    ]);

    tournamentId = existing.id;
  } else {
    const slug = await buildUniqueTournamentSlug(admin.prisma, title);
    const chatRoom = await ensureTournamentRoom(admin.prisma, slug, title);

    await admin.prisma.tournament.updateMany({
      where: { featured: true },
      data: { featured: false },
    });

    const created = await admin.prisma.tournament.create({
      data: {
        slug,
        title,
        description,
        format,
        status,
        startsAt: startsAt || null,
        featured: true,
        chatRoomId: chatRoom.id,
        createdByUserId: admin.user.id,
      },
      select: { id: true },
    });

    tournamentId = created.id;
  }

  const tournament = await getFeaturedTournament(admin.prisma, admin.user.uid);
  return NextResponse.json({ ok: true, tournament, tournamentId });
}
