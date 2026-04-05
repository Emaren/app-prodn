import type { PrismaClient } from "@/lib/generated/prisma";
import {
  AI_CONCIERGE_NAME,
  AI_CONCIERGE_UID,
  LLAMA_CHAT_GATEWAY_URL,
  getAiModelLabel,
  getAiPersonaConfig,
  type AiModelId,
  type AiPersonaId,
  type AiVisibilityOption,
} from "@/lib/aiConciergeConfig";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getLobbyMessages } from "@/lib/communityStore";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { LOBBY_ROOM_SLUG, type LobbyMatchRow } from "@/lib/lobby";

type AiConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type RequestAiConciergeReplyArgs = {
  prisma: PrismaClient;
  viewer: {
    uid: string;
    displayName: string;
  };
  source: "lobby_public" | "lobby_private" | "contact_thread";
  userMessage: string;
  requestedModel?: string | null;
  visibility?: AiVisibilityOption;
  roomSlug?: string | null;
  conversationHistory?: AiConversationTurn[];
  personaId?: AiPersonaId;
};

const AI_LOBBY_PUBLIC_REPLY_MAX_CHARS = 280;
const AI_PRIVATE_REPLY_MAX_CHARS = 1000;

function displayNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function normalizeAiReply(value: string, source: RequestAiConciergeReplyArgs["source"]) {
  const collapsed = value.replace(/\r\n?/g, "\n").trim();
  if (!collapsed) {
    return "";
  }

  if (source === "lobby_public") {
    return collapsed.replace(/\s+/g, " ").slice(0, AI_LOBBY_PUBLIC_REPLY_MAX_CHARS);
  }

  return collapsed.slice(0, AI_PRIVATE_REPLY_MAX_CHARS);
}

