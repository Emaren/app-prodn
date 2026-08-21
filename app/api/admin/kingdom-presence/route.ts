import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { livingKingdomHub } from "@/lib/livingKingdom/hub";
import { livingKingdomFeatureMode } from "@/lib/livingKingdom/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  return NextResponse.json(
    {
      mode: livingKingdomFeatureMode(),
      ...livingKingdomHub.stats(),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
