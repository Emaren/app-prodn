import type { PrismaClient } from "@/lib/generated/prisma";

export const CLAN_AUDIENCES = ["public", "users", "clan"] as const;
export type ClanAudience = (typeof CLAN_AUDIENCES)[number];
export const CLAN_REACTIONS = ["⚔️", "🔥", "🛡️", "🏰", "👑", "🩸"] as const;
export type ClanReaction = (typeof CLAN_REACTIONS)[number];
export type ClanViewMode = "basic" | "advanced" | "extreme";

export const CLAN_AUDIENCE_DETAILS: Record<
  ClanAudience,
  { label: string; shortLabel: string; description: string }
> = {
  public: {
    label: "Public",
    shortLabel: "World",
    description: "Visible to everyone, including visitors who are signed out.",
  },
  users: {
    label: "AoE2WAR users",
    shortLabel: "Users",
    description: "Visible only after signing in to AoE2WAR.",
  },
  clan: {
    label: "Clan only",
    shortLabel: "Clan",
    description: "Visible only to active clan members.",
  },
};

const AUDIENCE_BREADTH: Record<ClanAudience, number> = {
  clan: 0,
  users: 1,
  public: 2,
};

const MANAGER_ROLES = new Set(["owner", "admin"]);

export type ClanDirectoryEntry = {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  crestUrl: string | null;
  memberCount: number;
};

export const MYSTIKAL_FALLBACK: ClanDirectoryEntry = {
  id: 0,
  slug: "mystikal",
  name: "Mystikal Clan",
  tagline: "The old Deathmatch band enters the clan hall.",
  description:
    "A home for the Mystikal players, their allies, their rivals, and the AoE2 HD stories that keep the band together.",
  crestUrl: "/clans/mystikal-crest.webp",
  memberCount: 0,
};

export const JIMS_CLAN_FALLBACK: ClanDirectoryEntry = {
  id: -1,
  slug: "jims-clan",
  name: "Jim's Clan",
  tagline: "The American Champion raises his banner.",
  description:
    "A hard American warhouse for Jim, his allies, and every player willing to carry the fight.",
  crestUrl: null,
  memberCount: 0,
};

export const LEGEND_CLAN_FALLBACK: ClanDirectoryEntry = {
  id: -2,
  slug: "legend-clan",
  name: "Legend Clan",
  tagline: "The Sultan's house gathers beneath an opulent banner.",
  description:
    "A palace-hall for LeGenD_Sultan and the warriors who fight beneath the Legend banner.",
  crestUrl: null,
  memberCount: 0,
};

export const FOUNDING_CLAN_FALLBACKS: readonly ClanDirectoryEntry[] = [
  MYSTIKAL_FALLBACK,
  JIMS_CLAN_FALLBACK,
  LEGEND_CLAN_FALLBACK,
];

export function findFoundingClanFallback(slug: string) {
  return FOUNDING_CLAN_FALLBACKS.find((clan) => clan.slug === slug.toLowerCase()) ?? null;
}

export function mergeClanDirectoryWithFoundingClans(clans: ClanDirectoryEntry[]) {
  const bySlug = new Map(clans.map((clan) => [clan.slug, clan]));
  const founding = FOUNDING_CLAN_FALLBACKS.map(
    (fallback) => bySlug.get(fallback.slug) ?? fallback
  );
  const foundingSlugs = new Set(FOUNDING_CLAN_FALLBACKS.map((clan) => clan.slug));
  return [...founding, ...clans.filter((clan) => !foundingSlugs.has(clan.slug))];
}

export type ClanHallSnapshot = {
  clan: ClanDirectoryEntry & {
    chatAudiencePolicy: ClanAudience;
  };
  viewer: {
    authenticated: boolean;
    uid: string | null;
    displayName: string | null;
    isMember: boolean;
    role: string | null;
    canManage: boolean;
  };
  allowedAudiences: ClanAudience[];
  messages: Array<{
    id: number;
    body: string;
    audience: ClanAudience;
    createdAt: string;
    updatedAt: string;
    edited: boolean;
    canEdit: boolean;
    canDelete: boolean;
    author: {
      uid: string;
      displayName: string;
      role: string | null;
      isClanMember: boolean;
    };
    reactions: Array<{
      emoji: ClanReaction;
      count: number;
      viewerReacted: boolean;
      users: Array<{
        uid: string;
        displayName: string;
      }>;
    }>;
  }>;
  roster: Array<{
    uid: string;
    displayName: string;
    role: string;
    joinedAt: string;
  }>;
  access: {
    canReadChat: boolean;
    canPost: boolean;
    notice: string;
  };
};

