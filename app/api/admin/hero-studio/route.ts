import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  executeHeroStudioAction,
  HeroStudioActionError,
} from "@/lib/hero/actions";
import { loadHeroStudioSnapshot } from "@/lib/hero/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    return NextResponse.json(await loadHeroStudioSnapshot(gate.prisma), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Failed to load Hero Studio:", error);
    return NextResponse.json(
      { detail: "Hero Studio data is unavailable." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    const payload = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const result = await executeHeroStudioAction(
      gate.prisma,
      payload,
      gate.user.uid
    );
    return NextResponse.json(
      {
        snapshot: await loadHeroStudioSnapshot(gate.prisma),
        resultId: result.id,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof HeroStudioActionError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error("Hero Studio action failed:", error);
    return NextResponse.json(
      {
        detail:
          error instanceof Error ? error.message : "Hero Studio action failed.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
