import { NextResponse } from "next/server";

import { buildGeneralInspectionsSnapshot } from "@/lib/generalInspections/serverSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = NextResponse.json(buildGeneralInspectionsSnapshot());
    response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    return response;
  } catch (error) {
    console.error("General Inspections snapshot failed:", error);
    return NextResponse.json(
      {
        schema: 1,
        generatedAt: new Date().toISOString(),
        releaseSha: null,
        buildVersion: null,
        overallScore: 0,
        overallState: "red",
        categories: [],
        notes: ["General Inspections evidence reader is temporarily unavailable."],
      },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  }
}