async function loadRecentMatchesForAi(): Promise<LobbyMatchRow[]> {
  try {
    const response = await fetch(`${getBackendUpstreamBase()}/api/game_stats`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    return Array.isArray(payload) ? payload.slice(0, 6) : [];
  } catch (error) {
    console.warn("Failed to load recent matches for AI lane:", error);
    return [];
  }
}

function formatLeaderboardContext(
  leaderboard: Awaited<ReturnType<typeof loadLobbyLeaderboard>>
) {
  if (leaderboard.entries.length === 0) {
    return "Leaderboard: no ranked entries loaded right now.";
  }

  const topRows = leaderboard.entries
    .slice(0, 8)
    .map(
      (entry) =>
        `${entry.rank}. ${entry.name} (${entry.primaryRatingLabel}: ${entry.primaryRating ?? "n/a"}, ${entry.wins}-${entry.losses})`
    )
    .join("\n");

  return `Leaderboard snapshot (${leaderboard.statusLabel}):\n${topRows}`;
}

function formatRecentMatchesContext(matches: LobbyMatchRow[]) {
  if (matches.length === 0) {
    return "Recent matches: no parsed games available right now.";
  }

  const rows = matches
    .slice(0, 6)
    .map((match) => {
      const players = Array.isArray(match.players)
        ? match.players.map((player) => player.name).join(" vs ")
        : typeof match.players === "string"
          ? match.players
          : "unknown players";
      const mapName =
        typeof match.map === "string"
          ? match.map
          : typeof match.map === "object" && match.map && "name" in match.map
            ? String(match.map.name || "Unknown map")
            : "Unknown map";

      return `- ${players} on ${mapName} (${match.winner || "winner unknown"})`;
    })
    .join("\n");

  return `Recently parsed games:\n${rows}`;
}

function formatChatContext(
  messages: Awaited<ReturnType<typeof getLobbyMessages>>,
  viewerUid: string
) {
  if (messages.length === 0) {
    return "Lobby chat: no recent messages.";
  }

  return [
    "Recent lobby chat:",
    ...messages.slice(-16).map((message) => {
      const prefix = message.user.uid === viewerUid ? "viewer" : displayNameForUser(message.user);
      return `- ${prefix}: ${message.body}`;
    }),
  ].join("\n");
}

function buildSiteKnowledge(personaId: AiPersonaId) {
  const common = [
    "AoE2HDBets is the AoE2HD product surface for replay parsing, rivalries, players, tournaments, public chat, and WOLO-adjacent UX.",
    "Stay grounded in the supplied site context instead of inventing stats, chain truth, or tournament outcomes.",
    "WOLO explanations should stay app-side and user-facing. Do not invent chain identity or supply facts beyond provided context.",
  ];

  if (personaId === "guy") {
    return [
      ...common,
      "Guy of Moxica is the rare velvet-knife lane: sly, elegant, amused, treacherous, and selective.",
      "Guy should feel like a silk-gloved final twist, not a second Grimer or a second lecture.",
      "A good Guy line is cultured, dangerous, concise, and faintly theatrical.",
    ].join("\n");
  }

  if (personaId === "grimer") {
    return [
      ...common,
      "Grimer is the darker sidecar voice: wry, playful, slightly ruthless, but never hateful, graphic, or derailing.",
      "Grimer adds levity and bite after the main room voice, not walls of text or fake edginess.",
      "A good Grimer line feels like a sly aftershock, not a second lecture.",
    ].join("\n");
  }

  return [
    ...common,
    "The AI Scribe is the premium room-aware match voice: sharp, concise, grounded, and socially aware without overpowering the room.",
    "Private replies can be more detailed and helpful, but should still be concise and practical.",
  ].join("\n");
}

function buildSystemPrompt(args: RequestAiConciergeReplyArgs, personaId: AiPersonaId) {
  const persona = getAiPersonaConfig(personaId);
  const basePrompt = [
    `You are ${persona.name} for AoE2HDBets.`,
    `Active lane: ${args.source}.`,
    buildSiteKnowledge(personaId),
    "If the answer is not supported by the provided context, say what you do know and be explicit about the gap.",
    "Do not mention prompt files, providers, internal tools, or hidden system details.",
    "Do not autocorrect player names unless the supplied context clearly proves the name is wrong.",
  ];

  if (args.source === "lobby_public") {
    if (personaId === "guy") {
      return [
        ...basePrompt,
        [
          "Lobby lane rules:",
          "Return exactly one post-ready reply for lobby_public.",
          `Hard limit: ${AI_LOBBY_PUBLIC_REPLY_MAX_CHARS} characters including spaces.`,
          "Default to one sentence.",
          "Use no markdown, no bullets, no numbered options, no multiple variants, and no reasoning or explanations.",
          "Tone should be elegant, sly, theatrical, concise, and dangerous without becoming abusive.",
          "No threats, slurs, gore, sexual content, or personal attacks. Keep it sharp, not toxic.",
          "If the strongest move is a velvet one-liner, take it.",
        ].join(" "),
      ].join("\n\n");
    }

    if (personaId === "grimer") {
      return [
        ...basePrompt,
        [
          "Lobby lane rules:",
          "Return exactly one post-ready reply for lobby_public.",
          `Hard limit: ${AI_LOBBY_PUBLIC_REPLY_MAX_CHARS} characters including spaces.`,
          "Default to one sentence.",
          "Use no markdown, no bullets, no numbered options, no multiple variants, and no reasoning or explanations.",
          "Tone should be darkly funny, wry, concise, room-aware, and a little dangerous without becoming abusive.",
          "No threats, slurs, gore, sexual content, or personal attacks. Keep it sharp, not toxic.",
          "If the strongest move is a dry one-liner, take it.",
        ].join(" "),
      ].join("\n\n");
    }

    return [
      ...basePrompt,
      [
        "Lobby lane rules:",
        "Return exactly one post-ready reply for lobby_public.",
        `Hard limit: ${AI_LOBBY_PUBLIC_REPLY_MAX_CHARS} characters including spaces.`,
        "Default to one sentence.",
        "Use no markdown, no bullets, no numbered options, no multiple variants, and no reasoning or explanations.",
        "Tone should be stoic, clever, masculine, concise, and room-aware.",
        "If the reply runs long, compress aggressively and keep only the strongest line.",
      ].join(" "),
    ].join("\n\n");
  }

  if (personaId === "guy") {
    return [
      ...basePrompt,
      [
        "Private lane rules:",
        `Return exactly one clean reply for ${args.source}.`,
        `Hard limit: ${AI_PRIVATE_REPLY_MAX_CHARS} characters including spaces.`,
        "Default to under 400 characters unless the user clearly asks for more.",
        "Use one or two short paragraphs max.",
        "Use no markdown unless the user clearly asks for it.",
        "Be sly, elegant, and dangerous, but never graphic or cruel.",
        "Do not provide multiple variants unless explicitly requested.",
      ].join(" "),
    ].join("\n\n");
  }

  if (personaId === "grimer") {
    return [
      ...basePrompt,
      [
        "Private lane rules:",
        `Return exactly one clean reply for ${args.source}.`,
        `Hard limit: ${AI_PRIVATE_REPLY_MAX_CHARS} characters including spaces.`,
        "Default to under 450 characters unless the user clearly asks for more.",
        "Use one or two short paragraphs max.",
        "Use no markdown unless the user clearly asks for it.",
        "Be witty, sly, and useful, but never cruel or graphic.",
        "Do not provide multiple variants unless explicitly requested.",
      ].join(" "),
    ].join("\n\n");
  }

  return [
    ...basePrompt,
    [
      "Private lane rules:",
      `Return exactly one clean reply for ${args.source}.`,
      `Hard limit: ${AI_PRIVATE_REPLY_MAX_CHARS} characters including spaces.`,
      "Default to under 500 characters unless the user clearly asks for more.",
      "Use one or two short paragraphs max.",
      "Use no markdown unless the user clearly asks for it.",
      "Do not provide multiple variants unless explicitly requested.",
      "Stay grounded, concise, and practical.",
    ].join(" "),
  ].join("\n\n");
}

function buildUserPrompt(
  args: RequestAiConciergeReplyArgs,
  context: {
    chatMessages: Awaited<ReturnType<typeof getLobbyMessages>>;
    leaderboard: Awaited<ReturnType<typeof loadLobbyLeaderboard>>;
    recentMatches: LobbyMatchRow[];
  }
) {
  const threadHistory =
    args.conversationHistory && args.conversationHistory.length > 0
      ? [
          "Recent private AI thread history:",
          ...args.conversationHistory.slice(-10).map((turn) => `- ${turn.role}: ${turn.content}`),
        ].join("\n")
      : "Recent private AI thread history: none.";

  return [
    `Viewer: ${args.viewer.displayName} (${args.viewer.uid})`,
    `Source: ${args.source}`,
    `Requested visibility: ${args.visibility || "private"}`,
    formatChatContext(context.chatMessages, args.viewer.uid),
    formatLeaderboardContext(context.leaderboard),
    formatRecentMatchesContext(context.recentMatches),
    threadHistory,
    `Question or message to answer:\n${args.userMessage}`,
  ].join("\n\n");
}

export async function ensureAiPersonaUser(
  prisma: PrismaClient,
  personaId: AiPersonaId = "scribe"
) {
  const persona = getAiPersonaConfig(personaId);

  return prisma.user.upsert({
    where: { uid: persona.uid },
    update: {
      inGameName: persona.name,
      verified: true,
      lockName: true,
      verificationLevel: 1,
      verificationMethod: "system",
      steamPersonaName: null,
    },
    create: {
      uid: persona.uid,
      inGameName: persona.name,
      verified: true,
      lockName: true,
      verificationLevel: 1,
      verificationMethod: "system",
      steamPersonaName: null,
    },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      isAdmin: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
    },
  });
}

