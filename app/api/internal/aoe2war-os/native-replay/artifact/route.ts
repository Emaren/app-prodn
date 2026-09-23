import { NextRequest, NextResponse } from "next/server";

import {
  bridgeTokenConfigured,
  bridgeTokenMatches,
  readAoe2OsRun,
} from "@/lib/aoe2Os";
import {
  loadNativeReplayArtifact,
  parseNativeReplayRunParameters,
} from "@/lib/nativeReplayWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
};

function unauthorized(request: NextRequest) {
  if (!bridgeTokenConfigured()) {
    return NextResponse.json(
      { detail: "AOE2WAR_OS_BRIDGE_TOKEN is not configured on the server." },
      { status: 503, headers: NO_STORE }
    );
  }
  if (!bridgeTokenMatches(request.headers.get("x-aoe2war-os-key"))) {
    return NextResponse.json(
      { detail: "Invalid AoE2WAR OS bridge credential." },
      { status: 401, headers: NO_STORE }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = unauthorized(request);
  if (authError) return authError;

  const runId = request.nextUrl.searchParams.get("runId")?.trim() || "";
  if (!/^[A-Za-z0-9-]{1,100}$/.test(runId)) {
    return NextResponse.json(
      { detail: "A valid runId is required." },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const run = await readAoe2OsRun(runId);
    if (!run) {
      return NextResponse.json(
        { detail: "AoE2WAR OS run not found." },
        { status: 404, headers: NO_STORE }
      );
    }
    if (run.action !== "replay_native_run") {
      return NextResponse.json(
        { detail: "The requested run is not a native replay run." },
        { status: 409, headers: NO_STORE }
      );
    }
    if (!["claimed", "running"].includes(run.status)) {
      return NextResponse.json(
        { detail: `Native replay artifact is unavailable while run status is ${run.status}.` },
        { status: 409, headers: NO_STORE }
      );
    }

    const parameters = parseNativeReplayRunParameters(run.parameters);
    const artifact = await loadNativeReplayArtifact(parameters);

    return new NextResponse(artifact.bytes, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(artifact.byteSize),
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "X-AoE2WAR-Replay-SHA256": artifact.sha256,
        "X-AoE2WAR-Replay-Extension": artifact.fileName.slice(
          artifact.fileName.lastIndexOf(".")
        ),
        "X-AoE2WAR-Game-Stats-ID": String(parameters.gameStatsId),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Native replay artifact could not be materialized.",
      },
      { status: 409, headers: NO_STORE }
    );
  }
}
