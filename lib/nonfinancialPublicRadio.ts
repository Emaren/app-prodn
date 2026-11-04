/**
 * Restricted nonfinancial Radio display projections. The raw submission,
 * programming, and private asset tables remain denied to the web role.
 */
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { isNonfinancialPublicReadProfile } from "@/lib/nonfinancialPublicReadProfile";

export type PublicRadioTrack = {
  publicId: string;
  artistName: string;
  trackTitle: string;
  genre: string | null;
  featured: boolean;
  publishedAt: Date | null;
  artworkStorageKey: string | null;
};
export type PublicRadioMedia = {
  audioStorageKey: string;
  audioMediaType: string;
  artworkStorageKey: string | null;
  artworkMediaType: string | null;
};

export async function loadPublicRadioTracks(prisma: PrismaClient): Promise<PublicRadioTrack[]> {
  if (!isNonfinancialPublicReadProfile()) {
    return prisma.radioSubmission.findMany({
      where: { status: "published" },
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
      take: 60,
      select: {
        publicId: true, artistName: true, trackTitle: true, genre: true,
        featured: true, publishedAt: true, artworkStorageKey: true,
      },
    });
  }
  return prisma.$queryRaw<PublicRadioTrack[]>(Prisma.sql`
    SELECT public_id::text AS "publicId", artist_name AS "artistName",
           track_title AS "trackTitle", genre, featured,
           published_at AS "publishedAt", artwork_storage_key AS "artworkStorageKey"
    FROM aoe2war_public_v2.radio_published_tracks
    ORDER BY featured DESC, published_at DESC, public_id DESC LIMIT 60
  `);
}

export async function loadPublicRadioMedia(
  prisma: PrismaClient,
  publicId: string,
): Promise<PublicRadioMedia | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicId)) {
    return null;
  }
  if (!isNonfinancialPublicReadProfile()) {
    return prisma.radioSubmission.findFirst({
      where: { publicId, status: "published" },
      select: {
        audioStorageKey: true, audioMediaType: true,
        artworkStorageKey: true, artworkMediaType: true,
      },
    });
  }
  const rows = await prisma.$queryRaw<PublicRadioMedia[]>(Prisma.sql`
    SELECT audio_storage_key AS "audioStorageKey",
           audio_media_type AS "audioMediaType",
           artwork_storage_key AS "artworkStorageKey",
           artwork_media_type AS "artworkMediaType"
    FROM aoe2war_public_v2.radio_published_tracks
    WHERE public_id = CAST(${publicId} AS uuid) LIMIT 1
  `);
  return rows[0] ?? null;
}

export type PublicStationModel = {
  state: string;
  startedAt: Date | null;
  stoppedAt: Date | null;
  program: {
    id: number;
    publicId: string;
    name: string;
    items: Array<{
      id: number;
      position: number;
      transition: string;
      crossfadeMs: number;
      asset: {
        publicId: string;
        title: string;
        credit: string | null;
        kind: string;
        durationMs: number;
      };
    }>;
  } | null;
};

type StationDisplayRow = {
  state: string;
  startedAt: Date | null;
  stoppedAt: Date | null;
  programId: number | null;
  programPublicId: string | null;
  programName: string | null;
  programStatus: string | null;
  itemId: number | null;
  itemPosition: number | null;
  itemTransition: string | null;
  itemCrossfadeMs: number | null;
  assetPublicId: string | null;
  assetTitle: string | null;
  assetCredit: string | null;
  assetKind: string | null;
  assetDurationMs: number | null;
  assetIsReady: boolean | null;
};

