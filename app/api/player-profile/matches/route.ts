import { NextRequest, NextResponse } from "next/server";

import { applyProfileViewerMembership, loadPlayerProfileMatchPage, type PlayerProfileIdentity } from "@/lib/playerProfile";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { isNonfinancialPublicReadProfile } from "@/lib/nonfinancialPublicReadProfile";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCursor(value: string | null) {
  const parsed = Number(value || "0");
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function readLimit(value: string | null) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function readIdentity(request: NextRequest): PlayerProfileIdentity | null {
  const kind = request.nextUrl.searchParams.get("kind");

  if (kind === "claimed") {
    const uid = request.nextUrl.searchParams.get("uid")?.trim();
    return uid ? { kind, uid } : null;
  }

  if (kind === "replay") {
    const name = normalizePublicPlayerName(request.nextUrl.searchParams.get("name"));
    return name ? { kind, name } : null;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const identity = readIdentity(request);
    if (!identity) {
      return NextResponse.json({ detail: "Player identity is required." }, { status: 400 });
    }

    const page = await loadPlayerProfileMatchPage(
      getPrisma(),
      identity,
      readCursor(request.nextUrl.searchParams.get("cursor")),
      readLimit(request.nextUrl.searchParams.get("limit"))
    );

    if (!page) {
      return NextResponse.json({ detail: "Player not found." }, { status: 404 });
    }

    const responsePage = isNonfinancialPublicReadProfile()
      ? await applyProfileViewerMembership(getPrisma(), page, await getSessionUid(request))
      : page;
    return NextResponse.json(responsePage, {
      headers: {
        "Cache-Control":
          "private, no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Failed to load player profile matches:", error);
    return NextResponse.json({ detail: "Match feed unavailable." }, { status: 500 });
  }
}
