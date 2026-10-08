import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { loadPlayerResultRecoveryPlan, parsePlayerResultRecoveryRequest } from "@/lib/playerResultRecovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  let input;
  try {
    input = parsePlayerResultRecoveryRequest(await request.json());
  } catch (error) {
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Invalid player recovery plan request." }, { status: 400, headers });
  }
  try {
    return NextResponse.json(await loadPlayerResultRecoveryPlan(gate.prisma, input), { headers });
  } catch (error) {
    console.error("[player-recovery] read-only planning failed", error);
    return NextResponse.json({ detail: "The player recovery census could not be completed. No worker or result writer was invoked." }, { status: 503, headers });
  }
}
