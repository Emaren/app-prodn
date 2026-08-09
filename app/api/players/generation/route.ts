import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadPublicReplayGeneration } from "@/lib/publicReplayGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const generation = await loadPublicReplayGeneration(getPrisma());

  return NextResponse.json(
    { generation },
    {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
