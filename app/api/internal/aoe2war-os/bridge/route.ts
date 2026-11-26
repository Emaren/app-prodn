import { NextRequest, NextResponse } from "next/server";
import { acceptStorageVisualSubmission } from "@/lib/storageVisualBridgeReceiver";

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
  writeAoe2OsKingdomIntelligence,
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

const STORAGE_VISUAL_MAX_BYTES = 49_152;
const STORAGE_VISUAL_FIELDS = new Set([
  "op", "bridgeId", "hostname", "platform", "version", "capabilities", "payload",
]);

function storageError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status, headers: NO_STORE });
}

async function storeVisual(payload: JsonRecord) {
  try {
    const ack = await acceptStorageVisualSubmission(payload);
    return NextResponse.json(ack, { status: 201, headers: NO_STORE });
  } catch {
    return storageError(409, "STORAGE_VISUAL_AUTH_OR_REPLAY_HOLD");
  }
}

async function scopedStoragePost(request: NextRequest, scope: string) {
  if (scope !== "storage_visual") return storageError(403, "BRIDGE_SCOPE_DENIED");
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(contentType)) {
    return storageError(415, "STORAGE_VISUAL_JSON_REQUIRED");
  }

  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) return storageError(400, "INVALID_CONTENT_LENGTH");
  if (length !== null && Number(length) > STORAGE_VISUAL_MAX_BYTES) {
    return storageError(413, "STORAGE_VISUAL_BODY_BOUNDS_HOLD");
  }
  if (!request.body) return storageError(400, "STORAGE_VISUAL_WIRE_INVALID");

  const bytes = new Uint8Array(STORAGE_VISUAL_MAX_BYTES);
  const reader = request.body.getReader();
  let used = 0;
  let wire: JsonRecord | null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > bytes.length - used) {
        void reader.cancel().catch(() => undefined);
        return storageError(413, "STORAGE_VISUAL_BODY_BOUNDS_HOLD");
      }
      bytes.set(value, used);
      used += value.byteLength;
    }
    if (length !== null && Number(length) !== used) return storageError(400, "INVALID_CONTENT_LENGTH");
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used));
    wire = record(JSON.parse(json));
  } catch {
    return storageError(400, "STORAGE_VISUAL_WIRE_INVALID");
  } finally {
    reader.releaseLock();
  }

  // VPSSentry #50 signs the payload. Its other V1 wrapper fields describe the
  // relay and must never supply producer identity, privileges or a heartbeat.
  if (!wire || Object.keys(wire).length !== STORAGE_VISUAL_FIELDS.size ||
      !Object.keys(wire).every(key => STORAGE_VISUAL_FIELDS.has(key)) ||
      wire.op !== "storage_visual" || wire.version !== "storage-visual-bridge-v1" ||
      typeof wire.bridgeId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(wire.bridgeId) ||
      typeof wire.hostname !== "string" || !wire.hostname.trim() || wire.hostname.length > 255 ||
      typeof wire.platform !== "string" || !wire.platform.trim() || wire.platform.length > 64 ||
      !Array.isArray(wire.capabilities) || wire.capabilities.length !== 0) {
    return storageError(400, "STORAGE_VISUAL_WIRE_INVALID");
  }
  const payload = record(wire.payload);
  return payload ? storeVisual(payload) : storageError(400, "STORAGE_VISUAL_WIRE_INVALID");
}

export async function POST(request: NextRequest) {
  const authError = unauthorized(request);
  if (authError) return authError;

  // WE2 must overwrite this header on every external bridge request before
  // opening ingress. Only the private control transport may remain unmarked.
  const scope = request.headers.get("x-aoe2war-bridge-scope");
  // The Nginx EXACT legacy operator endpoint must overwrite the untrusted
  // client scope with operator_control. Only the separate storage visual
  // endpoint may carry storage_visual. No unmarked direct POST is allowed.
  if (scope === "storage_visual") return scopedStoragePost(request, scope);
  if (scope !== "operator_control") return storageError(403, "BRIDGE_SCOPE_DENIED");

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

  // Source-separated storage_visual uses the existing authenticated bridge.
  // No synthetic heartbeat, timer, scanner or release-controller operation.
  if (op === "storage_visual") {
    const payload = record(body.payload);
    if (!payload || Buffer.byteLength(JSON.stringify(body), "utf8") > STORAGE_VISUAL_MAX_BYTES) {
      return storageError(413, "STORAGE_VISUAL_BODY_BOUNDS_HOLD");
    }
    return storeVisual(payload);
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

    if (op === "kingdom_intelligence") {
      const payload = record(body.payload);
      if (!payload) {
        return NextResponse.json(
          { detail: "Kingdom Intelligence payload is required." },
          { status: 400, headers: NO_STORE }
        );
      }

      const intelligence = await writeAoe2OsKingdomIntelligence({
        bridgeId: bridge.bridgeId,
        runId: text(body.runId, 100) || null,
        sourceAction: text(body.sourceAction, 64) || "brain",
        payload,
      });
      return NextResponse.json({ ok: true, intelligence }, { headers: NO_STORE });
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
