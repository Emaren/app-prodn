import { NextRequest, NextResponse } from "next/server";

import { LLAMA_CHAT_GATEWAY_URL } from "@/lib/aiConciergeConfig";
import {
  findUniversalLanguage,
  normalizeUniversalLanguage,
} from "@/lib/i18n/languages";
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

  const { messageId: rawMessageId } = await context.params;
  const messageId = Number(rawMessageId);
  const input = (await request.json().catch(() => ({}))) as { language?: string };
  if (!Number.isInteger(messageId)) {
    return NextResponse.json({ detail: "Invalid translation request" }, { status: 400 });
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: { id: true, preferredLanguage: true },
  });
  if (!viewer) return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
  const language = normalizeUniversalLanguage(
    input.language || viewer.preferredLanguage || "en"
  );
  const languageDefinition = findUniversalLanguage(language);
  if (!language || !languageDefinition) {
    return NextResponse.json({ detail: "Choose a supported translation language" }, { status: 400 });
  }

  const message = await prisma.directMessage.findFirst({
    where: {
      id: messageId,
      conversation: { participants: { some: { userId: viewer.id } } },
    },
    select: {
      id: true,
      body: true,
      translations: { where: { language }, take: 1, select: { text: true } },
    },
  });
  if (!message) return NextResponse.json({ detail: "Message not found" }, { status: 404 });
  if (!message.body?.trim()) return NextResponse.json({ detail: "This message has no text to translate" }, { status: 400 });
  if (message.translations[0]) {
    return NextResponse.json({ language, text: message.translations[0].text, cached: true });
  }

  const response = await fetch(LLAMA_CHAT_GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: "Agent4.1M",
      messages: [
        { role: "system", content: "You are a precise chat translator. Return only the translated message, preserving names, links, emoji, line breaks, and game terminology. Never add commentary." },
        { role: "user", content: `Translate this private chat message to ${languageDefinition.englishName} (${language}):\n\n${message.body}` },
      ],
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  const text = payload.text?.trim();
  if (!response.ok || !text) {
    return NextResponse.json({ detail: payload.error || "Translation is temporarily unavailable" }, { status: 503 });
  }

  await prisma.directMessageTranslation.upsert({
    where: { messageId_language: { messageId: message.id, language } },
    create: { messageId: message.id, language, text },
    update: { text },
  });
  return NextResponse.json({ language, text, cached: false });
}
