import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  findUniversalLanguage,
  normalizeUniversalLanguage,
  SACRED_AOE2WAR_TERMS,
} from "@/lib/i18n/languages";
import {
  getClanMessageTranslation,
  setClanMessageTranslation,
} from "@/lib/clanMessageTranslationCache";
import {
  DirectOpenAiError,
  requestDirectOpenAiResponse,
} from "@/lib/openAiResponses";
import {
  loadClanHallSnapshot,
} from "@/lib/clans";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, max-age=0",
};

function normalizeSlug(value: string) {
  return decodeURIComponent(value)
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function parseMessageId(
  value: string,
) {
  const parsed =
    Number.parseInt(value, 10);

  return Number.isSafeInteger(
    parsed,
  ) && parsed > 0
    ? parsed
    : null;
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      slug: string;
      messageId: string;
    }>;
  },
) {
  const sessionUid =
    await getSessionUid(request);

  if (!sessionUid) {
    return NextResponse.json(
      {
        detail:
          "Sign in to translate Hall messages.",
      },
      {
        status: 401,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const params =
    await context.params;
  const slug =
    normalizeSlug(params.slug);
  const messageId =
    parseMessageId(
      params.messageId,
    );

  if (!messageId) {
    return NextResponse.json(
      {
        detail:
          "Invalid Hall message.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const input =
    (await request
      .json()
      .catch(() => ({}))) as {
      language?: string;
    };

  const prisma = getPrisma();

  const viewer =
    await prisma.user.findUnique({
      where: {
        uid: sessionUid,
      },
      select: {
        preferredLanguage: true,
      },
    });

  if (!viewer) {
    return NextResponse.json(
      {
        detail:
          "Viewer not found.",
      },
      {
        status: 404,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const language =
    normalizeUniversalLanguage(
      input.language ||
        viewer.preferredLanguage ||
        "en",
    );

  const languageDefinition =
    findUniversalLanguage(language);

  if (
    !language ||
    !languageDefinition
  ) {
    return NextResponse.json(
      {
        detail:
          "Choose a supported translation language.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const snapshot =
    await loadClanHallSnapshot(
      prisma,
      slug,
      sessionUid,
      { focusMessageId: messageId },
    );

  const message =
    snapshot?.messages.find(
      (entry) =>
        entry.id === messageId,
    );

  if (!snapshot || !message) {
    return NextResponse.json(
      {
        detail:
          "That Hall message is not visible to you.",
      },
      {
        status: 404,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const cached =
    getClanMessageTranslation(
      message.id,
      message.updatedAt,
      language,
    );

  if (cached) {
    return NextResponse.json(
      {
        language,
        text: cached,
        cached: true,
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  let text = "";

  try {
    const response =
      await requestDirectOpenAiResponse(
        {
          model: "gpt-4.1",
          instructions: [
            "You are a precise live chat translator.",
            "Return only the translated message.",
            "Preserve names, links, emoji, line breaks, Age of Empires terminology, and player handles.",
            `Never translate these AoE2WAR sacred terms: ${SACRED_AOE2WAR_TERMS.join(", ")}.`,
            "Never add commentary or explanation.",
          ].join(" "),
          input:
            `Translate this Clan Hall message to ${languageDefinition.englishName} (${language}):\n\n${message.body}`,
        },
      );

    text =
      response.text.trim();
  } catch (error) {
    console.error(
      "Clan Hall translation provider failed",
      {
        slug,
        messageId:
          message.id,
        language,
        error,
      },
    );

    return NextResponse.json(
      {
        detail:
          error instanceof
          DirectOpenAiError
            ? error.message
            : "Translation is temporarily unavailable.",
      },
      {
        status: 503,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  if (!text) {
    return NextResponse.json(
      {
        detail:
          "Translation is temporarily unavailable.",
      },
      {
        status: 503,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  setClanMessageTranslation(
    message.id,
    message.updatedAt,
    language,
    text,
  );

  return NextResponse.json(
    {
      language,
      text,
      cached: false,
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
