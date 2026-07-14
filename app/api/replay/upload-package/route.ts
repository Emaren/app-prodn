import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { reconcileTournamentMatchProofs } from "@/lib/tournamentProofReconciler";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const SUPPORTED_REPLAY_EXTENSIONS = new Set([
  ".aoe2record",
  ".aoe2mpgame",
  ".mgz",
  ".mgx",
  ".mgl",
]);

const MAX_REPLAY_PACK_FILES = 50;
const MAX_REPLAY_PACK_BYTES = 100 * 1024 * 1024;

type PackageUploadResult = {
  filename: string;
  ok: boolean;
  status: number;
  message?: string;
  detail?: string;
  finalityStatus?: string;
  gameId?: unknown;
  archived: boolean;
  parsed: boolean;
  resultReady: boolean;
  reviewRouted: boolean;
  duplicate: boolean;
};

type PackageSkippedEntry = {
  filename: string;
  reason: string;
};

function extensionFor(filename: string) {
  const normalized = filename.toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index) : "";
}

function isSupportedReplayFilename(filename: string) {
  return SUPPORTED_REPLAY_EXTENSIONS.has(extensionFor(filename));
}

function basenameFromArchivePath(value: string) {
  const cleaned = value.replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1]?.trim() || "replay.aoe2record";
}

function shouldIgnoreArchivePath(value: string) {
  const cleaned = value.replace(/\\/g, "/");
  const basename = basenameFromArchivePath(cleaned);
  return cleaned.startsWith("__MACOSX/") || basename === ".DS_Store" || basename.startsWith("._");
}

