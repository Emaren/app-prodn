import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma";

import {
  LEAGUE_CREATION_PRICE_WOLO,
  loadPublicLeagues,
  newLeagueIdentity,
  normalizeLeagueDescription,
  normalizeLeagueLine,
  normalizeLeagueMode,
  normalizeLeagueRequestId,
  normalizeLeagueTeamSize,
  resolveLeagueCommissioner,
  verifyLeagueCreationPayment,
} from "@/lib/leagues";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

type CreateLeagueBody = {
  requestId?: unknown;
  name?: unknown;
  description?: unknown;
  mode?: unknown;
  teamSize?: unknown;
  txHash?: unknown;
  fromAddress?: unknown;
};

export async function GET() {
  const leagues = await loadPublicLeagues(getPrisma());
  return NextResponse.json(
    { ok: true, leagues },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json(
        { detail: "Sign in before founding a league." },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const body = (await request.json().catch(() => ({}))) as CreateLeagueBody;
    const requestId = normalizeLeagueRequestId(body.requestId);
    const name = normalizeLeagueLine(body.name, 160);
    const description = normalizeLeagueDescription(body.description);
    const mode = normalizeLeagueMode(body.mode);
    const teamSize = normalizeLeagueTeamSize(body.teamSize);

    if (!requestId || !name || !mode || !teamSize) {
      return NextResponse.json(
        { detail: "League name, format, mode, and creation request are required." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const prisma = getPrisma();
    const [viewer, commissioner] = await Promise.all([
      prisma.user.findUnique({
        where: { uid: sessionUid },
        select: {
          id: true,
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      }),
      resolveLeagueCommissioner(prisma),
    ]);

    if (!viewer) {
      return NextResponse.json(
        { detail: "Your AoE2WAR profile could not be found." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const payment = await verifyLeagueCreationPayment({
      txHash: body.txHash,
      fromAddress: body.fromAddress,
      toAddress: commissioner.walletAddress,
      creatorUid: viewer.uid,
      requestId,
    });

    const creatorDisplayName =
      viewer.inGameName || viewer.steamPersonaName || viewer.uid;

    const existingLeague = await prisma.league.findUnique({
      where: { creationTxHash: payment.txHash },
    });

    if (existingLeague) {
      if (existingLeague.createdByUserId !== viewer.id) {
        throw new Error("That league creation payment has already been used.");
      }

      return NextResponse.json(
        {
          ok: true,
          recovered: true,
          league: {
            publicId: existingLeague.publicId,
            slug: existingLeague.slug,
            name: existingLeague.name,
            description: existingLeague.description,
            mode: existingLeague.mode,
            teamSize: existingLeague.teamSize,
            creatorDisplayName: existingLeague.creatorDisplayNameSnapshot,
            creationPriceWolo: existingLeague.creationPriceWolo,
            creationTxHash: existingLeague.creationTxHash,
            creationProofUrl: existingLeague.creationProofUrl,
            createdAt: existingLeague.createdAt.toISOString(),
          },
          href: `/leagues/${encodeURIComponent(existingLeague.slug)}`,
        },
        { status: 200, headers: NO_STORE_HEADERS },
      );
    }

    const identity = newLeagueIdentity(name);

    const league = await prisma.$transaction(async (tx) => {
      const created = await tx.league.create({
        data: {
          publicId: identity.publicId,
          slug: identity.slug,
          name,
          description: description || null,
          mode,
          teamSize,
          status: "active",
          createdByUserId: viewer.id,
          creatorDisplayNameSnapshot: creatorDisplayName,
          senderAddressSnapshot: payment.fromAddress,
          recipientAddressSnapshot: payment.toAddress,
          creationPriceWolo: LEAGUE_CREATION_PRICE_WOLO,
          creationMemo: payment.memo,
          creationTxHash: payment.txHash,
          creationProofUrl: payment.proofUrl,
        },
      });

      await recordUserActivity(tx, {
        userId: viewer.id,
        type: "league_created",
        path: "/leagues",
        label: payment.txHash,
        metadata: {
          leaguePublicId: created.publicId,
          leagueSlug: created.slug,
          leagueName: created.name,
          mode: created.mode,
          teamSize: created.teamSize,
          amountWolo: LEAGUE_CREATION_PRICE_WOLO,
          commissionerUid: commissioner.uid,
          fromAddress: payment.fromAddress,
          toAddress: payment.toAddress,
          txHash: payment.txHash,
          proofUrl: payment.proofUrl,
        },
        dedupeWithinSeconds: 0,
      });

      return created;
    });

    return NextResponse.json(
      {
        ok: true,
        league: {
          publicId: league.publicId,
          slug: league.slug,
          name: league.name,
          description: league.description,
          mode: league.mode,
          teamSize: league.teamSize,
          creatorDisplayName,
          creationPriceWolo: league.creationPriceWolo,
          creationTxHash: league.creationTxHash,
          creationProofUrl: league.creationProofUrl,
          createdAt: league.createdAt.toISOString(),
        },
        href: `/leagues/${encodeURIComponent(league.slug)}`,
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const duplicate =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
    const detail =
      duplicate
        ? "That league creation payment has already been used."
        : error instanceof Error
          ? error.message
          : "League creation failed.";

    console.error("League creation failed:", error);
    return NextResponse.json(
      { detail },
      {
        status: duplicate ? 409 : detail.includes("required") ? 400 : 422,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
