import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadPublicPlayerDirectoryGeneration } from "@/lib/publicPlayerDirectoryGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const generation = await loadPublicPlayerDirectoryGeneration(getPrisma());

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
