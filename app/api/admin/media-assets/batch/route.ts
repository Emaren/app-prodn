import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  buildManagedMediaBatchManifest,
  managedMediaBatchMimeType,
  MAX_MANAGED_MEDIA_BATCH_ARCHIVE_BYTES,
  normalizeManagedMediaArchivePath,
  parseManagedMediaBatchManifest,
  type ManagedMediaBatchAsset,
} from "@/lib/managedMediaBatch";
import {
  saveManagedMediaReference,
  saveManagedMediaUpload,
} from "@/lib/managedMediaAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const MAX_BATCH_ENTRY_BYTES = 50 * 1024 * 1024;
const MANIFEST_ENTRY_NAME = "asset-manifest.json";

type BatchResult = {
  assetFilename: string;
  kind: string;
  targets: string[];
  uploadedAssetId?: number;
  url?: string;
  ok: boolean;
  detail?: string;
};

function basenameFromArchivePath(value: string) {
  const cleaned = value.replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1]?.trim() || "asset";
}

function shouldIgnoreArchivePath(value: string) {
  const cleaned = value.replace(/\\/g, "/");
  const basename = basenameFromArchivePath(cleaned);
  return (
    cleaned.startsWith("__MACOSX/") ||
    basename === ".DS_Store" ||
    basename.startsWith("._")
  );
}

async function listZipEntries(zipPath: string) {
  const { stdout } = await execFileAsync("unzip", ["-Z1", zipPath], {
    maxBuffer: 2 * 1024 * 1024,
  });

  return stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function readZipEntry(
  zipPath: string,
  entryName: string,
  maxBuffer = MAX_BATCH_ENTRY_BYTES,
) {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath, entryName], {
    encoding: "buffer",
    maxBuffer,
  });

  return Buffer.from(stdout);
}

function fileFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
) {
  const bytes = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  return new File([bytes], basenameFromArchivePath(filename), {
    type: mimeType,
  });
}

function manifestEntryByNormalizedPath(
  entries: string[],
  wanted: string,
) {
  const normalizedWanted = normalizeManagedMediaArchivePath(wanted);
  if (!normalizedWanted) return null;

  return (
    entries.find(
      (entry) =>
        normalizeManagedMediaArchivePath(entry) === normalizedWanted,
    ) ?? null
  );
}

