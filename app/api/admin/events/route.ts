import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  EventStudioActionError,
  executeEventStudioAction,
} from "@/lib/events/actions";
import { loadEventStudioSnapshot } from "@/lib/events/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    return NextResponse.json(
      await loadEventStudioSnapshot(gate.prisma),
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to load Event Studio:", error);
    return NextResponse.json(
      { detail: "Event Studio data is unavailable." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await executeEventStudioAction(gate.prisma, payload);
    return NextResponse.json(
      {
        snapshot: await loadEventStudioSnapshot(gate.prisma),
        resultId: result.id,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof EventStudioActionError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error("Event Studio action failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Event Studio action failed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
