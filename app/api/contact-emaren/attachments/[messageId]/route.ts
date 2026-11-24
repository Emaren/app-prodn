import { NextRequest, NextResponse } from "next/server";

import { loadDirectMessageAttachmentContent } from "@/lib/directMessageAttachments";
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

function safeFilename(name: string | null, fallback: string) {
  const value = (name || fallback)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value || fallback;
}

function inferExtension(name: string | null, mimeType: string | null, fallback: string) {
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
      return fallback;
  }
}

function buildContentDisposition({
  name,
  mimeType,
  kind,
}: {
  name: string | null;
  mimeType: string | null;
  kind: "image" | "audio";
}) {
  const fallbackBase = kind === "audio" ? "voice-note" : "screenshot";
  const extension = inferExtension(
    name,
    mimeType,
    kind === "audio" ? ".webm" : ".png"
  );
  const providedBase = (name || "").replace(/\.[^.]+$/, "");
  const asciiFilename = `${safeFilename(providedBase, fallbackBase)}${extension}`;
  const originalFilename = (name || asciiFilename).replace(/[\r\n"]+/g, "").trim() || asciiFilename;
  const encodedFilename = encodeURIComponent(originalFilename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
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

    if (message.attachmentKind !== "image" && message.attachmentKind !== "audio") {
      return NextResponse.json({ detail: "Attachment type is unsupported" }, { status: 415 });
    }

    const isParticipant = message.conversation.participants.some(
      (participant) => participant.userId === viewer.id
    );
    if (!isParticipant) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }

    const decoded = await loadDirectMessageAttachmentContent(message.attachmentDataUrl);
    if (!decoded) {
      return NextResponse.json({ detail: "Attachment is unreadable" }, { status: 422 });
    }

    const responseMimeType =
      message.attachmentMimeType || decoded.mimeType || "application/octet-stream";

    return new NextResponse(decoded.buffer, {
      headers: {
        "Content-Type": responseMimeType,
        "Content-Length": String(decoded.buffer.length),
        "Content-Disposition": buildContentDisposition({
          name: message.attachmentName,
          mimeType: responseMimeType,
          kind: message.attachmentKind,
        }),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Failed to serve direct-message attachment:", error);
    return NextResponse.json({ detail: "Attachment unavailable" }, { status: 500 });
  }
}
