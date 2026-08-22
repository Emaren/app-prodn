import { NextRequest, NextResponse } from "next/server";

import { normalizeClanAudience } from "@/lib/clans";
import { loadDirectMessageAttachmentContent } from "@/lib/directMessageAttachments";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSlug(value: string) {
  return decodeURIComponent(value).trim().toLowerCase().slice(0, 80);
}

function parseAttachmentId(raw: string) {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function canReadAudience(
  audience: "public" | "users" | "clan",
  authenticated: boolean,
  hasClanAccess: boolean,
) {
  if (audience === "public") return true;
  if (audience === "users") return authenticated;
  return hasClanAccess;
}

function safeFilename(name: string | null, fallback: string) {
  const value = (name || fallback)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value || fallback;
}

function readRange(range: string | null, size: number) {
  if (!range?.startsWith("bytes=")) return null;
  const [rawStart, rawEnd] = range.slice(6).split("-", 2);
  const start = rawStart ? Number.parseInt(rawStart, 10) : Number.NaN;
  const end = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; attachmentId: string }> },
) {
  try {
    const params = await context.params;
    const slug = normalizeSlug(params.slug);
    const attachmentId = parseAttachmentId(params.attachmentId);
    if (!attachmentId) {
      return NextResponse.json({ detail: "Invalid attachment id." }, { status: 400 });
    }

    const prisma = getPrisma();
    const attachment = await prisma.clanMessageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        kind: true,
        name: true,
        mimeType: true,
        storageRef: true,
        message: {
          select: {
            audience: true,
            clan: {
              select: {
                id: true,
                slug: true,
                status: true,
                chatAudiencePolicy: true,
              },
            },
          },
        },
      },
    });

    if (
      !attachment ||
      attachment.message.clan.slug !== slug ||
      attachment.message.clan.status !== "active"
    ) {
      return NextResponse.json({ detail: "Attachment not found." }, { status: 404 });
    }

    if (
      attachment.kind !== "image" &&
      attachment.kind !== "audio" &&
      attachment.kind !== "video"
    ) {
      return NextResponse.json({ detail: "Attachment type is unsupported." }, { status: 415 });
    }

    const sessionUid = await getSessionUid(request);
    const viewer = sessionUid
      ? await prisma.user.findUnique({
          where: { uid: sessionUid },
          select: { id: true, isAdmin: true },
        })
      : null;
    const membership = viewer
      ? await prisma.clanMember.findUnique({
          where: {
            clanId_userId: {
              clanId: attachment.message.clan.id,
              userId: viewer.id,
            },
          },
          select: { status: true },
        })
      : null;

    const authenticated = Boolean(viewer);
    const hasClanAccess = Boolean(viewer?.isAdmin || membership?.status === "active");
    const policy = normalizeClanAudience(
      attachment.message.clan.chatAudiencePolicy,
      "public",
    );
    const messageAudience = normalizeClanAudience(attachment.message.audience);

    if (
      !canReadAudience(policy, authenticated, hasClanAccess) ||
      !canReadAudience(messageAudience, authenticated, hasClanAccess)
    ) {
      return NextResponse.json({ detail: "Attachment is not visible to you." }, { status: 403 });
    }

    const loaded = await loadDirectMessageAttachmentContent(attachment.storageRef);
    if (!loaded) {
      return NextResponse.json({ detail: "Attachment is unreadable." }, { status: 422 });
    }

    const mimeType = attachment.mimeType || loaded.mimeType || "application/octet-stream";
    const fallback = attachment.kind === "image"
      ? "clan-image"
      : attachment.kind === "video"
        ? "clan-video"
        : "clan-audio";
    const filename = safeFilename(attachment.name, fallback).replace(/[\r\n"]+/g, "");
    const range = readRange(request.headers.get("range"), loaded.buffer.length);
    const cacheControl = "private, no-store, max-age=0";

    if (range) {
      const chunk = loaded.buffer.subarray(range.start, range.end + 1);
      return new NextResponse(chunk, {
        status: 206,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${loaded.buffer.length}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": cacheControl,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return new NextResponse(loaded.buffer, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(loaded.buffer.length),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to serve Clan Hall attachment:", error);
    return NextResponse.json({ detail: "Attachment unavailable." }, { status: 500 });
  }
}
