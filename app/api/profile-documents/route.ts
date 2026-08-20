import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { listProfileDocuments, saveProfileDocument } from "@/lib/profileDocuments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

async function requireViewer(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return { error: NextResponse.json({ detail: "No active session" }, { status: 401, headers: NO_STORE_HEADERS }) };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { uid: true, isAdmin: true },
  });

  if (!user) {
    return { error: NextResponse.json({ detail: "User not found" }, { status: 404, headers: NO_STORE_HEADERS }) };
  }

  return { prisma, user };
}

export async function GET(request: NextRequest) {
  const gate = await requireViewer(request);
  if ("error" in gate) return gate.error;

  const requestedUid = request.nextUrl.searchParams.get("uid")?.trim() || gate.user.uid;
  if (requestedUid !== gate.user.uid && !gate.user.isAdmin) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const owner = await gate.prisma.user.findUnique({
    where: { uid: requestedUid },
    select: { uid: true, inGameName: true, steamPersonaName: true },
  });
  if (!owner) {
    return NextResponse.json({ detail: "Player not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const documents = await listProfileDocuments(gate.prisma, requestedUid);
  return NextResponse.json(
    {
      ownerUid: owner.uid,
      ownerName: owner.inGameName || owner.steamPersonaName || "Player",
      canUpload: requestedUid === gate.user.uid,
      canManage: requestedUid === gate.user.uid || gate.user.isAdmin,
      documents,
    },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireViewer(request);
  if ("error" in gate) return gate.error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ detail: "Choose a document first." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const asset = await saveProfileDocument({ prisma: gate.prisma, uid: gate.user.uid, file });
    return NextResponse.json(
      {
        document: {
          id: asset.id,
          name: asset.originalName || asset.label,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          createdAt: asset.createdAt.toISOString(),
          downloadUrl: `/api/profile-documents/${asset.id}`,
        },
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not save document." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
