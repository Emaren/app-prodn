import { unstable_cache } from "next/cache";
import type { PrismaClient } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

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

export const WORKSHOP_STREAM_STATUSES = [
  "draft",
  "ready",
  "live",
  "ended",
  "hidden",
] as const;

export type WorkshopDialogueTurn = {
  speaker: string;
  body: string;
  tone?: string | null;
};

const PUBLIC_ENTRY_SELECT = {
  id: true,
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

export type WorkshopChronicleCursor = {
  id: number;
};

export type WorkshopChroniclePageOptions = {
  take?: number;
  before?: WorkshopChronicleCursor | null;
};

export function normalizeWorkshopDialogue(
  value: unknown,
): WorkshopDialogueTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((turn) => {
      if (!turn || typeof turn !== "object" || Array.isArray(turn)) return [];
      const row = turn as Record<string, unknown>;
      const speaker =
        typeof row.speaker === "string" ? row.speaker.trim().slice(0, 100) : "";
      const body =
        typeof row.body === "string" ? row.body.trim().slice(0, 5_000) : "";
      const tone =
        typeof row.tone === "string"
          ? row.tone.trim().slice(0, 40) || null
          : null;
      return speaker && body ? [{ speaker, body, tone }] : [];
    })
    .slice(0, 24);
}

export async function loadWorkshopChroniclePage(
  prisma: PrismaClient,
  options: WorkshopChroniclePageOptions = {},
) {
  const take = Math.min(Math.max(options.take ?? 18, 1), 40);
  const rowLimit = take + 1;

  // PostgreSQL owns the chronological boundary calculation.
  //
  // WorkshopEntry.occurredAt is stored with microsecond precision while
  // JavaScript Date preserves only milliseconds. We therefore pass only the
  // unique row ID as the cursor and let PostgreSQL recover the cursor row's
  // exact occurred_at value before applying the chronological tuple boundary.
  //
  // This keeps the canonical ordering:
  //   occurred_at DESC, id DESC
  //
  // without lossy timestamp round-trips through JavaScript.
  const idRows = options.before
    ? await prisma.$queryRaw<Array<{ id: number }>>`
        WITH cursor_row AS (
          SELECT
            "occurred_at",
            "id"
          FROM "workshop_entries"
          WHERE "id" = ${options.before.id}
        )
        SELECT w."id"
        FROM "workshop_entries" AS w
        CROSS JOIN cursor_row AS c
        WHERE w."status" = 'published'
          AND w."visibility" = 'public'
          AND w."published_at" IS NOT NULL
          AND (w."occurred_at", w."id")
              < (c."occurred_at", c."id")
        ORDER BY
          w."occurred_at" DESC,
          w."id" DESC
        LIMIT ${rowLimit}
      `
    : await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT w."id"
        FROM "workshop_entries" AS w
        WHERE w."status" = 'published'
          AND w."visibility" = 'public'
          AND w."published_at" IS NOT NULL
        ORDER BY
          w."occurred_at" DESC,
          w."id" DESC
        LIMIT ${rowLimit}
      `;

  const hasMore = idRows.length > take;
  const pageIds = idRows.slice(0, take).map((row) => row.id);

  const selectedRows = pageIds.length
    ? await prisma.workshopEntry.findMany({
        where: {
          id: { in: pageIds },
        },
        select: PUBLIC_ENTRY_SELECT,
      })
    : [];

  // findMany with an IN predicate does not promise preservation of the ID
  // query's ordering, so explicitly restore the authoritative keyset order.
  const rowsById = new Map(selectedRows.map((entry) => [entry.id, entry]));

  const pageRows = pageIds.flatMap((id) => {
    const entry = rowsById.get(id);
    return entry ? [entry] : [];
  });

  if (pageRows.length !== pageIds.length) {
    throw new Error(
      "Workshop Chronicle page changed while it was being assembled.",
    );
  }

  const entries = pageRows.map((entry) => ({
    ...entry,
    dialogue: normalizeWorkshopDialogue(entry.dialogue),
    occurredAt: entry.occurredAt.toISOString(),
    publishedAt: entry.publishedAt?.toISOString() ?? null,
  }));

  const last = pageRows.at(-1);

  return {
    entries,
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            id: last.id,
          }
        : null,
  };
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
      where: {
        status: "published",
        visibility: "public",
        publishedAt: { not: null },
      },
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
    description:
      "The forge is quiet. Published build records remain available below.",
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
      include: {
        artifacts: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
      take: 250,
    }),
    prisma.workshopStream.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 60,
    }),
  ]);

  return { status, entries, streams };
}


async function buildPublicWorkshopSummary() {
  const prisma = getPrisma();

  const [status, activeStream] = await Promise.all([
    prisma.workshopStatus.findUnique({
      where: { id: 1 },
      select: {
        isOpen: true,
        isLive: true,
        activityMode: true,
        headline: true,
        currentProject: true,
        updatedAt: true,
      },
    }),
    prisma.workshopStream.findFirst({
      where: { status: "live", isPublic: true },
      select: { publicId: true },
    }),
  ]);

  return {
    isOpen: status?.isOpen ?? false,
    isLive: status?.isLive ?? false,
    activityMode: status?.activityMode ?? "closed",
    headline: status?.headline ?? "THE WORKSHOP RESTS",
    currentProject: status?.currentProject ?? null,
    streamLive: Boolean(activeStream),
    updatedAt: (status?.updatedAt ?? new Date(0)).toISOString(),
  };
}

export const loadCachedPublicWorkshopSummary = unstable_cache(
  buildPublicWorkshopSummary,
  ["public-workshop-summary-v1"],
  {
    revalidate: 30,
    tags: ["workshop-public"],
  },
);

export const loadCachedPublicWorkshop = unstable_cache(
  async () => loadPublicWorkshop(getPrisma()),
  ["public-workshop-v1"],
  {
    revalidate: 30,
    tags: ["workshop-public"],
  },
);

export const loadCachedWorkshopChronicleFirstPage = unstable_cache(
  async () => loadWorkshopChroniclePage(getPrisma(), { take: 18 }),
  ["public-workshop-chronicle-first-v1"],
  {
    revalidate: 30,
    tags: ["workshop-public"],
  },
);

export type PublicWorkshop = Awaited<ReturnType<typeof loadPublicWorkshop>>;
