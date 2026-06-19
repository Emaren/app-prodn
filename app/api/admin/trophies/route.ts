import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  executeTrophyAdminAction,
  TrophyActionError,
} from "@/lib/trophies/actions";
import {
  ensureTrophySeedData,
  loadTrophyCommandSnapshot,
} from "@/lib/trophies/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    await ensureTrophySeedData(gate.prisma);
    return NextResponse.json(await loadTrophyCommandSnapshot(gate.prisma));
  } catch (error) {
    console.error("Failed to load Trophy Command Center:", error);
    return NextResponse.json(
      { detail: "Trophy Command Center data is unavailable." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await ensureTrophySeedData(gate.prisma);
    await executeTrophyAdminAction(gate.prisma, gate.user, payload);
    return NextResponse.json(await loadTrophyCommandSnapshot(gate.prisma));
  } catch (error) {
    if (error instanceof TrophyActionError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    console.error("Trophy Command action failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Trophy Command action failed." },
      { status: 500 }
    );
  }
}
