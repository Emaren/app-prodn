import type { PrismaClient } from "@/lib/generated/prisma";
import { featuredAvatarCardUrlForUser } from "@/lib/avatarAssets";
import { loadChampionTitleEconomyState } from "@/lib/champions/titleState";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { seededTrophyDefinition } from "@/lib/trophies/service";

const CHAOSIUM_TITLE_IDS = [
  "chaos",
  "national-canada",
  "national-usa",
  "national-mexico",
] as const;

const LINEAGE_EVENT_TYPES = [
  "HOLDER_ASSIGNED",
  "HOLDER_REASSIGNED",
  "CHALLENGE_SETTLED_HOLDER_CHANGED",
] as const;

export type ChaosiumLineageEntry = {
  key: string;
  kind: "holder" | "origin";
  name: string;
  uid: string | null;
  href: string | null;
  avatarUrl: string | null;
  at: string | null;
  eventType: string;
  current: boolean;
};

export type ChaosiumBelt = {
  id: string;
  displayName: string;
  shortName: string;
  routeHref: string;
  assetUrl: string;
  status: string;
  currentHolder: string | null;
  currentHolderUid: string | null;
  currentHolderHref: string | null;
  currentHolderAvatarUrl: string | null;
  currentRecord: string | null;
  totalMatches: number | null;
  wins: number | null;
  losses: number | null;
  rating: number | null;
  ratingLabel: string | null;
  holderSince: string | null;
  lineage: ChaosiumLineageEntry[];
};

