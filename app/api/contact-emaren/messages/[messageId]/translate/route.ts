import { NextRequest, NextResponse } from "next/server";

import {
  findUniversalLanguage,
  normalizeUniversalLanguage,
} from "@/lib/i18n/languages";
import {
  DirectOpenAiError,
  requestDirectOpenAiResponse,
} from "@/lib/openAiResponses";
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

  let text = "";
  try {
    const response = await requestDirectOpenAiResponse({
      model: "gpt-4.1",
      instructions:
        "You are a precise chat translator. Return only the translated message, preserving names, links, emoji, line breaks, and game terminology. Never add commentary.",
      input: `Translate this private chat message to ${languageDefinition.englishName} (${language}):\n\n${message.body}`,
    });
    text = response.text.trim();
  } catch (error) {
    console.error("Private chat translation provider failed", {
      messageId: message.id,
      language,
      error,
    });
    return NextResponse.json(
      {
        detail:
          error instanceof DirectOpenAiError
            ? error.message
            : "Translation is temporarily unavailable",
      },
      { status: 503 },
    );
  }

  if (!text) {
    return NextResponse.json(
      { detail: "Translation is temporarily unavailable" },
      { status: 503 },
    );
  }

  await prisma.directMessageTranslation.upsert({
    where: { messageId_language: { messageId: message.id, language } },
    create: { messageId: message.id, language, text },
    update: { text },
  });
  return NextResponse.json({ language, text, cached: false });
}
