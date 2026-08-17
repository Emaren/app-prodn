import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { loadKingdomKnowledgeContext } from "@/lib/kingdomKnowledgeRouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = new Set([
  "lobby_public",
  "lobby_private",
  "contact_thread",
  "council",
  "bounty_page",
  "clan_hall",
]);

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const q =
    request.nextUrl.searchParams.get("q")?.trim().slice(0, 500) ||
    "What can the Kingdom Knowledge Router answer?";

  const rawSource =
    request.nextUrl.searchParams.get("source") || "lobby_public";
  const source = SOURCES.has(rawSource)
    ? (rawSource as
        | "lobby_public"
        | "lobby_private"
        | "contact_thread"
        | "council"
        | "bounty_page"
        | "clan_hall")
    : "lobby_public";

  const viewer = await gate.prisma.user.findUnique({
    where: { uid: gate.user.uid },
    select: {
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!viewer) {
    return NextResponse.json(
      { detail: "Admin viewer missing." },
      { status: 404 },
    );
  }

  const result = await loadKingdomKnowledgeContext({
    prisma: gate.prisma,
    viewer: {
      uid: viewer.uid,
      displayName:
        viewer.inGameName ||
        viewer.steamPersonaName ||
        viewer.uid,
    },
    source,
    message: q,
    maxRepositories: 8,
    maxContextChars: 24_000,
  });

  return NextResponse.json({
    ok: true,
    query: q,
    source,
    selectedRepositories: result.selectedRepositories,
    traces: result.traces,
    generatedAt: result.generatedAt,
    contextPreview: result.context,
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
