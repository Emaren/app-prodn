import type { PrismaClient } from "@/lib/generated/prisma";
import { featuredAvatarCardUrlForUser } from "@/lib/avatarAssets";
import { CHAMPIONS_NATIONAL_BELT_CATALOG } from "@/lib/champions/championsV2";
import { loadChampionTitleEconomyState } from "@/lib/champions/titleState";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { seededTrophyDefinition } from "@/lib/trophies/service";

const LINEAGE_EVENT_TYPES = [
  "HOLDER_ASSIGNED",
  "HOLDER_REASSIGNED",
  "CHALLENGE_SETTLED_HOLDER_CHANGED",
] as const;

type MuseumHolder = {
  name: string;
  uid?: string;
  href?: string;
};

type MuseumTitle = {
  id: string;
  slug: string;
  type: string;
  displayName: string;
  shortName: string;
  routeHref: string;
  assetUrl: string;
  status: string;
  holders: MuseumHolder[];
  holderSince: string | null;
  catalogOrder: number;
};

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
  dmRating: number | null;
  rmRating: number | null;
  holderSince: string | null;
  recentActivityAt: string | null;
  catalogOrder: number;
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

function latestIso(values: Array<string | null | undefined>) {
  let latest: { value: string; time: number } | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) continue;
    if (!latest || time > latest.time) latest = { value, time };
  }
  return latest?.value ?? null;
}