export function buildClanFallbackSnapshot(
  clan: ClanDirectoryEntry,
  viewerUid: string | null = null
): ClanHallSnapshot {
  const authenticated = Boolean(viewerUid);
  return {
    clan: { ...clan, chatAudiencePolicy: "public" },
    viewer: {
      authenticated,
      uid: viewerUid,
      displayName: null,
      isMember: false,
      role: null,
      canManage: false,
    },
    allowedAudiences: authenticated ? ["public", "users"] : [],
    messages: [],
    roster: [],
    access: {
      canReadChat: true,
      canPost: authenticated,
      notice: authenticated
        ? "Choose who can see each post before you send it."
        : "You are seeing public clan posts. Sign in to join the conversation.",
    },
  };
}

export function buildMystikalFallbackSnapshot(viewerUid: string | null = null) {
  return buildClanFallbackSnapshot(MYSTIKAL_FALLBACK, viewerUid);
}

export function isClanAudience(value: unknown): value is ClanAudience {
  return typeof value === "string" && (CLAN_AUDIENCES as readonly string[]).includes(value);
}

export function normalizeClanView(
  value: string | string[] | null | undefined
): ClanViewMode {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "basic" || raw === "b") return "basic";
  if (raw === "extreme" || raw === "e") return "extreme";
  return "advanced";
}

export function normalizeClanAudience(
  value: unknown,
  fallback: ClanAudience = "clan"
): ClanAudience {
  return isClanAudience(value) ? value : fallback;
}

export function normalizeClanMessage(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, 1200);
}

export function isClanReaction(value: unknown): value is ClanReaction {
  return typeof value === "string" && (CLAN_REACTIONS as readonly string[]).includes(value);
}

export function audienceAllowedByPolicy(audience: ClanAudience, policy: ClanAudience) {
  return AUDIENCE_BREADTH[audience] <= AUDIENCE_BREADTH[policy];
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

export async function loadClanDirectory(prisma: PrismaClient): Promise<ClanDirectoryEntry[]> {
  const clans = await prisma.clan.findMany({
    where: { status: "active" },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      description: true,
      crestUrl: true,
      _count: {
        select: {
          members: { where: { status: "active" } },
        },
      },
    },
  });

  return clans.map((clan) => ({
    id: clan.id,
    slug: clan.slug,
    name: clan.name,
    tagline: clan.tagline,
    description: clan.description,
    crestUrl: clan.crestUrl,
    memberCount: clan._count.members,
  }));
}

