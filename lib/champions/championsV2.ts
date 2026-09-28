import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

import {
  CHAMPIONS_V2_ACTIVE_COUNT,
  CHAMPIONS_V2_TRIBUTE_POOL_WOLO,
  CHAMPIONS_V2_VACANT_COUNT,
} from "@/lib/champions/championshipPolicy";
import type { ChampionTitleState } from "@/lib/champions/titleState";
import { getTitleState, loadChampionTitleEconomyState } from "@/lib/champions/titleState";
import {
  eloTitles,
  nationalTitles,
  podiumTitles,
  type TitleContender,
} from "@/lib/champions/titles";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import {
  loadPublicPlayerDirectory,
  type PublicPlayerDirectoryEntry,
} from "@/lib/publicPlayerDirectory";

export type ChampionsLane = "rm" | "dm";

type WatcherActivityRow = {
  userUid: string;
  eventCount: bigint | number;
  streamedGames: bigint | number;
  lastWatcherAt: Date | null;
  hasWatcherKey: boolean;
};

export type ChampionsV2ModeChampion = {
  lane: ChampionsLane;
  name: string;
  shortName: string;
  beltUrl: string;
  contenders: TitleContender[];
};

export type ChampionsV2EloDivision = {
  id: string;
  shortName: string;
  displayName: string;
  eyebrow: string;
  beltUrl: string;
  holder: {
    name: string;
    uid: string | null;
    href: string | null;
  } | null;
  contenders: TitleContender[];
};

export type ChampionsV2TeamContender = {
  rank: number;
  members: Array<{
    name: string;
    href: string | null;
  }>;
};

export type ChampionsV2TeamTitle = {
  size: 2 | 3 | 4;
  name: string;
  beltUrl: string;
  holderSlots: number;
  contenders: ChampionsV2TeamContender[];
};

export type ChampionsV2NationalBelt = {
  slug: string;
  country: string;
  flag: string;
  scope: "national" | "regional";
  beltUrl: string;
  routeHref: string | null;
  active: boolean;
  holder: {
    name: string;
    uid: string | null;
    href: string | null;
  } | null;
  contenders: TitleContender[];
};

export type ChampionsV2State = {
  world: ChampionTitleState;
  chaos: ChampionTitleState;
  womens: ChampionTitleState;
  rmChampion: ChampionsV2ModeChampion;
  dmChampion: ChampionsV2ModeChampion;
  teams: Record<ChampionsLane, ChampionsV2TeamTitle[]>;
  elo: Record<ChampionsLane, ChampionsV2EloDivision[]>;
  nationals: ChampionsV2NationalBelt[];
  designationTitles: ChampionTitleState[];
  summary: {
    active: number;
    vacant: number;
    tributePoolWolo: number;
  };
};

type CountryCatalogRow = {
  slug: string;
  country: string;
  flag: string;
  managedTarget?: string;
  scope?: "national" | "regional";
};