function parseJsonBody(value: string, contentType: string | null) {
  if (!value || !contentType?.toLowerCase().includes("json")) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTruthyPayloadFlag(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function classifyBackendReplayReceipt(
  payload: Record<string, unknown> | null,
  responseOk: boolean
) {
  const finalityStatus = String(
    payload?.finality_status || payload?.finalityStatus || ""
  ).trim();
  const pendingParse = isTruthyPayloadFlag(payload?.pending_parse ?? payload?.pendingParse);
  const unparsedFinal = isTruthyPayloadFlag(payload?.unparsed_final ?? payload?.unparsedFinal);
  const explicitParseCompleted = payload?.parse_completed ?? payload?.parseCompleted;
  const parsed =
    explicitParseCompleted === undefined || explicitParseCompleted === null
      ? Boolean(finalityStatus) &&
        !pendingParse &&
        !unparsedFinal &&
        !["live_pending_parse", "final_unparsed_proof"].includes(finalityStatus)
      : isTruthyPayloadFlag(explicitParseCompleted);
  const trustedFinalStatuses = new Set([
    "trusted_final",
    "trusted_final_duplicate",
    "trusted_final_refreshed",
    "reviewed_match_duplicate",
    "reviewed_match_refreshed",
  ]);
  const resultReady = Boolean(
    responseOk &&
      (isTruthyPayloadFlag(payload?.final_accepted ?? payload?.finalAccepted) ||
        isTruthyPayloadFlag(payload?.should_settle ?? payload?.shouldSettle) ||
        trustedFinalStatuses.has(finalityStatus))
  );
  const duplicate = finalityStatus.endsWith("_duplicate");

  return {
    finalityStatus,
    archived: Boolean(
      responseOk &&
        isTruthyPayloadFlag(payload?.raw_replay_archived ?? payload?.rawReplayArchived)
    ),
    parsed: Boolean(responseOk && parsed),
    resultReady,
    reviewRouted: Boolean(responseOk && !resultReady),
    duplicate,
  };
}

function receiptMessage(receipt: ReturnType<typeof classifyBackendReplayReceipt>) {
  if (receipt.resultReady) return "Result ready and filed.";
  if (receipt.parsed) return "Replay parsed and secured for private result review.";
  if (receipt.archived) return "Replay secured for private result review.";
  return "Replay received for private result review.";
}

async function listZipEntries(zipPath: string) {
  const { stdout } = await execFileAsync("unzip", ["-Z1", zipPath], {
    maxBuffer: 1024 * 1024,
  });

  return stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function readZipEntry(zipPath: string, entryName: string) {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath, entryName], {
    encoding: "buffer",
    maxBuffer: MAX_REPLAY_PACK_BYTES,
  });

  return Buffer.from(stdout);
}

async function uploadReplayBufferToBackend(options: {
  base: string;
  uid: string;
  playerName: string | null;
  data: Buffer;
  filename: string;
}) {
  const formData = new FormData();
  const bytes = new Uint8Array(
    options.data.buffer,
    options.data.byteOffset,
    options.data.byteLength
  );

  formData.append(
    "file",
    new Blob([bytes], { type: "application/octet-stream" }),
    options.filename
  );

  const headers = new Headers();
  headers.set("x-user-uid", options.uid);
  if (options.playerName) {
    headers.set("x-player-name", options.playerName);
  }
  if (process.env.INTERNAL_API_KEY) {
    headers.set("x-api-key", process.env.INTERNAL_API_KEY);
  }

  const response = await fetch(`${options.base}/api/replay/upload`, {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "application/json";
  const body = await response.text();
  const payload = parseJsonBody(body, contentType);
  const receipt = classifyBackendReplayReceipt(payload, response.ok);

  const result: PackageUploadResult = {
    filename: options.filename,
    ok: response.ok,
    status: response.status,
    message: response.ok
      ? receiptMessage(receipt)
      : typeof payload?.message === "string"
        ? payload.message
        : undefined,
    detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    finalityStatus: receipt.finalityStatus || undefined,
    gameId: payload?.game_id || payload?.gameId || payload?.id,
    archived: receipt.archived,
    parsed: receipt.parsed,
    resultReady: receipt.resultReady,
    reviewRouted: receipt.reviewRouted,
    duplicate: receipt.duplicate,
  };

  if (!response.ok && !result.detail) {
    result.detail = body.slice(0, 240) || "Replay upload failed.";
  }

  return result;
}

export async function POST(request: NextRequest) {
  const sessionUid = await getSessionUid(request);

  if (!sessionUid) {
    return NextResponse.json(
      { detail: "Sign in with Steam before uploading replay packs." },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const fileValue = formData.get("file");

  if (
    !fileValue ||
    typeof fileValue !== "object" ||
    !("arrayBuffer" in fileValue) ||
    !("name" in fileValue)
  ) {
    return NextResponse.json(
      { detail: "Choose a .zip replay pack first." },
      { status: 400 }
    );
  }

  const archiveFile = fileValue as File;
  const archiveName = archiveFile.name || "replay-pack.zip";

  if (extensionFor(archiveName) !== ".zip") {
    return NextResponse.json(
      { detail: "Replay packs must be .zip files." },
      { status: 400 }
    );
  }

  if (archiveFile.size > MAX_REPLAY_PACK_BYTES) {
    return NextResponse.json(
      { detail: "Replay pack is too large. Keep ZIP uploads under 100 MB." },
      { status: 413 }
    );
  }

  const prisma = getPrisma();
  let user = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: {
      id: true,
      uid: true,
      inGameName: true,
    },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        uid: sessionUid,
        isAdmin: false,
      },
      select: {
        id: true,
        uid: true,
        inGameName: true,
      },
    });
  }

  const tmpRoot = await mkdtemp(path.join(tmpdir(), "aoe2war-replay-pack-"));
  const zipPath = path.join(tmpRoot, "pack.zip");

  try {
    await writeFile(zipPath, Buffer.from(await archiveFile.arrayBuffer()));

    let entries: string[];
    try {
      entries = await listZipEntries(zipPath);
    } catch {
      return NextResponse.json(
        { detail: "Could not read that ZIP file." },
        { status: 400 }
      );
    }

    const replayEntries = entries
      .filter((entryName) => !entryName.endsWith("/"))
      .filter((entryName) => !shouldIgnoreArchivePath(entryName))
      .map((entryName) => ({
        entryName,
        filename: basenameFromArchivePath(entryName),
      }))
      .filter(({ filename }) => isSupportedReplayFilename(filename))
      .slice(0, MAX_REPLAY_PACK_FILES);

    const skipped: PackageSkippedEntry[] = entries
      .filter((entryName) => !entryName.endsWith("/"))
      .map((entryName) => basenameFromArchivePath(entryName))
      .filter((filename) => !isSupportedReplayFilename(filename))
      .slice(0, 20)
      .map((filename) => ({
        filename,
        reason: "unsupported file type",
      }));

    if (replayEntries.length === 0) {
      return NextResponse.json(
        {
          detail: "No supported AoE2 replay files were found in that ZIP.",
          supportedExtensions: Array.from(SUPPORTED_REPLAY_EXTENSIONS),
          skipped,
        },
        { status: 400 }
      );
    }

    const base = getBackendUpstreamBase();
    const results: PackageUploadResult[] = [];

    for (const { entryName, filename } of replayEntries) {
      try {
        const data = await readZipEntry(zipPath, entryName);
        results.push(
          await uploadReplayBufferToBackend({
            base,
            uid: sessionUid,
            playerName: user.inGameName,
            data,
            filename,
          })
        );
      } catch (error) {
        results.push({
          filename,
          ok: false,
          status: 500,
          detail: error instanceof Error ? error.message : "Replay upload failed.",
          archived: false,
          parsed: false,
          resultReady: false,
          reviewRouted: false,
          duplicate: false,
        });
      }
    }

    const received = results.filter((result) => result.ok);
    const uploaded = received.filter((result) => !result.duplicate);
    const archived = received.filter((result) => result.archived);
    const parsed = received.filter((result) => result.parsed);
    const resultReady = received.filter((result) => result.resultReady);
    const reviewRouted = received.filter((result) => result.reviewRouted);
    const duplicates = received.filter((result) => result.duplicate);
    const failed = results.filter((result) => !result.ok);

    if (resultReady.length > 0) {
      try {
        await reconcileTournamentMatchProofs(prisma, { force: true });
      } catch (error) {
        console.warn("Replay pack upload succeeded but tournament proof reconciliation failed:", error);
      }
    }

    if (received.length > 0) {
      await recordUserActivity(prisma, {
        userId: user.id,
        type: "replay_upload",
        path: "/upload",
        label: `Replay pack: ${resultReady.length} result ready`,
        metadata: {
          packageUpload: true,
          archiveFilename: archiveName,
          receivedCount: received.length,
          uploadedCount: uploaded.length,
          archivedCount: archived.length,
          parsedCount: parsed.length,
          resultReadyCount: resultReady.length,
          reviewRoutedCount: reviewRouted.length,
          duplicateCount: duplicates.length,
          failedCount: failed.length,
          skippedCount: skipped.length,
          filenames: uploaded.map((result) => result.filename).slice(0, 30),
        },
        dedupeWithinSeconds: 5,
      });
    }

    const message = [
      `Replay pack received: ${received.length}`,
      `${resultReady.length} result ready`,
      `${reviewRouted.length} routed to private review`,
      failed.length > 0 ? `${failed.length} failed` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return NextResponse.json(
      {
        message,
        received: received.length,
        uploaded: uploaded.length,
        archived: archived.length,
        parsed: parsed.length,
        resultReady: resultReady.length,
        reviewRouted: reviewRouted.length,
        duplicates: duplicates.length,
        failed: failed.length,
        skipped: skipped.length,
        maxFiles: MAX_REPLAY_PACK_FILES,
        results,
        skippedEntries: skipped,
      },
      { status: received.length > 0 ? 207 : 400 }
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
