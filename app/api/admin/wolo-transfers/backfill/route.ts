import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { backfillWoloMainnetTransfers } from "@/lib/woloMainnetTransfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function numberOption(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    const result = await backfillWoloMainnetTransfers(gate.prisma, {
      blockLimit: numberOption(body?.blockLimit),
      addressLimit: numberOption(body?.addressLimit),
      perAddressLimit: numberOption(body?.perAddressLimit),
      globalLimit: numberOption(body?.globalLimit),
    });

    return NextResponse.json({ ok: true, result }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "WOLO transfer backfill failed.";
    return NextResponse.json(
      { ok: false, detail },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
