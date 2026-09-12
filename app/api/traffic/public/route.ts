import { NextResponse } from "next/server";

import { loadPublicTraffic } from "@/lib/publicTraffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      await loadPublicTraffic(),
      {
        headers: {
          "Cache-Control":
            "public, max-age=30, s-maxage=300, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error(
      "Public Traffic Observatory failed:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Traffic Observatory is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
