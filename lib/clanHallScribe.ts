import type { PrismaClient } from "@/lib/generated/prisma";

import {
  hallScribeMentioned,
  hallScribeVisibleAudiences,
} from "@/lib/clanHallScribePolicy";

import { requestAiConciergeReply } from "@/lib/aiConcierge";
import {
  loadAiAgentBySlug,
  type AiAgentRuntimeConfig,
} from "@/lib/aiAgents";
import { publishClanHallEvent } from "@/lib/clanHallEvents";
import { clanHallFeatureEnabled } from "@/lib/clanHallFeatures";
import { formatClanRole } from "@/lib/clanRoles";
import type { ClanAudience } from "@/lib/clans";
import {
  AOE2WAR_HALL_SCRIBE_UID,
  isInternalSystemUid,
} from "@/lib/internalSystemAccounts";

export const AOE2WAR_HALL_SCRIBE_AGENT_SLUG =
  "aoe2war-hall-scribe";
export const AOE2WAR_HALL_SCRIBE_NAME = "Hall Scribe";
export const AOE2WAR_HALL_SCRIBE_MODEL = "Agent4.1HallScribe";

const HALL_SCRIBE_CONTEXT_MESSAGE_LIMIT = 24;
const HALL_SCRIBE_CONTEXT_CHAR_LIMIT = 12_000;

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

async function ensureHallScribeUser(prisma: PrismaClient) {
  return prisma.user.upsert({
    where: { uid: AOE2WAR_HALL_SCRIBE_UID },
    update: {
      inGameName: AOE2WAR_HALL_SCRIBE_NAME,
      verified: true,
      lockName: true,
      verificationLevel: 1,
      verificationMethod: "system",
      steamPersonaName: null,
    },
    create: {
      uid: AOE2WAR_HALL_SCRIBE_UID,
      inGameName: AOE2WAR_HALL_SCRIBE_NAME,
      verified: true,
      lockName: true,
      verificationLevel: 1,
      verificationMethod: "system",
      steamPersonaName: null,
    },
    select: { id: true, uid: true },
  });
}

async function buildHallGroundingContext(args: {
  prisma: PrismaClient;
  clanId: number;
  clanSlug: string;
  clanName: string;
  audience: ClanAudience;
  triggerMessageId: number;
  agentConfig: AiAgentRuntimeConfig;
}) {
  const visibleAudiences = hallScribeVisibleAudiences(args.audience);
  const [roster, messageRows] = await Promise.all([
    args.prisma.clanMember.findMany({
      where: { clanId: args.clanId, status: "active" },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      take: 40,
      select: {
        userId: true,
        role: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    args.prisma.clanMessage.findMany({
      where: {
        clanId: args.clanId,
        id: { lt: args.triggerMessageId },
        audience: { in: visibleAudiences },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HALL_SCRIBE_CONTEXT_MESSAGE_LIMIT,
      select: {
        id: true,
        body: true,
        audience: true,
        author: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
  ]);

  const roleByUserId = new Map(
    roster.map((entry) => [entry.userId, entry.role]),
  );
  const rosterLines = roster.map(
    (entry) =>
      `- ${displayName(entry.user)} — ${formatClanRole(entry.role)}`,
  );
  const conversationLines = messageRows
    .slice()
    .reverse()
    .map((entry) => {
      const role =
        entry.author.uid === AOE2WAR_HALL_SCRIBE_UID
          ? "Hall Scribe"
          : formatClanRole(roleByUserId.get(entry.author.id) ?? null);
      const body = entry.body.replace(/\s+/g, " ").trim().slice(0, 500);
      return `- ${displayName(entry.author)} [${role}; ${entry.audience}]: ${body}`;
    });

  const maxChars = Math.min(
    HALL_SCRIBE_CONTEXT_CHAR_LIMIT,
    Math.max(4_000, Math.floor(args.agentConfig.maxContextChars * 0.55)),
  );

  return [
    `Clan Hall: ${args.clanName}`,
    `Clan slug: ${args.clanSlug}`,
    `Reply audience: ${args.audience}`,
    "Privacy rule: recent Hall conversation below contains only messages visible at this reply audience. Never widen information from a narrower audience into a broader reply.",
    "",
    "Current active roster:",
    ...(rosterLines.length > 0 ? rosterLines : ["- No active members loaded."]),
    "",
    "Recent visible Hall conversation before the current message:",
    ...(conversationLines.length > 0
      ? conversationLines
      : ["- No earlier Hall messages in this audience lane."]),
  ]
    .join("\n")
    .slice(0, maxChars);
}

export async function maybeCreateAoE2WarHallScribeReply(args: {
  prisma: PrismaClient;
  clanId: number;
  clanSlug: string;
  clanName: string;
  audience: ClanAudience;
  triggerMessageId: number;
  message: string;
  forceReply?: boolean;
  viewer: { uid: string; displayName: string };
}) {
  if (
    args.clanSlug !== "aoe2war" ||
    !clanHallFeatureEnabled(args.clanSlug, "hallScribe") ||
    (!args.forceReply && !hallScribeMentioned(args.message)) ||
    isInternalSystemUid(args.viewer.uid)
  ) {
    return { status: "not_triggered" as const };
  }

  const agentConfig = await loadAiAgentBySlug(
    args.prisma,
    AOE2WAR_HALL_SCRIBE_AGENT_SLUG,
    { enabledOnly: true },
  );
  if (!agentConfig) return { status: "unconfigured" as const };

  const groundingContext = await buildHallGroundingContext({
    prisma: args.prisma,
    clanId: args.clanId,
    clanSlug: args.clanSlug,
    clanName: args.clanName,
    audience: args.audience,
    triggerMessageId: args.triggerMessageId,
    agentConfig,
  });

  const aiReply = await requestAiConciergeReply({
    prisma: args.prisma,
    viewer: args.viewer,
    source: "clan_hall",
    userMessage: args.message,
    requestedModel: agentConfig.requestedModel,
    visibility: args.audience === "public" ? "public" : "private",
    personaId: "scribe",
    agentConfig,
    groundingContext,
  });

  const body = aiReply.body.trim().slice(0, 1200);
  if (!body) return { status: "empty" as const };

  const aiUser = await ensureHallScribeUser(args.prisma);
  const created = await args.prisma.clanMessage.create({
    data: {
      clanId: args.clanId,
      authorUserId: aiUser.id,
      body,
      audience: args.audience,
    },
    select: { id: true },
  });

  publishClanHallEvent(args.clanSlug, {
    type: "message",
    messageId: created.id,
  });

  return { status: "posted" as const, messageId: created.id };
}
