import { NextResponse } from "next/server";

import { buildGeneralInspectionsSnapshot } from "@/lib/generalInspections/serverSnapshot";
import { buildWhyNotGreenReport } from "@/lib/generalInspections/gapReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const requestedReport = new URL(request.url).searchParams.get("report");
    if (requestedReport && requestedReport !== "why-not-green") {
      return NextResponse.json(
        { error: "Unsupported inspection report" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    // One collector read per request; the report only projects that sanitized snapshot.
    const snapshot = buildGeneralInspectionsSnapshot();
    const response = NextResponse.json(
      requestedReport === "why-not-green"
        ? buildWhyNotGreenReport(snapshot, Date.now())
        : snapshot,
    );
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
