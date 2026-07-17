import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const START_DATE = "2026-05-22";

const TRAFFIC_API_BASE = (
  process.env.TRAFFIC_API_BASE || "http://127.0.0.1:3345"
).replace(/\/+$/, "");

type TrafficPoint = {
  bucket_start?: string;
  visitors?: number;
  events?: number;
  audience?: number;
  confirmed?: number;
};

type ProjectGraphPayload = {
  graph?: {
    coverage_started_at?: string | null;
    points?: TrafficPoint[];
  };
};

type HumanSeriesPayload = {
  coverage_started_at?: string | null;
  projects?: Array<{
    slug?: string;
    points?: TrafficPoint[];
  }>;
};

function numberValue(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function dayKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function utcDays(start: string) {
  const days: string[] = [];

  const cursor = new Date(`${start}T00:00:00Z`);

  const now = new Date();

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export async function GET() {
  try {
    const [graphResponse, humanResponse] = await Promise.all([
      fetch(`${TRAFFIC_API_BASE}/api/projects/aoe2hdbets/graph?range_key=all`, {
        cache: "no-store",
      }),
      fetch(`${TRAFFIC_API_BASE}/api/project-human-series?range_key=all`, {
        cache: "no-store",
      }),
    ]);

    if (!graphResponse.ok) {
      throw new Error(
        `Traffic graph upstream returned ${graphResponse.status}.`,
      );
    }

    if (!humanResponse.ok) {
      throw new Error(
        `Human traffic upstream returned ${humanResponse.status}.`,
      );
    }

    const graph = (await graphResponse.json()) as ProjectGraphPayload;

    const human = (await humanResponse.json()) as HumanSeriesPayload;

    const totalByDay = new Map<string, number>();

    for (const point of graph.graph?.points || []) {
      const day = dayKey(point.bucket_start);

      if (!day || day < START_DATE) {
        continue;
      }

      totalByDay.set(day, numberValue(point.visitors));
    }

    const aoe2war = human.projects?.find(
      (project) => project.slug === "aoe2hdbets",
    );

    const humanByDay = new Map<
      string,
      {
        suspected: number;
        confirmed: number;
      }
    >();

    for (const point of aoe2war?.points || []) {
      const day = dayKey(point.bucket_start);

      if (!day || day < START_DATE) {
        continue;
      }

      const current = humanByDay.get(day) || {
        suspected: 0,
        confirmed: 0,
      };

      current.suspected += numberValue(point.audience ?? point.visitors);

      current.confirmed += numberValue(point.confirmed);

      humanByDay.set(day, current);
    }

    const humanCoverageDay = dayKey(human.coverage_started_at);

    const points = utcDays(START_DATE).map((date) => {
      const classified = humanCoverageDay !== null && date >= humanCoverageDay;

      const humanDay = humanByDay.get(date);

      const suspectedRaw = classified ? humanDay?.suspected || 0 : null;

      const confirmedRaw = classified ? humanDay?.confirmed || 0 : null;

      const baseTotal = totalByDay.get(date) || 0;

      const totalTraffic = Math.max(
        baseTotal,
        suspectedRaw || 0,
        confirmedRaw || 0,
      );

      const suspectedHuman =
        suspectedRaw === null ? null : Math.min(totalTraffic, suspectedRaw);

      const confirmedHuman =
        confirmedRaw === null
          ? null
          : Math.min(suspectedHuman || 0, confirmedRaw);

      return {
        date,
        values: {
          totalTraffic,
          suspectedHuman,
          confirmedHuman,
        },
      };
    });

    return NextResponse.json(
      {
        ok: true,
        startDate: START_DATE,
        humanCoverageStartedAt: human.coverage_started_at || null,
        points,
      },
      {
        headers: {
          "Cache-Control":
            "public, max-age=30, s-maxage=300, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Public Traffic Observatory failed:", error);

    return NextResponse.json(
      {
        detail: "Traffic Observatory is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  }
}
