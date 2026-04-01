import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMessageId(raw: string) {
  const messageId = Number(raw);
  if (!Number.isInteger(messageId) || messageId < 1) {
    return null;
  }
  return messageId;
}

function decodeDataUrl(dataUrl: string) {
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

function safeFilename(name: string | null, fallback: string) {
  const value = (name || fallback).replace(/["\r\n]+/g, "").trim();
  return value || fallback;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> }
) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const { messageId: messageIdParam } = await context.params;
    const messageId = parseMessageId(messageIdParam);
    if (!messageId) {
      return NextResponse.json({ detail: "Invalid attachment id" }, { status: 400 });
    }

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true },
    });

    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      select: {
        attachmentKind: true,
        attachmentName: true,
        attachmentMimeType: true,
        attachmentDataUrl: true,
        conversation: {
          select: {
            participants: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!message?.attachmentDataUrl || !message.attachmentKind) {
      return NextResponse.json({ detail: "Attachment not found" }, { status: 404 });
    }

    const isParticipant = message.conversation.participants.some(
      (participant) => participant.userId === viewer.id
    );
    if (!isParticipant) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }

    const decoded = decodeDataUrl(message.attachmentDataUrl);
    if (!decoded) {
      return NextResponse.json({ detail: "Attachment is unreadable" }, { status: 422 });
    }

    const filename = safeFilename(
      message.attachmentName,
      message.attachmentKind === "audio" ? "voice-note" : "screenshot"
    );

    return new NextResponse(decoded.buffer, {
      headers: {
        "Content-Type": message.attachmentMimeType || decoded.mimeType,
        "Content-Length": String(decoded.buffer.length),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Failed to serve direct-message attachment:", error);
    return NextResponse.json({ detail: "Attachment unavailable" }, { status: 500 });
  }
}
