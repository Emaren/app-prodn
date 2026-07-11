import { NextRequest, NextResponse } from "next/server";

import { publishDirectMessageEvent } from "@/lib/directMessageEvents";
import { loadDirectMessageAttachmentContent } from "@/lib/directMessageAttachments";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> }
) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ detail: "Voice transcription is not configured yet" }, { status: 503 });
  }

  const { messageId: rawMessageId } = await context.params;
  const messageId = Number(rawMessageId);
  if (!Number.isInteger(messageId)) {
    return NextResponse.json({ detail: "Invalid message id" }, { status: 400 });
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({ where: { uid: sessionUid }, select: { id: true } });
  if (!viewer) return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });

  const message = await prisma.directMessage.findFirst({
    where: {
      id: messageId,
      attachmentKind: "audio",
      conversation: { participants: { some: { userId: viewer.id } } },
    },
    select: {
      id: true,
      attachmentDataUrl: true,
      attachmentMimeType: true,
      attachmentName: true,
      transcription: true,
      conversation: { select: { participants: { select: { user: { select: { uid: true } } } } } },
    },
  });
  if (!message?.attachmentDataUrl) {
    return NextResponse.json({ detail: "Voice note not found" }, { status: 404 });
  }
  if (message.transcription) {
    return NextResponse.json({ text: message.transcription, cached: true });
  }

  const attachment = await loadDirectMessageAttachmentContent(message.attachmentDataUrl);
  if (!attachment) return NextResponse.json({ detail: "Voice note file is unavailable" }, { status: 404 });

  await prisma.directMessage.update({
    where: { id: message.id },
    data: { transcriptionStatus: "processing" },
  });

  try {
    const formData = new FormData();
    const mimeType = message.attachmentMimeType || attachment.mimeType || "audio/webm";
    formData.set("file", new Blob([attachment.buffer], { type: mimeType }), message.attachmentName || `voice-${message.id}.webm`);
    formData.set("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
    formData.set("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    const text = payload.text?.trim();
    if (!response.ok || !text) {
      throw new Error(payload.error?.message || "Transcription failed");
    }

    await prisma.directMessage.update({
      where: { id: message.id },
      data: { transcription: text, transcriptionStatus: "complete" },
    });
    for (const participant of message.conversation.participants) {
      publishDirectMessageEvent(participant.user.uid, { type: "message_updated", messageId: message.id });
    }
    return NextResponse.json({ text, cached: false });
  } catch (error) {
    await prisma.directMessage.update({
      where: { id: message.id },
      data: { transcriptionStatus: "failed" },
    });
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Transcription failed" },
      { status: 502 }
    );
  }
}
