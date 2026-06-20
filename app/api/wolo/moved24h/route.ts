import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WoloMovedRow = {
  total_wolo: string | number | null;
  transfer_count: string | number | null;
};

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function GET() {
  const prisma = getPrisma();

  try {
    const rows = await prisma.$queryRaw<WoloMovedRow[]>`
      select
        coalesce(sum(abs(amount_wolo_display::numeric)), 0)::text as total_wolo,
        count(*)::text as transfer_count
      from wolo_indexed_transfers
      where timestamp >= now() - interval '24 hours'
    `;

    const row = rows[0] ?? { total_wolo: "0", transfer_count: "0" };

    return NextResponse.json({
      ok: true,
      windowHours: 24,
      totalWolo: toNumber(row.total_wolo),
      transferCount: Math.trunc(toNumber(row.transfer_count)),
    });
  } catch (error) {
    console.warn("Failed to load 24h WOLO movement:", error);

    return NextResponse.json({
      ok: false,
      windowHours: 24,
      totalWolo: 0,
      transferCount: 0,
    });
  }
}
