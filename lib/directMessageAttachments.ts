import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE_ATTACHMENT_PREFIX = "file:v1:";
const DEFAULT_ATTACHMENT_DIR = path.join(
  process.cwd(),
  "storage",
  "direct-message-attachments"
);

type PersistDirectMessageAttachmentInput = {
  buffer: Buffer;
  kind: "image" | "audio" | "video";
  mimeType: string;
  name: string | null;
  namespace?: "clan-hall";
};

export type LoadedDirectMessageAttachment = {
  mimeType: string | null;
  buffer: Buffer;
};

function getAttachmentRootDir() {
  const explicit =
    process.env.DIRECT_MESSAGE_ATTACHMENT_DIR?.trim();

  if (explicit) {
    return explicit;
  }

  const managedMediaRoot =
    process.env.MANAGED_MEDIA_UPLOAD_DIR?.trim();

  if (managedMediaRoot) {
    return path.join(
      managedMediaRoot,
      "direct-message-attachments",
    );
  }

  const mountedManagedMediaRoot =
    "/mnt/HC_Volume_105319120/aoe-managed-assets";

  if (existsSync(mountedManagedMediaRoot)) {
    return path.join(
      mountedManagedMediaRoot,
      "direct-message-attachments",
    );
  }

  return DEFAULT_ATTACHMENT_DIR;
}

function getAttachmentReadRootDirs() {
  const primary = path.resolve(getAttachmentRootDir());
  const legacy = path.resolve(DEFAULT_ATTACHMENT_DIR);

  return primary === legacy
    ? [primary]
    : [primary, legacy];
}

export function getDirectMessageAttachmentRootDir() {
  return getAttachmentRootDir();
}

function inferAttachmentExtension({
  kind,
  mimeType,
  name,
}: {
  kind: "image" | "audio" | "video";
  mimeType: string;
  name: string | null;
}) {
  const extensionMatch = name?.trim().match(/\.([A-Za-z0-9]{1,10})$/);
  if (extensionMatch?.[1]) {
    return `.${extensionMatch[1].toLowerCase()}`;
  }

  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
      return ".m4a";
    case "audio/ogg":
      return ".ogg";
    case "audio/wav":
      return ".wav";
    case "audio/webm":
      return ".webm";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    default:
      return kind === "audio" ? ".bin" : kind === "video" ? ".video" : ".img";
  }
}

function buildRelativeAttachmentPath(input: PersistDirectMessageAttachmentInput) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = inferAttachmentExtension(input);
  const namespace = input.namespace === "clan-hall" ? "clan-hall/" : "";
  return `${namespace}${year}/${month}/${randomUUID()}${extension}`;
}

function resolveAttachmentPathAtRoot(
  root: string,
  reference: string,
) {
  const rootDir = path.resolve(root);
  const absolutePath = path.resolve(rootDir, reference);

  if (
    absolutePath !== rootDir &&
    !absolutePath.startsWith(`${rootDir}${path.sep}`)
  ) {
    return null;
  }

  return absolutePath;
}

function resolveAttachmentPath(reference: string) {
  return resolveAttachmentPathAtRoot(
    getAttachmentRootDir(),
    reference,
  );
}

function decodeDataUrl(dataUrl: string): LoadedDirectMessageAttachment | null {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex < 0) {
    return null;
  }

  const meta = dataUrl.slice(5, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);
  const [mimeType = "application/octet-stream"] = meta.split(";");
  const isBase64 = meta.includes(";base64");

  try {
    return {
      mimeType,
      buffer: isBase64
        ? Buffer.from(data, "base64")
        : Buffer.from(decodeURIComponent(data), "utf8"),
    };
  } catch {
    return null;
  }
}

export function encodeLegacyAttachmentDataUrl(mimeType: string, buffer: Buffer) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export async function persistDirectMessageAttachment(
  input: PersistDirectMessageAttachmentInput
) {
  const relativePath = buildRelativeAttachmentPath(input);
  const absolutePath = resolveAttachmentPath(relativePath);
  if (!absolutePath) {
    throw new Error("Could not resolve attachment storage path.");
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer);
  return `${FILE_ATTACHMENT_PREFIX}${relativePath}`;
}

export async function removePersistedDirectMessageAttachment(
  reference: string | null,
) {
  if (!reference?.startsWith(FILE_ATTACHMENT_PREFIX)) {
    return;
  }

  const relativePath =
    reference.slice(FILE_ATTACHMENT_PREFIX.length);

  await Promise.all(
    getAttachmentReadRootDirs().map(async (root) => {
      const absolutePath =
        resolveAttachmentPathAtRoot(root, relativePath);

      if (!absolutePath) return;

      await unlink(absolutePath).catch(() => {});
    }),
  );
}

export async function loadDirectMessageAttachmentContent(
  storedAttachment: string
): Promise<LoadedDirectMessageAttachment | null> {
  if (storedAttachment.startsWith("data:")) {
    return decodeDataUrl(storedAttachment);
  }

  if (!storedAttachment.startsWith(FILE_ATTACHMENT_PREFIX)) {
    return null;
  }

  const relativePath =
    storedAttachment.slice(FILE_ATTACHMENT_PREFIX.length);

  for (const root of getAttachmentReadRootDirs()) {
    const absolutePath =
      resolveAttachmentPathAtRoot(root, relativePath);

    if (!absolutePath) continue;

    try {
      return {
        mimeType: null,
        buffer: await readFile(absolutePath),
      };
    } catch {
      // Try the legacy root before declaring the attachment missing.
    }
  }

  return null;
}
