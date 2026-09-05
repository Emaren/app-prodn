import type { ChampionTitleEconomyState } from "@/lib/champions/titleState";

export type NationalChampionBeacon = {
  id: "canada" | "us" | "mexico" | "uk";
  titleId: string;
  country: string;
  representedCountry: string;
  champion: string | null;
  championHref: string | null;
  bountyWolo: number;
  tributeWolo: number;
  tenureDays: number;
  tier: "lit" | "vacant";
  x: number;
  y: number;
  beltHref: string;
  assetUrl: string | null;
};

const NATIONAL_LAYOUT = [
  {
    id: "canada",
    titleId: "national-canada",
    country: "Canada",
    x: 22,
    y: 35,
  },
  {
    id: "us",
    titleId: "national-usa",
    country: "United States",
    x: 24,
    y: 47,
  },
  {
    id: "mexico",
    titleId: "national-mexico",
    country: "Mexico",
    x: 22,
    y: 60,
  },
  {
    id: "uk",
    titleId: "national-uk",
    country: "United Kingdom",
    x: 45,
    y: 36,
  },
] as const;

function daysHeld(holderSince: string | null | undefined, now: Date) {
  if (!holderSince) return 0;
  const started = new Date(holderSince);
  if (Number.isNaN(started.getTime())) return 0;
  return Math.max(
    0,
    Math.floor((now.getTime() - started.getTime()) / 86_400_000),
  );
}

export function buildNationalChampionBeacons(
  state: ChampionTitleEconomyState,
  now = new Date(),
): NationalChampionBeacon[] {
  const titlesById = new Map(
    state.titles
      .filter((title) => title.type === "national")
      .map((title) => [title.id, title] as const),
  );

  return NATIONAL_LAYOUT.map((layout) => {
    const title = titlesById.get(layout.titleId);
    const holder = title?.holders[0] ?? null;

    return {
      ...layout,
      representedCountry: title?.country ?? layout.country,
      champion: holder?.name ?? null,
      championHref: holder?.href ?? null,
      bountyWolo: Math.max(0, title?.currentBountyWolo ?? 0),
      tributeWolo: Math.max(0, title?.dailyWolo ?? 0),
      tenureDays: holder ? daysHeld(title?.holderSince, now) : 0,
      tier: holder ? "lit" : "vacant",
      beltHref: title?.routeHref ?? `/champions/nations/${layout.id}`,
      assetUrl: title?.assetUrl ?? null,
    };
  });
}
