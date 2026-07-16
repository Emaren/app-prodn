import type { PrismaClient } from "@/lib/generated/prisma";

export const WORKSHOP_ACTIVITY_MODES = [
  "closed",
  "building_live",
  "streaming",
  "ai_session_live",
  "quiet_work",
  "major_deployment",
  "maintenance",
  "special_event",
] as const;

export const WORKSHOP_ENTRY_TYPES = [
  "build_note",
  "ai_discussion",
  "design_decision",
  "screenshot",
  "image",
  "deployment",
  "parser_discovery",
  "video",
  "livestream",
  "audio",
  "milestone",
] as const;

export const WORKSHOP_LANES = [
  "work_feed",
  "on_anvil",
  "next_forge",
  "fresh_forge",
  "legendary",
] as const;

export const WORKSHOP_STREAM_STATUSES = ["draft", "ready", "live", "ended", "hidden"] as const;

export type WorkshopDialogueTurn = {
  speaker: string;
  body: string;
  tone?: string | null;
};

const PUBLIC_ENTRY_SELECT = {
  publicId: true,
  entryType: true,
  title: true,
  summary: true,
  body: true,
  dialogue: true,
  lane: true,
  mediaKind: true,
  mediaUrl: true,
  mediaAlt: true,
  linkLabel: true,
  linkUrl: true,
  pinned: true,
  featuredOrder: true,
  occurredAt: true,
  publishedAt: true,
  artifacts: {
    where: { isPublic: true },
    orderBy: { sortOrder: "asc" as const },
    select: {
      kind: true,
      label: true,
      url: true,
      alt: true,
      mimeType: true,
      sortOrder: true,
    },
  },
} as const;

export function normalizeWorkshopDialogue(value: unknown): WorkshopDialogueTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((turn) => {
    if (!turn || typeof turn !== "object" || Array.isArray(turn)) return [];
    const row = turn as Record<string, unknown>;
    const speaker = typeof row.speaker === "string" ? row.speaker.trim().slice(0, 100) : "";
    const body = typeof row.body === "string" ? row.body.trim().slice(0, 5_000) : "";
    const tone = typeof row.tone === "string" ? row.tone.trim().slice(0, 40) || null : null;
    return speaker && body ? [{ speaker, body, tone }] : [];
  }).slice(0, 24);
}

export async function loadPublicWorkshop(prisma: PrismaClient) {
  const [status, entries, activeStream] = await Promise.all([
    prisma.workshopStatus.findUnique({
      where: { id: 1 },
      select: {
        isOpen: true,
        isLive: true,
        activityMode: true,
        headline: true,
        description: true,
        currentProject: true,
        openedAt: true,
        updatedAt: true,
      },
    }),
    prisma.workshopEntry.findMany({
      where: { status: "published", visibility: "public", publishedAt: { not: null } },
      orderBy: [
        { pinned: "desc" },
        { featuredOrder: "desc" },
        { occurredAt: "desc" },
        { id: "desc" },
      ],
      take: 120,
      select: PUBLIC_ENTRY_SELECT,
    }),
    prisma.workshopStream.findFirst({
      where: { status: "live", isPublic: true },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: {
        publicId: true,
        provider: true,
        sourceType: true,
        title: true,
        description: true,
        playbackUrl: true,
        embedUrl: true,
        thumbnailUrl: true,
        status: true,
        startedAt: true,
      },
    }),
  ]);

  const fallbackStatus = {
    isOpen: false,
    isLive: false,
    activityMode: "closed",
    headline: "THE WORKSHOP RESTS",
    description: "The forge is quiet. Published build records remain available below.",
    currentProject: null,
    openedAt: null,
    updatedAt: new Date(0),
  };

  return {
    generatedAt: new Date().toISOString(),
    status: {
      ...(status ?? fallbackStatus),
      openedAt: (status ?? fallbackStatus).openedAt?.toISOString() ?? null,
      updatedAt: (status ?? fallbackStatus).updatedAt.toISOString(),
    },
    stream: activeStream
      ? {
          ...activeStream,
          startedAt: activeStream.startedAt?.toISOString() ?? null,
        }
      : null,
    entries: entries.map((entry) => ({
      ...entry,
      dialogue: normalizeWorkshopDialogue(entry.dialogue),
      occurredAt: entry.occurredAt.toISOString(),
      publishedAt: entry.publishedAt?.toISOString() ?? null,
    })),
  };
}

export async function loadAdminWorkshop(prisma: PrismaClient) {
  const [status, entries, streams] = await Promise.all([
    prisma.workshopStatus.findUnique({ where: { id: 1 } }),
    prisma.workshopEntry.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { artifacts: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
      take: 250,
    }),
    prisma.workshopStream.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 60,
    }),
  ]);

  return { status, entries, streams };
}

export type PublicWorkshop = Awaited<ReturnType<typeof loadPublicWorkshop>>;