const COUNTRY_BELT_CATALOG: CountryCatalogRow[] = [
  { slug: "canada", country: "Canada", flag: "🇨🇦" },
  { slug: "usa", country: "USA", flag: "🇺🇸" },
  { slug: "mexico", country: "Mexico", flag: "🇲🇽" },
  { slug: "uk", country: "UK", flag: "🇬🇧" },
  { slug: "brazil", country: "Brazil", flag: "🇧🇷" },
  { slug: "argentina", country: "Argentina", flag: "🇦🇷" },
  { slug: "netherlands", country: "Netherlands", flag: "🇳🇱" },
  { slug: "poland", country: "Poland", flag: "🇵🇱" },
  { slug: "austria", country: "Austria", flag: "🇦🇹" },
  { slug: "turkey", country: "Turkey", flag: "🇹🇷" },
  { slug: "egypt", country: "Egypt", flag: "🇪🇬" },
  { slug: "spain", country: "Spain", flag: "🇪🇸" },
  { slug: "hungary", country: "Hungary", flag: "🇭🇺" },
  { slug: "russia", country: "Russia", flag: "🇷🇺" },
  { slug: "kazakhstan", country: "Kazakhstan", flag: "🇰🇿" },
  { slug: "hong-kong", country: "Hong Kong", flag: "🇭🇰" },
  { slug: "singapore", country: "Singapore", flag: "🇸🇬" },
  { slug: "taiwan", country: "Taiwan", flag: "🇹🇼" },
  { slug: "switzerland", country: "Switzerland", flag: "🇨🇭" },
  { slug: "sweden", country: "Sweden", flag: "🇸🇪" },
  { slug: "ireland", country: "Ireland", flag: "🇮🇪" },
  { slug: "india", country: "India", flag: "🇮🇳" },
  { slug: "south-africa", country: "South Africa", flag: "🇿🇦" },
  { slug: "scotland", country: "Scotland", flag: "🏴" },
  { slug: "morocco", country: "Morocco", flag: "🇲🇦" },
  { slug: "algeria", country: "Algeria", flag: "🇩🇿" },
  { slug: "saudi-arabia", country: "Saudi Arabia", flag: "🇸🇦" },
  { slug: "iraq", country: "Iraq", flag: "🇮🇶" },
  { slug: "iran", country: "Iran", flag: "🇮🇷" },
  { slug: "italy", country: "Italy", flag: "🇮🇹" },
  { slug: "denmark", country: "Denmark", flag: "🇩🇰" },
  { slug: "greece", country: "Greece", flag: "🇬🇷" },
  { slug: "france", country: "France", flag: "🇫🇷" },
  { slug: "japan", country: "Japan", flag: "🇯🇵" },
  { slug: "germany", country: "Germany", flag: "🇩🇪" },
  { slug: "china", country: "China", flag: "🇨🇳" },
  { slug: "australia", country: "Australia", flag: "🇦🇺" },
  { slug: "finland", country: "Finland", flag: "🇫🇮" },
  { slug: "norway", country: "Norway", flag: "🇳🇴" },
  { slug: "philippines", country: "Philippines", flag: "🇵🇭" },
  {
    slug: "norse",
    country: "Norse",
    flag: "⚔️",
    managedTarget: "regional-norse",
    scope: "regional",
  },
  {
    slug: "southeast-asia",
    country: "Southeast Asia",
    flag: "🌏",
    managedTarget: "regional-southeast-asia",
    scope: "regional",
  },
];

const NATIONAL_CONTENDER_OVERRIDES: Record<string, string[]> = {
  usa: ["Scavanger_Ab", "Zodiac"],
  uk: ["Sniper"],
  brazil: ["Dil Pascana", "Dil_Pascana", "dil_pascana"],
  argentina: ["Maxi"],
};

const NATIONAL_COUNTRY_ALIASES: Record<string, string[]> = {
  usa: ["USA", "United States", "United States of America"],
  uk: ["UK", "United Kingdom", "Great Britain"],
};

const REGIONAL_COUNTRY_ELIGIBILITY: Record<string, string[]> = {
  // Product-policy lane: Pakistan is intentionally represented by the
  // Southeast Asia regional crown even though it is not a national target.
  "southeast-asia": ["Pakistan"],
};