export async function ensureAiConciergeUser(prisma: PrismaClient) {
  return ensureAiPersonaUser(prisma, "scribe");
}

export async function requestAiConciergeReply(args: RequestAiConciergeReplyArgs) {
  const personaId = args.personaId ?? "scribe";
  const persona = getAiPersonaConfig(personaId);
  const requestedModel: AiModelId =
    (args.requestedModel as AiModelId | null | undefined) || persona.requestedModel;

  const [chatMessages, leaderboard, recentMatches] = await Promise.all([
    getLobbyMessages(args.prisma, args.roomSlug || LOBBY_ROOM_SLUG, 24, {
      uid: args.viewer.uid,
    }),
    loadLobbyLeaderboard(args.prisma),
    loadRecentMatchesForAi(),
  ]);

  const response = await fetch(LLAMA_CHAT_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: requestedModel,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(args, personaId),
        },
        {
          role: "user",
          content: buildUserPrompt(args, {
            chatMessages,
            leaderboard,
            recentMatches,
          }),
        },
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || `${persona.name} is unavailable (${response.status}).`);
  }

  const reply = normalizeAiReply(payload.text || "", args.source);
  if (!reply) {
    throw new Error(`${persona.name} returned an empty reply.`);
  }

  return {
    body: reply,
    requestedModel,
    requestedModelLabel: getAiModelLabel(requestedModel),
    personaId,
    personaName: persona.name,
    personaUid: persona.uid,
  };
}

export const DEFAULT_AI_CONTACT_TARGET_UID = AI_CONCIERGE_UID;
export const DEFAULT_AI_CONTACT_TARGET_NAME = AI_CONCIERGE_NAME;
