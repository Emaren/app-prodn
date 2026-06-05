import { NextRequest, NextResponse } from "next/server";

import { loadPlayerProfileMatchPage, type PlayerProfileIdentity } from "@/lib/playerProfile";
import { getPrisma } from "@/lib/prisma";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Failed to load player profile matches:", error);
    return NextResponse.json({ detail: "Match feed unavailable." }, { status: 500 });
  }
}