function normalizeIdentity(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function holderIdentity(
  uid: string | null | undefined,
  name: string | null | undefined,
) {
  const normalizedUid = String(uid ?? "").trim().toLowerCase();
  if (normalizedUid) return `uid:${normalizedUid}`;
  const normalizedName = normalizeIdentity(name);
  return normalizedName ? `name:${normalizedName}` : "";
}

function previousReignLabel(eventType: string) {
  return eventType === "CHALLENGE_SETTLED_HOLDER_CHANGED"
    ? "Reign ended · challenge transfer"
    : "Reign ended · title transfer";
}

export async function loadChaosium(prisma: PrismaClient): Promise<ChaosiumBelt[]> {
  const [economy, directory] = await Promise.all([
    loadChampionTitleEconomyState(prisma),
    loadPublicPlayerDirectory(prisma),
  ]);

  let trophyRows: Array<{
    id: number;
    trophyId: string;
    createdAt: Date;
    events: Array<{
      id: number;
      eventType: string;
      createdAt: Date;
      fromHolder: {
        uid: string;
        inGameName: string | null;
        steamPersonaName: string | null;
      } | null;
      toHolder: {
        uid: string;
        inGameName: string | null;
        steamPersonaName: string | null;
      } | null;
    }>;
  }> = [];

  try {
    trophyRows = await prisma.trophy.findMany({
      include: {
        events: {
          where: {
            eventType: {
              in: [...LINEAGE_EVENT_TYPES],
            },
          },
          include: {
            fromHolder: {
              select: {
                uid: true,
                inGameName: true,
                steamPersonaName: true,
              },
            },
            toHolder: {
              select: {
                uid: true,
                inGameName: true,
                steamPersonaName: true,
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    });
  } catch (error) {
    console.warn("Chaosium trophy lineage unavailable; showing current custody only:", error);
  }

  const trophyByDefinitionId = new Map<string, (typeof trophyRows)[number]>();
  for (const trophy of trophyRows) {
    const seed = seededTrophyDefinition(trophy.trophyId);
    if (seed?.definition?.id) {
      trophyByDefinitionId.set(seed.definition.id, trophy);
    }
  }

  return CHAOSIUM_TITLE_IDS.flatMap((titleId) => {
    const title = economy.titles.find((row) => row.id === titleId);
    if (!title) return [];

    const holder = title.holders[0] ?? null;
    const holderName = holder?.name ?? null;
    const holderKey = normalizeIdentity(holderName);
    const holderPlayer =
      (holder?.uid
        ? directory.allEntries.find(
            (entry) => entry.uid?.toLowerCase() === holder.uid?.toLowerCase(),
          )
        : null) ??
      directory.allEntries.find(
        (entry) => normalizeIdentity(entry.name) === holderKey,
      ) ??
      null;

    const trophy = trophyByDefinitionId.get(title.id) ?? null;
    const lineage: ChaosiumLineageEntry[] = [];
    let lineageCursor = holderIdentity(
      holder?.uid ?? holderPlayer?.uid,
      holderName,
    );

    if (holderName) {
      const key = `current:${holderKey}`;
      lineage.push({
        key,
        kind: "holder",
        name: holderName,
        uid: holder?.uid ?? holderPlayer?.uid ?? null,
        href: holder?.href ?? holderPlayer?.href ?? null,
        avatarUrl: featuredAvatarCardUrlForUser(
          holder?.uid ?? holderPlayer?.uid,
          holderName,
          holderPlayer?.featuredAvatarRevision,
        ),
        at: title.holderSince ?? null,
        eventType: "CURRENT_HOLDER",
        current: true,
      });
    }

    for (const event of trophy?.events ?? []) {
      const toName =
        event.toHolder?.inGameName ||
        event.toHolder?.steamPersonaName ||
        null;
      const toIdentity = holderIdentity(event.toHolder?.uid, toName);

      // Walk the custody chain backward. A newer transfer's fromHolder is the
      // previous reign even when that earlier acquisition was seeded before
      // TrophyEvent history existed.
      if (lineageCursor && toIdentity && lineageCursor !== toIdentity) {
        continue;
      }

      const previousHolder = event.fromHolder;
      const previousName =
        previousHolder?.inGameName ||
        previousHolder?.steamPersonaName ||
        null;

      if (!previousHolder || !previousName) {
        lineageCursor = "";
        break;
      }

      const previousIdentity = holderIdentity(previousHolder.uid, previousName);
      if (!previousIdentity) continue;

      const player =
        directory.allEntries.find(
          (entry) =>
            entry.uid?.toLowerCase() === previousHolder.uid.toLowerCase(),
        ) ??
        directory.allEntries.find(
          (entry) =>
            normalizeIdentity(entry.name) === normalizeIdentity(previousName),
        ) ??
        null;

      lineage.push({
        key: `event:${event.id}:from:${previousIdentity}`,
        kind: "holder",
        name: previousName,
        uid: previousHolder.uid ?? player?.uid ?? null,
        href:
          player?.href ??
          `/players/${encodeURIComponent(previousHolder.uid)}`,
        avatarUrl: featuredAvatarCardUrlForUser(
          previousHolder.uid ?? player?.uid,
          previousName,
          player?.featuredAvatarRevision,
        ),
        at: event.createdAt.toISOString(),
        eventType: previousReignLabel(event.eventType),
        current: false,
      });

      lineageCursor = previousIdentity;
    }

    if (trophy) {
      lineage.push({
        key: `origin:${trophy.id}`,
        kind: "origin",
        name: "Belt entered the Kingdom",
        uid: null,
        href: null,
        avatarUrl: null,
        at: trophy.createdAt.toISOString(),
        eventType: "Origin",
        current: false,
      });
    }

    const rating =
      holderPlayer?.steamRmRating ??
      holderPlayer?.steamDmRating ??
      null;
    const ratingLabel =
      holderPlayer?.steamRmRating != null
        ? "RM"
        : holderPlayer?.steamDmRating != null
          ? "DM"
          : null;

    return [{
      id: title.id,
      displayName: title.displayName,
      shortName: title.shortName,
      routeHref: title.routeHref,
      assetUrl: title.assetUrl,
      status: title.status,
      currentHolder: holderName,
      currentHolderUid: holder?.uid ?? holderPlayer?.uid ?? null,
      currentHolderHref: holder?.href ?? holderPlayer?.href ?? null,
      currentHolderAvatarUrl: holderName
        ? featuredAvatarCardUrlForUser(
            holder?.uid ?? holderPlayer?.uid,
            holderName,
            holderPlayer?.featuredAvatarRevision,
          )
        : null,
      currentRecord: holderPlayer
        ? `${holderPlayer.wins}-${holderPlayer.losses}`
        : null,
      totalMatches: holderPlayer?.totalMatches ?? null,
      wins: holderPlayer?.wins ?? null,
      losses: holderPlayer?.losses ?? null,
      rating,
      ratingLabel,
      holderSince: title.holderSince ?? null,
      lineage,
    }];
  });
}
