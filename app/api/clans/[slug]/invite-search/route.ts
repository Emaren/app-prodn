import { NextRequest, NextResponse } from "next/server";

import { canSendClanInvite } from "@/lib/clanInvites";
import { clanHallFeatureEnabled } from "@/lib/clanHallFeatures";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function normalizeSlug(value: string) {
  return decodeURIComponent(value).trim().toLowerCase().slice(0, 80);
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const params = await context.params;
    const slug = normalizeSlug(params.slug);
    if (!clanHallFeatureEnabled(slug, "inviteDoor")) {
      return NextResponse.json(
        { results: [] },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json(
        { results: [] },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 80);
    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] }, { headers: NO_STORE_HEADERS });
    }

    const prisma = getPrisma();
    const [viewer, clan] = await Promise.all([
      prisma.user.findUnique({
        where: { uid: sessionUid },
        select: { id: true, isAdmin: true },
      }),
      prisma.clan.findFirst({
        where: { slug, status: "active" },
        select: { id: true },
      }),
    ]);

    if (!viewer || !clan) {
      return NextResponse.json(
        { results: [] },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const membership = await prisma.clanMember.findUnique({
      where: {
        clanId_userId: {
          clanId: clan.id,
          userId: viewer.id,
        },
      },
      select: { role: true, status: true },
    });

    if (
      !canSendClanInvite({
        siteAdmin: viewer.isAdmin,
        membershipRole: membership?.role ?? null,
        membershipStatus: membership?.status ?? null,
      })
    ) {
      return NextResponse.json(
        { results: [] },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const candidates = await prisma.user.findMany({
      where: {
        id: { not: viewer.id },
        OR: [
          { uid: { contains: query, mode: "insensitive" } },
          { inGameName: { contains: query, mode: "insensitive" } },
          { steamPersonaName: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ inGameName: "asc" }, { id: "asc" }],
      take: 12,
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });

    const memberRows = candidates.length
      ? await prisma.clanMember.findMany({
          where: {
            clanId: clan.id,
            userId: { in: candidates.map((candidate) => candidate.id) },
            status: "active",
          },
          select: { userId: true },
        })
      : [];

    const memberIds = new Set(memberRows.map((row) => row.userId));

    return NextResponse.json(
      {
        results: candidates.map((candidate) => ({
          uid: candidate.uid,
          displayName: displayName(candidate),
          alreadyMember: memberIds.has(candidate.id),
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to search Clan invite candidates:", error);
    return NextResponse.json(
      { results: [] },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
