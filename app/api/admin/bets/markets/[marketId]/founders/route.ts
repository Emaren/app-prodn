import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { createFounderBonus, FounderBonusError } from "@/lib/betFounderBonuses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ marketId: string }> }
) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { marketId: marketIdRaw } = await context.params;
    const marketId = Number.parseInt(marketIdRaw, 10);
    if (!Number.isFinite(marketId)) {
      return NextResponse.json({ detail: "Market id is required." }, { status: 400 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      bonusType?: string;
      amountWolo?: number | string;
      note?: string;
    };

    const created = await createFounderBonus(gate.prisma, {
      marketId,
      bonusType: payload.bonusType,
      amountWolo: payload.amountWolo,
      note: typeof payload.note === "string" ? payload.note : null,
      createdByUserId: gate.user.id,
    });

    return NextResponse.json({
      ok: true,
      founderBonus: {
        id: created.id,
        marketId: created.marketId,
        bonusType: created.bonusType,
        totalAmountWolo: created.totalAmountWolo,
        note: created.note ?? null,
        status: created.status,
      },
    });
  } catch (error) {
    console.error("Failed to create founder bonus:", error);
    if (error instanceof FounderBonusError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const detail =
      error instanceof Error ? error.message : "Founder bonus could not be created.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
