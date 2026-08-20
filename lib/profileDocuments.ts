import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PrismaClient } from "@/lib/generated/prisma";

export const PROFILE_DOCUMENT_KIND = "document";
export const PROFILE_DOCUMENT_REFERENCE_PREFIX = "profile-document:v1:";
export const MAX_PROFILE_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_PROFILE_DOCUMENTS_PER_USER = 30;
export const MAX_PROFILE_DOCUMENT_TOTAL_BYTES = 250 * 1024 * 1024;

const DEFAULT_PRODUCTION_PRIVATE_ROOT = "/mnt/HC_Volume_105319120/aoe2war/profile-documents-private";
const DEFAULT_LOCAL_ROOT = path.join(process.cwd(), "storage", "profile-documents");
const TARGET_PREFIX = "profile-documents-";

const ALLOWED_EXTENSIONS = new Map<string, string>([
  ["pdf", "application/pdf"],
  ["txt", "text/plain; charset=utf-8"],
  ["md", "text/markdown; charset=utf-8"],
  ["rtf", "application/rtf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["odt", "application/vnd.oasis.opendocument.text"],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
]);

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeUidSegment(uid: string) {
  const value = uid.trim().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
  if (!value) throw new Error("Profile identity is unavailable.");
  return value;
}

function storageRoot() {
  const configured = String(process.env.PROFILE_DOCUMENT_UPLOAD_DIR || "").trim();
  if (configured) return path.resolve(configured);

  return process.env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_PRIVATE_ROOT
    : DEFAULT_LOCAL_ROOT;
}

function resolveStoredPath(reference: string) {
  if (!reference.startsWith(PROFILE_DOCUMENT_REFERENCE_PREFIX)) return null;
  const relative = reference.slice(PROFILE_DOCUMENT_REFERENCE_PREFIX.length);
  if (!relative || path.isAbsolute(relative)) return null;

  const root = path.resolve(storageRoot());
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) return null;
  return absolute;
}

function extensionForFile(file: File) {
  const extension = path.extname(file.name || "").replace(/^\./, "").toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension) ? extension : null;
}

function relativeDocumentPath(uid: string, extension: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${safeUidSegment(uid)}/${year}/${month}/${randomUUID()}.${extension}`;
}

export function profileDocumentTarget(uid: string) {
  return `${TARGET_PREFIX}${uid}`.slice(0, 160);
}

export function profileDocumentOwnerUid(target: string | null | undefined) {
  if (!target?.startsWith(TARGET_PREFIX)) return null;
  return target.slice(TARGET_PREFIX.length) || null;
}

export function profileDocumentMimeType(asset: {
  mimeType: string | null;
  originalName: string | null;
}) {
  const extension = path.extname(asset.originalName || "").replace(/^\./, "").toLowerCase();
  return ALLOWED_EXTENSIONS.get(extension) || asset.mimeType || "application/octet-stream";
}

export async function saveProfileDocument({
  prisma,
  uid,
  file,
}: {
  prisma: PrismaClient;
  uid: string;
  file: File;
}) {
  if (file.size <= 0) throw new Error("Choose a document first.");
  if (file.size > MAX_PROFILE_DOCUMENT_BYTES) {
    throw new Error("Document is too large. Keep profile documents under 25 MB.");
  }

  const extension = extensionForFile(file);
  if (!extension) {
    throw new Error("Use PDF, DOC, DOCX, ODT, TXT, MD, RTF, XLS, XLSX, PPT, or PPTX.");
  }

  const target = profileDocumentTarget(uid);
  const [documentCount, documentBytes] = await Promise.all([
    prisma.managedMediaAsset.count({
      where: {
        kind: PROFILE_DOCUMENT_KIND,
        target,
        active: true,
      },
    }),
    prisma.managedMediaAsset.aggregate({
      where: {
        kind: PROFILE_DOCUMENT_KIND,
        target,
        active: true,
      },
      _sum: {
        sizeBytes: true,
      },
    }),
  ]);

  if (documentCount >= MAX_PROFILE_DOCUMENTS_PER_USER) {
    throw new Error(
      `Profile War Archive limit reached (${MAX_PROFILE_DOCUMENTS_PER_USER} documents).`,
    );
  }

  const currentBytes = Number(documentBytes._sum.sizeBytes || 0);
  if (currentBytes + file.size > MAX_PROFILE_DOCUMENT_TOTAL_BYTES) {
    throw new Error(
      "Profile War Archive storage limit reached (250 MB per player).",
    );
  }

  const originalName = cleanText(file.name, 255) || `document.${extension}`;
  const relativePath = relativeDocumentPath(uid, extension);
  const absolutePath = resolveStoredPath(`${PROFILE_DOCUMENT_REFERENCE_PREFIX}${relativePath}`);
  if (!absolutePath) throw new Error("Could not resolve profile document storage.");

  const buffer = Buffer.from(await file.arrayBuffer());
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer, { flag: "wx", mode: 0o640 });

  try {
    return await prisma.managedMediaAsset.create({
      data: {
        key: `document:${safeUidSegment(uid)}:${randomUUID()}`.slice(0, 160),
        kind: PROFILE_DOCUMENT_KIND,
        target: profileDocumentTarget(uid),
        label: originalName.slice(0, 160),
        url: `${PROFILE_DOCUMENT_REFERENCE_PREFIX}${relativePath}`,
        alt: null,
        mimeType: cleanText(file.type, 100) || ALLOWED_EXTENSIONS.get(extension) || null,
        originalName,
        sizeBytes: file.size,
        active: true,
        uploadedByUid: uid,
      },
    });
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}

export async function listProfileDocuments(prisma: PrismaClient, uid: string) {
  const rows = await prisma.managedMediaAsset.findMany({
    where: {
      kind: PROFILE_DOCUMENT_KIND,
      target: profileDocumentTarget(uid),
      active: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.originalName || row.label,
    mimeType: profileDocumentMimeType(row),
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    downloadUrl: `/api/profile-documents/${row.id}`,
  }));
}

export async function loadProfileDocumentBytes(reference: string) {
  const absolutePath = resolveStoredPath(reference);
  if (!absolutePath) return null;
  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

export async function removeProfileDocumentFile(reference: string) {
  const absolutePath = resolveStoredPath(reference);
  if (!absolutePath) return;
  await unlink(absolutePath).catch(() => undefined);
}
