import type { EventTile, PrismaClient } from "@/lib/generated/prisma";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import type {
  EventStudioSnapshot,
  EventTileStatus,
  EventTileView,
} from "@/lib/events/types";
import { FALLBACK_EVENT_TILE } from "@/lib/events/types";

type EventWithRelations = EventTile & {
  linkedTrophy: { displayName: string } | null;
  playerOne: { representedCountry: string | null } | null;
  playerTwo: { representedCountry: string | null } | null;
};

function eventStatus(value: string): EventTileStatus {
  return ["draft", "scheduled", "live", "completed", "archived"].includes(value)
    ? (value as EventTileStatus)
    : "draft";
}

function text(value: string | null | undefined) {
  return value?.trim() || "";
}

function playerName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function seededCountry(
  eventTileId: string,
  slot: "playerOne" | "playerTwo",
  representedCountry: string | null | undefined
) {
  if (representedCountry) return representedCountry;
  if (eventTileId === "wolomania-i") {
    return slot === "playerOne" ? "USA" : "Mexico";
  }
  return null;
}

export function serializeEventTile(event: EventWithRelations): EventTileView {
  return {
    id: event.id,
    eventTileId: event.eventTileId,
    slug: event.slug,
    status: eventStatus(event.status),
    priority: event.priority,
    isPublished: event.isPublished,
    isActive: event.isActive,
    name: event.name,
    eyebrow: text(event.eyebrow),
    title: event.title,
    subtitle: text(event.subtitle),
    description: text(event.description),
    chapterLabel: text(event.chapterLabel),
    dateLabel: text(event.dateLabel),
    eventStartsAt: event.eventStartsAt?.toISOString() ?? null,
    eventEndsAt: event.eventEndsAt?.toISOString() ?? null,
    payoutBadgeText: text(event.payoutBadgeText),
    featuredBadgeText: text(event.featuredBadgeText),
    ctaLabel: text(event.ctaLabel),
    ctaUrl: text(event.ctaUrl) || "/lobby",
    matchFormat: text(event.matchFormat),
    rulesSummary: text(event.rulesSummary),
    tournamentName: text(event.tournamentName),
    linkedTrophyId: event.linkedTrophyId,
    linkedTrophyName: event.linkedTrophy?.displayName ?? null,
    playerOneUserId: event.playerOneUserId,
    playerOneName: text(event.playerOneName),
    playerOneAvatarUrl: text(event.playerOneAvatarUrl),
    playerOneCountry: seededCountry(
      event.eventTileId,
      "playerOne",
      event.playerOne?.representedCountry
    ),
    playerTwoUserId: event.playerTwoUserId,
    playerTwoName: text(event.playerTwoName),
    playerTwoAvatarUrl: text(event.playerTwoAvatarUrl),
    playerTwoCountry: seededCountry(
      event.eventTileId,
      "playerTwo",
      event.playerTwo?.representedCountry
    ),
    commissionerUserId: event.commissionerUserId,
    commissionerName: text(event.commissionerName),
    commissionerAvatarUrl: text(event.commissionerAvatarUrl),
    beltImageUrl: text(event.beltImageUrl),
    backgroundImageUrl: text(event.backgroundImageUrl),
    mobileBackgroundImageUrl: text(event.mobileBackgroundImageUrl),
    gradientFrom: event.gradientFrom,
    gradientVia: event.gradientVia,
    gradientTo: event.gradientTo,
    overlayOpacity: event.overlayOpacity,
    vignetteOpacity: event.vignetteOpacity,
    theme: event.theme,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    publishedAt: event.publishedAt?.toISOString() ?? null,
    source: "database",
  };
}

const EVENT_INCLUDE = {
  linkedTrophy: { select: { displayName: true } },
  playerOne: { select: { representedCountry: true } },
  playerTwo: { select: { representedCountry: true } },
} as const;

export async function loadActiveEventTile(prisma: PrismaClient): Promise<EventTileView> {
  try {
    const event = await prisma.eventTile.findFirst({
      where: {
        isPublished: true,
        isActive: true,
        status: { not: "archived" },
      },
      include: EVENT_INCLUDE,
      orderBy: [{ priority: "desc" }, { publishedAt: "desc" }, { updatedAt: "desc" }],
    });
    return event ? serializeEventTile(event) : FALLBACK_EVENT_TILE;
  } catch (error) {
    console.warn("Active EventTile unavailable; using Wolomania fallback:", error);
    return FALLBACK_EVENT_TILE;
  }
}

export async function loadEventStudioSnapshot(
  prisma: PrismaClient
): Promise<EventStudioSnapshot> {
  const [events, users, trophies, mediaAssets] = await Promise.all([
    prisma.eventTile.findMany({
      include: EVENT_INCLUDE,
      orderBy: [
        { isActive: "desc" },
        { isPublished: "desc" },
        { priority: "desc" },
        { updatedAt: "desc" },
      ],
      take: 100,
    }),
    prisma.user.findMany({
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        representedCountry: true,
      },
      orderBy: [{ lastSeen: "desc" }, { id: "asc" }],
      take: 500,
    }),
    prisma.trophy.findMany({
      select: { id: true, trophyId: true, displayName: true, status: true },
      orderBy: [{ family: "asc" }, { displayName: "asc" }],
      take: 200,
    }),
    prisma.managedMediaAsset.findMany({
      where: {
        active: true,
        kind: { in: ["avatar", "belt", "artifact", "background", "logo", "other"] },
      },
      select: {
        id: true,
        kind: true,
        target: true,
        label: true,
        url: true,
        active: true,
        updatedAt: true,
      },
      orderBy: [{ kind: "asc" }, { target: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 240,
    }),
  ]);

  return {
    events: events.map(serializeEventTile),
    users: users.map((user) => ({
      id: user.id,
      uid: user.uid,
      name: playerName(user),
      representedCountry: user.representedCountry,
      avatarUrl: managedMediaPublicUrl(
        "avatar",
        user.inGameName || user.steamPersonaName || user.uid,
        "/champions/players/silhouette.webp"
      ),
    })),
    trophies,
    mediaAssets: mediaAssets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      target: asset.target,
      label: asset.label,
      url: asset.url,
      active: asset.active,
      updatedAt: asset.updatedAt.toISOString(),
    })),
    activeEventId: events.find((event) => event.isActive && event.isPublished)?.id ?? null,
    generatedAt: new Date().toISOString(),
  };
}