export async function loadClanHallSnapshot(
  prisma: PrismaClient,
  slug: string,
  viewerUid: string | null
): Promise<ClanHallSnapshot | null> {
  const clan = await prisma.clan.findFirst({
    where: { slug, status: "active" },
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      description: true,
      crestUrl: true,
      chatAudiencePolicy: true,
      _count: {
        select: { members: { where: { status: "active" } } },
      },
    },
  });
  if (!clan) return null;

  const viewer = viewerUid
    ? await prisma.user.findUnique({
        where: { uid: viewerUid },
        select: {
          id: true,
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          isAdmin: true,
        },
      })
    : null;
  const membership = viewer
    ? await prisma.clanMember.findUnique({
        where: { clanId_userId: { clanId: clan.id, userId: viewer.id } },
        select: { role: true, status: true },
      })
    : null;
  const activeMembership = membership?.status === "active" ? membership : null;
  const canManage = Boolean(
    viewer?.isAdmin || (activeMembership && MANAGER_ROLES.has(activeMembership.role))
  );
  const isMember = Boolean(activeMembership || viewer?.isAdmin);
  const policy = normalizeClanAudience(clan.chatAudiencePolicy, "public");
  const authenticated = Boolean(viewer);
  const canReadChat =
    policy === "public" ||
    (policy === "users" && authenticated) ||
    (policy === "clan" && isMember);
  const visibleAudiences: ClanAudience[] = canReadChat
    ? [
        "public",
        ...(authenticated ? (["users"] as const) : []),
        ...(isMember ? (["clan"] as const) : []),
      ]
    : [];
  const allowedAudiences = authenticated
    ? CLAN_AUDIENCES.filter(
        (audience) =>
          audienceAllowedByPolicy(audience, policy) &&
          (audience !== "clan" || isMember)
      )
    : [];

  const [messageRows, rosterRows] = await Promise.all([
    visibleAudiences.length > 0
      ? prisma.clanMessage.findMany({
          where: { clanId: clan.id, audience: { in: visibleAudiences } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 80,
          select: {
            id: true,
            body: true,
            audience: true,
            createdAt: true,
            updatedAt: true,
            author: {
              select: {
                id: true,
                uid: true,
                inGameName: true,
                steamPersonaName: true,
              },
            },
            reactions: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                emoji: true,
                userId: true,
                user: {
                  select: { uid: true, inGameName: true, steamPersonaName: true },
                },
              },
            },
          },
        })
      : [],
    prisma.clanMember.findMany({
      where: { clanId: clan.id, status: "active" },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      take: 16,
      select: {
        role: true,
        joinedAt: true,
        user: {
          select: { uid: true, inGameName: true, steamPersonaName: true },
        },
      },
    }),
  ]);

  const authorIds = Array.from(new Set(messageRows.map((message) => message.author.id)));
  const authorMemberships =
    authorIds.length > 0
      ? await prisma.clanMember.findMany({
          where: {
            clanId: clan.id,
            userId: { in: authorIds },
            status: "active",
          },
          select: { userId: true, role: true },
        })
      : [];
  const roleByUserId = new Map(authorMemberships.map((row) => [row.userId, row.role]));

  const notice =
    policy === "clan" && !isMember
      ? `${clan.name} is currently visible to active clan members only.`
      : policy === "users" && !authenticated
        ? `${clan.name} currently shares this hall with signed-in AoE2WAR users.`
        : !authenticated
          ? "You are seeing public clan posts. Sign in to join the conversation."
          : allowedAudiences.length === 0
            ? `${clan.name} has closed posting to clan members.`
            : "Choose who can see each post before you send it.";

  return {
    clan: {
      id: clan.id,
      slug: clan.slug,
      name: clan.name,
      tagline: clan.tagline,
      description: clan.description,
      crestUrl: clan.crestUrl,
      memberCount: clan._count.members,
      chatAudiencePolicy: policy,
    },
    viewer: {
      authenticated,
      uid: viewer?.uid ?? null,
      displayName: viewer ? displayName(viewer) : null,
      isMember,
      role: activeMembership?.role ?? (viewer?.isAdmin ? "site_admin" : null),
      canManage,
    },
    allowedAudiences,
    messages: messageRows
      .slice()
      .reverse()
      .map((message) => {
        const role = roleByUserId.get(message.author.id) ?? null;
        const groupedReactions = new Map<
          ClanReaction,
          {
            emoji: ClanReaction;
            count: number;
            viewerReacted: boolean;
            users: Array<{ uid: string; displayName: string }>;
          }
        >();

        for (const reaction of message.reactions) {
          if (!isClanReaction(reaction.emoji)) continue;
          const group = groupedReactions.get(reaction.emoji) ?? {
            emoji: reaction.emoji,
            count: 0,
            viewerReacted: false,
            users: [],
          };
          group.count += 1;
          group.viewerReacted = group.viewerReacted || reaction.userId === viewer?.id;
          group.users.push({
            uid: reaction.user.uid,
            displayName: displayName(reaction.user),
          });
          groupedReactions.set(reaction.emoji, group);
        }

        const canEdit = Boolean(
          viewer && (message.author.id === viewer.id || viewer.isAdmin || canManage)
        );

        return {
          id: message.id,
          body: message.body,
          audience: normalizeClanAudience(message.audience),
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
          edited: message.updatedAt.getTime() > message.createdAt.getTime(),
          canEdit,
          canDelete: canEdit,
          author: {
            uid: message.author.uid,
            displayName: displayName(message.author),
            role,
            isClanMember: Boolean(role),
          },
          reactions: CLAN_REACTIONS.flatMap((emoji) => {
            const group = groupedReactions.get(emoji);
            return group ? [group] : [];
          }),
        };
      }),
    roster: rosterRows.map((member) => ({
      uid: member.user.uid,
      displayName: displayName(member.user),
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    })),
    access: { canReadChat, canPost: allowedAudiences.length > 0, notice },
  };
}
