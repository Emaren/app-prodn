import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  bridgeTokenConfigured,
  confirmationMatches,
  createAoe2OsRun,
  getAoe2OsAction,
  isAoe2OsAction,
  loadAoe2OsDashboard,
  cancelAoe2OsRun,
} from "@/lib/aoe2Os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
};

function validSha(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value.trim());
}

async function dashboardResponse(status = 200) {
  try {
    const dashboard = await loadAoe2OsDashboard();
    return NextResponse.json(
      {
        ...dashboard,
        bridgeTokenConfigured: bridgeTokenConfigured(),
      },
      { status, headers: NO_STORE }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "AoE2WAR OS control store is unavailable.",
      },
      { status: 503, headers: NO_STORE }
    );
  }
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  return dashboardResponse();
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;

  if (!isAoe2OsAction(action)) {
    return NextResponse.json(
      { detail: "Unknown AoE2WAR OS action." },
      { status: 400, headers: NO_STORE }
    );
  }

  const dashboard = await loadAoe2OsDashboard();
  if (!dashboard.bridge?.online) {
    return NextResponse.json(
      { detail: "Operator Bridge is offline. Start the bridge before queueing commands." },
      { status: 409, headers: NO_STORE }
    );
  }

  const definition = getAoe2OsAction(action);
  if (!confirmationMatches(action, body.confirmation)) {
    return NextResponse.json(
      {
        detail: `Type ${definition.confirmation} to confirm ${definition.label}.`,
      },
      { status: 400, headers: NO_STORE }
    );
  }

  if (definition.requiresSourceSha && !validSha(body.expectedSourceSha)) {
    return NextResponse.json(
      { detail: "A 40-character expected source SHA is required for production deploy." },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    await createAoe2OsRun({
      action,
      requestedByUserId: admin.user.id,
      requestedByUid: admin.user.uid,
      expectedSourceSha:
        typeof body.expectedSourceSha === "string"
          ? body.expectedSourceSha.trim()
          : null,
      expectedTargetSha:
        typeof body.expectedTargetSha === "string"
          ? body.expectedTargetSha.trim()
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error ? error.message : "Could not queue AoE2WAR OS action.",
      },
      { status: 409, headers: NO_STORE }
    );
  }

  return dashboardResponse(201);
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";

  if (!runId) {
    return NextResponse.json(
      { detail: "runId is required." },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const cancelled = await cancelAoe2OsRun(runId);
    if (!cancelled) {
      return NextResponse.json(
        { detail: "Run not found." },
        { status: 404, headers: NO_STORE }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : "Could not cancel run.",
      },
      { status: 409, headers: NO_STORE }
    );
  }

  return dashboardResponse();
}
