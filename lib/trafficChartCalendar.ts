// Source-only calendar geometry for the ORIGINAL certified Traffic chart.
// Unpublished UTC days are GAPS, never fabricated zero-value observations.
const DAY_MS = 86_400_000;

export type TrafficChartPoint = {
  date: string;
  values: Record<string, number | null>;
};

export type TrafficChartRange = "7D" | "30D" | "ALL";

export function trafficUtcDay(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const millis = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(millis)) return null;
  if (new Date(millis).toISOString().slice(0, 10) !== date) return null;
  return Math.floor(millis / DAY_MS);
}

// 7D/30D mean genuine UTC calendar days ending at the latest certified
// observation, not the last N records. The public page reports staleness
// independently so a missed ingestion interval is never presented as fresh.
export function trafficCalendarWindow<T extends { date: string }>(
  points: readonly T[],
  range: TrafficChartRange,
): T[] {
  if (range === "ALL") return [...points];
  const latest = trafficUtcDay(points.at(-1)?.date ?? "");
  if (latest === null) return [];
  const earliest = latest - (range === "7D" ? 6 : 29);
  return points.filter((point) => {
    const day = trafficUtcDay(point.date);
    return day !== null && day >= earliest && day <= latest;
  });
}

// Uniform calendar spacing: if October 20-22 were never certified, October
// 23 must be four days to the right of October 19, not one point away.
export function trafficCalendarFraction(
  points: readonly { date: string }[],
  index: number,
): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= points.length)
    return null;
  if (points.length === 1) return 0.5;
  const first = trafficUtcDay(points[0].date);
  const last = trafficUtcDay(points.at(-1)?.date ?? "");
  const current = trafficUtcDay(points[index].date);
  if (first === null || last === null || current === null ||
      last <= first || current < first || current > last) return null;
  return (current - first) / (last - first);
}

export function trafficNearestCalendarIndex(
  points: readonly { date: string }[],
  fraction: number,
): number | null {
  if (!points.length || !Number.isFinite(fraction)) return null;
  let winner: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  points.forEach((_point, index) => {
    const x = trafficCalendarFraction(points, index);
    if (x === null) return;
    const distance = Math.abs(x - fraction);
    if (distance < nearestDistance) {
      winner = index;
      nearestDistance = distance;
    }
  });
  return winner;
}

// Split the SVG path whenever any UTC day was never certified, values are
// invalid, duplicate, or dates arrive in the wrong order.
export function trafficCertifiedRuns(
  points: readonly TrafficChartPoint[],
  seriesKey: string,
): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  let prior: number | null = null;
  points.forEach((point, index) => {
    const day = trafficUtcDay(point.date);
    const value = point.values[seriesKey];
    if (day === null || typeof value !== "number" ||
        !Number.isFinite(value) || value < 0) {
      if (current.length) segments.push(current);
      current = [];
      prior = null;
      return;
    }
    if (prior !== null && day !== prior + 1) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(index);
    prior = day;
  });
  if (current.length) segments.push(current);
  return segments;
}

export function trafficMissingCalendarDays(
  points: readonly { date: string }[],
): number {
  let missing = 0;
  let previous: number | null = null;
  for (const point of points) {
    const current = trafficUtcDay(point.date);
    if (current === null) return 0; // Upstream validates; do not invent gaps.
    if (previous !== null && current <= previous) return 0;
    if (previous !== null) missing += Math.max(0, current - previous - 1);
    previous = current;
  }
  return missing;
}
