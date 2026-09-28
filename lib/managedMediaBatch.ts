import {
  MANAGED_MEDIA_KINDS,
  normalizeManagedMediaKind,
  normalizeManagedMediaTarget,
  slugifyManagedMediaTarget,
  type ManagedMediaKind,
} from "@/lib/managedMediaAssets";

export const MANAGED_MEDIA_BATCH_SCHEMA_VERSION = 1;
export const MAX_MANAGED_MEDIA_BATCH_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_MANAGED_MEDIA_BATCH_ASSETS = 120;
export const MAX_MANAGED_MEDIA_BATCH_TARGETS = 300;

const MANAGED_MEDIA_KIND_SET = new Set<string>(MANAGED_MEDIA_KINDS);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export type ManagedMediaBatchAsset = {
  assetFilename: string;
  kind: ManagedMediaKind;
  targets: string[];
  label: string;
  alt: string | null;
  replaceActive: boolean;
  displayType: string | null;
};

export type ManagedMediaBatchManifest = {
  schema: 1;
  assets: ManagedMediaBatchAsset[];
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export function normalizeManagedMediaArchivePath(value: unknown) {
  const raw = String(value ?? "").trim().replace(/\\/g, "/");

  if (!raw || raw.startsWith("/") || raw.includes("\0")) {
    return null;
  }

  const parts = raw.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    return null;
  }

  return parts.join("/");
}

export function managedMediaBatchMimeType(filename: string) {
  const normalized = filename.toLowerCase();
  const index = normalized.lastIndexOf(".");
  const extension = index >= 0 ? normalized.slice(index) : "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function isSupportedManagedMediaBatchFilename(filename: string) {
  return Boolean(managedMediaBatchMimeType(filename));
}

function normalizeTargets(value: unknown, index: number) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Batch asset ${index + 1} must define at least one target.`);
  }

  const targets = Array.from(
    new Set(
      value.map((target) => normalizeManagedMediaTarget(target)).filter(Boolean),
    ),
  ) as string[];

  if (!targets.length) {
    throw new Error(`Batch asset ${index + 1} does not contain a valid target.`);
  }

  if (targets.length > 12) {
    throw new Error(`Batch asset ${index + 1} has too many target aliases.`);
  }

  return targets;
}

export function parseManagedMediaBatchManifest(value: unknown): ManagedMediaBatchManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Batch manifest must be a JSON object.");
  }

  const input = value as Record<string, unknown>;
  if (Number(input.schema) !== MANAGED_MEDIA_BATCH_SCHEMA_VERSION) {
    throw new Error(
      `Batch manifest schema must be ${MANAGED_MEDIA_BATCH_SCHEMA_VERSION}.`,
    );
  }

  if (!Array.isArray(input.assets)) {
    throw new Error("Batch manifest must contain an assets array.");
  }

  if (input.assets.length === 0) {
    throw new Error("Batch manifest does not contain any assets.");
  }

  if (input.assets.length > MAX_MANAGED_MEDIA_BATCH_ASSETS) {
    throw new Error(
      `Batch manifest exceeds the ${MAX_MANAGED_MEDIA_BATCH_ASSETS}-asset limit.`,
    );
  }

  const seenTargets = new Set<string>();
  let totalTargets = 0;

  const assets = input.assets.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Batch asset ${index + 1} must be a JSON object.`);
    }

    const source = row as Record<string, unknown>;
    const assetFilename = normalizeManagedMediaArchivePath(source.asset_filename);
    if (!assetFilename || !isSupportedManagedMediaBatchFilename(assetFilename)) {
      throw new Error(
        `Batch asset ${index + 1} must reference a supported media file.`,
      );
    }

    const rawKind = cleanText(source.kind, 32).toLowerCase();
    if (!MANAGED_MEDIA_KIND_SET.has(rawKind)) {
      throw new Error(`Batch asset ${index + 1} has an unsupported media kind.`);
    }
    const kind = normalizeManagedMediaKind(rawKind);
    const targets = normalizeTargets(source.targets, index);

    for (const target of targets) {
      const key = `${kind}:${target}`;
      if (seenTargets.has(key)) {
        throw new Error(`Batch manifest assigns ${key} more than once.`);
      }
      seenTargets.add(key);
    }

    totalTargets += targets.length;
    if (totalTargets > MAX_MANAGED_MEDIA_BATCH_TARGETS) {
      throw new Error(
        `Batch manifest exceeds the ${MAX_MANAGED_MEDIA_BATCH_TARGETS}-target limit.`,
      );
    }

    const fallbackLabel =
      assetFilename
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim() || targets[0];

    return {
      assetFilename,
      kind,
      targets,
      label: cleanText(source.label, 160) || fallbackLabel,
      alt: cleanText(source.alt, 180) || null,
      replaceActive: source.replace_active !== false,
      displayType: cleanText(source.display_type, 40) || null,
    } satisfies ManagedMediaBatchAsset;
  });

  return {
    schema: MANAGED_MEDIA_BATCH_SCHEMA_VERSION,
    assets,
  };
}

export function buildManagedMediaBatchManifest(options: {
  archiveEntries: string[];
  kind: unknown;
  targetPrefix?: unknown;
}): ManagedMediaBatchManifest {
  const kind = normalizeManagedMediaKind(options.kind);
  const targetPrefix = slugifyManagedMediaTarget(String(options.targetPrefix ?? ""));
  const entries = options.archiveEntries
    .map((entry) => normalizeManagedMediaArchivePath(entry))
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry) => !entry.endsWith("/"))
    .filter((entry) => isSupportedManagedMediaBatchFilename(entry))
    .slice(0, MAX_MANAGED_MEDIA_BATCH_ASSETS);

  if (!entries.length) {
    throw new Error("No supported managed-media files were found in that ZIP.");
  }

  return {
    schema: MANAGED_MEDIA_BATCH_SCHEMA_VERSION,
    assets: entries.map((assetFilename) => {
      const basename = assetFilename.split("/").pop() || "asset";
      const label = basename
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const stem = slugifyManagedMediaTarget(label) || "asset";
      const target = targetPrefix ? `${targetPrefix}-${stem}` : stem;

      return {
        assetFilename,
        kind,
        targets: [target],
        label,
        alt: label || null,
        replaceActive: true,
        displayType: null,
      };
    }),
  };
}
