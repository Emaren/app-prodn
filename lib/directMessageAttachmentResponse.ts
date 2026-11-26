import { NextRequest, NextResponse } from "next/server";

import { loadDirectMessageAttachmentContent } from "@/lib/directMessageAttachments";
import { isRestrictedImageReference, readRestrictedImage } from "@/lib/restrictedDirectImageStorage.mjs";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import {usesNonfinancialProductionAuth} from "@/lib/productionAuth";
import {restrictedDirectRead,privateDirectError,RestrictedDirectReadError} from "@/lib/restrictedDirectInbox";

function privateJson(detail: string, status: number) {
  return NextResponse.json({detail}, {status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}

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

export async function readPrivateDirectAttachment(
  request: NextRequest, legacyMessageId?:string
) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return privateJson("No active session", 401);
    }

    const ids=legacyMessageId===undefined?request.nextUrl.searchParams.getAll("attachmentMessageId"):[legacyMessageId];
    if(usesNonfinancialProductionAuth()&&[...request.nextUrl.searchParams.keys()].some(k=>legacyMessageId!==undefined||k!=="attachmentMessageId"))return privateJson("Invalid attachment request",400);
    const messageId = ids.length===1 && /^[1-9]\d{0,9}$/.test(ids[0]) && Number(ids[0])<=2147483647
      ? parseMessageId(ids[0]) : null;
    if (!messageId) {
      return privateJson("Invalid attachment id", 400);
    }

    if(usesNonfinancialProductionAuth()){
      try{
        const row=await restrictedDirectRead(request,{op:"attachment",messageId});
        const ref=row.storageRef,mime=row.mimeType,name=row.name;
        if(row.messageId!==messageId||typeof ref!=="string"||!isRestrictedImageReference(ref)||
           typeof mime!=="string"||!["image/png","image/jpeg","image/webp"].includes(mime)||
           (name!==null&&typeof name!=="string"))throw new RestrictedDirectReadError(503);
        const decoded=await readRestrictedImage(process.env.SOCIAL_DIRECT_IMAGE_READ_ROOT,ref,mime);
        if(!decoded)return privateJson("Attachment is unreadable",422);
        return new NextResponse(decoded.buffer,{headers:{
          "Content-Type":mime,"Content-Length":String(decoded.buffer.length),
          "Content-Disposition":buildContentDisposition({name:name as string|null,mimeType:mime,kind:"image"}),
          "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox",
        }});
      }catch(error){return privateDirectError(error);}
    }
    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true },
    });

    if (!viewer) {
      return privateJson("Viewer not found", 404);
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

    if (!message?.conversation.participants.some(participant=>participant.userId===viewer.id) ||
        !message.attachmentDataUrl || !message.attachmentKind) {
      return privateJson("Attachment not found", 404);
    }

    if (message.attachmentKind !== "image" && message.attachmentKind !== "audio") {
      return privateJson("Attachment type is unsupported", 415);
    }

    const decoded = isRestrictedImageReference(message.attachmentDataUrl)
      ? await readRestrictedImage(process.env.SOCIAL_DIRECT_IMAGE_READ_ROOT, message.attachmentDataUrl, message.attachmentMimeType)
      : await loadDirectMessageAttachmentContent(message.attachmentDataUrl);
    if (!decoded) {
      return privateJson("Attachment is unreadable", 422);
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
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options":"nosniff",
        "Content-Security-Policy":"sandbox",
      },
    });
  } catch (error) {
    console.error("Direct-message attachment unavailable");
    return privateJson("Attachment unavailable", 500);
  }
}
