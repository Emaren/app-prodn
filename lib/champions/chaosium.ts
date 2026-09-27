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

function eventLabel(eventType: string) {
  if (eventType === "CHALLENGE_SETTLED_HOLDER_CHANGED") return "Won the belt";
  if (eventType === "HOLDER_REASSIGNED") return "Title transferred";
  if (eventType === "HOLDER_ASSIGNED") return "First holder";
  return "Title event";
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
    let skippedCurrentHolderEvent = false;

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
      const toHolder = event.toHolder;
      const name =
        toHolder?.inGameName ||
        toHolder?.steamPersonaName ||
        null;
      if (!name) continue;

      const identity = normalizeIdentity(name);
      if (!identity) continue;

      // The current reign is already rendered as the live beacon from Trophy
      // custody. Skip only its newest matching event; preserve older reigns if
      // the same warrior later regained a belt.
      if (
        !skippedCurrentHolderEvent &&
        holderKey &&
        identity === holderKey
      ) {
        skippedCurrentHolderEvent = true;
        continue;
      }

      const player =
        directory.allEntries.find(
          (entry) => entry.uid?.toLowerCase() === toHolder?.uid.toLowerCase(),
        ) ??
        directory.allEntries.find(
          (entry) => normalizeIdentity(entry.name) === identity,
        ) ??
        null;

      lineage.push({
        key: `event:${event.id}`,
        kind: "holder",
        name,
        uid: toHolder?.uid ?? player?.uid ?? null,
        href: player?.href ?? (toHolder?.uid ? `/players/${encodeURIComponent(toHolder.uid)}` : null),
        avatarUrl: featuredAvatarCardUrlForUser(
          toHolder?.uid ?? player?.uid,
          name,
          player?.featuredAvatarRevision,
        ),
        at: event.createdAt.toISOString(),
        eventType: eventLabel(event.eventType),
        current: false,
      });
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