export async function loadChaosium(prisma: PrismaClient): Promise<ChaosiumBelt[]> {
  const [economy, directory] = await Promise.all([
    loadChampionTitleEconomyState(prisma),
    loadPublicPlayerDirectory(prisma, null, { includePresence: false }),
  ]);

  let trophyRows: Array<{
    id: number;
    trophyId: string;
    family: string;
    status: string;
    eligibleNationality: string | null;
    currentHolderDisplayName: string | null;
    holderSince: Date | null;
    createdAt: Date;
    nftImageUri: string | null;
    currentHolder: {
      uid: string;
      inGameName: string | null;
      steamPersonaName: string | null;
    } | null;
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
        currentHolder: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
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
    console.warn(
      "Chaosium trophy lineage unavailable; showing current custody only:",
      error,
    );
  }

  const liveNationalBySlug = new Map(
    economy.titles
      .filter((title) => title.type === "national")
      .map((title) => [title.slug, title]),
  );

  const countryByIdentity = new Map(
    CHAMPIONS_NATIONAL_BELT_CATALOG.map((country) => [
      normalizeIdentity(country.country),
      country,
    ]),
  );

  const trophyByDefinitionId = new Map<
    string,
    (typeof trophyRows)[number]
  >();

  for (const trophy of trophyRows) {
    const seed = seededTrophyDefinition(trophy.trophyId);
    if (seed?.definition?.id) {
      trophyByDefinitionId.set(seed.definition.id, trophy);
      continue;
    }

    const directId = trophy.trophyId.trim().toLowerCase();
    if (directId) trophyByDefinitionId.set(directId, trophy);

    if (trophy.family === "national" && trophy.eligibleNationality) {
      const country = countryByIdentity.get(
        normalizeIdentity(trophy.eligibleNationality),
      );
      if (country) {
        trophyByDefinitionId.set(
          country.managedTarget ?? `national-${country.slug}`,
          trophy,
        );
      }
    }
  }

  const coreTitles: MuseumTitle[] = economy.titles
    .filter(
      (title) =>
        title.type !== "designation" &&
        title.type !== "national" &&
        title.id !== "tag-team",
    )
    .map((title, index) => ({
      id: title.id,
      slug: title.slug,
      type: title.type,
      displayName: title.displayName,
      shortName: title.shortName,
      routeHref: title.routeHref,
      assetUrl: managedMediaPublicUrl("belt", title.id, title.assetUrl),
      status: title.status,
      holders: title.holders,
      holderSince: title.holderSince ?? null,
      catalogOrder: index,
    }));

  const nationalTitles: MuseumTitle[] = CHAMPIONS_NATIONAL_BELT_CATALOG.map(
    (country, index) => {
      const live = liveNationalBySlug.get(country.slug) ?? null;
      const id = live?.id ?? country.managedTarget ?? `national-${country.slug}`;
      const trophy = trophyByDefinitionId.get(id) ?? null;
      const trophyHolderName =
        trophy?.currentHolderDisplayName ||
        trophy?.currentHolder?.inGameName ||
        trophy?.currentHolder?.steamPersonaName ||
        null;
      const heldByTrophy =
        Boolean(trophyHolderName) &&
        ["held", "active", "guardian_held"].includes(trophy?.status ?? "");

      return {
        id,
        slug: country.slug,
        type: live?.type ?? "national",
        displayName: live?.displayName ?? `${country.country} Champion`,
        shortName: live?.shortName ?? country.country,
        routeHref: live?.routeHref ?? "/national-champions",
        assetUrl: managedMediaPublicUrl(
          "belt",
          country.managedTarget ?? `national-${country.slug}`,
          trophy?.nftImageUri?.trim() ||
            live?.assetUrl ||
            "/champions/belts/aoe2war-world.webp",
        ),
        status: live?.status ?? (heldByTrophy ? "held" : "vacant"),
        holders:
          live?.holders?.length
            ? live.holders
            : heldByTrophy && trophyHolderName
              ? [
                  {
                    name: trophyHolderName,
                    uid: trophy?.currentHolder?.uid,
                    href: trophy?.currentHolder?.uid
                      ? `/players/${encodeURIComponent(trophy.currentHolder.uid)}`
                      : undefined,
                  },
                ]
              : [],
        holderSince:
          live?.holderSince ??
          trophy?.holderSince?.toISOString() ??
          null,
        catalogOrder: coreTitles.length + index,
      };
    },
  );

  const museumTitles = [...coreTitles, ...nationalTitles];

  const belts = museumTitles.map((title) => {
    const trophy = trophyByDefinitionId.get(title.id) ?? null;
    const primaryHolder = title.holders[0] ?? null;
    const holderNames = title.holders.map((holder) => holder.name).filter(Boolean);
    const holderName = holderNames.length ? holderNames.join(" + ") : null;
    const holderKey = normalizeIdentity(primaryHolder?.name ?? holderName);
    const holderPlayer =
      (primaryHolder?.uid
        ? directory.allEntries.find(
            (entry) =>
              entry.uid?.toLowerCase() === primaryHolder.uid?.toLowerCase(),
          )
        : null) ??
      directory.allEntries.find(
        (entry) => normalizeIdentity(entry.name) === holderKey,
      ) ??
      null;

    const lineage: ChaosiumLineageEntry[] = [];
    let lineageCursor = holderIdentity(
      primaryHolder?.uid ?? holderPlayer?.uid,
      primaryHolder?.name ?? holderName,
    );

    if (holderName) {
      lineage.push({
        key: `current:${title.id}:${holderKey || normalizeIdentity(holderName)}`,
        kind: "holder",
        name: holderName,
        uid: primaryHolder?.uid ?? holderPlayer?.uid ?? null,
        href:
          title.holders.length === 1
            ? primaryHolder?.href ?? holderPlayer?.href ?? null
            : null,
        avatarUrl: featuredAvatarCardUrlForUser(
          primaryHolder?.uid ?? holderPlayer?.uid,
          primaryHolder?.name ?? holderName,
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

      const previousIdentity = holderIdentity(
        previousHolder.uid,
        previousName,
      );
      if (!previousIdentity) continue;

      if (toIdentity && previousIdentity === toIdentity) {
        lineageCursor = previousIdentity;
        continue;
      }

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

    const rmRating = holderPlayer?.steamRmRating ?? null;
    const dmRating = holderPlayer?.steamDmRating ?? null;
    const rating = rmRating ?? dmRating;
    const ratingLabel =
      rmRating != null
        ? "RM"
        : dmRating != null
          ? "DM"
          : null;

    return {
      id: title.id,
      displayName: title.displayName,
      shortName: title.shortName,
      routeHref: title.routeHref,
      assetUrl: title.assetUrl,
      status: title.status,
      currentHolder: holderName,
      currentHolderUid:
        primaryHolder?.uid ?? holderPlayer?.uid ?? null,
      currentHolderHref:
        title.holders.length === 1
          ? primaryHolder?.href ?? holderPlayer?.href ?? null
          : null,
      currentHolderAvatarUrl: holderName
        ? featuredAvatarCardUrlForUser(
            primaryHolder?.uid ?? holderPlayer?.uid,
            primaryHolder?.name ?? holderName,
            holderPlayer?.featuredAvatarRevision,
          )
        : null,
      currentRecord:
        title.holders.length === 1 && holderPlayer
          ? `${holderPlayer.wins}-${holderPlayer.losses}`
          : null,
      totalMatches:
        title.holders.length === 1
          ? holderPlayer?.totalMatches ?? null
          : null,
      wins:
        title.holders.length === 1
          ? holderPlayer?.wins ?? null
          : null,
      losses:
        title.holders.length === 1
          ? holderPlayer?.losses ?? null
          : null,
      rating:
        title.holders.length === 1 ? rating : null,
      ratingLabel:
        title.holders.length === 1 ? ratingLabel : null,
      dmRating:
        title.holders.length === 1 ? dmRating : null,
      rmRating:
        title.holders.length === 1 ? rmRating : null,
      holderSince: title.holderSince,
      recentActivityAt: latestIso([
        title.holderSince,
        ...lineage.map((entry) => entry.at),
      ]),
      catalogOrder: title.catalogOrder,
      lineage,
    } satisfies ChaosiumBelt;
  });

  return belts.sort((left, right) => {
    const leftHeld = Boolean(left.currentHolder);
    const rightHeld = Boolean(right.currentHolder);
    if (leftHeld !== rightHeld) return leftHeld ? -1 : 1;

    if (leftHeld && rightHeld) {
      const leftTime = Date.parse(left.recentActivityAt ?? "");
      const rightTime = Date.parse(right.recentActivityAt ?? "");
      const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
      const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
      if (safeLeft !== safeRight) return safeRight - safeLeft;
    }

    return left.catalogOrder - right.catalogOrder;
  });
}
