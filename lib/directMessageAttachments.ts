import { randomUUID } from "node:crypto";
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
  kind: "image" | "audio";
  mimeType: string;
  name: string | null;
};

export type LoadedDirectMessageAttachment = {
  mimeType: string | null;
  buffer: Buffer;
};

function getAttachmentRootDir() {
  return process.env.DIRECT_MESSAGE_ATTACHMENT_DIR || DEFAULT_ATTACHMENT_DIR;
}

function inferAttachmentExtension({
  kind,
  mimeType,
  name,
}: {
  kind: "image" | "audio";
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
    default:
      return kind === "audio" ? ".bin" : ".img";
  }
}

function buildRelativeAttachmentPath(input: PersistDirectMessageAttachmentInput) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = inferAttachmentExtension(input);
  return `${year}/${month}/${randomUUID()}${extension}`;
}

function resolveAttachmentPath(reference: string) {
  const rootDir = path.resolve(getAttachmentRootDir());
  const absolutePath = path.resolve(rootDir, reference);
  if (absolutePath !== rootDir && !absolutePath.startsWith(`${rootDir}${path.sep}`)) {
    return null;
  }
  return absolutePath;
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

export async function removePersistedDirectMessageAttachment(reference: string | null) {
  if (!reference?.startsWith(FILE_ATTACHMENT_PREFIX)) {
    return;
  }

  const relativePath = reference.slice(FILE_ATTACHMENT_PREFIX.length);
  const absolutePath = resolveAttachmentPath(relativePath);
  if (!absolutePath) {
    return;
  }

  await unlink(absolutePath).catch(() => {});
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

  const relativePath = storedAttachment.slice(FILE_ATTACHMENT_PREFIX.length);
  const absolutePath = resolveAttachmentPath(relativePath);
  if (!absolutePath) {
    return null;
  }

  try {
    return {
      mimeType: null,
      buffer: await readFile(absolutePath),
    };
  } catch {
    return null;
  }
}