export function projectPublicStationRows(rows: StationDisplayRow[]): PublicStationModel | null {
  if (rows.length === 0) return null;
  const first = rows[0];
  for (const row of rows) {
    if (row.state !== first.state ||
        row.startedAt?.getTime() !== first.startedAt?.getTime() ||
        row.stoppedAt?.getTime() !== first.stoppedAt?.getTime() ||
        row.programId !== first.programId ||
        row.programPublicId !== first.programPublicId ||
        row.programName !== first.programName ||
        row.programStatus !== first.programStatus) {
      throw new Error("PUBLIC_RADIO_STATION_SNAPSHOT_INCONSISTENT");
    }
  }
  if (first.programId === null || first.programPublicId === null ||
      first.programName === null) {
    if (rows.length !== 1 || rows[0].itemId !== null) {
      throw new Error("PUBLIC_RADIO_STATION_PROGRAM_INCOMPLETE");
    }
    return { state: first.state, startedAt: first.startedAt, stoppedAt: first.stoppedAt, program: null };
  }
  if (first.state === "on_air" && first.programStatus !== "ready") {
    throw new Error("PUBLIC_RADIO_STATION_NOT_PUBLISHED_READY");
  }
  const items: NonNullable<PublicStationModel["program"]>["items"] = [];
  const occupied = new Set<number>();
  for (const row of rows) {
    if (row.itemId === null) continue;
    if (row.itemPosition === null || !Number.isSafeInteger(row.itemPosition) ||
        occupied.has(row.itemPosition) || row.assetIsReady !== true ||
        !row.assetPublicId || !row.assetTitle || !row.assetKind ||
        row.assetDurationMs === null || row.assetDurationMs <= 0 ||
        !row.itemTransition || row.itemCrossfadeMs === null) {
      throw new Error("PUBLIC_RADIO_STATION_ITEM_NOT_READY");
    }
    occupied.add(row.itemPosition);
    items.push({
      id: row.itemId, position: row.itemPosition,
      transition: row.itemTransition, crossfadeMs: row.itemCrossfadeMs,
      asset: {
        publicId: row.assetPublicId, title: row.assetTitle,
        credit: row.assetCredit, kind: row.assetKind,
        durationMs: row.assetDurationMs,
      },
    });
  }
  items.sort((a,b) => a.position - b.position);
  if (first.state === "on_air" && items.length === 0) {
    throw new Error("PUBLIC_RADIO_ON_AIR_WITHOUT_ITEMS");
  }
  return {
    state: first.state, startedAt: first.startedAt, stoppedAt: first.stoppedAt,
    program: { id: first.programId, publicId: first.programPublicId,
               name: first.programName, items },
  };
}

export async function loadPublicRadioStation(prisma: PrismaClient): Promise<PublicStationModel | null> {
  if (!isNonfinancialPublicReadProfile()) {
    return prisma.radioStationState.findUnique({
      where: { id: 1 },
      select: {
        state: true, startedAt: true, stoppedAt: true,
        program: {
          select: {
            id: true, publicId: true, name: true,
            items: {
              orderBy: { position: "asc" },
              select: {
                id: true, position: true, transition: true, crossfadeMs: true,
                asset: {
                  select: {
                    publicId: true, title: true, credit: true,
                    kind: true, durationMs: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }
  const rows = await prisma.$queryRaw<StationDisplayRow[]>(Prisma.sql`
    SELECT state, started_at AS "startedAt", stopped_at AS "stoppedAt",
           program_id AS "programId", program_public_id::text AS "programPublicId",
           program_name AS "programName", program_status AS "programStatus",
           item_id AS "itemId", item_position AS "itemPosition",
           item_transition AS "itemTransition",
           item_crossfade_ms AS "itemCrossfadeMs",
           asset_public_id::text AS "assetPublicId", asset_title AS "assetTitle",
           asset_credit AS "assetCredit", asset_kind AS "assetKind",
           asset_duration_ms AS "assetDurationMs",
           asset_is_ready AS "assetIsReady"
    FROM aoe2war_public_v2.radio_station_display
    ORDER BY item_position ASC NULLS LAST, item_id ASC NULLS LAST
    LIMIT 5001
  `);
  if (rows.length > 5000) throw new Error("PUBLIC_RADIO_STATION_TOO_MANY_ITEMS");
  return projectPublicStationRows(rows);
}
