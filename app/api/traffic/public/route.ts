import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRAFFIC_API_BASE = (
  process.env.TRAFFIC_API_BASE || "http://127.0.0.1:3345"
).replace(/\/+$/, "");

type PublicTrafficPayload = {
  ok?: boolean;
  project_slug?: string;
  coverage_started_at?: string | null;
  coverage_ended_at?: string | null;
  generated_at?: string;
  semantics?: {
    total_traffic?: string;
    suspected_human?: string;
    confirmed_human?: string;
  };
  points?: Array<{
    date?: string;
    values?: {
      totalTraffic?: number;
      suspectedHuman?: number;
      confirmedHuman?: number;
    };
  }>;
};

function finiteNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 5000);

  try {
    const response = await fetch(
      `${TRAFFIC_API_BASE}/api/projects/aoe2hdbets/public-audience-series`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Canonical Traffic upstream returned ${response.status}.`,
      );
    }

    const payload =
      (await response.json()) as PublicTrafficPayload;

    const points = Array.isArray(payload.points)
      ? payload.points
          .filter(
            (point) =>
              typeof point?.date === "string" &&
              point.values,
          )
          .map((point) => {
            const totalTraffic = finiteNumber(
              point.values?.totalTraffic,
            );

            const suspectedHuman = finiteNumber(
              point.values?.suspectedHuman,
            );

            const confirmedHuman = finiteNumber(
              point.values?.confirmedHuman,
            );

            if (
              totalTraffic < suspectedHuman ||
              suspectedHuman < confirmedHuman
            ) {
              throw new Error(
                `Canonical Traffic hierarchy failed on ${point.date}.`,
              );
            }

            return {
              date: point.date,
              values: {
                totalTraffic,
                suspectedHuman,
                confirmedHuman,
              },
            };
          })
      : [];

    return NextResponse.json(
      {
        ok: true,
        startDate:
          payload.coverage_started_at || null,
        coverageEndedAt:
          payload.coverage_ended_at || null,
        semantics:
          payload.semantics || null,
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
    console.error(
      "Public Traffic Observatory failed:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Traffic Observatory is temporarily unavailable.",
      },
      {
        status: 503,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}
