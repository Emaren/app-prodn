import {
  HOME_DYNAMIC_SOURCE_KEYS,
  HOME_SOURCE_KEYS,
} from "./homeSources.ts";

type HomeCopyValue = string | number;
type HomeCopyValues = Record<string, HomeCopyValue | null | undefined>;

export type HomeCatalog = {
  static: readonly string[];
  dynamic: readonly string[];
};

export type HomeCopy = (
  source: string,
  values?: HomeCopyValues,
) => string;

const HOME_SOURCE_INDEX = new Map<string, number>(
  HOME_SOURCE_KEYS.map((source, index) => [source, index]),
);

const DYNAMIC_MATCHERS = [
  [/^Rank #(\d+)$/, ["rank"]],
  [/^(\d+)W · (\d+)L · (\d+)U$/, ["wins", "losses", "unknowns"]],
  [/^(\d+)(?:st|nd|rd|th)$/, ["rank"]],
  [/^(\d+) active$/, ["count"]],
  [/^(\d+) entrant$/, ["count"]],
  [/^(\d+) entrants$/, ["count"]],
  [/^(\d+) match$/, ["count"]],
  [/^(\d+) matches$/, ["count"]],
  [/^(\d+) shown$/, ["count"]],
  [/^(\d+) recent$/, ["count"]],
  [/^(\d+) earners$/, ["count"]],
  [/^(\d+) \/ (\d+) earners$/, ["shown", "total"]],
  [/^(\d+) reserve$/, ["reserve"]],
  [/^Winner (.+)$/, ["winner"]],
  [/^(.+) is typing…$/, ["name"]],
  [/^Filter (.+)$/, ["name"]],
  [/^Remove (.+) filter$/, ["name"]],
  [/^(\d+) anonymous player$/, ["count"]],
  [/^(\d+) anonymous players$/, ["count"]],
  [/^(\d+) HD lobbies · (\d+) seats$/, ["lobbies", "seats"]],
  [/^Steam HD: (\d+) open lobbies$/, ["count"]],
  [/^(\d+) ranked on the board$/, ["count"]],
  [/^(\d+) final replay awaiting parser review$/, ["count"]],
  [/^(\d+) final replays awaiting parser review$/, ["count"]],
  [/^(\d+) awaiting parser review\.$/, ["count"]],
  [/^(.+) WOLO pot$/, ["amount"]],
  [/^(.+)% crowd$/, ["percent"]],
  [/^(.+) rating$/, ["rating"]],
  [/^(.+) WOLO$/, ["amount"]],
  [/^(.+)'s Team$/, ["name"]],
  [/^(.+)' Team$/, ["name"]],
] as const;

function interpolate(template: string, values?: HomeCopyValues) {
  if (!values) return template;

  return Object.entries(values).reduce((result, [key, value]) => {
    if (value === null || value === undefined) return result;
    return result.replaceAll(`{${key}}`, String(value));
  }, template);
}

function dynamicTranslation(catalog: HomeCatalog, source: string) {
  for (let index = 0; index < DYNAMIC_MATCHERS.length; index += 1) {
    const [pattern, names] = DYNAMIC_MATCHERS[index];
    const match = source.match(pattern);
    if (!match) continue;

    const values = Object.fromEntries(
      names.map((name, captureIndex) => [name, match[captureIndex + 1]]),
    );

    return {
      template: catalog.dynamic[index] ?? HOME_DYNAMIC_SOURCE_KEYS[index],
      values,
    };
  }

  return null;
}

export function translateHomeCopy(
  catalog: HomeCatalog,
  source: string,
  values?: HomeCopyValues,
) {
  const staticIndex = HOME_SOURCE_INDEX.get(source);

  if (staticIndex !== undefined) {
    return interpolate(catalog.static[staticIndex] ?? source, values);
  }

  const dynamic = dynamicTranslation(catalog, source);
  if (!dynamic) return interpolate(source, values);

  return interpolate(dynamic.template, {
    ...dynamic.values,
    ...values,
  });
}

export function assertHomeCatalog(
  value: unknown,
): asserts value is HomeCatalog {
  if (!value || typeof value !== "object") {
    throw new Error("Homepage translation catalog is missing.");
  }

  const candidate = value as Partial<HomeCatalog>;

  if (
    !Array.isArray(candidate.static) ||
    candidate.static.length !== HOME_SOURCE_KEYS.length
  ) {
    throw new Error("Homepage static catalog is incomplete.");
  }

  if (
    !Array.isArray(candidate.dynamic) ||
    candidate.dynamic.length !== HOME_DYNAMIC_SOURCE_KEYS.length
  ) {
    throw new Error("Homepage dynamic catalog is incomplete.");
  }

  if (
    candidate.static.some((entry) => typeof entry !== "string" || !entry.trim()) ||
    candidate.dynamic.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error("Homepage translation catalog contains empty copy.");
  }
}