function normalizedIdentity(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function entryIdentity(entry: PublicPlayerDirectoryEntry) {
  return entry.uid || entry.steamId || entry.key;
}

function laneRating(entry: PublicPlayerDirectoryEntry, lane: ChampionsLane) {
  const rating = lane === "dm" ? entry.steamDmRating : entry.steamRmRating;
  return typeof rating === "number" && Number.isFinite(rating) ? Math.round(rating) : null;
}

function sortedLaneEntries(entries: PublicPlayerDirectoryEntry[], lane: ChampionsLane) {
  return entries
    .filter((entry) => laneRating(entry, lane) !== null)
    .sort((left, right) => {
      const ratingDiff = (laneRating(right, lane) ?? 0) - (laneRating(left, lane) ?? 0);
      if (ratingDiff !== 0) return ratingDiff;
      if (left.totalMatches !== right.totalMatches) return right.totalMatches - left.totalMatches;
      if (left.wins !== right.wins) return right.wins - left.wins;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
}

function contenderFromEntry(
  entry: PublicPlayerDirectoryEntry,
  rank: number,
  lane: ChampionsLane,
  badge?: string | null,
): TitleContender {
  const rating = laneRating(entry, lane);
  return {
    rank,
    name: entry.name,
    href: entry.href,
    rating,
    ratingLabel: rating === null ? null : `${rating} ${lane.toUpperCase()}`,
    meta: `${entry.wins}-${entry.losses} · ${entry.totalMatches} battles`,
    badge: badge ?? null,
  };
}

function topLaneContenders(
  entries: PublicPlayerDirectoryEntry[],
  lane: ChampionsLane,
  limit = 10,
) {
  return sortedLaneEntries(entries, lane)
    .slice(0, limit)
    .map((entry, index) => contenderFromEntry(entry, index + 1, lane));
}

function alternatingWorldContenders(entries: PublicPlayerDirectoryEntry[]) {
  const rm = sortedLaneEntries(entries, "rm");
  const dm = sortedLaneEntries(entries, "dm");
  const rmTop = laneRating(rm[0], "rm") ?? Number.NEGATIVE_INFINITY;
  const dmTop = laneRating(dm[0], "dm") ?? Number.NEGATIVE_INFINITY;
  let lane: ChampionsLane = dmTop > rmTop ? "dm" : "rm";
  const indexes: Record<ChampionsLane, number> = { rm: 0, dm: 0 };
  const used = new Set<string>();
  const output: TitleContender[] = [];

  for (let guard = 0; guard < 200 && output.length < 10; guard += 1) {
    const pool = lane === "rm" ? rm : dm;
    let chosen: PublicPlayerDirectoryEntry | null = null;

    while (indexes[lane] < pool.length) {
      const candidate = pool[indexes[lane]++];
      const key = entryIdentity(candidate);
      if (used.has(key)) continue;
      chosen = candidate;
      used.add(key);
      break;
    }

    if (chosen) {
      output.push(
        contenderFromEntry(
          chosen,
          output.length + 1,
          lane,
          lane.toUpperCase(),
        ),
      );
    }

    lane = lane === "rm" ? "dm" : "rm";

    if (
      indexes.rm >= rm.length &&
      indexes.dm >= dm.length
    ) {
      break;
    }
  }

  return output;
}

function inEloBand(
  entry: PublicPlayerDirectoryEntry,
  lane: ChampionsLane,
  min: number | null,
  max: number | null,
) {
  const rating = laneRating(entry, lane);
  if (rating === null) return false;
  if (min !== null && rating < min) return false;
  if (max !== null && rating > max) return false;
  return true;
}

function eloManagedTarget(
  definition: (typeof eloTitles)[number],
  lane: ChampionsLane,
) {
  if (lane === "rm") {
    return definition.id;
  }

  const division = definition.id.replace(/^elo-/, "");
  return division === "challenger" ? "dm-contender" : `dm-${division}`;
}

function buildEloDivisions(
  entries: PublicPlayerDirectoryEntry[],
  lane: ChampionsLane,
  titleEconomy: Awaited<ReturnType<typeof loadChampionTitleEconomyState>>,
): ChampionsV2EloDivision[] {
  return eloTitles.map((definition) => {
    const titleState = getTitleState(titleEconomy, definition);
    const holder = titleState.holders[0] ?? null;
    const contenders = sortedLaneEntries(
      entries.filter((entry) =>
        inEloBand(
          entry,
          lane,
          definition.eloMin ?? null,
          definition.eloMax ?? null,
        ),
      ),
      lane,
    )
      .slice(0, 10)
      .map((entry, index) => contenderFromEntry(entry, index + 1, lane));

    return {
      id: definition.id,
      shortName: definition.shortName,
      displayName: definition.displayName,
      eyebrow: definition.eyebrow,
      beltUrl: managedMediaPublicUrl(
        "belt",
        eloManagedTarget(definition, lane),
        definition.assetUrl,
      ),
      holder: holder
        ? {
            name: holder.name,
            uid: holder.uid ?? null,
            href: holder.href ?? null,
          }
        : null,
      contenders,
    };
  });
}

function lookupDirectoryEntry(
  entries: PublicPlayerDirectoryEntry[],
  names: string[],
) {
  const wanted = new Set(names.map(normalizedIdentity).filter(Boolean));

  return (
    entries.find((entry) => {
      const values = [
        entry.name,
        entry.inGameName,
        entry.steamPersonaName,
        ...entry.aliases,
      ];
      return values.some((value) => wanted.has(normalizedIdentity(value)));
    }) ?? null
  );
}

function manualContender(
  entries: PublicPlayerDirectoryEntry[],
  names: string[],
  rank: number,
  badge: string,
): TitleContender {
  const entry = lookupDirectoryEntry(entries, names);
  const displayName = entry?.name || names[0];
  const rating = entry?.steamRmRating ?? entry?.steamDmRating ?? null;

  return {
    rank,
    name: displayName,
    href: entry?.href,
    rating,
    ratingLabel: rating ? `${rating} ELO` : null,
    meta: entry ? `${entry.wins}-${entry.losses} · ${entry.totalMatches} battles` : "Invited contender",
    badge,
  };
}

function representedCountryKey(value: string | null | undefined) {
  return normalizedIdentity(value);
}

function countryEligibilityValues(country: CountryCatalogRow) {
  if (country.scope === "regional") {
    return REGIONAL_COUNTRY_ELIGIBILITY[country.slug] ?? [];
  }

  return NATIONAL_COUNTRY_ALIASES[country.slug] ?? [country.country];
}

function countryDirectoryContenders(
  entries: PublicPlayerDirectoryEntry[],
  country: CountryCatalogRow,
): TitleContender[] {
  const eligible = new Set(
    countryEligibilityValues(country)
      .map(representedCountryKey)
      .filter(Boolean),
  );

  if (!eligible.size) return [];

  return entries
    .filter(
      (entry) =>
        entry.claimed &&
        eligible.has(representedCountryKey(entry.representedCountry)),
    )
    .sort((left, right) => {
      if (left.totalMatches !== right.totalMatches) {
        return right.totalMatches - left.totalMatches;
      }

      const leftRating = left.steamRmRating ?? left.steamDmRating ?? Number.NEGATIVE_INFINITY;
      const rightRating = right.steamRmRating ?? right.steamDmRating ?? Number.NEGATIVE_INFINITY;
      if (leftRating !== rightRating) return rightRating - leftRating;
      if (left.wins !== right.wins) return right.wins - left.wins;
      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    })
    .slice(0, 10)
    .map((entry, index) => ({
      rank: index + 1,
      name: entry.name,
      href: entry.href,
      rating: entry.steamRmRating ?? entry.steamDmRating ?? null,
      ratingLabel:
        entry.steamRmRating !== null
          ? `${entry.steamRmRating} RM`
          : entry.steamDmRating !== null
            ? `${entry.steamDmRating} DM`
            : null,
      meta: `${entry.wins}-${entry.losses} · ${entry.totalMatches} battles`,
      badge: `${country.flag} contender`,
    }));
}

function dedupeContenders(rows: TitleContender[], holderName?: string | null) {
  const seen = new Set<string>();
  const holderKey = normalizedIdentity(holderName);

  return rows
    .filter((row) => {
      const key = normalizedIdentity(row.name);
      if (!key || key === holderKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function loadChaosActivityContenders(
  prisma: PrismaClient,
  claimedEntries: PublicPlayerDirectoryEntry[],
  excludedIdentities: Set<string>,
) {
  let rows: WatcherActivityRow[] = [];

  try {
    rows = await prisma.$queryRaw<WatcherActivityRow[]>(Prisma.sql`
      WITH watcher_activity AS (
        SELECT
          COALESCE(w.user_uid, u.uid) AS user_uid,
          COUNT(*)::bigint AS event_count,
          COUNT(
            DISTINCT COALESCE(
              NULLIF(w.replay_hash, ''),
              NULLIF(w.replay_file, '')
            )
          )::bigint AS streamed_games,
          MAX(w.created_at) AS last_watcher_at
        FROM watcher_client_events w
        LEFT JOIN users u
          ON u.id = w.user_id
        WHERE COALESCE(w.user_uid, u.uid) IS NOT NULL
        GROUP BY COALESCE(w.user_uid, u.uid)
      ),
      watcher_keys AS (
        SELECT
          u.uid AS user_uid,
          TRUE AS has_watcher_key
        FROM api_keys k
        JOIN users u
          ON u.id = k.user_id
        WHERE
          k.kind = 'watcher'
          AND k.revoked_at IS NULL
        GROUP BY u.uid
      )
      SELECT
        u.uid AS "userUid",
        COALESCE(a.event_count, 0)::bigint AS "eventCount",
        COALESCE(a.streamed_games, 0)::bigint AS "streamedGames",
        a.last_watcher_at AS "lastWatcherAt",
        COALESCE(k.has_watcher_key, FALSE) AS "hasWatcherKey"
      FROM users u
      LEFT JOIN watcher_activity a
        ON a.user_uid = u.uid
      LEFT JOIN watcher_keys k
        ON k.user_uid = u.uid
    `);
  } catch (error) {
    console.warn("Champion Chaos watcher activity unavailable:", error);
  }

  const activityByUid = new Map(
    rows.map((row) => [
      row.userUid,
      {
        eventCount: Number(row.eventCount || 0),
        streamedGames: Number(row.streamedGames || 0),
        lastWatcherAt: row.lastWatcherAt?.getTime() ?? 0,
        hasWatcher: row.hasWatcherKey || Number(row.eventCount || 0) > 0,
      },
    ]),
  );

  return claimedEntries
    .filter(
      (entry) =>
        !excludedIdentities.has(normalizedIdentity(entry.name)) &&
        !excludedIdentities.has(normalizedIdentity(entry.uid)),
    )
    .map((entry) => {
      const activity = entry.uid ? activityByUid.get(entry.uid) : null;
      return {
        entry,
        hasWatcher: activity?.hasWatcher ?? false,
        streamedGames: activity?.streamedGames ?? 0,
        eventCount: activity?.eventCount ?? 0,
        lastWatcherAt: activity?.lastWatcherAt ?? 0,
      };
    })
    .sort((left, right) => {
      if (left.hasWatcher !== right.hasWatcher) {
        return Number(right.hasWatcher) - Number(left.hasWatcher);
      }
      if (left.streamedGames !== right.streamedGames) {
        return right.streamedGames - left.streamedGames;
      }
      if (left.eventCount !== right.eventCount) {
        return right.eventCount - left.eventCount;
      }
      if (left.lastWatcherAt !== right.lastWatcherAt) {
        return right.lastWatcherAt - left.lastWatcherAt;
      }
      if (left.entry.totalMatches !== right.entry.totalMatches) {
        return right.entry.totalMatches - left.entry.totalMatches;
      }
      return left.entry.name.localeCompare(right.entry.name);
    })
    .slice(0, 10)
    .map(({ entry, hasWatcher, streamedGames }, index) => ({
      rank: index + 1,
      name: entry.name,
      href: entry.href,
      rating: entry.steamRmRating ?? entry.steamDmRating ?? null,
      ratingLabel: null,
      meta: hasWatcher
        ? `Watcher · ${streamedGames} streamed battle${streamedGames === 1 ? "" : "s"}`
        : entry.totalMatches > 0
          ? `${entry.totalMatches} archived battles · Watcher not linked`
          : "Kingdom member · Watcher not linked",
      badge: hasWatcher ? "Watcher" : "Member",
    } satisfies TitleContender));
}

function buildNationalBelts(
  titleEconomy: Awaited<ReturnType<typeof loadChampionTitleEconomyState>>,
  directoryEntries: PublicPlayerDirectoryEntry[],
): ChampionsV2NationalBelt[] {
  const nationalBySlug = new Map(
    nationalTitles.map((definition) => [
      definition.slug,
      getTitleState(titleEconomy, definition),
    ]),
  );

  return COUNTRY_BELT_CATALOG.map((country) => {
    const live = nationalBySlug.get(country.slug) ?? null;
    const active = ["canada", "usa", "mexico"].includes(country.slug);
    const liveHolder = active ? live?.holders[0] ?? null : null;

    const overrideNames = NATIONAL_CONTENDER_OVERRIDES[country.slug] ?? [];
    const contenderGroups =
      country.slug === "brazil"
        ? [["Dil Pascana", "Dil_Pascana", "dil_pascana"]]
        : overrideNames.map((name) => [name]);

    const manual = contenderGroups.map((names, index) =>
      manualContender(directoryEntries, names, index + 1, `${country.flag} contender`),
    );
    const automatic = countryDirectoryContenders(directoryEntries, country);
    const liveRows = live?.contenders ?? [];
    const contenders = dedupeContenders(
      [...manual, ...automatic, ...liveRows],
      liveHolder?.name ?? null,
    );

    const fallback =
      live?.assetUrl ||
      (country.slug === "usa"
        ? "/champions/belts/usa.webp"
        : country.slug === "canada"
          ? "/champions/belts/canada.webp"
          : country.slug === "mexico"
            ? "/champions/belts/mexico.webp"
            : country.slug === "uk"
              ? "/champions/belts/uk.webp"
              : "/champions/belts/aoe2war-world.webp");

    return {
      slug: country.slug,
      country: country.country,
      flag: country.flag,
      scope: country.scope ?? "national",
      beltUrl: managedMediaPublicUrl(
        "belt",
        country.managedTarget ?? `national-${country.slug}`,
        fallback,
      ),
      routeHref: live?.routeHref ?? null,
      active,
      holder: liveHolder
        ? {
            name: liveHolder.name,
            uid: liveHolder.uid ?? null,
            href: liveHolder.href ?? null,
          }
        : null,
      contenders,
    };
  });
}

function modeChampion(
  lane: ChampionsLane,
  contenders: TitleContender[],
): ChampionsV2ModeChampion {
  const rm = lane === "rm";
  return {
    lane,
    name: rm ? "Random Map Champion" : "Death Match Champion",
    shortName: rm ? "RM Champion" : "DM Champion",
    beltUrl: managedMediaPublicUrl(
      "belt",
      rm ? "random-map-champion" : "deathmatch-champion",
      "/champions/belts/aoe2war-world.webp",
    ),
    contenders,
  };
}

const CURATED_TEAM_CONTENDERS: Record<2 | 3 | 4, string[][]> = {
  2: [
    ["Jim", "Scavanger_Ab"],
    ["Emaren", "Tekki"],
    ["Zodiac", "MouldyBoars39381"],
    ["Julio Alvarez", "Sniper"],
  ],
  3: [
    ["Jim", "Scavanger_Ab", "Tekki"],
    ["Emaren", "Zodiac", "MouldyBoars39381"],
  ],
  4: [
    ["Jim", "Scavanger_Ab", "Tekki", "Zodiac"],
    ["Emaren", "Julio Alvarez", "MouldyBoars39381", "Sniper"],
  ],
};

function curatedTeamContenders(
  entries: PublicPlayerDirectoryEntry[],
  size: 2 | 3 | 4,
): ChampionsV2TeamContender[] {
  return CURATED_TEAM_CONTENDERS[size].map((names, index) => ({
    rank: index + 1,
    members: names.map((name) => {
      const entry = lookupDirectoryEntry(entries, [name]);
      return {
        name: entry?.name || name,
        href: entry?.href ?? null,
      };
    }),
  }));
}

function teamTitles(
  lane: ChampionsLane,
  entries: PublicPlayerDirectoryEntry[],
): ChampionsV2TeamTitle[] {
  return ([2, 3, 4] as const).map((size) => ({
    size,
    name: `${size}v${size} ${lane.toUpperCase()} Champions`,
    beltUrl: managedMediaPublicUrl(
      "belt",
      `${size}v${size}-${lane}`,
      "/champions/belts/tag-team.webp",
    ),
    holderSlots: size,
    contenders: curatedTeamContenders(entries, size),
  }));
}

export async function loadChampionsV2State(
  prisma: PrismaClient,
): Promise<ChampionsV2State> {
  const [titleEconomy, directory] = await Promise.all([
    loadChampionTitleEconomyState(prisma),
    loadPublicPlayerDirectory(prisma),
  ]);

  const directoryEntries = directory.allEntries;
  const rmContenders = topLaneContenders(directoryEntries, "rm");
  const dmContenders = topLaneContenders(directoryEntries, "dm");

  const worldBase = getTitleState(titleEconomy, podiumTitles[0]);
  const chaosBase = getTitleState(titleEconomy, podiumTitles[1]);
  const womensBase = getTitleState(titleEconomy, podiumTitles[2]);

  const chaosHolderIdentities = new Set(
    chaosBase.holders.flatMap((holder) => [
      normalizedIdentity(holder.name),
      normalizedIdentity(holder.uid),
    ]).filter(Boolean),
  );
  const chaosContenders = await loadChaosActivityContenders(
    prisma,
    directory.claimedEntries,
    chaosHolderIdentities,
  );

  const world: ChampionTitleState = {
    ...worldBase,
    status: "vacant",
    holders: [],
    currentBountyWolo: undefined,
    holderSince: null,
    contenders: alternatingWorldContenders(directoryEntries),
    contenderStatus: "live",
  };

  const chaos: ChampionTitleState = {
    ...chaosBase,
    contenders: chaosContenders,
    contenderStatus: chaosContenders.length ? "live" : "placeholder",
  };

  const womens: ChampionTitleState = {
    ...womensBase,
    status: "vacant",
    holders: [],
    contenders: [
      {
        rank: 1,
        name: "Moose",
        meta: "Invited contender · not yet registered",
        badge: "Women's #1",
      },
    ],
    contenderStatus: "live",
  };

  const designationTitles = titleEconomy.titles.filter(
    (title) => title.type === "designation",
  );

  return {
    world,
    chaos,
    womens,
    rmChampion: modeChampion("rm", rmContenders),
    dmChampion: modeChampion("dm", dmContenders),
    teams: {
      rm: teamTitles("rm", directoryEntries),
      dm: teamTitles("dm", directoryEntries),
    },
    elo: {
      rm: buildEloDivisions(directoryEntries, "rm", titleEconomy),
      dm: buildEloDivisions(directoryEntries, "dm", titleEconomy),
    },
    nationals: buildNationalBelts(titleEconomy, directoryEntries),
    designationTitles,
    summary: {
      active: CHAMPIONS_V2_ACTIVE_COUNT,
      vacant: CHAMPIONS_V2_VACANT_COUNT,
      tributePoolWolo: CHAMPIONS_V2_TRIBUTE_POOL_WOLO,
    },
  };
}
