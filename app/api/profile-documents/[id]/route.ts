import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import {
  PROFILE_DOCUMENT_KIND,
  loadProfileDocumentBytes,
  profileDocumentMimeType,
  profileDocumentOwnerUid,
  removeProfileDocumentFile,
} from "@/lib/profileDocuments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

async function gateDocument(request: NextRequest, idValue: string) {
  const uid = await getSessionUid(request);
  if (!uid) return { error: NextResponse.json({ detail: "No active session" }, { status: 401, headers: NO_STORE_HEADERS }) };

  const id = Number(idValue);
  if (!Number.isInteger(id) || id < 1) {
    return { error: NextResponse.json({ detail: "Document not found" }, { status: 404, headers: NO_STORE_HEADERS }) };
  }

  const prisma = getPrisma();
  const [viewer, asset] = await Promise.all([
    prisma.user.findUnique({ where: { uid }, select: { uid: true, isAdmin: true } }),
    prisma.managedMediaAsset.findFirst({ where: { id, kind: PROFILE_DOCUMENT_KIND, active: true } }),
  ]);

  if (!viewer) return { error: NextResponse.json({ detail: "User not found" }, { status: 404, headers: NO_STORE_HEADERS }) };
  if (!asset) return { error: NextResponse.json({ detail: "Document not found" }, { status: 404, headers: NO_STORE_HEADERS }) };

  const ownerUid = profileDocumentOwnerUid(asset.target);
  if (!ownerUid || (ownerUid !== viewer.uid && !viewer.isAdmin)) {
    return { error: NextResponse.json({ detail: "Forbidden" }, { status: 403, headers: NO_STORE_HEADERS }) };
  }

  return { prisma, viewer, asset, ownerUid };
}

function safeDownloadName(value: string | null) {
  return (value || "profile-document")
    .replace(/[\r\n\"]/g, "_")
    .slice(0, 180);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateDocument(request, id);
  if ("error" in gate) return gate.error;

  const bytes = await loadProfileDocumentBytes(gate.asset.url);
  if (!bytes) {
    return NextResponse.json({ detail: "Document file is unavailable" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const filename = safeDownloadName(gate.asset.originalName || gate.asset.label);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": profileDocumentMimeType(gate.asset),
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await gateDocument(request, id);
  if ("error" in gate) return gate.error;

  await gate.prisma.managedMediaAsset.update({ where: { id: gate.asset.id }, data: { active: false } });
  await removeProfileDocumentFile(gate.asset.url);
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
