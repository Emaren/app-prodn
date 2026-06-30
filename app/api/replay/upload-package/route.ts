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
  finalityStatus?: unknown;
  gameId?: unknown;
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

  const result: PackageUploadResult = {
    filename: options.filename,
    ok: response.ok,
    status: response.status,
    message: typeof payload?.message === "string" ? payload.message : undefined,
    detail: typeof payload?.detail === "string" ? payload.detail : undefined,
    finalityStatus: payload?.finality_status || payload?.finalityStatus,
    gameId: payload?.game_id || payload?.gameId || payload?.id,
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
        });
      }
    }

    const uploaded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);

    if (uploaded.length > 0) {
      try {
        await reconcileTournamentMatchProofs(prisma, { force: true });
      } catch (error) {
        console.warn("Replay pack upload succeeded but tournament proof reconciliation failed:", error);
      }

      await recordUserActivity(prisma, {
        userId: user.id,
        type: "replay_upload",
        path: "/upload",
        label: `Replay pack: ${uploaded.length} uploaded`,
        metadata: {
          packageUpload: true,
          archiveFilename: archiveName,
          uploadedCount: uploaded.length,
          failedCount: failed.length,
          skippedCount: skipped.length,
          filenames: uploaded.map((result) => result.filename).slice(0, 30),
        },
        dedupeWithinSeconds: 5,
      });
    }

    const message =
      failed.length === 0
        ? `Replay pack imported: ${uploaded.length} replay${uploaded.length === 1 ? "" : "s"} uploaded.`
        : `Replay pack partly imported: ${uploaded.length} uploaded, ${failed.length} failed.`;

    return NextResponse.json(
      {
        message,
        uploaded: uploaded.length,
        failed: failed.length,
        skipped: skipped.length,
        maxFiles: MAX_REPLAY_PACK_FILES,
        results,
        skippedEntries: skipped,
      },
      { status: uploaded.length > 0 ? 207 : 400 }
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
