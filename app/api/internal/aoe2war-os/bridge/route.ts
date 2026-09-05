import { NextRequest, NextResponse } from "next/server";

import {
  appendAoe2OsRunEvent,
  bridgeTokenConfigured,
  bridgeTokenMatches,
  claimNextAoe2OsRun,
  completeAoe2OsRun,
  createAoe2OsRun,
  isAoe2OsAction,
  loadAoe2OsDashboard,
  readAoe2OsRun,
  readAoe2OsRunEvents,
  writeAoe2OsBridgeHeartbeat,
  writeAoe2OsSnapshot,
} from "@/lib/aoe2Os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
};

type JsonRecord = Record<string, unknown>;

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

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

function bridgeFields(body: JsonRecord) {
  const bridgeId = text(body.bridgeId, 100);
  const hostname = text(body.hostname, 160);
  const platform = text(body.platform, 120);
  const version = text(body.version, 64);
  const rawCapabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
  const capabilities = rawCapabilities.filter(isAoe2OsAction);

  if (!bridgeId || !hostname) return null;

  return {
    bridgeId,
    hostname,
    platform: platform || "unknown",
    version: version || "unknown",
    capabilities,
    currentRunId: text(body.currentRunId, 100) || null,
  };
}

export async function POST(request: NextRequest) {
  const authError = unauthorized(request);
  if (authError) return authError;

  const body = record(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json(
      { detail: "JSON body required." },
      { status: 400, headers: NO_STORE }
    );
  }

  const op = text(body.op, 32);

  // The production CLI uses the same authenticated, fixed-action control
  // plane to delegate `finish` to the Mac source authority. These operations
  // intentionally do not publish a fake VPS bridge heartbeat.
  try {
    if (op === "queue_finish") {
      const dashboard = await loadAoe2OsDashboard();
      if (
        !dashboard.bridge?.online ||
        !dashboard.bridge.capabilities.includes("finish")
      ) {
        return NextResponse.json(
          { detail: "The Mac Operator Bridge is not online with finish capability." },
          { status: 503, headers: NO_STORE }
        );
      }

      const run = await createAoe2OsRun({
        action: "finish",
        requestedByUserId: 0,
        requestedByUid: `production-cli:${text(body.hostname, 120) || "unknown"}`,
        parameters: {
          message: text(body.message, 200) || "Finish AoE2WAR work",
          dryRun: body.dryRun === true,
          preserveContextHistory: body.preserveContextHistory === true,
        },
      });
      return NextResponse.json({ ok: true, run }, { headers: NO_STORE });
    }

    if (op === "run_status") {
      const runId = text(body.runId, 100);
      if (!runId) {
        return NextResponse.json(
          { detail: "runId is required." },
          { status: 400, headers: NO_STORE }
        );
      }
      const run = await readAoe2OsRun(runId);
      if (!run) {
        return NextResponse.json(
          { detail: "AoE2WAR OS run not found." },
          { status: 404, headers: NO_STORE }
        );
      }
      const events = await readAoe2OsRunEvents(runId);
      return NextResponse.json({ ok: true, run, events }, { headers: NO_STORE });
    }
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error ? error.message : "AoE2WAR OS delegation failed.",
      },
      { status: 409, headers: NO_STORE }
    );
  }

  const bridge = bridgeFields(body);

  if (!bridge) {
    return NextResponse.json(
      { detail: "bridgeId and hostname are required." },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const heartbeat = await writeAoe2OsBridgeHeartbeat(bridge);

    if (op === "heartbeat") {
      return NextResponse.json({ ok: true, heartbeat }, { headers: NO_STORE });
    }

    if (op === "claim") {
      const run = await claimNextAoe2OsRun(bridge.bridgeId);
      return NextResponse.json({ ok: true, run }, { headers: NO_STORE });
    }

    if (op === "event") {
      const runId = text(body.runId, 100);
      const message = text(body.message, 8_000);
      const kind =
        body.kind === "stderr" || body.kind === "system" || body.kind === "info"
          ? body.kind
          : "stdout";

      if (!runId || !message) {
        return NextResponse.json(
          { detail: "runId and message are required." },
          { status: 400, headers: NO_STORE }
        );
      }

      const event = await appendAoe2OsRunEvent({
        runId,
        bridgeId: bridge.bridgeId,
        kind,
        message,
      });
      return NextResponse.json({ ok: true, event }, { headers: NO_STORE });
    }

    if (op === "complete") {
      const runId = text(body.runId, 100);
      const exitCode = Number(body.exitCode);

      if (!runId || !Number.isInteger(exitCode)) {
        return NextResponse.json(
          { detail: "runId and integer exitCode are required." },
          { status: 400, headers: NO_STORE }
        );
      }

      const run = await completeAoe2OsRun({
        runId,
        bridgeId: bridge.bridgeId,
        exitCode,
        result: body.result ?? null,
        error: text(body.error, 20_000) || null,
        stdoutTail: text(body.stdoutTail, 40_000) || null,
      });
      return NextResponse.json({ ok: true, run }, { headers: NO_STORE });
    }

    if (op === "snapshot") {
      const payload = record(body.payload);
      if (!payload) {
        return NextResponse.json(
          { detail: "snapshot payload is required." },
          { status: 400, headers: NO_STORE }
        );
      }

      const snapshot = await writeAoe2OsSnapshot({
        bridgeId: bridge.bridgeId,
        runId: text(body.runId, 100) || null,
        sourceAction: text(body.sourceAction, 64) || "bridge",
        payload,
      });
      return NextResponse.json({ ok: true, snapshot }, { headers: NO_STORE });
    }

    return NextResponse.json(
      { detail: `Unknown bridge op: ${op || "(empty)"}` },
      { status: 400, headers: NO_STORE }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error ? error.message : "AoE2WAR OS bridge operation failed.",
      },
      { status: 409, headers: NO_STORE }
    );
  }
}
