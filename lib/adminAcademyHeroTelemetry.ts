import { open, stat } from "fs/promises";

export type AcademyHeroVariant = "a" | "b" | "e";

export type AcademyHeroPreferenceRecentRow = {
  at: string;
  variant: AcademyHeroVariant;
  previousVariant: AcademyHeroVariant | null;
  source: "hero-click" | "toggle" | "unknown";
  anonymousId: string | null;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
};

export type AcademyHeroPreferenceAnalytics = {
  totalEvents: number;
  uniqueVisitors: number;
  last24Hours: number;
  last7Days: number;
  latestAt: string | null;
  preferredVariant: AcademyHeroVariant;
  variantCounts: Record<AcademyHeroVariant, number>;
  variantPercentages: Record<AcademyHeroVariant, number>;
  latestVisitorChoiceCounts: Record<AcademyHeroVariant, number>;
  latestVisitorChoicePercentages: Record<AcademyHeroVariant, number>;
  sourceCounts: {
    heroClick: number;
    toggle: number;
    unknown: number;
  };
  recent: AcademyHeroPreferenceRecentRow[];
};

type RawAcademyHeroPreferenceEntry = {
  at?: unknown;
  variant?: unknown;
  previousVariant?: unknown;
  source?: unknown;
  anonymousId?: unknown;
  path?: unknown;
  ip?: unknown;
  userAgent?: unknown;
};

const DEFAULT_LOG_PATH =
  "/mnt/HC_Volume_105319120/aoe2-telemetry/academy-hero-preferences.jsonl";

const MAX_READ_BYTES = 1024 * 1024;
const VARIANTS: AcademyHeroVariant[] = ["b", "a", "e"];

function emptyAnalytics(): AcademyHeroPreferenceAnalytics {
  return {
    totalEvents: 0,
    uniqueVisitors: 0,
    last24Hours: 0,
    last7Days: 0,
    latestAt: null,
    preferredVariant: "e",
    variantCounts: { b: 0, a: 0, e: 0 },
    variantPercentages: { b: 0, a: 0, e: 0 },
    latestVisitorChoiceCounts: { b: 0, a: 0, e: 0 },
    latestVisitorChoicePercentages: { b: 0, a: 0, e: 0 },
    sourceCounts: {
      heroClick: 0,
      toggle: 0,
      unknown: 0,
    },
    recent: [],
  };
}

function isVariant(value: unknown): value is AcademyHeroVariant {
  return value === "b" || value === "a" || value === "e";
}

function normalizeSource(value: unknown): "hero-click" | "toggle" | "unknown" {
  if (value === "hero-click" || value === "toggle") return value;
  return "unknown";
}

function safeString(value: unknown, maxLength = 320) {
  return typeof value === "string" ? value.slice(0, maxLength) : null;
}

function pct(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function toRecentRow(raw: RawAcademyHeroPreferenceEntry): AcademyHeroPreferenceRecentRow | null {
  if (!isVariant(raw.variant)) return null;

  const at = safeString(raw.at, 80);
  if (!at || Number.isNaN(new Date(at).getTime())) return null;

  return {
    at,
    variant: raw.variant,
    previousVariant: isVariant(raw.previousVariant) ? raw.previousVariant : null,
    source: normalizeSource(raw.source),
    anonymousId: safeString(raw.anonymousId, 120),
    path: safeString(raw.path, 240),
    ip: safeString(raw.ip, 80),
    userAgent: safeString(raw.userAgent, 320),
  };
}

async function readTail(path: string) {
  const fileStat = await stat(path);
  const start = Math.max(0, fileStat.size - MAX_READ_BYTES);
  const length = fileStat.size - start;

  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, start);
    const text = buffer.toString("utf8");

    // If we began mid-line, drop the first partial row.
    if (start > 0) {
      const firstNewline = text.indexOf("\n");
      return firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
    }

    return text;
  } finally {
    await file.close();
  }
}

export async function loadAcademyHeroPreferenceAnalytics(
  logPath = process.env.AOE2WAR_ACADEMY_HERO_PREF_LOG ?? DEFAULT_LOG_PATH
): Promise<AcademyHeroPreferenceAnalytics> {
  let text = "";

  try {
    text = await readTail(logPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return emptyAnalytics();
    }

    console.warn("Academy hero preference telemetry unavailable:", error);
    return emptyAnalytics();
  }

  const rows: AcademyHeroPreferenceRecentRow[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as RawAcademyHeroPreferenceEntry;
      const row = toRecentRow(parsed);
      if (row) rows.push(row);
    } catch {
      // Ignore malformed telemetry rows. One bad row should not break Admin.
    }
  }

  if (rows.length === 0) {
    return emptyAnalytics();
  }

  rows.sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const variantCounts: Record<AcademyHeroVariant, number> = { b: 0, a: 0, e: 0 };
  const sourceCounts = {
    heroClick: 0,
    toggle: 0,
    unknown: 0,
  };
  const latestChoiceByVisitor = new Map<
    string,
    {
      at: string;
      variant: AcademyHeroVariant;
    }
  >();

  let last24Hours = 0;
  let last7Days = 0;

  for (const row of rows) {
    variantCounts[row.variant] += 1;

    if (row.source === "hero-click") sourceCounts.heroClick += 1;
    else if (row.source === "toggle") sourceCounts.toggle += 1;
    else sourceCounts.unknown += 1;

    const atMs = new Date(row.at).getTime();
    if (now - atMs <= dayMs) last24Hours += 1;
    if (now - atMs <= 7 * dayMs) last7Days += 1;

    const visitorKey = row.anonymousId || row.ip || `event:${row.at}:${rows.indexOf(row)}`;
    const current = latestChoiceByVisitor.get(visitorKey);
    if (!current || row.at > current.at) {
      latestChoiceByVisitor.set(visitorKey, {
        at: row.at,
        variant: row.variant,
      });
    }
  }

  const latestVisitorChoiceCounts: Record<AcademyHeroVariant, number> = {
    b: 0,
    a: 0,
    e: 0,
  };

  for (const choice of latestChoiceByVisitor.values()) {
    latestVisitorChoiceCounts[choice.variant] += 1;
  }

  const preferredVariant =
    VARIANTS.slice().sort(
      (left, right) =>
        latestVisitorChoiceCounts[right] - latestVisitorChoiceCounts[left] ||
        variantCounts[right] - variantCounts[left]
    )[0] ?? "e";

  return {
    totalEvents: rows.length,
    uniqueVisitors: latestChoiceByVisitor.size,
    last24Hours,
    last7Days,
    latestAt: rows[rows.length - 1]?.at ?? null,
    preferredVariant,
    variantCounts,
    variantPercentages: {
      b: pct(variantCounts.b, rows.length),
      a: pct(variantCounts.a, rows.length),
      e: pct(variantCounts.e, rows.length),
    },
    latestVisitorChoiceCounts,
    latestVisitorChoicePercentages: {
      b: pct(latestVisitorChoiceCounts.b, latestChoiceByVisitor.size),
      a: pct(latestVisitorChoiceCounts.a, latestChoiceByVisitor.size),
      e: pct(latestVisitorChoiceCounts.e, latestChoiceByVisitor.size),
    },
    sourceCounts,
    recent: rows.slice(-8).reverse(),
  };
}