async function saveBatchAsset(options: {
  prisma: Awaited<ReturnType<typeof requireAdmin>> extends { prisma: infer P }
    ? P
    : never;
  uploadedByUid: string;
  zipPath: string;
  archiveEntries: string[];
  asset: ManagedMediaBatchAsset;
}) {
  const archiveEntry = manifestEntryByNormalizedPath(
    options.archiveEntries,
    options.asset.assetFilename,
  );

  if (!archiveEntry) {
    throw new Error(
      `ZIP is missing manifest asset ${options.asset.assetFilename}.`,
    );
  }

  const mimeType = managedMediaBatchMimeType(
    options.asset.assetFilename,
  );
  if (!mimeType) {
    throw new Error(
      `Unsupported media file: ${options.asset.assetFilename}.`,
    );
  }

  const buffer = await readZipEntry(
    options.zipPath,
    archiveEntry,
  );
  const file = fileFromBuffer(
    buffer,
    options.asset.assetFilename,
    mimeType,
  );

  const primaryTarget = options.asset.targets[0];
  const primary = await saveManagedMediaUpload({
    prisma: options.prisma,
    file,
    kind: options.asset.kind,
    target: primaryTarget,
    label: options.asset.label,
    alt: options.asset.alt,
    uploadedByUid: options.uploadedByUid,
    active: true,
    replaceActive: options.asset.replaceActive,
  });

  for (const target of options.asset.targets.slice(1)) {
    await saveManagedMediaReference({
      prisma: options.prisma,
      kind: options.asset.kind,
      target,
      url: primary.url,
      label: options.asset.label,
      alt: options.asset.alt,
      uploadedByUid: options.uploadedByUid,
    });
  }

  return primary;
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  const formData = await request.formData();
  const fileValue = formData.get("file");

  if (!(fileValue instanceof File)) {
    return NextResponse.json(
      { detail: "Choose a ZIP asset pack first." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!fileValue.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json(
      { detail: "Managed-media batch uploads must be ZIP files." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (
    fileValue.size <= 0 ||
    fileValue.size > MAX_MANAGED_MEDIA_BATCH_ARCHIVE_BYTES
  ) {
    return NextResponse.json(
      {
        detail:
          "Asset pack is too large. Keep managed-media ZIP uploads under 64 MB.",
      },
      {
        status: fileValue.size > 0 ? 413 : 400,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  const tmpRoot = await mkdtemp(
    path.join(tmpdir(), "aoe2war-media-pack-"),
  );
  const zipPath = path.join(tmpRoot, "pack.zip");

  try {
    await writeFile(
      zipPath,
      Buffer.from(await fileValue.arrayBuffer()),
    );

    let archiveEntries: string[];
    try {
      archiveEntries = (await listZipEntries(zipPath))
        .filter((entry) => !entry.endsWith("/"))
        .filter((entry) => !shouldIgnoreArchivePath(entry));
    } catch {
      return NextResponse.json(
        { detail: "Could not read that ZIP file." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const manifestEntry =
      archiveEntries.find(
        (entry) =>
          basenameFromArchivePath(entry).toLowerCase() ===
          MANIFEST_ENTRY_NAME,
      ) ?? null;

    let manifest;
    let manifestMode: "embedded" | "automatic";

    try {
      if (manifestEntry) {
        const manifestBytes = await readZipEntry(
          zipPath,
          manifestEntry,
          1024 * 1024,
        );
        manifest = parseManagedMediaBatchManifest(
          JSON.parse(manifestBytes.toString("utf8")),
        );
        manifestMode = "embedded";
      } else {
        manifest = buildManagedMediaBatchManifest({
          archiveEntries,
          kind: formData.get("kind"),
          targetPrefix: formData.get("targetPrefix"),
        });
        manifestMode = "automatic";
      }
    } catch (error) {
      return NextResponse.json(
        {
          detail:
            error instanceof Error
              ? error.message
              : "Could not validate the batch manifest.",
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    for (const asset of manifest.assets) {
      const matching = manifestEntryByNormalizedPath(
        archiveEntries,
        asset.assetFilename,
      );
      if (!matching) {
        return NextResponse.json(
          {
            detail:
              `ZIP is missing manifest asset ${asset.assetFilename}.`,
          },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
    }

    const results: BatchResult[] = [];

    for (const asset of manifest.assets) {
      try {
        const saved = await saveBatchAsset({
          prisma: gate.prisma,
          uploadedByUid: gate.user.uid,
          zipPath,
          archiveEntries,
          asset,
        });

        results.push({
          assetFilename: asset.assetFilename,
          kind: asset.kind,
          targets: asset.targets,
          uploadedAssetId: saved.id,
          url: saved.url,
          ok: true,
        });
      } catch (error) {
        results.push({
          assetFilename: asset.assetFilename,
          kind: asset.kind,
          targets: asset.targets,
          ok: false,
          detail:
            error instanceof Error
              ? error.message
              : "Asset import failed.",
        });
      }
    }

    const succeeded = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);
    const boundTargets = succeeded.reduce(
      (sum, result) => sum + result.targets.length,
      0,
    );

    return NextResponse.json(
      {
        message: [
          `Imported ${succeeded.length}/${results.length} assets`,
          `${boundTargets} managed target${boundTargets === 1 ? "" : "s"} bound`,
          failed.length ? `${failed.length} failed` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        manifestMode,
        uploadedAssets: succeeded.length,
        boundTargets,
        failed: failed.length,
        results,
      },
      {
        status: failed.length ? 207 : 201,
        headers: NO_STORE_HEADERS,
      },
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
